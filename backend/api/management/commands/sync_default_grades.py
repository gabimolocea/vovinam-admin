from django.core.management.base import BaseCommand

from api.grade_catalog import sync_default_grades


class Command(BaseCommand):
    help = 'Synchronizează catalogul implicit de grade FRVV în baza de date.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--no-prune',
            action='store_true',
            help='Nu șterge gradele suplimentare nefolosite din baza de date.',
        )

    def handle(self, *args, **options):
        grades = sync_default_grades(prune_unused=not options['no_prune'])
        self.stdout.write(self.style.SUCCESS(f'S-au sincronizat {grades.count()} grade implicite.'))