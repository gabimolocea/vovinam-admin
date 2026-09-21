from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (
    Athlete,
    FightCategory,
    Match,
    MatchRound,
    RefereePointEvent,
    RefereeScore,
)


User = get_user_model()


class LiveFullscreenLegacySyncTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username='adminsync',
            email='adminsync@example.com',
            password='testpass123',
            first_name='Admin',
            last_name='Sync',
            role='admin',
            is_staff=True,
        )
        self.central_ref = Athlete.objects.create(
            user=self.admin_user,
            first_name='Central',
            last_name='Ref',
            is_referee=True,
            status='approved',
        )
        self.red_corner = Athlete.objects.create(first_name='Red', last_name='Corner', status='approved')
        self.blue_corner = Athlete.objects.create(first_name='Blue', last_name='Corner', status='approved')
        self.category = FightCategory.objects.create(name='Fight Test')
        self.match = Match.objects.create(
            category=self.category,
            match_type='qualifications',
            red_corner=self.red_corner,
            blue_corner=self.blue_corner,
            central_referee=self.central_ref,
        )
        # A new Match auto-provisions its 2x2min rounds (see api.signals) -
        # replace them with this test's own custom round.
        MatchRound.objects.filter(match=self.match).delete()
        self.round1 = MatchRound.objects.create(match=self.match, round_number=1, duration_seconds=180)
        self.client.force_authenticate(user=self.admin_user)

    def test_match_referee_scores_sync_to_legacy_admin_models(self):
        round_response = self.client.post(
            '/api/match-referee-scores/',
            {
                'match': self.match.id,
                'referee': self.central_ref.id,
                'round': self.round1.id,
                'red_corner_score': 9,
                'blue_corner_score': 3,
            },
            format='json',
        )
        self.assertEqual(round_response.status_code, 201)

        final_response = self.client.post(
            '/api/match-referee-scores/',
            {
                'match': self.match.id,
                'referee': self.central_ref.id,
                'round': None,
                'red_corner_score': 1,
                'blue_corner_score': 0,
            },
            format='json',
        )
        self.assertEqual(final_response.status_code, 201)

        legacy_score = RefereeScore.objects.get(match=self.match, referee=self.central_ref)
        self.assertEqual(legacy_score.red_corner_score, 9)
        self.assertEqual(legacy_score.blue_corner_score, 3)
        self.assertEqual(legacy_score.winner, 'red')

        legacy_events = RefereePointEvent.objects.filter(
            match=self.match,
            referee=self.central_ref,
            event_type='score',
            metadata__origin='match_referee_score_sync',
        )
        self.assertEqual(legacy_events.count(), 2)
        self.assertEqual(set(legacy_events.values_list('side', flat=True)), {'red', 'blue'})

    def test_match_penalty_events_sync_to_central_penalties(self):
        response = self.client.post(
            '/api/match-events/',
            {
                'match': self.match.id,
                'round': self.round1.id,
                'event_type': 'penalty_red',
                'corner': 'red',
                'value': -2,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)

        legacy_penalty = RefereePointEvent.objects.get(
            match=self.match,
            referee=self.central_ref,
            event_type='penalty',
            metadata__origin='match_event_sync',
        )
        self.assertEqual(legacy_penalty.side, 'red')
        self.assertEqual(legacy_penalty.points, -2)
        self.assertTrue(legacy_penalty.metadata.get('central'))
        self.assertEqual(legacy_penalty.metadata.get('round'), 1)
