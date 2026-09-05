from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Athlete, Category, City, Club, CompetitionField, Grade, Match
from landing.models import Event


class PublicApiPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.city = City.objects.create(name='Public API City')
        self.club = Club.objects.create(name='Public API Club', city=self.city)
        self.grade = Grade.objects.create(name='Public API Grade')
        self.approved_athlete = Athlete.objects.create(
            first_name='Public',
            last_name='Athlete',
            date_of_birth=date(2000, 1, 1),
            cnp='1234567890123',
            address='Private address',
            mobile_number='0700000000',
            emergency_contact_name='Private contact',
            emergency_contact_phone='0711111111',
            club=self.club,
            city=self.city,
            current_grade=self.grade,
            status='approved',
        )
        self.pending_athlete = Athlete.objects.create(
            first_name='Pending',
            last_name='Athlete',
            status='pending',
        )

    def test_public_athlete_list_only_returns_approved_profiles(self):
        response = self.client.get('/api/athletes/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.json()], [self.approved_athlete.id])

    def test_public_athlete_detail_excludes_private_fields(self):
        response = self.client.get(f'/api/athletes/{self.approved_athlete.id}/')

        self.assertEqual(response.status_code, 200)
        for field in (
            'cnp', 'address', 'mobile_number', 'emergency_contact_name',
            'emergency_contact_phone', 'medical_certificate', 'date_of_birth',
            'status', 'admin_notes', 'user',
        ):
            self.assertNotIn(field, response.json())

    def test_pending_athlete_detail_is_not_public(self):
        response = self.client.get(f'/api/athletes/{self.pending_athlete.id}/')

        self.assertEqual(response.status_code, 404)

    def test_public_athlete_list_supports_bounded_pagination_and_filters(self):
        Athlete.objects.create(
            first_name='Second',
            last_name='Approved',
            club=self.club,
            city=self.city,
            current_grade=self.grade,
            status='approved',
        )

        response = self.client.get('/api/athletes/', {
            'paginate': 'true',
            'page_size': 1,
            'club': self.club.id,
            'city': self.city.id,
            'grade': self.grade.id,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 2)
        self.assertEqual(len(response.json()['results']), 1)
        self.assertIsNotNone(response.json()['next'])

    def test_public_reference_reads_remain_available(self):
        self.assertEqual(self.client.get('/api/clubs/').status_code, 200)
        self.assertEqual(self.client.get('/api/grades/').status_code, 200)

    def test_anonymous_reference_mutations_are_rejected(self):
        self.assertIn(self.client.post('/api/clubs/', {'name': 'Injected'}).status_code, (401, 403))
        self.assertIn(self.client.post('/api/grades/', {'name': 'Injected'}).status_code, (401, 403))


class PublicOperationalMutationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.city = City.objects.create(name='Operational City')
        self.event = Event.objects.create(
            title='Operational Event',
            slug='operational-event',
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 2),
            city=self.city,
            event_type='competition',
        )
        self.category = Category.objects.create(name='Operational Category', event=self.event)
        self.match = Match.objects.create(category=self.category)
        self.field = CompetitionField.objects.get(event=self.event, field_number=1)

    def test_public_operational_reads_remain_available(self):
        self.assertEqual(self.client.get('/api/matches/').status_code, 200)
        self.assertEqual(self.client.get('/api/monitor-sessions/').status_code, 200)

    def test_anonymous_match_mutations_are_rejected(self):
        response = self.client.patch(
            f'/api/matches/{self.match.id}/',
            {'status': 'completed'},
            format='json',
        )

        self.assertIn(response.status_code, (401, 403))

    def test_anonymous_monitor_session_mutations_are_rejected(self):
        response = self.client.post(
            '/api/monitor-sessions/',
            {'field': self.field.id, 'status': 'displaying'},
            format='json',
        )

        self.assertIn(response.status_code, (401, 403))

    def test_anonymous_weight_mutations_are_rejected(self):
        response = self.client.post(
            '/api/fight-athlete-weights/',
            {'category': self.category.id},
            format='json',
        )

        self.assertIn(response.status_code, (401, 403))