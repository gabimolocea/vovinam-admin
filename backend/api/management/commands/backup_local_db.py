from django.core.management.base import BaseCommand, CommandError

from api.local_backup import BackupError, TRIGGER_MANUAL, create_backup


class Command(BaseCommand):
    help = (
        'Take a single pg_dump snapshot of the local event database into '
        'settings.LOCAL_BACKUP_DIR. Used both for one-off manual backups '
        'and by `backup_loop` for the scheduled/automatic ones.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--trigger', default=TRIGGER_MANUAL,
            help='Label stored in the backup manifest (manual, scheduled, pre_import, ...).',
        )
        parser.add_argument('--label', default=None, help='Optional human note for this snapshot.')

    def handle(self, *args, **options):
        try:
            manifest = create_backup(trigger=options['trigger'], label=options.get('label'))
        except BackupError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS(
            f"Backup creat: {manifest['filename']} ({manifest['size_bytes']} bytes)"
        ))
