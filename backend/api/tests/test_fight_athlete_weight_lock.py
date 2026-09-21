from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Athlete, City, Club, FightAthleteWeight, FightCategory, User
from landing.models import Event


class FightAthleteWeightLockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='weight-lock-admin',
            email='weight-lock-admin@example.com',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

        now = timezone.now()
        self.event = Event.objects.create(
            title='Weight Lock Event',
            slug='weight-lock-event',
            start_date=now,
            end_date=now + timedelta(days=1),
            event_type='competition',
        )
        self.city = City.objects.create(name='Weight Lock City')
        self.club = Club.objects.create(name='Weight Lock Club', city=self.city)
        self.athlete = Athlete.objects.create(
            first_name='Weight',
            last_name='Athlete',
            date_of_birth=date(2000, 1, 1),
            club=self.club,
            city=self.city,
        )
        self.category = FightCategory.objects.create(name='Lupta -60kg', event=self.event)
        self.weight = FightAthleteWeight.objects.create(
            category=self.category,
            athlete=self.athlete,
            current_weight_kg='60.00',
        )

    def test_weight_defaults_unlocked(self):
        self.assertFalse(self.weight.is_weight_locked)

    def test_editing_weight_is_allowed_while_unlocked(self):
        response = self.client.patch(
            f'/api/fight-athlete-weights/{self.weight.id}/',
            {'current_weight_kg': '61.00'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.weight.refresh_from_db()
        self.assertEqual(str(self.weight.current_weight_kg), '61.00')

    def test_locking_the_record_is_allowed(self):
        response = self.client.patch(
            f'/api/fight-athlete-weights/{self.weight.id}/',
            {'is_weight_locked': True},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.weight.refresh_from_db()
        self.assertTrue(self.weight.is_weight_locked)

    def test_editing_weight_on_a_locked_record_is_rejected(self):
        self.weight.is_weight_locked = True
        self.weight.save()

        response = self.client.patch(
            f'/api/fight-athlete-weights/{self.weight.id}/',
            {'current_weight_kg': '62.00'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.weight.refresh_from_db()
        self.assertEqual(str(self.weight.current_weight_kg), '60.00')

    def test_editing_non_weight_field_on_a_locked_record_is_still_allowed(self):
        self.weight.is_weight_locked = True
        self.weight.save()

        response = self.client.patch(
            f'/api/fight-athlete-weights/{self.weight.id}/',
            {'is_disqualified': True},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.weight.refresh_from_db()
        self.assertTrue(self.weight.is_disqualified)

    def test_unlocking_and_editing_weight_in_the_same_request_is_allowed(self):
        self.weight.is_weight_locked = True
        self.weight.save()

        response = self.client.patch(
            f'/api/fight-athlete-weights/{self.weight.id}/',
            {'current_weight_kg': '62.00', 'is_weight_locked': False},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.weight.refresh_from_db()
        self.assertEqual(str(self.weight.current_weight_kg), '62.00')
        self.assertFalse(self.weight.is_weight_locked)

    def test_unlocking_then_editing_weight_in_a_second_request_is_allowed(self):
        self.weight.is_weight_locked = True
        self.weight.save()

        unlock_response = self.client.patch(
            f'/api/fight-athlete-weights/{self.weight.id}/',
            {'is_weight_locked': False},
            format='json',
        )
        self.assertEqual(unlock_response.status_code, 200)

        edit_response = self.client.patch(
            f'/api/fight-athlete-weights/{self.weight.id}/',
            {'current_weight_kg': '63.00'},
            format='json',
        )

        self.assertEqual(edit_response.status_code, 200)
        self.weight.refresh_from_db()
        self.assertEqual(str(self.weight.current_weight_kg), '63.00')
