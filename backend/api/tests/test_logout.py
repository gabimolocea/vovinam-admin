from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import User


class LogoutTests(TestCase):
    """The apps clear their access token before calling logout, so logout
    must work - and really end the session - without one."""

    def setUp(self):
        self.user = User.objects.create_user(username='iesire', email='iesire@example.com', password='x', role='athlete')
        self.refresh = str(RefreshToken.for_user(self.user))
        self.client = APIClient()

    def test_logout_without_access_token_ends_the_session(self):
        response = self.client.post('/api/auth/logout/', {'refresh': self.refresh}, format='json', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200)

        reuse = self.client.post('/api/auth/token/refresh/', {'refresh': self.refresh}, format='json', HTTP_HOST='localhost')
        self.assertEqual(reuse.status_code, 401)

    def test_an_expired_or_bogus_access_token_does_not_block_logout(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer not-a-real-token')
        response = self.client.post('/api/auth/logout/', {'refresh': self.refresh}, format='json', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200)

    def test_a_bogus_refresh_token_is_refused(self):
        response = self.client.post('/api/auth/logout/', {'refresh': 'nonsense'}, format='json', HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 400)
