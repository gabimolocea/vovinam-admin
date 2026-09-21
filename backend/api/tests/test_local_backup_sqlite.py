import sqlite3
import tempfile
from pathlib import Path

from django.test import SimpleTestCase, override_settings

from api import local_backup


def _make_sqlite_db(path, value):
    conn = sqlite3.connect(str(path))
    try:
        conn.execute('CREATE TABLE marker (value TEXT)')
        conn.execute('INSERT INTO marker (value) VALUES (?)', (value,))
        conn.commit()
    finally:
        conn.close()


def _read_marker(path):
    conn = sqlite3.connect(str(path))
    try:
        row = conn.execute('SELECT value FROM marker').fetchone()
        return row[0] if row else None
    finally:
        conn.close()


class LocalBackupSqliteTests(SimpleTestCase):
    """The Electron launcher runs the local venue backend on SQLite, not
    PostgreSQL (no Docker requirement) - this locks in that
    create_backup/restore_backup actually work against a plain .sqlite3
    file instead of unconditionally requiring pg_dump/pg_restore."""

    databases = {'default'}

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp_dir.cleanup)
        tmp_path = Path(self.tmp_dir.name)

        self.db_path = tmp_path / 'db.sqlite3'
        self.backup_dir = tmp_path / 'backups'
        _make_sqlite_db(self.db_path, 'original')

        override = override_settings(
            DATABASES={'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': str(self.db_path)}},
            LOCAL_BACKUP_DIR=str(self.backup_dir),
        )
        override.enable()
        self.addCleanup(override.disable)

    def test_create_backup_snapshots_a_sqlite_database(self):
        manifest = local_backup.create_backup(trigger=local_backup.TRIGGER_MANUAL)

        self.assertEqual(manifest['engine'], 'sqlite3')
        backup_path = self.backup_dir / manifest['filename']
        self.assertTrue(backup_path.is_file())
        self.assertEqual(_read_marker(backup_path), 'original')

    def test_list_backups_surfaces_the_manifest(self):
        local_backup.create_backup(trigger=local_backup.TRIGGER_MANUAL, label='before weigh-in')

        backups = local_backup.list_backups()

        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0]['label'], 'before weigh-in')
        self.assertEqual(backups[0]['engine'], 'sqlite3')

    def test_restore_backup_reverts_a_later_change(self):
        manifest = local_backup.create_backup(trigger=local_backup.TRIGGER_MANUAL)

        # Simulate a risky change made after the backup was taken.
        conn = sqlite3.connect(str(self.db_path))
        conn.execute('UPDATE marker SET value = ?', ('corrupted',))
        conn.commit()
        conn.close()
        self.assertEqual(_read_marker(self.db_path), 'corrupted')

        report = local_backup.restore_backup(manifest['filename'])

        self.assertEqual(report['restored_from'], manifest['filename'])
        self.assertEqual(_read_marker(self.db_path), 'original')
        # restore_backup takes its own pre-restore safety snapshot first.
        self.assertEqual(len(local_backup.list_backups()), 2)

    def test_restore_backup_rejects_unknown_filename(self):
        with self.assertRaises(FileNotFoundError):
            local_backup.restore_backup('does-not-exist.dump')
