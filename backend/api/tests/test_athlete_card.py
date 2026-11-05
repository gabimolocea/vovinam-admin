from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import Athlete, Club, Grade, Title, User


class AthleteCardTests(TestCase):
    """The hover card on an athlete tagged in an article: sign-in only, like their profile."""

    def setUp(self):
        self.athlete = Athlete.objects.create(
            first_name='Florin', last_name='Macovei', status='approved', is_coach=True,
            club=Club.objects.create(name='CS Card'),
            current_grade=Grade.objects.create(name='CENTURĂ ROŞIE, 7 DANG', rank_order=20),
            title=Title.objects.create(name='Maestru'),
        )
        self.url = f'/api/athletes/{self.athlete.pk}/card/'

    def get(self, user=None, url=None):
        client = APIClient()
        if user:
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return client.get(url or self.url, HTTP_HOST='localhost')

    def test_signed_in_user_gets_photo_name_grade_and_titles(self):
        user = User.objects.create_user(username='cititor', email='c@example.com', password='x', role='athlete')
        data = self.get(user).data
        self.assertEqual(data['full_name'], 'Florin Macovei')
        self.assertEqual(data['grade'], 'CENTURĂ ROŞIE, 7 DANG')
        self.assertEqual(data['title'], 'Maestru')
        self.assertEqual(data['roles'], ['Antrenor'])
        self.assertEqual(data['club'], 'CS Card')
        self.assertNotIn('cnp', data)
        # No photo uploaded: the model's placeholder, which isn't a photo.
        self.assertIsNone(data['profile_image'])

    def test_visitors_get_the_card_of_someone_already_public(self):
        # Has a title, so already on the public Staff page.
        data = self.get().data
        self.assertEqual(data['full_name'], 'Florin Macovei')
        self.assertEqual(data['grade'], 'CENTURĂ ROŞIE, 7 DANG')
        self.assertEqual(data['title'], 'Maestru')

    def test_visitors_get_a_referee_card_too(self):
        referee = Athlete.objects.create(first_name='Ar', last_name='Bitru', status='approved', is_referee=True)
        self.assertEqual(self.get(url=f'/api/athletes/{referee.pk}/card/').status_code, 200)

    def test_visitors_get_nothing_for_other_athletes(self):
        athlete = Athlete.objects.create(first_name='Sportiv', last_name='Minor', status='approved')
        response = self.get(url=f'/api/athletes/{athlete.pk}/card/')
        # 403, not 401: the frontend's API client turns any 401 into a
        # session-expired redirect to the login page.
        self.assertEqual(response.status_code, 403)
        self.assertNotIn('profile_image', response.data)

    def test_unapproved_athletes_have_no_card(self):
        user = User.objects.create_user(username='cititor', email='c@example.com', password='x', role='athlete')
        pending = Athlete.objects.create(first_name='In', last_name='Asteptare', status='pending')
        self.assertEqual(self.get(user, f'/api/athletes/{pending.pk}/card/').status_code, 404)
