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
