from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Athlete, RefereeQRLogin, User
from landing.models import Event


class RefereeQrLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='qr-admin', email='qr-admin@example.com',
            password='testpass123', role='admin', is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

        now = timezone.now()
        self.event = Event.objects.create(
            title='QR Login Test Event', slug='qr-login-test-event',
            start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        self.referee_athlete = Athlete.objects.create(first_name='Ref', last_name='Erence', status='approved', is_referee=True)

    def test_info_creates_and_is_idempotent(self):
        res1 = self.client.get(f'/api/events/{self.event.id}/referees/{self.referee_athlete.id}/qr-login/')
        self.assertEqual(res1.status_code, 200, res1.data)
        token1 = res1.data['token']

        res2 = self.client.get(f'/api/events/{self.event.id}/referees/{self.referee_athlete.id}/qr-login/')
        self.assertEqual(res2.status_code, 200, res2.data)
        self.assertEqual(res2.data['token'], token1)
        self.assertEqual(RefereeQRLogin.objects.count(), 1)

    def test_exchange_provisions_a_user_and_returns_jwt(self):
        info = self.client.get(f'/api/events/{self.event.id}/referees/{self.referee_athlete.id}/qr-login/').data
        anon = APIClient()
        res = anon.post('/api/referee-qr-login/', {'token': info['token']}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn('access', res.data['tokens'])
        self.assertIn('refresh', res.data['tokens'])

        self.referee_athlete.refresh_from_db()
        self.assertIsNotNone(self.referee_athlete.user_id)
        self.assertFalse(self.referee_athlete.user.has_usable_password())

    def test_exchange_reuses_existing_linked_user(self):
        existing_user = User.objects.create_user(
            username='existing-ref', email='existing-ref@example.com', password='irrelevant', role='athlete',
        )
        self.referee_athlete.user = existing_user
        self.referee_athlete.save(update_fields=['user'])

        info = self.client.get(f'/api/events/{self.event.id}/referees/{self.referee_athlete.id}/qr-login/').data
        anon = APIClient()
        res = anon.post('/api/referee-qr-login/', {'token': info['token']}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['user']['email'], 'existing-ref@example.com')
        self.assertEqual(User.objects.filter(email='existing-ref@example.com').count(), 1)

    def test_exchange_rejects_unknown_token(self):
        anon = APIClient()
        res = anon.post('/api/referee-qr-login/', {'token': 'not-a-real-token'}, format='json')
        self.assertEqual(res.status_code, 404)

    def test_reset_rotates_token_and_invalidates_the_old_one(self):
        info = self.client.get(f'/api/events/{self.event.id}/referees/{self.referee_athlete.id}/qr-login/').data
        old_token = info['token']

        reset_res = self.client.post(f'/api/events/{self.event.id}/referees/{self.referee_athlete.id}/qr-login/reset/')
        self.assertEqual(reset_res.status_code, 200, reset_res.data)
        new_token = reset_res.data['token']
        self.assertNotEqual(new_token, old_token)

        anon = APIClient()
        old_res = anon.post('/api/referee-qr-login/', {'token': old_token}, format='json')
        self.assertEqual(old_res.status_code, 404)

        new_res = anon.post('/api/referee-qr-login/', {'token': new_token}, format='json')
        self.assertEqual(new_res.status_code, 200, new_res.data)

    def test_qr_endpoints_require_admin(self):
        non_admin = User.objects.create_user(
            username='not-admin', email='not-admin@example.com', password='testpass123', role='athlete',
        )
        client = APIClient()
        client.force_authenticate(user=non_admin)
        res = client.get(f'/api/events/{self.event.id}/referees/{self.referee_athlete.id}/qr-login/')
        self.assertEqual(res.status_code, 403)
