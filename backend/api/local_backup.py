"""
Local event backup/restore service ("time travel" for competition day).

Snapshots are taken with `pg_dump -Fc` (PostgreSQL custom format) into
`settings.LOCAL_BACKUP_DIR`, each with a small JSON manifest next to it so
the admin UI can list "1 hour ago", "2 hours ago", etc. without having to
open the dump file itself.

Restoring always takes a fresh "pre-restore safety" snapshot first, so an
operator who picks the wrong backup by mistake can always come back to
where they were a minute ago.

Only used when `settings.IS_LOCAL_EVENT_SERVER` is True (the venue/LAN
server, see crud/settings_local.py). Requires PostgreSQL — intentionally
raises if the active database engine is not postgresql.
"""

from __future__ import annotations

import json
import os
import re
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
    db = settings.DATABASES['default']
    if 'postgresql' not in db.get('ENGINE', ''):
        raise BackupError(
            'Backup-urile locale funcționează doar cu PostgreSQL. '
            'Rulează cu DJANGO_SETTINGS_MODULE=crud.settings_local.'
        )
    return db


def _pg_env(db: dict[str, Any]) -> dict[str, str]:
    env = os.environ.copy()
    if db.get('PASSWORD'):
        env['PGPASSWORD'] = db['PASSWORD']
    return env


def _run(cmd: list[str], env: dict[str, str]) -> None:
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise BackupError((result.stderr or result.stdout or 'comandă eșuată').strip()[:2000])


def _manifest_path(dump_path: Path) -> Path:
    return dump_path.with_suffix(dump_path.suffix + '.json')


def create_backup(trigger: str = TRIGGER_MANUAL, label: str | None = None,
                   triggered_by: str | None = None) -> dict[str, Any]:
    """Take a pg_dump snapshot of the local event database. Returns its manifest."""
    db = _db_config()
    backup_dir = _backup_dir()

    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    filename = f'frvv-local-{trigger}-{timestamp}.dump'
    dump_path = backup_dir / filename

    cmd = [
        'pg_dump', '-Fc', '--no-owner', '--no-acl',
        '-h', str(db.get('HOST') or 'localhost'),
        '-p', str(db.get('PORT') or '5432'),
        '-U', str(db.get('USER') or 'postgres'),
        '-d', str(db['NAME']),
        '-f', str(dump_path),
    ]
    _run(cmd, _pg_env(db))

    manifest = {
        'filename': filename,
        'created_at': datetime.now().isoformat(),
        'trigger': trigger,
        'label': label or None,
        'triggered_by': triggered_by or None,
        'size_bytes': dump_path.stat().st_size,
        'db_name': db['NAME'],
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
    dump_path = _resolve_dump_path(filename)

    safety_manifest = create_backup(trigger=TRIGGER_PRE_RESTORE, triggered_by=triggered_by)

    # Close Django's own connection so pg_restore isn't fighting an open session.
    connections.close_all()

    cmd = [
        'pg_restore', '--clean', '--if-exists', '--no-owner', '--no-acl',
        '-h', str(db.get('HOST') or 'localhost'),
        '-p', str(db.get('PORT') or '5432'),
        '-U', str(db.get('USER') or 'postgres'),
        '-d', str(db['NAME']),
        str(dump_path),
    ]
    _run(cmd, _pg_env(db))
    connections.close_all()

    return {
        'restored_from': filename,
        'restored_at': datetime.now().isoformat(),
        'safety_backup': safety_manifest['filename'],
    }
