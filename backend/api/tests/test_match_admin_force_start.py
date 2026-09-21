from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from api.models import (
    Athlete,
    City,
    Club,
    CompetitionField,
    DisplayMonitorSession,
    FightCategory,
    Match,
    MatchFieldAssignment,
)
from landing.models import Event

User = get_user_model()


class MatchAdminForceStartTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            username='admin-force-start',
            email='admin-force-start@example.com',
            password='testpass123',
            first_name='Admin',
            last_name='ForceStart',
        )
        self.client.force_login(self.admin_user)

        city = City.objects.create(name='Test City Force Start')
        club = Club.objects.create(name='Test Club Force Start', city=city)
        now = timezone.now()
        self.event = Event.objects.create(
            title='Test Event Force Start',
            slug='test-event-force-start',
            start_date=now,
            end_date=now + timedelta(days=1),
            city=city,
            address='Test address',
        )
        self.field = CompetitionField.objects.get(event=self.event, field_number=1)
        self.field.name = 'Tatami Test'
        self.field.save(update_fields=['name'])
        self.category = FightCategory.objects.create(name='Categorie Test Force Start', event=self.event)
        self.red_corner = Athlete.objects.create(first_name='Roșu', last_name='Test', club=club, status='approved')
        self.blue_corner = Athlete.objects.create(first_name='Albastru', last_name='Test', club=club, status='approved')
        self.match = Match.objects.create(
            category=self.category,
            field=self.field,
            match_type='finals',
            red_corner=self.red_corner,
            blue_corner=self.blue_corner,
            status='completed',
        )
        self.assignment = MatchFieldAssignment.objects.create(
            match=self.match,
            field=self.field,
            status='completed',
            order=1,
        )
        DisplayMonitorSession.objects.create(field=self.field, status='idle')

    def test_force_start_reopens_match_and_schedule(self):
        url = reverse('admin:api_match_force_start', args=[self.match.pk])
        response = self.client.post(url, follow=True)

        self.assertEqual(response.status_code, 200)

        self.match.refresh_from_db()
        self.assignment.refresh_from_db()
        session = DisplayMonitorSession.objects.get(field=self.field)

        self.assertEqual(self.match.status, 'active')
        self.assertEqual(self.assignment.status, 'in_progress')
        self.assertEqual(session.status, 'displaying')
        self.assertEqual(session.current_match_id, self.match.pk)
        self.assertEqual(session.current_category_id, self.category.pk)
