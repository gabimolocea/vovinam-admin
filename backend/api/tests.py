from django.test import TestCase
from rest_framework.test import APIClient


class ApiRootTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_api_root_returns_200_and_contains_endpoints(self):
        # API is included at root; request the root URL
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        # Expect at least one known endpoint key in the JSON response
        self.assertIn('club', response.json())
from django.test import TestCase

# Create your tests here.
