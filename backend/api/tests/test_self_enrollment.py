from django.test import TestCase
from rest_framework.test import APIClient

from api.models import Athlete, Category, CategoryAthlete, User


class SelfEnrollmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='self-enrolling-athlete',
            email='self-enrolling@example.com',
            password='testpass123',
            role='athlete',
        )
        self.athlete = Athlete.objects.create(
            user=self.user,
            first_name='Self',
            last_name='Enrollment',
            status='approved',
        )
        self.other_user = User.objects.create_user(
            username='other-athlete',
            email='other-athlete@example.com',
            password='testpass123',
            role='athlete',
        )
        self.other_athlete = Athlete.objects.create(
            user=self.other_user,
            first_name='Other',
            last_name='Athlete',
            status='approved',
        )
        self.category = Category.objects.create(name='Self Enrollment Category')
        self.other_category = Category.objects.create(name='Other Category')
        CategoryAthlete.objects.create(category=self.other_category, athlete=self.other_athlete)
        self.client.force_authenticate(user=self.user)

    def test_athlete_can_enroll_self_with_category_only(self):
        response = self.client.post(
            '/api/category-athletes/',
            {'category': self.category.id},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(CategoryAthlete.objects.filter(
            category=self.category,
            athlete=self.athlete,
        ).exists())

    def test_my_filter_only_returns_authenticated_athlete_enrollments(self):
        own_enrollment = CategoryAthlete.objects.create(
            category=self.category,
            athlete=self.athlete,
        )

        response = self.client.get('/api/category-athletes/', {'my': 'true'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.json()], [own_enrollment.id])

    def test_athlete_cannot_enroll_another_athlete(self):
        response = self.client.post(
            '/api/category-athletes/',
            {'category': self.category.id, 'athlete': self.other_athlete.id},
            format='json',
        )

        self.assertEqual(response.status_code, 403)