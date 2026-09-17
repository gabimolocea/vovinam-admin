from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import CategoryAthleteScore


class Command(BaseCommand):
    """One-off fix for results approved before the award-population bug
    (silently never wrote SoloCategory/FightCategory/TeamCategory's
    first/second/third_place, nor CategoryAthlete/CategoryTeam's `place`)
    was fixed: re-runs the same award/placement logic that now already
    runs automatically on every new approval, against every athlete result
    that was approved before the fix existed. Safe to run more than once -
    it only writes a field when its current value actually differs."""

    help = "Backfills first/second/third_place and CategoryAthlete/CategoryTeam.place for already-approved athlete results."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would change without writing anything.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        qs = CategoryAthleteScore.objects.filter(
            status='approved', submitted_by_athlete=True,
        ).exclude(placement_claimed__isnull=True).exclude(placement_claimed='')

        touched = 0
        for score in qs.select_related('category', 'athlete'):
            with transaction.atomic():
                sid = transaction.savepoint()
                score._update_category_awards_text_only()
                if score.type == 'teams':
                    score._create_or_update_team()
                if dry_run:
                    transaction.savepoint_rollback(sid)
                else:
                    transaction.savepoint_commit(sid)
            touched += 1
            self.stdout.write(f"  {score.category} - {score.athlete} - {score.placement_claimed}")

        verb = 'Ar actualiza' if dry_run else 'S-au actualizat'
        self.stdout.write(self.style.SUCCESS(f"{verb} {touched} rezultate aprobate."))
