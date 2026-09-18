from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from api.models import (
    Athlete,
    CategoryAthlete,
    CategoryAthleteScore,
    CategoryTeam,
    SoloCategory,
    Team,
    TeamCategory,
    User,
)
from landing.models import Event


class IndividualPlacementConflictTests(TestCase):
    """Two athletes can both submit a "1st place" claim for the same solo
    category while pending - approving the second one used to silently
    overwrite the first athlete's already-approved placement with no
    warning. approve() must now block that instead."""

    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='placement-admin', email='placement-admin@example.com',
            password='testpass123', role='admin',
        )
        now = timezone.now()
        self.competition = Event.objects.create(
            title='Placement Conflict Competition', slug='placement-conflict-competition',
            start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        self.category = SoloCategory.objects.create(name='Solo Category', event=self.competition)
        self.first_athlete = Athlete.objects.create(first_name='First', last_name='Claimant', status='approved')
        self.second_athlete = Athlete.objects.create(first_name='Second', last_name='Claimant', status='approved')

    def _make_result(self, athlete, placement='1st'):
        return CategoryAthleteScore.objects.create(
            category=self.category, type='solo', athlete=athlete,
            submitted_by_athlete=True, placement_claimed=placement,
        )

    def test_approving_a_second_claim_for_the_same_place_is_blocked(self):
        first_result = self._make_result(self.first_athlete)
        first_result.approve(self.admin_user)
        self.category.refresh_from_db()
        self.assertEqual(self.category.first_place_id, self.first_athlete.pk)

        second_result = self._make_result(self.second_athlete)
        with self.assertRaises(ValidationError):
            second_result.approve(self.admin_user)

        second_result.refresh_from_db()
        self.assertEqual(second_result.status, 'pending')
        # The first athlete's placement must survive untouched.
        self.category.refresh_from_db()
        self.assertEqual(self.category.first_place_id, self.first_athlete.pk)
        self.assertEqual(
            CategoryAthlete.objects.get(category=self.category, athlete=self.first_athlete).place, 1,
        )

    def test_approving_a_different_place_for_another_athlete_is_not_blocked(self):
        first_result = self._make_result(self.first_athlete, placement='1st')
        first_result.approve(self.admin_user)

        second_result = self._make_result(self.second_athlete, placement='2nd')
        second_result.approve(self.admin_user)  # should not raise

        self.category.refresh_from_db()
        self.assertEqual(self.category.first_place_id, self.first_athlete.pk)
        self.assertEqual(self.category.second_place_id, self.second_athlete.pk)

    def test_reapproving_the_same_athletes_own_claim_is_not_a_conflict(self):
        result = self._make_result(self.first_athlete)
        result.approve(self.admin_user)

        # A second, corrected claim from the same athlete for the same
        # place (e.g. resubmitted after a revision request) isn't a
        # conflict with themself.
        correction = self._make_result(self.first_athlete)
        correction.approve(self.admin_user)  # should not raise


class TeamPlacementConflictTests(TestCase):
    """Same rule for team results - a differently-composed team claiming
    an already-awarded place is blocked; the same team (by member set)
    re-approving isn't."""

    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='team-placement-admin', email='team-placement-admin@example.com',
            password='testpass123', role='admin',
        )
        now = timezone.now()
        self.competition = Event.objects.create(
            title='Team Placement Conflict Competition', slug='team-placement-conflict-competition',
            start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        self.category = TeamCategory.objects.create(name='Team Category', event=self.competition)
        self.athlete_one = Athlete.objects.create(first_name='Alice', last_name='One', status='approved')
        self.athlete_two = Athlete.objects.create(first_name='Bob', last_name='Two', status='approved')
        self.athlete_three = Athlete.objects.create(first_name='Cara', last_name='Three', status='approved')
        self.athlete_four = Athlete.objects.create(first_name='Dan', last_name='Four', status='approved')

    def _make_team_result(self, members, placement='1st'):
        result = CategoryAthleteScore.objects.create(
            category=self.category, type='teams',
            submitted_by_athlete=True, placement_claimed=placement,
        )
        result.team_members.set(members)
        return result

    def test_a_different_team_claiming_the_same_place_is_blocked(self):
        first_result = self._make_team_result([self.athlete_one, self.athlete_two])
        first_result.approve(self.admin_user)
        first_team = Team.objects.first()

        second_result = self._make_team_result([self.athlete_three, self.athlete_four])
        with self.assertRaises(ValidationError):
            second_result.approve(self.admin_user)

        second_result.refresh_from_db()
        self.assertEqual(second_result.status, 'pending')
        self.category.refresh_from_db()
        self.assertEqual(self.category.first_place_team_id, first_team.pk)
        # No second team/enrollment should have been created by the
        # rejected approval attempt.
        self.assertEqual(Team.objects.count(), 1)
        self.assertEqual(CategoryTeam.objects.filter(category=self.category).count(), 1)

    def test_the_same_team_reapproving_is_not_a_conflict(self):
        first_result = self._make_team_result([self.athlete_one, self.athlete_two])
        first_result.approve(self.admin_user)

        # Same exact member set submitted again (e.g. a corrected/resent
        # claim) - not a conflict with itself.
        correction = self._make_team_result([self.athlete_one, self.athlete_two])
        correction.approve(self.admin_user)  # should not raise
