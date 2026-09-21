from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Athlete, Category, Match, User


class MatchPointEventPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.category = Category.objects.create(name='Fight Test')
        self.red = Athlete.objects.create(first_name='Red', last_name='Corner')
        self.blue = Athlete.objects.create(first_name='Blue', last_name='Corner')
        self.match = Match.objects.create(
            category=self.category,
            match_type='qualifications',
            red_corner=self.red,
            blue_corner=self.blue,
            display_mode='real_time',
        )

        self.assigned_user = User.objects.create_user(
            username='assigned-ref',
            email='assigned@example.com',
            password='testpass123',
            first_name='Assigned',
            last_name='Ref',
            role='athlete',
        )
        self.assigned_referee = Athlete.objects.create(
            user=self.assigned_user,
            first_name='Assigned',
            last_name='Ref',
            is_referee=True,
            status='approved',
        )
        self.match.referees.add(self.assigned_referee)

        self.other_user = User.objects.create_user(
            username='other-ref',
            email='other@example.com',
            password='testpass123',
            first_name='Other',
            last_name='Ref',
            role='athlete',
        )
        self.other_referee = Athlete.objects.create(
            user=self.other_user,
            first_name='Other',
            last_name='Ref',
            is_referee=True,
            status='approved',
        )

        self.admin_user = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='testpass123',
            first_name='Admin',
            last_name='User',
            role='admin',
            is_staff=True,
        )

        self.url = f'/api/matches/{self.match.id}/point_events/'
        self.payload = {
            'side': 'red',
            'points': 1,
            'event_type': 'score',
            'metadata': {
                'round': 1,
                'origin': 'test',
            },
        }

    def test_assigned_referee_can_create_point_event(self):
        self.client.force_authenticate(user=self.assigned_user)

        response = self.client.post(self.url, self.payload, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['referee'], self.assigned_referee.id)

    def test_unassigned_referee_gets_403(self):
        self.client.force_authenticate(user=self.other_user)

        response = self.client.post(self.url, self.payload, format='json')

        self.assertEqual(response.status_code, 403)

    def test_non_admin_cannot_submit_for_other_referee(self):
        self.client.force_authenticate(user=self.assigned_user)

        response = self.client.post(
            self.url,
            {**self.payload, 'referee': self.other_referee.id},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_for_assigned_referee(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            self.url,
            {**self.payload, 'referee': self.assigned_referee.id},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['referee'], self.assigned_referee.id)

    def test_delete_requires_admin(self):
        self.client.force_authenticate(user=self.assigned_user)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, 403)
