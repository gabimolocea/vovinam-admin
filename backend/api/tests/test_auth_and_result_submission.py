"""Coverage for three security-sensitive flows: login/registration,
self-service password reset, and athletes submitting competition results.

These endpoints are hit directly by the public site with no staff review in
the loop (unlike most admin-only viewsets), so the tests lean on real HTTP
requests through APIClient rather than calling model methods directly -
the goal is to pin down the actual request/response contract and the
authorization rules around it.
"""
import io

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from PIL import Image
from rest_framework.test import APIClient

from api.models import Athlete, Category, CategoryAthleteScore, User


class AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='auth-user',
            email='auth-user@example.com',
            password='CorrectHorseBattery9',
            role='user',
        )

    def test_login_with_correct_credentials_returns_tokens(self):
        response = self.client.post('/api/auth/login/', {
            'email': 'auth-user@example.com',
            'password': 'CorrectHorseBattery9',
        }, format='json')

        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertTrue(data['tokens']['access'])
        self.assertTrue(data['tokens']['refresh'])
        self.assertEqual(data['user']['email'], 'auth-user@example.com')

    def test_login_with_wrong_password_is_rejected(self):
        response = self.client.post('/api/auth/login/', {
            'email': 'auth-user@example.com',
            'password': 'not-the-password',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertNotIn('tokens', response.json())

    def test_login_with_unknown_email_is_rejected(self):
        response = self.client.post('/api/auth/login/', {
            'email': 'nobody@example.com',
            'password': 'whatever123',
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_login_for_deactivated_account_is_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])

        response = self.client.post('/api/auth/login/', {
            'email': 'auth-user@example.com',
            'password': 'CorrectHorseBattery9',
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_register_creates_user_and_returns_tokens(self):
        response = self.client.post('/api/auth/register/', {
            'email': 'newcomer@example.com',
            'password': 'AnotherStrongPass9',
            'password_confirm': 'AnotherStrongPass9',
            'terms_accepted': True,
        }, format='json')

        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(User.objects.filter(email='newcomer@example.com').exists())
        self.assertTrue(response.json()['tokens']['access'])
        self.assertIsNotNone(User.objects.get(email='newcomer@example.com').terms_accepted_at)

    def test_register_rejects_duplicate_email(self):
        response = self.client.post('/api/auth/register/', {
            'email': 'auth-user@example.com',
            'password': 'AnotherStrongPass9',
            'password_confirm': 'AnotherStrongPass9',
            'terms_accepted': True,
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_register_rejects_mismatched_password_confirmation(self):
        response = self.client.post('/api/auth/register/', {
            'email': 'mismatch@example.com',
            'password': 'AnotherStrongPass9',
            'password_confirm': 'SomethingElse9',
            'terms_accepted': True,
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='mismatch@example.com').exists())

    def test_register_rejects_weak_password(self):
        response = self.client.post('/api/auth/register/', {
            'email': 'weak-password@example.com',
            'password': '12345',
            'password_confirm': '12345',
            'terms_accepted': True,
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='weak-password@example.com').exists())

    def test_register_rejects_missing_terms_acceptance(self):
        response = self.client.post('/api/auth/register/', {
            'email': 'no-consent@example.com',
            'password': 'AnotherStrongPass9',
            'password_confirm': 'AnotherStrongPass9',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='no-consent@example.com').exists())


class PasswordResetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='reset-user',
            email='reset-user@example.com',
            password='OldPassword123',
            role='user',
        )

    def _valid_uid_and_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        return uid, token

    def test_request_for_existing_email_sends_reset_email(self):
        response = self.client.post('/api/auth/password-reset/', {
            'email': 'reset-user@example.com',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('reset-user@example.com', mail.outbox[0].to)

    def test_request_for_unknown_email_returns_same_generic_response_without_sending(self):
        """Anti-enumeration: an unregistered email must look identical to a
        registered one from the outside - same status code, same message,
        just no email actually sent."""
        known = self.client.post('/api/auth/password-reset/', {
            'email': 'reset-user@example.com',
        }, format='json')
        mail.outbox = []
        unknown = self.client.post('/api/auth/password-reset/', {
            'email': 'nobody@example.com',
        }, format='json')

        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(len(mail.outbox), 0)

    def test_request_without_email_is_a_bad_request(self):
        response = self.client.post('/api/auth/password-reset/', {}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_confirm_with_valid_token_changes_password(self):
        uid, token = self._valid_uid_and_token()

        response = self.client.post('/api/auth/password-reset-confirm/', {
            'uid': uid,
            'token': token,
            'new_password': 'BrandNewPassword9',
        }, format='json')

        self.assertEqual(response.status_code, 200, response.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('BrandNewPassword9'))

        old_password_login = self.client.post('/api/auth/login/', {
            'email': 'reset-user@example.com',
            'password': 'OldPassword123',
        }, format='json')
        self.assertEqual(old_password_login.status_code, 400)

    def test_confirm_with_invalid_token_is_rejected(self):
        uid, _real_token = self._valid_uid_and_token()

        response = self.client.post('/api/auth/password-reset-confirm/', {
            'uid': uid,
            'token': 'this-is-not-a-real-token',
            'new_password': 'BrandNewPassword9',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('OldPassword123'))

    def test_confirm_with_malformed_uid_is_rejected(self):
        response = self.client.post('/api/auth/password-reset-confirm/', {
            'uid': 'not-valid-base64!!',
            'token': 'irrelevant',
            'new_password': 'BrandNewPassword9',
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_confirm_rejects_password_failing_validation(self):
        uid, token = self._valid_uid_and_token()

        response = self.client.post('/api/auth/password-reset-confirm/', {
            'uid': uid,
            'token': token,
            'new_password': '123',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('OldPassword123'))

    def test_token_cannot_be_reused_after_password_already_changed(self):
        """Django's token generator folds the password hash into the token,
        so it self-invalidates the moment the password actually changes -
        this pins down that a captured reset link can't be replayed."""
        uid, token = self._valid_uid_and_token()
        first = self.client.post('/api/auth/password-reset-confirm/', {
            'uid': uid, 'token': token, 'new_password': 'BrandNewPassword9',
        }, format='json')
        self.assertEqual(first.status_code, 200)

        replay = self.client.post('/api/auth/password-reset-confirm/', {
            'uid': uid, 'token': token, 'new_password': 'YetAnotherPassword9',
        }, format='json')
        self.assertEqual(replay.status_code, 400)


class ResultSubmissionTests(TestCase):
    """Covers CategoryAthleteScoreViewSet's create path - the "submit a
    competition result" flow athletes use from their own profile."""

    def setUp(self):
        self.client = APIClient()

        self.athlete_user = User.objects.create_user(
            username='result-athlete', email='result-athlete@example.com',
            password='testpass123', role='athlete',
        )
        self.athlete = Athlete.objects.create(
            user=self.athlete_user, first_name='Result', last_name='Athlete', status='approved',
        )

        self.other_athlete_user = User.objects.create_user(
            username='other-result-athlete', email='other-result-athlete@example.com',
            password='testpass123', role='athlete',
        )
        self.other_athlete = Athlete.objects.create(
            user=self.other_athlete_user, first_name='Other', last_name='Athlete', status='approved',
        )

        self.supporter_user = User.objects.create_user(
            username='supporter-no-athlete', email='supporter@example.com',
            password='testpass123', role='supporter',
        )

        self.admin_user = User.objects.create_user(
            username='result-admin', email='result-admin@example.com',
            password='testpass123', role='admin', is_staff=True,
        )

        self.category = Category.objects.create(name='Result Submission Category')

    @staticmethod
    def _certificate_file():
        # CategoryAthleteScore.certificate_image is a real ImageField, so
        # Django/Pillow decode it on save - arbitrary bytes get rejected as
        # "not a valid image", it has to be an actual (tiny) JPEG.
        buffer = io.BytesIO()
        Image.new('RGB', (2, 2), color='white').save(buffer, format='JPEG')
        buffer.seek(0)
        return SimpleUploadedFile('diploma.jpg', buffer.read(), content_type='image/jpeg')

    def test_athlete_can_submit_result_with_certificate(self):
        self.client.force_authenticate(user=self.athlete_user)

        response = self.client.post('/api/category-athlete-score/', {
            'category': self.category.id,
            'athlete': self.athlete.id,
            'placement_claimed': '1st',
            'certificate_image': self._certificate_file(),
        }, format='multipart')

        self.assertEqual(response.status_code, 201, response.content)
        score = CategoryAthleteScore.objects.get(pk=response.json()['id'])
        self.assertEqual(score.status, 'pending')
        self.assertTrue(score.submitted_by_athlete)

    def test_athlete_submission_without_certificate_is_rejected(self):
        self.client.force_authenticate(user=self.athlete_user)

        response = self.client.post('/api/category-athlete-score/', {
            'category': self.category.id,
            'athlete': self.athlete.id,
            'placement_claimed': '1st',
        }, format='multipart')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(CategoryAthleteScore.objects.filter(category=self.category).exists())

    def test_athlete_submission_status_is_always_pending_even_if_client_requests_approved(self):
        """perform_create() must never trust a client-supplied `status` for
        a self-submission - only admins can set status directly."""
        self.client.force_authenticate(user=self.athlete_user)

        response = self.client.post('/api/category-athlete-score/', {
            'category': self.category.id,
            'athlete': self.athlete.id,
            'placement_claimed': '1st',
            'status': 'approved',
            'certificate_image': self._certificate_file(),
        }, format='multipart')

        self.assertEqual(response.status_code, 201, response.content)
        score = CategoryAthleteScore.objects.get(pk=response.json()['id'])
        self.assertEqual(score.status, 'pending')

    def test_user_without_athlete_profile_cannot_submit_result(self):
        self.client.force_authenticate(user=self.supporter_user)

        response = self.client.post('/api/category-athlete-score/', {
            'category': self.category.id,
            'placement_claimed': '1st',
            'certificate_image': self._certificate_file(),
        }, format='multipart')

        self.assertEqual(response.status_code, 400)

    def test_unauthenticated_request_cannot_submit_result(self):
        response = self.client.post('/api/category-athlete-score/', {
            'category': self.category.id,
            'placement_claimed': '1st',
        }, format='multipart')

        self.assertIn(response.status_code, (401, 403))

    def test_admin_without_own_athlete_profile_cannot_directly_create_a_result(self):
        """Documents a real bug found while writing this suite, not the
        intended behavior: CategoryAthleteScoreViewSet.perform_create() has
        a dedicated branch for admins (`submitted_by_athlete=False,
        status=...`), but CategoryAthleteScoreSerializer.create() is
        overridden and unconditionally requires `hasattr(request.user,
        'athlete')`, ignoring both kwargs perform_create passes it. Net
        effect: an admin/staff account with no Athlete profile of their own
        (the common case - most federation staff aren't athletes) cannot
        create a score via this endpoint at all, regardless of is_admin.
        The `approve`/`reject` actions on an athlete-submitted result are
        unaffected and remain the supported staff workflow."""
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post('/api/category-athlete-score/', {
            'category': self.category.id,
            'athlete': self.athlete.id,
            'placement_claimed': '1st',
            'status': 'approved',
        }, format='multipart')

        self.assertEqual(response.status_code, 400)
        self.assertIn('athlete profile', response.json()[0])

    def test_admin_with_own_athlete_profile_can_submit_a_result(self):
        """The one path through the serializer's create() that does work
        for an admin: when the admin account itself has an Athlete profile,
        it's treated exactly like a normal athlete self-submission (still
        forced to `submitted_by_athlete=True`/`status='pending'`, and still
        needs the certificate) - the perform_create() admin branch never
        actually gets a chance to run."""
        Athlete.objects.create(
            user=self.admin_user, first_name='Admin', last_name='Athlete', status='approved',
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post('/api/category-athlete-score/', {
            'category': self.category.id,
            'placement_claimed': '1st',
            'status': 'approved',
            'certificate_image': self._certificate_file(),
        }, format='multipart')

        self.assertEqual(response.status_code, 201, response.content)
        score = CategoryAthleteScore.objects.get(pk=response.json()['id'])
        self.assertEqual(score.status, 'pending')
        self.assertTrue(score.submitted_by_athlete)
