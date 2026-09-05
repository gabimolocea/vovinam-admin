from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import Category, Group, User
from landing.models import Event


class BulkOperationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='bulk-admin',
            email='bulk-admin@example.com',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)
        now = timezone.now()
        self.event_one = Event.objects.create(
            title='Bulk Event One',
            slug='bulk-event-one',
            start_date=now,
            end_date=now + timedelta(days=1),
            event_type='competition',
        )
        self.event_two = Event.objects.create(
            title='Bulk Event Two',
            slug='bulk-event-two',
            start_date=now,
            end_date=now + timedelta(days=1),
            event_type='competition',
        )
        self.group_one = Group.objects.create(name='Group One', event=self.event_one, display_order=4)
        self.group_two = Group.objects.create(name='Group Two', event=self.event_two, display_order=7)

    def test_group_reorder_rejects_mixed_events_without_changes(self):
        response = self.client.post(
            '/api/groups/reorder/',
            {'order': [self.group_one.id, self.group_two.id]},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.group_one.refresh_from_db()
        self.group_two.refresh_from_db()
        self.assertEqual(self.group_one.display_order, 4)
        self.assertEqual(self.group_two.display_order, 7)

    def test_group_reorder_rejects_duplicate_ids(self):
        response = self.client.post(
            '/api/groups/reorder/',
            {'order': [self.group_one.id, self.group_one.id]},
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_group_delete_can_atomically_cascade_categories(self):
        category = Category.objects.create(
            name='Deleted with group',
            event=self.event_one,
            group=self.group_one,
        )

        response = self.client.delete(
            f'/api/groups/{self.group_one.id}/?cascade_categories=true',
        )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Group.objects.filter(pk=self.group_one.id).exists())
        self.assertFalse(Category.objects.filter(pk=category.id).exists())