from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient


class ApiRootTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_api_root_returns_200_and_contains_endpoints(self):
        # API is included at root; request the root URL
        # API is mounted under /api/ in this project
        response = self.client.get('/api/')
        self.assertEqual(response.status_code, 200)
        # Expect at least one known endpoint key in the JSON response
        # API exposes 'clubs' (plural) as the endpoint name
        self.assertIn('clubs', response.json())
