from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Athlete, RefereePinLoginAttempt, RefereeQRLogin, User
from landing.models import Event


class RefereePinLoginTests(TestCase):
    """The PIN is the credential a keyboard-less device logs in with
    (devices/referee-esp32c3). It is short enough that the lockout is the
    only thing standing between it and a script, so most of this pins
    down the lockout rather than the happy path."""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='pin-admin', email='pin-admin@example.com',
            password='testpass123', role='admin', is_staff=True,
        )

        now = timezone.now()
        self.event = Event.objects.create(
            title='PIN Login Test Event', slug='pin-login-test-event',
            start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        self.referee = Athlete.objects.create(
            first_name='Pin', last_name='Referee', status='approved', is_referee=True,
        )
        self.qr = RefereeQRLogin.objects.create(event=self.event, referee=self.referee)

    def test_pin_is_generated_with_the_qr_login(self):
        self.assertIsNotNone(self.qr.pin)
        self.assertEqual(len(self.qr.pin), RefereeQRLogin.PIN_LENGTH)
        self.assertTrue(self.qr.pin.isdigit())

    def test_pins_are_unique_across_referees(self):
        other = Athlete.objects.create(
            first_name='Other', last_name='Referee', status='approved', is_referee=True,
        )
        second = RefereeQRLogin.objects.create(event=self.event, referee=other)
        self.assertNotEqual(second.pin, self.qr.pin)

    def test_admin_sees_the_pin_next_to_the_qr_token(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/events/{self.event.id}/referees/{self.referee.id}/qr-login/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['pin'], self.qr.pin)

    def test_reset_rotates_the_pin_too(self):
        self.client.force_authenticate(user=self.admin)
        old_pin = self.qr.pin
        res = self.client.post(f'/api/events/{self.event.id}/referees/{self.referee.id}/qr-login/reset/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertNotEqual(res.data['pin'], old_pin)
        self.qr.refresh_from_db()
        self.assertEqual(self.qr.pin, res.data['pin'])

    def test_correct_pin_returns_a_session(self):
        res = self.client.post('/api/referee-pin-login/', {'pin': self.qr.pin}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data['tokens']['access'])
        # The device needs nothing configured but the address: the server
        # says which event this PIN belongs to.
        self.assertEqual(res.data['event_id'], self.event.id)

    def test_correct_pin_leaves_no_attempt_rows(self):
        self.client.post('/api/referee-pin-login/', {'pin': self.qr.pin}, format='json')
        self.assertEqual(RefereePinLoginAttempt.objects.count(), 0)

    def test_wrong_pin_is_refused_and_counted(self):
        res = self.client.post('/api/referee-pin-login/', {'pin': '00000'}, format='json')
        self.assertEqual(res.status_code, 404, res.data)
        self.assertEqual(RefereePinLoginAttempt.objects.count(), 1)

    def test_missing_pin_is_refused(self):
        res = self.client.post('/api/referee-pin-login/', {}, format='json')
        self.assertEqual(res.status_code, 404, res.data)

    def test_guessing_locks_the_address_out(self):
        for _ in range(RefereePinLoginAttempt.MAX_FAILURES):
            self.client.post('/api/referee-pin-login/', {'pin': '00000'}, format='json')

        res = self.client.post('/api/referee-pin-login/', {'pin': '00000'}, format='json')
        self.assertEqual(res.status_code, 429, res.data)

    def test_lockout_holds_even_once_the_right_pin_is_found(self):
        """The whole point: a script that works through the space must not
        be let in the moment it hits a valid code."""
        for _ in range(RefereePinLoginAttempt.MAX_FAILURES):
            self.client.post('/api/referee-pin-login/', {'pin': '00000'}, format='json')

        res = self.client.post('/api/referee-pin-login/', {'pin': self.qr.pin}, format='json')
        self.assertEqual(res.status_code, 429, res.data)

    def test_lockout_lifts_once_the_failures_age_out(self):
        for _ in range(RefereePinLoginAttempt.MAX_FAILURES):
            self.client.post('/api/referee-pin-login/', {'pin': '00000'}, format='json')

        stale = timezone.now() - timedelta(minutes=RefereePinLoginAttempt.WINDOW_MINUTES + 1)
        RefereePinLoginAttempt.objects.update(created_at=stale)

        res = self.client.post('/api/referee-pin-login/', {'pin': self.qr.pin}, format='json')
        self.assertEqual(res.status_code, 200, res.data)

    def test_a_referee_who_mistypes_still_gets_in(self):
        self.client.post('/api/referee-pin-login/', {'pin': '00000'}, format='json')
        self.client.post('/api/referee-pin-login/', {'pin': '00001'}, format='json')
        res = self.client.post('/api/referee-pin-login/', {'pin': self.qr.pin}, format='json')
        self.assertEqual(res.status_code, 200, res.data)

    def test_pin_login_needs_no_authentication(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/referee-pin-login/', {'pin': self.qr.pin}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
