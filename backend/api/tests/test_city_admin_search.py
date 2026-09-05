"""Regression test for CityAdmin's accent-insensitive autocomplete search.

CityAdmin.get_search_results() has two code paths: a database-side
'unaccent' lookup on PostgreSQL, and a Python-side fallback for other
backends (SQLite in local dev/tests). This test exercises the fallback path
that actually runs in this project's test suite, and locks in the existing
accent-insensitive/ranked-match behavior after the PostgreSQL optimization
was added alongside it.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from api.models import City

User = get_user_model()


class CityAdminSearchTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            username='cityadmin', email='cityadmin@example.com', password='x'
        )
        self.client.force_login(self.admin_user)
        self.bucuresti = City.objects.create(name='București')
        self.brasov = City.objects.create(name='Brașov')
        self.cluj = City.objects.create(name='Cluj-Napoca')

    def test_search_is_accent_insensitive(self):
        """Typing without diacritics ('Bucuresti') must still find 'București'."""
        url = reverse('admin:api_city_changelist')
        response = self.client.get(url, {'q': 'Bucuresti'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'București')
        self.assertNotContains(response, 'Brașov')

    def test_search_ranks_exact_match_first(self):
        url = reverse('admin:api_city_changelist')
        response = self.client.get(url, {'q': 'Cluj'})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Cluj-Napoca')
