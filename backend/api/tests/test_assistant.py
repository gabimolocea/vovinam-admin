"""Tests for the AI chat assistant (api/assistant.py, api/assistant_tools.py,
api/views/assistant.py). The Anthropic client is always mocked - these tests
never make a real API call - see _text_response/_tool_use_response below for
the fake Claude response shapes used to drive the tool-calling loop."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Athlete, Category, CategoryAthlete, Club, FightCategory
from api.assistant_tools import tool_list_categories, _visible_club_ids
from landing.models import Event

User = get_user_model()


def _text_response(text):
    return SimpleNamespace(stop_reason='end_turn', content=[SimpleNamespace(type='text', text=text)])


def _tool_use_response(tool_name, tool_input, tool_use_id='tool_1'):
    return SimpleNamespace(
        stop_reason='tool_use',
        content=[SimpleNamespace(type='tool_use', name=tool_name, input=tool_input, id=tool_use_id)],
    )


class AssistantAccessTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.plain_athlete_user = User.objects.create_user(
            username='assistant-plain-athlete', email='plain@example.com', password='testpass123', role='athlete',
        )
        Athlete.objects.create(user=self.plain_athlete_user, first_name='Plain', last_name='Athlete', status='approved')

    def test_plain_athlete_forbidden(self):
        self.client.force_authenticate(user=self.plain_athlete_user)
        response = self.client.post('/api/assistant/chat/', {'message': 'salut'}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_forbidden(self):
        response = self.client.post('/api/assistant/chat/', {'message': 'salut'}, format='json')
        self.assertEqual(response.status_code, 401)

    @override_settings(ANTHROPIC_API_KEY='test-key')
    @patch('anthropic.Anthropic')
    def test_empty_message_rejected(self, mock_anthropic_cls):
        admin = User.objects.create_user(
            username='assistant-empty-admin', email='empty-admin@example.com', password='testpass123',
            role='admin', is_staff=True,
        )
        self.client.force_authenticate(user=admin)
        response = self.client.post('/api/assistant/chat/', {'message': '  '}, format='json')
        self.assertEqual(response.status_code, 400)
        mock_anthropic_cls.assert_not_called()


class AssistantMissingKeyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='assistant-nokey-admin', email='nokey-admin@example.com', password='testpass123',
            role='admin', is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    @override_settings(ANTHROPIC_API_KEY='')
    def test_missing_api_key_returns_clean_503(self):
        response = self.client.post('/api/assistant/chat/', {'message': 'salut'}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertIn('error', response.json())


class AssistantEnrollFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

        self.club_a = Club.objects.create(name='Assistant Club A')
        self.club_b = Club.objects.create(name='Assistant Club B')

        self.admin = User.objects.create_user(
            username='assistant-flow-admin', email='flow-admin@example.com', password='testpass123',
            role='admin', is_staff=True,
        )

        self.coach_user = User.objects.create_user(
            username='assistant-flow-coach', email='flow-coach@example.com', password='testpass123', role='athlete',
        )
        self.coach = Athlete.objects.create(
            user=self.coach_user, first_name='Coach', last_name='A', club=self.club_a, is_coach=True, status='approved',
        )

        self.athlete_a = Athlete.objects.create(first_name='Ana', last_name='ClubA', club=self.club_a, status='approved')
        self.athlete_b = Athlete.objects.create(first_name='Bogdan', last_name='ClubB', club=self.club_b, status='approved')

        now = timezone.now()
        self.event = Event.objects.create(
            title='Assistant Test Event', slug='assistant-test-event',
            start_date=now + timedelta(days=10), end_date=now + timedelta(days=11),
            event_type='competition',
        )
        self.category = FightCategory.objects.create(name='Assistant Fight Category', event=self.event)

    @override_settings(ANTHROPIC_API_KEY='test-key')
    @patch('anthropic.Anthropic')
    def test_admin_can_enroll_athlete_from_any_club(self, mock_anthropic_cls):
        mock_client = mock_anthropic_cls.return_value
        mock_client.messages.create.return_value = _tool_use_response(
            'enroll_athlete', {'athlete_id': self.athlete_b.id, 'category_id': self.category.id, 'weight': 65},
        )
        self.client.force_authenticate(user=self.admin)

        chat_response = self.client.post('/api/assistant/chat/', {'message': 'înscrie-l pe Bogdan'}, format='json')
        self.assertEqual(chat_response.status_code, 200)
        payload = chat_response.json()
        self.assertIsNotNone(payload['pending_confirmation'])
        self.assertFalse(CategoryAthlete.objects.filter(athlete=self.athlete_b, category=self.category).exists())

        confirm_response = self.client.post('/api/assistant/confirm/', {
            'conversation_id': payload['conversation_id'],
            'message_id': payload['message_id'],
        }, format='json')
        self.assertEqual(confirm_response.status_code, 200)
        self.assertTrue(CategoryAthlete.objects.filter(athlete=self.athlete_b, category=self.category).exists())

    @override_settings(ANTHROPIC_API_KEY='test-key')
    @patch('anthropic.Anthropic')
    def test_coach_can_enroll_own_club_athlete(self, mock_anthropic_cls):
        mock_client = mock_anthropic_cls.return_value
        mock_client.messages.create.return_value = _tool_use_response(
            'enroll_athlete', {'athlete_id': self.athlete_a.id, 'category_id': self.category.id},
        )
        self.client.force_authenticate(user=self.coach_user)

        chat_response = self.client.post('/api/assistant/chat/', {'message': 'înscrie-o pe Ana'}, format='json')
        self.assertEqual(chat_response.status_code, 200)
        payload = chat_response.json()
        self.assertIsNotNone(payload['pending_confirmation'])

        confirm_response = self.client.post('/api/assistant/confirm/', {
            'conversation_id': payload['conversation_id'],
            'message_id': payload['message_id'],
        }, format='json')
        self.assertEqual(confirm_response.status_code, 200)
        self.assertTrue(CategoryAthlete.objects.filter(athlete=self.athlete_a, category=self.category).exists())

    @override_settings(ANTHROPIC_API_KEY='test-key')
    @patch('anthropic.Anthropic')
    def test_coach_cannot_enroll_other_club_athlete(self, mock_anthropic_cls):
        """The model "asks" to enroll an athlete from another club - the
        tool function must refuse and no row may be created, even though
        nothing stopped the model itself from making the call."""
        mock_client = mock_anthropic_cls.return_value
        mock_client.messages.create.side_effect = [
            _tool_use_response('enroll_athlete', {'athlete_id': self.athlete_b.id, 'category_id': self.category.id}),
            _text_response('Nu am putut înscrie acel sportiv.'),
        ]
        self.client.force_authenticate(user=self.coach_user)

        chat_response = self.client.post('/api/assistant/chat/', {'message': 'înscrie-l pe Bogdan'}, format='json')
        self.assertEqual(chat_response.status_code, 200)
        payload = chat_response.json()
        self.assertIsNone(payload['pending_confirmation'])
        self.assertFalse(CategoryAthlete.objects.filter(athlete=self.athlete_b, category=self.category).exists())

    @override_settings(ANTHROPIC_API_KEY='test-key')
    @patch('anthropic.Anthropic')
    def test_cancel_does_not_create_enrollment(self, mock_anthropic_cls):
        mock_client = mock_anthropic_cls.return_value
        mock_client.messages.create.return_value = _tool_use_response(
            'enroll_athlete', {'athlete_id': self.athlete_a.id, 'category_id': self.category.id},
        )
        self.client.force_authenticate(user=self.coach_user)

        chat_response = self.client.post('/api/assistant/chat/', {'message': 'înscrie-o pe Ana'}, format='json')
        payload = chat_response.json()

        confirm_response = self.client.post('/api/assistant/confirm/', {
            'conversation_id': payload['conversation_id'],
            'message_id': payload['message_id'],
            'confirmed': False,
        }, format='json')
        self.assertEqual(confirm_response.status_code, 200)
        self.assertFalse(CategoryAthlete.objects.filter(athlete=self.athlete_a, category=self.category).exists())


class AssistantVisibilityToolTests(TestCase):
    """Direct unit tests of the tool layer's club/deadline visibility fix
    (_visible_club_ids / tool_list_categories) - the gap this feature must
    not regress (see AdminCentralizatorMatrix.jsx's canSeeAllClubs)."""

    def setUp(self):
        self.club_a = Club.objects.create(name='Visibility Club A')
        self.club_b = Club.objects.create(name='Visibility Club B')

        self.coach_user = User.objects.create_user(
            username='visibility-coach', email='visibility-coach@example.com', password='testpass123', role='athlete',
        )
        self.coach = Athlete.objects.create(
            user=self.coach_user, first_name='Coach', last_name='Vis', club=self.club_a, is_coach=True, status='approved',
        )
        self.admin = User.objects.create_user(
            username='visibility-admin', email='visibility-admin@example.com', password='testpass123',
            role='admin', is_staff=True,
        )

        self.athlete_a = Athlete.objects.create(first_name='Ana', last_name='VisA', club=self.club_a, status='approved')
        self.athlete_b = Athlete.objects.create(first_name='Bogdan', last_name='VisB', club=self.club_b, status='approved')

        now = timezone.now()
        self.future_deadline_event = Event.objects.create(
            title='Future Deadline Event', slug='future-deadline-event',
            start_date=now + timedelta(days=10), end_date=now + timedelta(days=11),
            coach_registration_deadline=now + timedelta(days=5),
            event_type='competition',
        )
        self.past_deadline_event = Event.objects.create(
            title='Past Deadline Event', slug='past-deadline-event',
            start_date=now + timedelta(days=10), end_date=now + timedelta(days=11),
            coach_registration_deadline=now - timedelta(days=1),
            event_type='competition',
        )

        self.future_category = FightCategory.objects.create(name='Future Category', event=self.future_deadline_event)
        CategoryAthlete.objects.create(category=self.future_category, athlete=self.athlete_a)
        CategoryAthlete.objects.create(category=self.future_category, athlete=self.athlete_b)

        self.past_category = FightCategory.objects.create(name='Past Category', event=self.past_deadline_event)
        CategoryAthlete.objects.create(category=self.past_category, athlete=self.athlete_a)
        CategoryAthlete.objects.create(category=self.past_category, athlete=self.athlete_b)

    def test_coach_sees_only_own_club_before_deadline(self):
        result = tool_list_categories(self.coach_user, event_id=self.future_deadline_event.id)
        category = result['categories'][0]
        self.assertEqual(category['enrolled_count'], 1)
        self.assertEqual(category['enrolled_athletes'][0]['club_id'], self.club_a.id)

    def test_coach_sees_every_club_after_deadline(self):
        result = tool_list_categories(self.coach_user, event_id=self.past_deadline_event.id)
        category = result['categories'][0]
        self.assertEqual(category['enrolled_count'], 2)

    def test_admin_sees_every_club_regardless_of_deadline(self):
        result = tool_list_categories(self.admin, event_id=self.future_deadline_event.id)
        category = result['categories'][0]
        self.assertEqual(category['enrolled_count'], 2)

    def test_visible_club_ids_direct(self):
        self.assertEqual(_visible_club_ids(self.coach_user, self.future_deadline_event), {self.club_a.id})
        self.assertIsNone(_visible_club_ids(self.coach_user, self.past_deadline_event))
        self.assertIsNone(_visible_club_ids(self.admin, self.future_deadline_event))


class AssistantThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='assistant-throttle-admin', email='throttle-admin@example.com', password='testpass123',
            role='admin', is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def tearDown(self):
        cache.clear()

    @override_settings(ANTHROPIC_API_KEY='test-key')
    @patch('anthropic.Anthropic')
    def test_throttle_returns_429_past_configured_rate(self, mock_anthropic_cls):
        mock_client = mock_anthropic_cls.return_value
        mock_client.messages.create.return_value = _text_response('ok')

        statuses = []
        for _ in range(21):
            response = self.client.post('/api/assistant/chat/', {'message': 'salut'}, format='json')
            statuses.append(response.status_code)

        self.assertIn(429, statuses)
