from datetime import timedelta

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Category, CompetitionField, DisplayMonitorSession, Match
from api.serializers import MatchSerializer
from api.views import MatchViewSet
from landing.models import Event


class LiveStatePerformanceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.event = Event.objects.create(
            title='Live State Event',
            slug='live-state-event',
            start_date=now,
            end_date=now + timedelta(days=1),
            event_type='competition',
        )
        self.category = Category.objects.create(name='Live State Category', event=self.event)
        self.field = CompetitionField.objects.get(event=self.event, field_number=1)
        self.match = Match.objects.create(category=self.category, field=self.field)
        DisplayMonitorSession.objects.update_or_create(
            field=self.field,
            defaults={
                'current_category': self.category,
                'current_match': self.match,
                'status': 'displaying',
            },
        )

    def test_field_state_returns_complete_public_snapshot(self):
        response = self.client.get('/api/monitor-sessions/field-state/', {'field': self.field.id})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['field']['id'], self.field.id)
        self.assertEqual(payload['event']['id'], self.event.id)
        self.assertEqual(payload['session']['current_match'], self.match.id)
        self.assertEqual(payload['match']['id'], self.match.id)
        self.assertIn('rounds', payload)
        self.assertIn('point_events', payload)

    def test_ten_match_serialization_has_bounded_query_count(self):
        Match.objects.bulk_create([
            Match(category=self.category, match_number=f'Q{index}')
            for index in range(2, 11)
        ])
        queryset = MatchViewSet().get_queryset().order_by('id')[:10]

        with CaptureQueriesContext(connection) as queries:
            MatchSerializer(queryset, many=True).data

        self.assertLessEqual(len(queries), 8)