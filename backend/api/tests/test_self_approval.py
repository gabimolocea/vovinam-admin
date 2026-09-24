from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Athlete,
    CategoryAthleteScore,
    Club,
    SoloCategory,
    User,
)
from landing.models import Event


class SelfApprovalTests(TestCase):
    """Un rezultat trimis de sportiv se aprobă de antrenorul clubului sau
    de un admin - niciodată de sportivul care l-a trimis.

    Regula asta e scrisă în docstring-ul lui IsResultReviewerOrAdmin, dar
    nu era verificată nicăieri: la federație antrenorii sunt ei înșiși
    sportivi legitimați, iar un antrenor care concurează trecea toate
    condițiile (e antrenor, e al clubului, rezultatul e al unui sportiv
    din clubul lui - el însuși) și își putea aproba propriul rezultat.
    """

    def setUp(self):
        self.client = APIClient()
        self.club = Club.objects.create(name='CS Test')

        now = timezone.now()
        self.event = Event.objects.create(
            title='Self Approval Test', slug='self-approval-test',
            start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        self.category = SoloCategory.objects.create(
            name='Solo A', event=self.event, display_order=1,
        )

        # Antrenor care e și sportiv legitimat - cazul real de la federație.
        self.coach_user = User.objects.create_user(
            username='coach', email='coach@example.com', password='pass12345', role='athlete',
        )
        self.coach = Athlete.objects.create(
            first_name='Coach', last_name='Player', club=self.club,
            status='approved', is_coach=True, user=self.coach_user,
        )
        self.club.coaches.add(self.coach)

        # Un alt sportiv al aceluiași club.
        self.teammate = Athlete.objects.create(
            first_name='Team', last_name='Mate', club=self.club, status='approved',
        )

    def _submitted_score(self, athlete):
        return CategoryAthleteScore.objects.create(
            category=self.category, athlete=athlete, type='solo',
            status='pending', submitted_by_athlete=True,
        )

    def test_coach_cannot_approve_their_own_submitted_result(self):
        score = self._submitted_score(self.coach)
        self.client.force_authenticate(user=self.coach_user)

        response = self.client.post(f'/api/category-athlete-score/{score.id}/approve/', {'action': 'approve'}, format='json')

        self.assertEqual(response.status_code, 403, response.content)
        score.refresh_from_db()
        self.assertEqual(score.status, 'pending')

    def test_coach_cannot_reject_their_own_submitted_result(self):
        score = self._submitted_score(self.coach)
        self.client.force_authenticate(user=self.coach_user)

        response = self.client.post(f'/api/category-athlete-score/{score.id}/reject/', {'action': 'reject'}, format='json')

        self.assertEqual(response.status_code, 403, response.content)
        score.refresh_from_db()
        self.assertEqual(score.status, 'pending')

    def test_coach_still_approves_a_clubmate_result(self):
        """Regula închide doar auto-aprobarea, nu rolul de antrenor."""
        score = self._submitted_score(self.teammate)
        self.client.force_authenticate(user=self.coach_user)

        response = self.client.post(f'/api/category-athlete-score/{score.id}/approve/', {'action': 'approve'}, format='json')

        self.assertEqual(response.status_code, 200, response.content)
        score.refresh_from_db()
        self.assertEqual(score.status, 'approved')

    def test_admin_may_still_approve_anyones_result(self):
        """Adminul federației rămâne ultima instanță, inclusiv pentru
        rezultatul unui antrenor care a concurat."""
        admin_user = User.objects.create_user(
            username='fed-admin', email='fed@example.com', password='pass12345',
            role='admin', is_staff=True,
        )
        score = self._submitted_score(self.coach)
        self.client.force_authenticate(user=admin_user)

        response = self.client.post(f'/api/category-athlete-score/{score.id}/approve/', {'action': 'approve'}, format='json')

        self.assertEqual(response.status_code, 200, response.content)
        score.refresh_from_db()
        self.assertEqual(score.status, 'approved')
