from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Athlete, Category, Match, MatchRound, User


class MatchRoundStopTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='admin-round',
            email='admin-round@example.com',
            password='testpass123',
            first_name='Admin',
            last_name='Round',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

        category = Category.objects.create(name='Fight Round Test')
        red = Athlete.objects.create(first_name='Red', last_name='One')
        blue = Athlete.objects.create(first_name='Blue', last_name='Two')
        self.match = Match.objects.create(category=category, red_corner=red, blue_corner=blue)
        # A new Match auto-provisions its 2x2min rounds (see api.signals) -
        # each test below creates its own single custom round instead.
        MatchRound.objects.filter(match=self.match).delete()

    def test_stop_active_round_marks_completed(self):
        round_obj = MatchRound.objects.create(
            match=self.match,
            round_number=1,
            status='active',
            started_at=timezone.now() - timedelta(seconds=25),
        )

        response = self.client.patch(
            f'/api/match-rounds/{round_obj.id}/',
            {'status': 'completed'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        round_obj.refresh_from_db()
        self.assertEqual(round_obj.status, 'completed')
        self.assertIsNotNone(round_obj.ended_at)

    def test_stop_paused_round_clears_pause_and_accumulates_time(self):
        paused_at = timezone.now() - timedelta(seconds=12)
        round_obj = MatchRound.objects.create(
            match=self.match,
            round_number=1,
            status='active',
            started_at=timezone.now() - timedelta(seconds=40),
            paused_at=paused_at,
            accumulated_pause_seconds=3,
        )

        response = self.client.patch(
            f'/api/match-rounds/{round_obj.id}/',
            {'status': 'completed'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        round_obj.refresh_from_db()
        self.assertEqual(round_obj.status, 'completed')
        self.assertIsNone(round_obj.paused_at)
        self.assertGreaterEqual(round_obj.accumulated_pause_seconds, 15)
        self.assertIsNotNone(round_obj.ended_at)


class MatchRoundExtraFlagTests(TestCase):
    """Repriza suplimentara trebuie sa se poata deosebi de cele din preset.

    Fara semnul asta, resetul meciului n-avea cum sa stie ce sa stearga si ce sa
    aduca la zero, si lasa in urma repriza adaugata la egalitate."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='admin-extra',
            email='admin-extra@example.com',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)
        category = Category.objects.create(name='Fight Extra Round Test')
        red = Athlete.objects.create(first_name='Red', last_name='Extra')
        blue = Athlete.objects.create(first_name='Blue', last_name='Extra')
        self.match = Match.objects.create(category=category, red_corner=red, blue_corner=blue)

    def test_rounds_are_not_extra_by_default(self):
        runda = MatchRound.objects.filter(match=self.match).first()
        self.assertIsNotNone(runda)
        self.assertFalse(runda.is_extra)

    def test_api_creates_and_reports_an_extra_round(self):
        numar = MatchRound.objects.filter(match=self.match).count() + 1
        response = self.client.post(
            '/api/match-rounds/',
            {'match': self.match.id, 'round_number': numar, 'duration_seconds': 60, 'is_extra': True},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.data['is_extra'])
        self.assertTrue(MatchRound.objects.get(id=response.data['id']).is_extra)

        listate = self.client.get(f'/api/match-rounds/?match_id={self.match.id}')
        self.assertEqual(listate.status_code, 200)
        randuri = listate.data['results'] if isinstance(listate.data, dict) else listate.data
        suplimentare = [r for r in randuri if r['is_extra']]
        self.assertEqual([r['round_number'] for r in suplimentare], [numar])

    def test_preset_can_take_the_extra_mark_back_off(self):
        runda = MatchRound.objects.create(
            match=self.match, round_number=9, duration_seconds=60, is_extra=True,
        )
        response = self.client.patch(
            f'/api/match-rounds/{runda.id}/', {'is_extra': False}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)
        runda.refresh_from_db()
        self.assertFalse(runda.is_extra)
