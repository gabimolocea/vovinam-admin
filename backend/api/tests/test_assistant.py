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

from api.models import (
    AssistantConversation, AssistantMessage, Athlete, Category, CategoryAthlete, Club,
    FightCategory, Grade, GradeHistory,
)
from api.assistant_tools import (
    tool_list_categories, _visible_club_ids, tool_create_club, tool_edit_athlete,
    tool_create_category, tool_approve_request, tool_reject_request, execute_confirmed_tool,
)
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


class AssistantAdminToolsTests(TestCase):
    """The admin-only write tools (clubs, athletes, competitions/categories/
    groups, approvals) - see the ADMIN-only section of assistant_tools.py.
    Calls the tool_* propose functions and execute_confirmed_tool directly
    (no mocked Claude needed) - matches AssistantVisibilityToolTests' style
    below."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin-tools-admin', email='admin-tools-admin@example.com', password='testpass123',
            role='admin', is_staff=True,
        )
        self.coach_user = User.objects.create_user(
            username='admin-tools-coach', email='admin-tools-coach@example.com', password='testpass123', role='athlete',
        )
        self.club = Club.objects.create(name='Admin Tools Club')
        Athlete.objects.create(user=self.coach_user, first_name='Tools', last_name='Coach', is_coach=True, club=self.club, status='approved')
        self.athlete = Athlete.objects.create(first_name='Edit', last_name='Target', club=self.club, status='approved')

    def test_non_admin_cannot_propose_club_creation(self):
        result = tool_create_club(self.coach_user, name='Sneaky Club')
        self.assertIn('error', result)
        self.assertFalse(Club.objects.filter(name='Sneaky Club').exists())

    def test_admin_create_club_end_to_end(self):
        proposal = tool_create_club(self.admin, name='New Club', description='desc')
        self.assertTrue(proposal['requires_confirmation'])
        self.assertFalse(Club.objects.filter(name='New Club').exists())
        outcome = execute_confirmed_tool(self.admin, 'create_club', proposal['args'])
        self.assertTrue(outcome['success'])
        self.assertTrue(Club.objects.filter(name='New Club').exists())

    def test_edit_athlete_ignores_disallowed_fields(self):
        proposal = tool_edit_athlete(
            self.admin, athlete_id=self.athlete.id, status='approved', cnp='1234567890123', first_name='Renamed',
        )
        self.assertTrue(proposal['requires_confirmation'])
        self.assertEqual(proposal['args'], {'athlete_id': self.athlete.id, 'first_name': 'Renamed'})
        outcome = execute_confirmed_tool(self.admin, 'edit_athlete', proposal['args'])
        self.assertTrue(outcome['success'])
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.first_name, 'Renamed')

    def test_non_admin_edit_athlete_refused(self):
        result = tool_edit_athlete(self.coach_user, athlete_id=self.athlete.id, first_name='Hacked')
        self.assertIn('error', result)
        self.athlete.refresh_from_db()
        self.assertNotEqual(self.athlete.first_name, 'Hacked')

    def test_execute_confirmed_tool_rechecks_admin(self):
        """Even called directly with a non-admin user (bypassing the propose
        step entirely), the executor itself must still refuse - defense in
        depth, not just a UI-layer check."""
        outcome = execute_confirmed_tool(self.coach_user, 'create_club', {'name': 'Bypass Club'})
        self.assertFalse(outcome['success'])
        self.assertFalse(Club.objects.filter(name='Bypass Club').exists())

    def test_create_category_respects_operational_lock(self):
        now = timezone.now()
        event = Event.objects.create(
            title='Admin Tools Event', slug='admin-tools-event', start_date=now, end_date=now,
            event_type='competition', sync_mode='local_event', sync_locked=True, local_sync_status='exported',
        )
        proposal = tool_create_category(self.admin, event_id=event.id, name='New Category')
        self.assertTrue(proposal['requires_confirmation'])
        outcome = execute_confirmed_tool(self.admin, 'create_category', proposal['args'])
        self.assertFalse(outcome['success'])
        self.assertIn('blocat', outcome['error'])

    def test_approve_account_request(self):
        pending_user = User.objects.create_user(
            username='pending-account', email='pending-account@example.com', password='testpass123', role='athlete',
        )
        pending_athlete = Athlete.objects.create(user=pending_user, first_name='Pending', last_name='Account', status='pending')
        proposal = tool_approve_request(self.admin, domain='account', item_id=pending_athlete.id)
        self.assertTrue(proposal['requires_confirmation'])
        outcome = execute_confirmed_tool(self.admin, 'approve_request', proposal['args'])
        self.assertTrue(outcome['success'])
        pending_athlete.refresh_from_db()
        self.assertEqual(pending_athlete.status, 'approved')

    def test_reject_grade_request_with_notes(self):
        grade = Grade.objects.create(name='Test Belt', rank_order=1)
        gh = GradeHistory.objects.create(athlete=self.athlete, grade=grade, submitted_by_athlete=True)
        self.assertEqual(gh.status, 'pending')
        proposal = tool_reject_request(self.admin, domain='grade', item_id=gh.id, notes='Lipsă document')
        outcome = execute_confirmed_tool(self.admin, 'reject_request', proposal['args'])
        self.assertTrue(outcome['success'])
        gh.refresh_from_db()
        self.assertEqual(gh.status, 'rejected')
        self.assertEqual(gh.admin_notes, 'Lipsă document')

    def test_cannot_approve_already_resolved_request(self):
        grade = Grade.objects.create(name='Test Belt 2', rank_order=2)
        gh = GradeHistory.objects.create(athlete=self.athlete, grade=grade, status='approved')
        result = tool_approve_request(self.admin, domain='grade', item_id=gh.id)
        self.assertIn('error', result)

    def test_non_admin_cannot_approve(self):
        grade = Grade.objects.create(name='Test Belt 3', rank_order=3)
        gh = GradeHistory.objects.create(athlete=self.athlete, grade=grade, submitted_by_athlete=True)
        result = tool_approve_request(self.coach_user, domain='grade', item_id=gh.id)
        self.assertIn('error', result)
        gh.refresh_from_db()
        self.assertEqual(gh.status, 'pending')


class AssistantReportTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='assistant-report-admin', email='report-admin@example.com', password='testpass123',
            role='admin', is_staff=True,
        )
        self.coach_user = User.objects.create_user(
            username='assistant-report-coach', email='report-coach@example.com', password='testpass123', role='athlete',
        )
        Athlete.objects.create(user=self.coach_user, first_name='Report', last_name='Coach', is_coach=True, status='approved')

        conversation = AssistantConversation.objects.create(user=self.coach_user)
        AssistantMessage.objects.create(conversation=conversation, role='user', content='cum inscriu un sportiv?')
        AssistantMessage.objects.create(
            conversation=conversation, role='assistant', content='iată cum...',
            tool_calls=[{'tool': 'list_clubs', 'args': {}, 'result': {'clubs': []}}],
        )
        AssistantMessage.objects.create(conversation=conversation, role='user', content='inscrie-l pe Ion la categoria X')
        AssistantMessage.objects.create(
            conversation=conversation, role='assistant', content='am pregătit acțiunea',
            tool_calls=[{
                'tool': 'enroll_athlete', 'args': {'athlete_id': 1, 'category_id': 2},
                'result': {'requires_confirmation': True, 'status': 'confirmed', 'summary': '...', 'tool': 'enroll_athlete', 'args': {}},
            }],
        )
        AssistantMessage.objects.create(conversation=conversation, role='user', content='inscrie-l pe Vasile la alt club')
        AssistantMessage.objects.create(
            conversation=conversation, role='assistant', content='nu am putut',
            tool_calls=[{
                'tool': 'enroll_athlete', 'args': {'athlete_id': 99, 'category_id': 2},
                'result': {'error': 'Poți înscrie doar sportivi din clubul tău.'},
            }],
        )

        old_conversation = AssistantConversation.objects.create(user=self.coach_user)
        old_message = AssistantMessage.objects.create(conversation=old_conversation, role='user', content='mesaj vechi')
        AssistantMessage.objects.filter(pk=old_message.pk).update(created_at=timezone.now() - timedelta(days=30))

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get('/api/assistant/report/')
        self.assertEqual(response.status_code, 403)

    def test_admin_report_aggregates_recent_usage(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/assistant/report/', {'days': 7})
        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload['totals']['conversations'], 1)
        self.assertEqual(payload['totals']['user_messages'], 3)
        self.assertEqual(len(payload['recent_questions']), 3)

        tool_usage_by_name = {t['tool']: t for t in payload['tool_usage']}
        self.assertEqual(tool_usage_by_name['list_clubs']['count'], 1)
        self.assertEqual(tool_usage_by_name['list_clubs']['errors'], 0)
        self.assertEqual(tool_usage_by_name['enroll_athlete']['count'], 2)
        self.assertEqual(tool_usage_by_name['enroll_athlete']['errors'], 1)

        self.assertEqual(payload['write_actions']['proposed'], 1)
        self.assertEqual(payload['write_actions']['confirmed'], 1)

        self.assertEqual(len(payload['recent_errors']), 1)
        self.assertEqual(payload['recent_errors'][0]['tool'], 'enroll_athlete')

    def test_days_parameter_excludes_older_messages(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/assistant/report/', {'days': 60})
        payload = response.json()
        self.assertEqual(payload['totals']['conversations'], 2)
        self.assertEqual(payload['totals']['user_messages'], 4)


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
