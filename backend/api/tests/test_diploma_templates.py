import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import City
from landing.models import Event

User = get_user_model()


class DiplomaTemplateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username='diploma-admin',
            email='diploma-admin@example.com',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin_user)

        self.city = City.objects.create(name='Diploma City')
        now = timezone.now()
        self.event = Event.objects.create(
            title='Diploma Event',
            slug='diploma-event',
            start_date=now,
            end_date=now + timedelta(days=1),
            city=self.city,
            address='Main Hall',
            event_type='competition',
        )

    def _pdf_file(self, name='template.pdf'):
        return SimpleUploadedFile(name, b'%PDF-1.4\n% diploma test\n', content_type='application/pdf')

    def test_create_and_list_diploma_template(self):
        response = self.client.post(
            '/api/diploma-templates/',
            {
                'event': str(self.event.id),
                'title': 'Diploma locul 1',
                'template_kind': 'first_place',
                'category_scope': 'solo',
                'preview_orientation': 'landscape',
                'placements': json.dumps([]),
                'pdf_file': self._pdf_file(),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload['event'], self.event.id)
        self.assertEqual(payload['template_kind'], 'first_place')
        self.assertEqual(payload['category_scope'], 'solo')
        self.assertTrue(payload['pdf_url'].endswith('.pdf'))

        list_response = self.client.get(f'/api/diploma-templates/?event={self.event.id}')
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()), 1)

    def test_update_diploma_template_placements(self):
        create_response = self.client.post(
            '/api/diploma-templates/',
            {
                'event': str(self.event.id),
                'title': 'Diploma participare',
                'template_kind': 'participation',
                'category_scope': 'fight',
                'preview_orientation': 'landscape',
                'placements': json.dumps([]),
                'pdf_file': self._pdf_file('participation.pdf'),
            },
            format='multipart',
        )
        template_id = create_response.json()['id']

        placements = [
            {
                'id': 'athlete_name_1',
                'field_key': 'athlete_with_club',
                'label': 'Nume sportiv (club)',
                'x': 50,
                'y': 48,
                'font_size': 28,
                'width': 42,
                'align': 'center',
            }
        ]
        response = self.client.patch(
            f'/api/diploma-templates/{template_id}/',
            {
                'placements': placements,
                'preview_orientation': 'portrait',
                'category_scope': 'solo',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['preview_orientation'], 'portrait')
        self.assertEqual(payload['category_scope'], 'solo')
        self.assertEqual(payload['placements'][0]['field_key'], 'athlete_with_club')
        self.assertEqual(payload['placements'][0]['x'], 50)

    def test_delete_diploma_template(self):
        create_response = self.client.post(
            '/api/diploma-templates/',
            {
                'event': str(self.event.id),
                'title': 'Diploma locul 2',
                'template_kind': 'second_place',
                'category_scope': 'team',
                'preview_orientation': 'landscape',
                'placements': json.dumps([]),
                'pdf_file': self._pdf_file('second.pdf'),
            },
            format='multipart',
        )
        template_id = create_response.json()['id']

        response = self.client.delete(f'/api/diploma-templates/{template_id}/')
        self.assertEqual(response.status_code, 204)

        list_response = self.client.get(f'/api/diploma-templates/?event={self.event.id}')
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json(), [])

    def test_can_create_same_place_for_multiple_category_scopes(self):
        first = self.client.post(
            '/api/diploma-templates/',
            {
                'event': str(self.event.id),
                'title': 'Diploma locul 1 solo',
                'template_kind': 'first_place',
                'category_scope': 'solo',
                'preview_orientation': 'landscape',
                'placements': json.dumps([]),
                'pdf_file': self._pdf_file('solo.pdf'),
            },
            format='multipart',
        )
        second = self.client.post(
            '/api/diploma-templates/',
            {
                'event': str(self.event.id),
                'title': 'Diploma locul 1 echipa',
                'template_kind': 'first_place',
                'category_scope': 'team',
                'preview_orientation': 'landscape',
                'placements': json.dumps([]),
                'pdf_file': self._pdf_file('team.pdf'),
            },
            format='multipart',
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)

    def test_duplicate_diploma_template(self):
        create_response = self.client.post(
            '/api/diploma-templates/',
            {
                'event': str(self.event.id),
                'title': 'Diploma baza',
                'template_kind': 'first_place',
                'category_scope': 'solo',
                'preview_orientation': 'landscape',
                'placements': json.dumps([]),
                'pdf_file': self._pdf_file('base.pdf'),
            },
            format='multipart',
        )
        template_id = create_response.json()['id']

        duplicate_response = self.client.post(f'/api/diploma-templates/{template_id}/duplicate/')
        self.assertEqual(duplicate_response.status_code, 201)
        payload = duplicate_response.json()
        self.assertNotEqual(payload['id'], template_id)
        self.assertEqual(payload['title'], 'Diploma baza (copie)')
        self.assertEqual(payload['template_kind'], 'first_place')
        self.assertNotEqual(payload['category_scope'], 'solo')
        self.assertEqual(payload['placements'], [])

    def test_update_diploma_template_with_multipart_pdf_and_placements(self):
        create_response = self.client.post(
            '/api/diploma-templates/',
            {
                'event': str(self.event.id),
                'title': 'Diploma editare pdf',
                'template_kind': 'third_place',
                'category_scope': 'all',
                'preview_orientation': 'landscape',
                'placements': json.dumps([]),
                'pdf_file': self._pdf_file('initial.pdf'),
            },
            format='multipart',
        )
        template_id = create_response.json()['id']

        response = self.client.patch(
            f'/api/diploma-templates/{template_id}/',
            {
                'title': 'Diploma editare pdf nou',
                'template_kind': 'third_place',
                'category_scope': 'solo',
                'preview_orientation': 'portrait',
                'is_active': 'true',
                'placements': json.dumps([
                    {
                        'id': 'field_1',
                        'field_key': 'athlete_with_club',
                        'label': 'Nume sportiv (club)',
                        'x': 50,
                        'y': 45,
                        'font_size': 24,
                        'width': 40,
                        'align': 'center',
                    }
                ]),
                'pdf_file': self._pdf_file('replacement.pdf'),
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['title'], 'Diploma editare pdf nou')
        self.assertEqual(payload['category_scope'], 'solo')
        self.assertEqual(payload['preview_orientation'], 'portrait')
        self.assertEqual(payload['placements'][0]['field_key'], 'athlete_with_club')
        self.assertTrue(payload['pdf_url'].endswith('.pdf'))