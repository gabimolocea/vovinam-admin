from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from api.models import (
    Athlete, CategoryAthlete, CategoryAthleteScore, CategoryTeam, SoloCategory, Team, TeamCategory,
)
from api.models.scoring import medal_counts_for_athlete
from api.participations import record_participations
from landing.models import Event


class RecordParticipationsTests(TestCase):
    """Everyone enrolled who didn't place gets "Participare" - and nobody else does."""

    def setUp(self):
        now = timezone.now()
        self.event = Event.objects.create(
            title='Cupa', slug='cupa', start_date=now - timedelta(days=2), end_date=now - timedelta(days=1),
            event_type='competition',
        )
        self.category = SoloCategory.objects.create(name='Solo', event=self.event)

    def athlete(self, name, place=None):
        athlete = Athlete.objects.create(first_name=name, last_name='Test')
        CategoryAthlete.objects.create(category=self.category, athlete=athlete, place=place)
        return athlete

    def results(self, athlete):
        return list(CategoryAthleteScore.objects.filter(athlete=athlete).values_list('placement_claimed', 'status'))

    def test_enrolled_without_place_gets_an_approved_participation(self):
        athlete = self.athlete('Fara')
        self.assertEqual(record_participations(self.event), 1)
        self.assertEqual(self.results(athlete), [('participation', 'approved')])

    def test_the_result_scoring_already_created_is_reused_not_duplicated(self):
        athlete = self.athlete('Arbitrat')
        CategoryAthleteScore.objects.create(category=self.category, athlete=athlete, type='solo', score=17)
        record_participations(self.event)
        self.assertEqual(self.results(athlete), [('participation', 'approved')])

    def test_podium_athletes_are_left_alone(self):
        by_place = self.athlete('Locul1', place=1)
        by_result = self.athlete('Locul2')
        CategoryAthleteScore.objects.create(category=self.category, athlete=by_result, placement_claimed='2nd')

        self.assertEqual(record_participations(self.event), 0)
        self.assertEqual(self.results(by_place), [])
        self.assertEqual(self.results(by_result), [('2nd', 'approved')])

    def test_running_again_changes_nothing(self):
        self.athlete('Fara')
        record_participations(self.event)
        self.assertEqual(record_participations(self.event), 0)
        self.assertEqual(CategoryAthleteScore.objects.count(), 1)

    def test_a_team_without_place_gets_one_participation_for_its_members(self):
        a1 = Athlete.objects.create(first_name='Echipa', last_name='Unu')
        a2 = Athlete.objects.create(first_name='Echipa', last_name='Doi')
        team, _ = Team.get_or_create_by_members([a1, a2])
        category = TeamCategory.objects.create(name='Echipe', event=self.event)
        CategoryTeam.objects.create(category=category, team=team)

        record_participations(self.event)
        record_participations(self.event)

        result = CategoryAthleteScore.objects.get(category=category)
        self.assertEqual(result.placement_claimed, 'participation')
        self.assertEqual(set(result.team_members.values_list('pk', flat=True)), {a1.pk, a2.pk})

    def test_a_participation_is_not_a_medal(self):
        athlete = self.athlete('Fara')
        record_participations(self.event)
        self.assertEqual(medal_counts_for_athlete(athlete), {'gold': 0, 'silver': 0, 'bronze': 0})

    def test_command_covers_competitions_that_have_ended(self):
        athlete = self.athlete('Fara')
        call_command('record_participations', stdout=StringIO())
        self.assertEqual(self.results(athlete), [('participation', 'approved')])


class SelfSubmittedParticipationTests(TestCase):
    def test_an_athlete_can_claim_participation_and_it_can_be_approved(self):
        from api.models import User

        now = timezone.now()
        event = Event.objects.create(
            title='Cupa', slug='cupa', start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        category = SoloCategory.objects.create(name='Solo', event=event)
        athlete = Athlete.objects.create(first_name='Singur', last_name='Test')
        admin = User.objects.create_user(username='adm', email='adm@example.com', password='x', role='admin')

        result = CategoryAthleteScore.objects.create(
            category=category, athlete=athlete, type='solo', placement_claimed='participation',
            submitted_by_athlete=True,
        )
        self.assertEqual(result.status, 'pending')

        result.approve(admin)
        result.refresh_from_db()
        self.assertEqual(result.status, 'approved')
        self.assertEqual(medal_counts_for_athlete(athlete), {'gold': 0, 'silver': 0, 'bronze': 0})
