from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from api.models import (
    Athlete,
    CategoryAthleteScore,
    CategoryTeam,
    Team,
    TeamCategory,
    User,
)
from landing.models import Event


class TeamResultApprovalTests(TestCase):
    """
    Teams are identified by their exact set of members (>=2 athletes), not
    by a persisted name. These tests cover the approval path that creates
    Team/TeamMember/CategoryTeam records from a submitted team result.
    """

    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='team-admin',
            email='team-admin@example.com',
            password='testpass123',
            role='admin',
        )
        now = timezone.now()
        self.competition = Event.objects.create(
            title='Team Result Competition',
            slug='team-result-competition',
            start_date=now,
            end_date=now + timedelta(days=1),
            event_type='competition',
        )
        self.category = TeamCategory.objects.create(name='Team Category', event=self.competition)
        self.athlete_one = Athlete.objects.create(first_name='Alice', last_name='One', status='approved')
        self.athlete_two = Athlete.objects.create(first_name='Bob', last_name='Two', status='approved')

    def _make_team_result(self, members, placement='1st'):
        result = CategoryAthleteScore.objects.create(
            category=self.category,
            type='teams',
            submitted_by_athlete=True,
            placement_claimed=placement,
        )
        result.team_members.set(members)
        return result

    def test_approve_creates_team_and_enrolls_it_in_category(self):
        result = self._make_team_result([self.athlete_one, self.athlete_two])

        result.approve(self.admin_user)

        self.assertEqual(result.status, 'approved')
        self.assertEqual(Team.objects.count(), 1)
        team = Team.objects.first()
        self.assertEqual(
            set(team.members.values_list('athlete_id', flat=True)),
            {self.athlete_one.pk, self.athlete_two.pk},
        )
        self.assertTrue(CategoryTeam.objects.filter(category=self.category, team=team).exists())
        self.category.refresh_from_db()
        self.assertEqual(self.category.first_place_team_id, team.pk)

    def test_approve_reuses_existing_team_with_same_members(self):
        first_result = self._make_team_result([self.athlete_one, self.athlete_two], placement='1st')
        first_result.approve(self.admin_user)

        second_category = TeamCategory.objects.create(name='Second Team Category', event=self.competition)
        second_result = CategoryAthleteScore.objects.create(
            category=second_category,
            type='teams',
            submitted_by_athlete=True,
            placement_claimed='2nd',
        )
        second_result.team_members.set([self.athlete_one, self.athlete_two])
        second_result.approve(self.admin_user)

        # Same member set -> same Team reused across categories, not duplicated.
        self.assertEqual(Team.objects.count(), 1)
        self.assertTrue(CategoryTeam.objects.filter(category=second_category).exists())

    def test_approve_rejects_team_with_fewer_than_min_members(self):
        result = self._make_team_result([self.athlete_one])

        with self.assertRaises(ValidationError):
            result.approve(self.admin_user)

        result.refresh_from_db()
        self.assertEqual(result.status, 'pending')
        self.assertEqual(Team.objects.count(), 0)
