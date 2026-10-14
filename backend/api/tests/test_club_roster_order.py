from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import Athlete, Club, Grade, User


class ClubRosterOrderTests(TestCase):
    """A club's athletes: its coach first, then everyone from the highest grade down."""

    def setUp(self):
        self.club = Club.objects.create(name='CS Ordine')
        low = Grade.objects.create(name='Galbenă', rank_order=1)
        high = Grade.objects.create(name='Neagră', rank_order=10)
        middle = Grade.objects.create(name='Albastră', rank_order=5)

        def athlete(name, grade, **extra):
            return Athlete.objects.create(
                first_name=name, last_name='Test', club=self.club, current_grade=grade, status='approved', **extra,
            )

        athlete('Incepator', low)
        athlete('Fara', None)
        athlete('Avansat', high)
        self.coach_user = User.objects.create_user(username='antrenor', email='a@example.com', password='x', role='athlete')
        coach = athlete('Antrenor', middle, is_coach=True, user=self.coach_user)
        self.club.coaches.add(coach)

    def names(self, user, params):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        response = client.get('/api/athletes/', {'ordering': 'grade', 'paginate': 'true', **params}, HTTP_HOST='localhost')
        return [row['first_name'] for row in response.data['results']]

    def test_club_page_lists_coach_first_then_by_grade(self):
        admin = User.objects.create_user(username='adm', email='adm@example.com', password='x', role='admin')
        self.assertEqual(self.names(admin, {'club': self.club.pk}), ['Antrenor', 'Avansat', 'Incepator', 'Fara'])

    def test_coach_own_roster_uses_the_same_order(self):
        self.assertEqual(self.names(self.coach_user, {'my_club': 'true'}), ['Antrenor', 'Avansat', 'Incepator', 'Fara'])
