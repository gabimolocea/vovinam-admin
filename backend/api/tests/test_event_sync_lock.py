from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Athlete, CategoryAthlete, City, Club, CompetitionField, FightCategory, Group
from landing.models import Event

User = get_user_model()


class EventSyncLockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username='sync-lock-admin',
            email='sync-lock-admin@example.com',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin_user)

        self.city = City.objects.create(name='Sync Lock City')
        self.club = Club.objects.create(name='Sync Lock Club', city=self.city)
        now = timezone.now()

        self.locked_event = Event.objects.create(
            title='Locked Event',
            slug='locked-event',
            start_date=now,
            end_date=now + timedelta(days=1),
            city=self.city,
            address='Locked venue',
            event_type='competition',
            sync_mode='local_event',
            sync_locked=True,
            local_sync_status='exported',
            exported_to_local_at=now,
        )

        self.locked_group = Group.objects.create(
            name='Locked Group',
            event=self.locked_event,
            birth_year_start=2010,
            birth_year_end=2012,
        )
        self.locked_category = FightCategory.objects.create(
            name='Locked Fight',
            event=self.locked_event,
            group=self.locked_group,
        )
        self.locked_field = CompetitionField.objects.get(event=self.locked_event, field_number=1)
        self.athlete = Athlete.objects.create(
            first_name='Locked',
            last_name='Athlete',
            club=self.club,
            city=self.city,
            status='approved',
        )

    def test_event_detail_exposes_sync_state(self):
        response = self.client.get(f'/api/events/{self.locked_event.id}/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['sync_mode'], 'local_event')
        self.assertTrue(payload['sync_locked'])
        self.assertEqual(payload['local_sync_status'], 'exported')
        self.assertIn('results_uploaded_at', payload)
        self.assertIn('sync_completed_at', payload)
        self.assertIsNone(payload['results_uploaded_at'])
        self.assertIsNone(payload['sync_completed_at'])
        self.assertTrue(payload['operational_lock_active'])

    def test_locked_event_blocks_category_athlete_create(self):
        response = self.client.post(
            '/api/category-athletes/',
            {
                'category': self.locked_category.id,
                'athlete': self.athlete.id,
                'weight': 55,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 423)
        self.assertIn('blocat pentru operare locală', response.json()['error'])
        self.assertFalse(CategoryAthlete.objects.filter(category=self.locked_category, athlete=self.athlete).exists())

    def test_locked_event_blocks_generate_standard_groups_categories(self):
        response = self.client.post(
            f'/api/competitions/{self.locked_event.id}/generate-standard-groups-categories/',
            format='json',
        )

        self.assertEqual(response.status_code, 423)
        self.assertIn('blocat pentru operare locală', response.json()['error'])

    def test_locked_event_blocks_competition_field_update(self):
        response = self.client.patch(
            f'/api/competition-fields/{self.locked_field.id}/',
            {'name': 'Updated field name'},
            format='json',
        )

        self.assertEqual(response.status_code, 423)
        self.locked_field.refresh_from_db()
        self.assertNotEqual(self.locked_field.name, 'Updated field name')

    def test_locked_event_allows_sync_only_update_but_blocks_operational_changes(self):
        blocked_response = self.client.patch(
            f'/api/events/{self.locked_event.id}/',
            {'address': 'Changed address'},
            format='json',
        )
        self.assertEqual(blocked_response.status_code, 423)

        unlock_response = self.client.patch(
            f'/api/events/{self.locked_event.id}/',
            {
                'sync_locked': False,
                'sync_mode': 'cloud',
                'local_sync_status': 'completed',
            },
            format='json',
        )

        self.assertEqual(unlock_response.status_code, 200)
        self.locked_event.refresh_from_db()
        self.assertFalse(self.locked_event.sync_locked)
        self.assertEqual(self.locked_event.sync_mode, 'cloud')
        self.assertEqual(self.locked_event.local_sync_status, 'completed')

        allowed_response = self.client.patch(
            f'/api/events/{self.locked_event.id}/',
            {'address': 'Changed address'},
            format='json',
        )
        self.assertEqual(allowed_response.status_code, 200)
        self.locked_event.refresh_from_db()
        self.assertEqual(self.locked_event.address, 'Changed address')

    def test_complete_local_sync_action_unlocks_event_after_results_uploaded(self):
        response = self.client.post(f'/api/events/{self.locked_event.id}/complete-local-sync/', format='json')
        self.assertEqual(response.status_code, 400)

        self.locked_event.mark_results_uploaded(uploaded_at=timezone.now())
        self.locked_event.save(update_fields=['local_sync_status', 'results_uploaded_at'])

        response = self.client.post(f'/api/events/{self.locked_event.id}/complete-local-sync/', format='json')

        self.assertEqual(response.status_code, 200)
        self.locked_event.refresh_from_db()
        self.assertFalse(self.locked_event.sync_locked)
        self.assertEqual(self.locked_event.sync_mode, 'cloud')
        self.assertEqual(self.locked_event.local_sync_status, 'completed')
        self.assertIsNotNone(self.locked_event.results_uploaded_at)
        self.assertIsNotNone(self.locked_event.sync_completed_at)

    @override_settings(IS_LOCAL_EVENT_SERVER=True)
    def test_local_event_server_is_exempt_from_its_own_lock(self):
        """The lock exists to stop the CLOUD instance from accepting
        operational edits after an event is exported to a local venue
        machine. On the local machine itself - the new authority once
        locked - the exact same operations must be allowed, or nothing
        (weigh-ins, category assignments, scores) can be entered there for
        the rest of the event."""
        response = self.client.post(
            '/api/category-athletes/',
            {
                'category': self.locked_category.id,
                'athlete': self.athlete.id,
                'weight': 55,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(CategoryAthlete.objects.filter(category=self.locked_category, athlete=self.athlete).exists())

    def test_mark_local_in_progress_requires_locked_exported_event(self):
        response = self.client.post(f'/api/events/{self.locked_event.id}/mark-local-in-progress/', format='json')

        self.assertEqual(response.status_code, 200)
        self.locked_event.refresh_from_db()
        self.assertEqual(self.locked_event.local_sync_status, 'local_in_progress')

        self.locked_event.sync_locked = False
        self.locked_event.local_sync_status = 'idle'
        self.locked_event.save(update_fields=['sync_locked', 'local_sync_status'])

        response = self.client.post(f'/api/events/{self.locked_event.id}/mark-local-in-progress/', format='json')
        self.assertEqual(response.status_code, 400)