from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (
    Athlete,
    Category,
    CategoryAthleteScore,
    CategoryRefereeAssignment,
    Match,
    MatchRefereeAssignment,
    User,
)


class AssignedRefereeScorePermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name='Assigned Category')
        self.competitor = Athlete.objects.create(
            first_name='Competing',
            last_name='Athlete',
            status='approved',
        )
        self.athlete_score = CategoryAthleteScore.objects.create(
            category=self.category,
            athlete=self.competitor,
            type='solo',
            status='approved',
        )
        self.match = Match.objects.create(
            category=self.category,
            red_corner=self.competitor,
        )

        self.assigned_user = User.objects.create_user(
            username='assigned-score-referee',
            email='assigned-score@example.com',
            password='testpass123',
            role='athlete',
        )
        self.assigned_referee = Athlete.objects.create(
            user=self.assigned_user,
            first_name='Assigned',
            last_name='Referee',
            is_referee=True,
            status='approved',
        )
        self.unassigned_user = User.objects.create_user(
            username='unassigned-score-referee',
            email='unassigned-score@example.com',
            password='testpass123',
            role='athlete',
        )
        self.unassigned_referee = Athlete.objects.create(
            user=self.unassigned_user,
            first_name='Unassigned',
            last_name='Referee',
            is_referee=True,
            status='approved',
        )
        CategoryRefereeAssignment.objects.create(
            category=self.category,
            referee_1=self.assigned_referee,
        )
        MatchRefereeAssignment.objects.create(
            match=self.match,
            referee_1=self.assigned_referee,
        )

    def test_assigned_referee_can_create_category_score(self):
        self.client.force_authenticate(user=self.assigned_user)

        response = self.client.post(
            '/api/category-referee-score/',
            {'athlete_score': self.athlete_score.id, 'score': 90},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['referee'], self.assigned_referee.id)

    def test_unassigned_referee_cannot_create_category_score(self):
        self.client.force_authenticate(user=self.unassigned_user)

        response = self.client.post(
            '/api/category-referee-score/',
            {'athlete_score': self.athlete_score.id, 'score': 90},
            format='json',
        )

        self.assertEqual(response.status_code, 403)

    def test_assigned_referee_can_create_match_score(self):
        self.client.force_authenticate(user=self.assigned_user)

        response = self.client.post(
            '/api/match-referee-scores/',
            {
                'match': self.match.id,
                'round': None,
                'red_corner_score': 10,
                'blue_corner_score': 8,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['referee'], self.assigned_referee.id)

    def test_unassigned_referee_cannot_create_match_score(self):
        self.client.force_authenticate(user=self.unassigned_user)

        response = self.client.post(
            '/api/match-referee-scores/',
            {
                'match': self.match.id,
                'round': None,
                'red_corner_score': 10,
                'blue_corner_score': 8,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 403)
