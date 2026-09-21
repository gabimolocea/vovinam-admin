"""
Local event backup/restore service ("time travel" for competition day).

Snapshots go into `settings.LOCAL_BACKUP_DIR`, each with a small JSON
manifest next to it so the admin UI can list "1 hour ago", "2 hours ago",
etc. without having to open the dump file itself. PostgreSQL snapshots use
`pg_dump -Fc` (the venue/LAN Docker deployment, see crud/settings_local.py);
SQLite snapshots (the Electron launcher's zero-setup local database) use
sqlite3's own online backup API, which is safe to run even while Django
holds an open connection to the same file.

Restoring always takes a fresh "pre-restore safety" snapshot first, so an
operator who picks the wrong backup by mistake can always come back to
where they were a minute ago.

Only used when `settings.IS_LOCAL_EVENT_SERVER` is True.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connections

TRIGGER_MANUAL = 'manual'
TRIGGER_SCHEDULED = 'scheduled'
TRIGGER_PRE_IMPORT = 'pre_import'
TRIGGER_PRE_RESTORE = 'pre_restore_safety'

_SAFE_NAME_RE = re.compile(r'^[A-Za-z0-9_.-]+$')


class BackupError(RuntimeError):
    """Raised for any backup/restore failure (missing pg_dump, bad db config, ...)."""


def _backup_dir() -> Path:
    backup_dir = Path(getattr(settings, 'LOCAL_BACKUP_DIR', settings.BASE_DIR / 'local_backups'))
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _db_config() -> dict[str, Any]:
    return settings.DATABASES['default']


def _db_engine(db: dict[str, Any]) -> str:
    engine = db.get('ENGINE', '')
    if 'postgresql' in engine:
        return 'postgresql'
    if 'sqlite3' in engine:
        return 'sqlite3'
    raise BackupError(f'Backup-urile locale nu sunt suportate pentru motorul de bază de date "{engine}".')


def _pg_env(db: dict[str, Any]) -> dict[str, str]:
    env = os.environ.copy()
    if db.get('PASSWORD'):
        env['PGPASSWORD'] = db['PASSWORD']
    return env


def _run(cmd: list[str], env: dict[str, str]) -> None:
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise BackupError((result.stderr or result.stdout or 'comandă eșuată').strip()[:2000])


def _sqlite_copy(source_path: Path | str, dest_path: Path | str) -> None:
    """Online, connection-safe copy via sqlite3's own backup API - unlike a
    raw file copy, this can't produce a torn/corrupt snapshot if the source
    is being written to concurrently (Django's own connection, in practice)."""
    source = sqlite3.connect(f'file:{source_path}?mode=ro', uri=True)
    try:
        dest = sqlite3.connect(str(dest_path))
        try:
            source.backup(dest)
        finally:
            dest.close()
    finally:
        source.close()


def _manifest_path(dump_path: Path) -> Path:
    return dump_path.with_suffix(dump_path.suffix + '.json')


def create_backup(trigger: str = TRIGGER_MANUAL, label: str | None = None,
                   triggered_by: str | None = None) -> dict[str, Any]:
    """Take a snapshot of the local event database. Returns its manifest."""
    db = _db_config()
    engine = _db_engine(db)
    backup_dir = _backup_dir()

    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    filename = f'frvv-local-{trigger}-{timestamp}.dump'
    dump_path = backup_dir / filename

    if engine == 'postgresql':
        cmd = [
            'pg_dump', '-Fc', '--no-owner', '--no-acl',
            '-h', str(db.get('HOST') or 'localhost'),
            '-p', str(db.get('PORT') or '5432'),
            '-U', str(db.get('USER') or 'postgres'),
            '-d', str(db['NAME']),
            '-f', str(dump_path),
        ]
        _run(cmd, _pg_env(db))
    else:
        _sqlite_copy(db['NAME'], dump_path)

    manifest = {
        'filename': filename,
        'created_at': datetime.now().isoformat(),
        'trigger': trigger,
        'label': label or None,
        'triggered_by': triggered_by or None,
        'size_bytes': dump_path.stat().st_size,
        'db_name': str(db['NAME']),
        'engine': engine,
    }
    _manifest_path(dump_path).write_text(json.dumps(manifest, indent=2))

    _prune_old_backups(backup_dir)
    return manifest


def list_backups() -> list[dict[str, Any]]:
    """Return all known backups (newest first), reading from their manifest files."""
    backup_dir = _backup_dir()
    backups = []
    for manifest_file in backup_dir.glob('*.dump.json'):
        try:
            data = json.loads(manifest_file.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        dump_path = backup_dir / data.get('filename', '')
        if not dump_path.exists():
            continue
        backups.append(data)
    backups.sort(key=lambda item: item.get('created_at', ''), reverse=True)
    return backups


def _prune_old_backups(backup_dir: Path) -> None:
    keep = getattr(settings, 'LOCAL_BACKUP_RETENTION_COUNT', 200)
    backups = list_backups()
    for stale in backups[keep:]:
        dump_path = backup_dir / stale['filename']
        dump_path.unlink(missing_ok=True)
        _manifest_path(dump_path).unlink(missing_ok=True)


def _resolve_dump_path(filename: str) -> Path:
    if not filename or not _SAFE_NAME_RE.match(filename):
        raise BackupError('Nume de fișier invalid.')
    backup_dir = _backup_dir()
    dump_path = backup_dir / filename
    if not dump_path.is_file() or dump_path.parent != backup_dir:
        raise FileNotFoundError(f'Backup-ul „{filename}” nu a fost găsit.')
    return dump_path


def restore_backup(filename: str, triggered_by: str | None = None) -> dict[str, Any]:
    """
    Restore the local event database from a previously taken backup.

    Always takes a "pre-restore safety" snapshot of the CURRENT state first,
    so an accidental/wrong restore can itself be undone by restoring that
    safety snapshot afterwards.
    """
    db = _db_config()
    engine = _db_engine(db)
    dump_path = _resolve_dump_path(filename)

    safety_manifest = create_backup(trigger=TRIGGER_PRE_RESTORE, triggered_by=triggered_by)

    # Close Django's own connection so pg_restore/sqlite3 isn't fighting an
    # open session on the file/database it's about to overwrite.
    connections.close_all()

    if engine == 'postgresql':
        cmd = [
            'pg_restore', '--clean', '--if-exists', '--no-owner', '--no-acl',
            '-h', str(db.get('HOST') or 'localhost'),
            '-p', str(db.get('PORT') or '5432'),
            '-U', str(db.get('USER') or 'postgres'),
            '-d', str(db['NAME']),
            str(dump_path),
        ]
        _run(cmd, _pg_env(db))
    else:
        _sqlite_copy(dump_path, db['NAME'])
    connections.close_all()

    return {
        'restored_from': filename,
        'restored_at': datetime.now().isoformat(),
        'safety_backup': safety_manifest['filename'],
    }
