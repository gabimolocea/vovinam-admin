from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from api.models import Athlete, CategoryAthlete, City, Club, FightAthleteWeight, FightCategory
from landing.models import Event


class CategoryAthleteFightWeightSyncTests(TestCase):
    """A coach's declared weight on the enrollment (CategoryAthlete.weight)
    should keep mirroring into FightAthleteWeight.pre_weight_kg - the field
    the admin actually looks at - on every edit, not just the first one."""

    def setUp(self):
        now = timezone.now()
        self.event = Event.objects.create(
            title='Weight Sync Event',
            slug='weight-sync-event',
            start_date=now,
            end_date=now + timedelta(days=1),
            event_type='competition',
        )
        self.city = City.objects.create(name='Weight Sync City')
        self.club = Club.objects.create(name='Weight Sync Club', city=self.city)
        self.athlete = Athlete.objects.create(
            first_name='Sync',
            last_name='Athlete',
            date_of_birth=date(2000, 1, 1),
            club=self.club,
            city=self.city,
        )
        self.category = FightCategory.objects.create(name='Lupta -60kg', event=self.event)

    def test_first_weight_submission_creates_matching_fight_weight(self):
        enrollment = CategoryAthlete.objects.create(category=self.category, athlete=self.athlete, weight='58.50')

        fw = FightAthleteWeight.objects.get(category=self.category, athlete=self.athlete)
        self.assertEqual(str(fw.pre_weight_kg), '58.50')
        self.assertFalse(fw.is_weight_locked)

    def test_editing_the_weight_again_updates_pre_weight_kg(self):
        enrollment = CategoryAthlete.objects.create(category=self.category, athlete=self.athlete, weight='58.50')

        enrollment.weight = '59.10'
        enrollment.save()

        fw = FightAthleteWeight.objects.get(category=self.category, athlete=self.athlete)
        self.assertEqual(str(fw.pre_weight_kg), '59.10')

    def test_locked_official_weight_is_not_overwritten_by_a_later_enrollment_edit(self):
        enrollment = CategoryAthlete.objects.create(category=self.category, athlete=self.athlete, weight='58.50')

        fw = FightAthleteWeight.objects.get(category=self.category, athlete=self.athlete)
        fw.current_weight_kg = Decimal('58.50')
        fw.is_weight_locked = True
        fw.save()

        enrollment.weight = '60.00'
        enrollment.save()

        fw.refresh_from_db()
        self.assertEqual(str(fw.pre_weight_kg), '58.50')
