"""
Runs forever, taking an automatic local-event backup every N minutes.

Intended to run as its own container (`backup-scheduler` service in
docker-compose.local.yml), completely separate from the Django web process,
so a crash/restart of the backend never interrupts the backup cadence and
vice versa.
"""

import time

from django.conf import settings
from django.core.management.base import BaseCommand

from api.local_backup import BackupError, TRIGGER_SCHEDULED, create_backup


class Command(BaseCommand):
    help = 'Continuously take scheduled backups of the local event database every LOCAL_BACKUP_INTERVAL_MINUTES.'

    # The backup-scheduler container (docker-compose.local.yml) runs this
    # command directly as its entrypoint, skipping entrypoint.local.sh's
    # `collectstatic` step - so the static manifest never exists there, and
    # Django's default system checks (which resolve urls.py, including the
    # ManifestStaticFilesStorage-backed favicon route) would fail every
    # startup. This command never serves HTTP/URLs, so those checks don't
    # apply to it.
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval-minutes', type=int, default=None,
            help='Override settings.LOCAL_BACKUP_INTERVAL_MINUTES.',
        )

    def handle(self, *args, **options):
        interval_minutes = options['interval_minutes'] or getattr(settings, 'LOCAL_BACKUP_INTERVAL_MINUTES', 15)
        interval_seconds = max(interval_minutes, 1) * 60

        self.stdout.write(self.style.SUCCESS(
            f'Backup automat pornit: la fiecare {interval_minutes} minute. Ctrl+C pentru oprire.'
        ))

        while True:
            time.sleep(interval_seconds)
            try:
                manifest = create_backup(trigger=TRIGGER_SCHEDULED)
                self.stdout.write(f"[{manifest['created_at']}] backup automat: {manifest['filename']}")
            except BackupError as exc:
                self.stderr.write(self.style.WARNING(f'Backup automat eșuat: {exc}'))
