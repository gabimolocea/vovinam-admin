from types import SimpleNamespace
from django.test import TestCase, RequestFactory
from django.contrib import admin
from django.utils import timezone

from ..admin import TrainingSeminarAdmin
from ..models import User, Athlete, TrainingSeminar, TrainingSeminarParticipation
from ..serializers import TrainingSeminarSerializer


class TrainingSeminarAdminTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        # Create an admin user and an athlete
        self.admin_user = User.objects.create_user(username='admin', email='admin@example.com', password='pass', is_staff=True, is_superuser=True)
        self.athlete_user = User.objects.create_user(username='athlete_user', email='athlete@example.com', password='pass')
        self.athlete = Athlete.objects.create(first_name='Test', last_name='Athlete', date_of_birth='2000-01-01', user=self.athlete_user)

        self.seminar = TrainingSeminar.objects.create(name='Test Seminar', start_date='2025-12-01', end_date='2025-12-02', place='Gym')

    def test_save_related_sets_reviewed_by_for_admin_enrollments(self):
        # Simulate admin adding athlete to seminar via admin form
        request = self.factory.post('/admin/api/trainingseminar/')
        request.user = self.admin_user

        # Add the athlete to the seminar M2M
        self.seminar.athletes.add(self.athlete)

        # Call the admin save_related hook to ensure reviewed_by is populated
        admin_instance = TrainingSeminarAdmin(TrainingSeminar, admin.site)
        # Provide a dummy form with save_m2m (admin.save_related expects this)
        class DummyForm(SimpleNamespace):
            def save_m2m(self_inner):
                return None

        form = DummyForm(instance=self.seminar)
        admin_instance.save_related(request, form, formsets=[], change=False)

        # There should now be a participation record for the athlete+seminar with reviewed_by set
        tsp = TrainingSeminarParticipation.objects.filter(athlete=self.athlete, seminar=self.seminar).first()
        self.assertIsNotNone(tsp, 'Participation record was not created')
        self.assertFalse(tsp.submitted_by_athlete, 'Participation created via admin should not be marked as submitted_by_athlete')
        self.assertIsNotNone(tsp.reviewed_by, 'Admin-created participation should have reviewed_by set')
        self.assertEqual(tsp.reviewed_by, self.admin_user)
        self.assertIsNotNone(tsp.reviewed_date, 'Admin-created participation should have reviewed_date set')


class TrainingSeminarSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='athlete2', email='a2@example.com', password='pass')
        self.athlete_user = self.user
        self.athlete = Athlete.objects.create(first_name='A', last_name='Two', date_of_birth='2000-01-01', user=self.athlete_user)
        self.seminar = TrainingSeminar.objects.create(name='S', start_date='2025-11-01', end_date='2025-11-02', place='Hall')

    def test_is_submitted_reflects_participation(self):
        # Create a participation submitted by athlete
        tsp = TrainingSeminarParticipation.objects.create(athlete=self.athlete, seminar=self.seminar, submitted_by_athlete=True)

        # Build a fake request with the athlete user
        factory = RequestFactory()
        request = factory.get(f'/api/training-seminars/{self.seminar.pk}/')
        request.user = self.user

        serializer = TrainingSeminarSerializer(self.seminar, context={'request': request})
        data = serializer.data
        self.assertIn('is_submitted', data)
        self.assertTrue(data['is_submitted'], 'Serializer should indicate the athlete has submitted for this seminar')
        # New fields exposed for frontend badge
        self.assertIn('submission_status', data)
        self.assertEqual(data['submission_status'], tsp.status)
        self.assertIn('submission_id', data)
        self.assertEqual(data['submission_id'], tsp.id)
        self.assertIn('submission_date', data)
        self.assertIsNotNone(data['submission_date'])
