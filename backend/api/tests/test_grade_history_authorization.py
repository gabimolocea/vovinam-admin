from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Athlete, Club, Grade, GradeHistory, User


class GradeHistoryAuthorizationTests(TestCase):
    """Gradele sunt evidența de fond a federației, iar un rând nou se
    creează direct cu status 'aprobat' (vezi GradeHistory.status).

    `GradeHistoryViewSet` declară IsAthleteOwnerCoachOrAdmin, dar pe un
    `viewsets.ViewSet` simplu DRF nu rulează singur verificările pe
    obiect, iar acea permisiune lasă la nivel de view doar
    `is_authenticated`. Citirile și modificările sunt totuși acoperite,
    pentru că trec prin `get_queryset()`, care e restrâns pe club/sportiv.
    Crearea nu trecea prin nimic.
    """

    def setUp(self):
        self.client = APIClient()
        self.club_a = Club.objects.create(name='CS Alfa')
        self.club_b = Club.objects.create(name='CS Beta')
        self.grade = Grade.objects.create(name='Centura neagră 1 Dang')

        self.outsider_user = User.objects.create_user(
            username='outsider', email='outsider@example.com', password='pass12345', role='athlete',
        )
        self.outsider = Athlete.objects.create(
            first_name='Out', last_name='Sider', club=self.club_b,
            status='approved', user=self.outsider_user,
        )

        self.victim = Athlete.objects.create(
            first_name='Alt', last_name='Sportiv', club=self.club_a, status='approved',
        )

        self.coach_user = User.objects.create_user(
            username='coach-a', email='coach-a@example.com', password='pass12345', role='athlete',
        )
        self.coach = Athlete.objects.create(
            first_name='Antrenor', last_name='Alfa', club=self.club_a,
            status='approved', is_coach=True, user=self.coach_user,
        )
        self.club_a.coaches.add(self.coach)

    def _payload(self, athlete):
        return {'athlete': athlete.id, 'grade': self.grade.id, 'level': 'good'}

    def test_stranger_cannot_grant_a_grade_to_someone_else(self):
        self.client.force_authenticate(user=self.outsider_user)

        response = self.client.post('/api/grade-histories/', self._payload(self.victim), format='json')

        self.assertEqual(response.status_code, 403, response.content)
        self.assertFalse(GradeHistory.objects.filter(athlete=self.victim).exists())

    def test_athlete_cannot_grant_a_grade_to_themselves(self):
        """Un sportiv nu-și acordă singur gradul - altfel oricine cu un
        cont își poate scrie centură neagră în evidența federației."""
        self.client.force_authenticate(user=self.outsider_user)

        response = self.client.post('/api/grade-histories/', self._payload(self.outsider), format='json')

        self.assertEqual(response.status_code, 403, response.content)
        self.assertFalse(GradeHistory.objects.filter(athlete=self.outsider).exists())

    def test_coach_may_record_a_grade_for_their_own_club(self):
        self.client.force_authenticate(user=self.coach_user)

        response = self.client.post('/api/grade-histories/', self._payload(self.victim), format='json')

        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(GradeHistory.objects.filter(athlete=self.victim).exists())

    def test_coach_cannot_record_a_grade_for_another_club(self):
        self.client.force_authenticate(user=self.coach_user)

        response = self.client.post('/api/grade-histories/', self._payload(self.outsider), format='json')

        self.assertEqual(response.status_code, 403, response.content)
        self.assertFalse(GradeHistory.objects.filter(athlete=self.outsider).exists())

    def test_admin_may_record_a_grade_for_anyone(self):
        admin_user = User.objects.create_user(
            username='fed-admin-grade', email='fed-grade@example.com', password='pass12345',
            role='admin', is_staff=True,
        )
        self.client.force_authenticate(user=admin_user)

        response = self.client.post('/api/grade-histories/', self._payload(self.outsider), format='json')

        self.assertEqual(response.status_code, 201, response.content)

    def test_anonymous_cannot_create_a_grade(self):
        response = self.client.post('/api/grade-histories/', self._payload(self.victim), format='json')
        self.assertIn(response.status_code, (401, 403), response.content)
