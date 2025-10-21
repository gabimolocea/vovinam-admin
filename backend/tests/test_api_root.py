from django.test import TestCase
from rest_framework.test import APIClient


class ApiRootSmokeTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_api_root_returns_200_and_contains_endpoints(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('club', response.json())
