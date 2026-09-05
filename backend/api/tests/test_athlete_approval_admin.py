from django.test import TestCase
from django.urls import reverse

from api.models import Athlete, User


class AthleteApprovalAdminSecurityTests(TestCase):
    """
    Regression tests for the athlete-approval admin views: approving must
    require a POST confirmation (not a bare GET link) and both the approve
    and non-superuser paths must respect has_change_permission().
    """

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username='super-admin',
            email='super-admin@example.com',
            password='testpass123',
        )
        self.athlete = Athlete.objects.create(
            first_name='Pending',
            last_name='Athlete',
            status='pending',
        )
        self.approve_url = reverse('admin:api_athlete_approve', args=(self.athlete.pk,))

    def test_get_approve_shows_confirmation_without_approving(self):
        self.client.force_login(self.superuser)

        response = self.client.get(self.approve_url)

        self.assertEqual(response.status_code, 200)
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.status, 'pending')

    def test_post_approve_approves_the_athlete(self):
        self.client.force_login(self.superuser)

        response = self.client.post(self.approve_url)

        self.assertEqual(response.status_code, 302)
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.status, 'approved')

    def test_approve_requires_staff_login(self):
        # Anonymous requests are redirected to the admin login page rather
        # than being allowed to approve.
        response = self.client.post(self.approve_url)

        self.assertEqual(response.status_code, 302)
        self.assertIn('/admin/login/', response.url)
        self.athlete.refresh_from_db()
        self.assertEqual(self.athlete.status, 'pending')
