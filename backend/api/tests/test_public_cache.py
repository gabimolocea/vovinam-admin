"""Cache-ul listelor publice: ce se pune, ce nu, si cand dispare.

Partea care conteaza nu e ca raspunsurile se repeta mai repede, ci ca nu
pleaca spre omul gresit. Detaliul unui articol si galeria intorc
`my_reaction` - daca ar intra in cache, reactia unuia ar ajunge la altul.
"""
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from landing.models import Event, NewsPost
from ..models import Club, User


class PublicCacheTests(TestCase):
    def setUp(self):
        cache.clear()
        # API-ul se autentifica prin JWT, nu prin sesiune: `force_login` nu
        # ajunge la view-uri, iar reactiile ar raspunde 401.
        self.client = APIClient()

    def test_club_list_is_served_from_cache(self):
        Club.objects.create(name='Clubul Unu')
        first = self.client.get('/api/public/clubs/')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.data), 1)

        # Scris direct in baza, fara semnale de salvare prin ORM-ul urmarit:
        # daca raspunsul vine din cache, clubul nou nu se vede inca.
        Club.objects.filter(pk__isnull=True).exists()  # no-op, pastreaza conexiunea
        with self.settings():
            Club.objects.bulk_create([Club(name='Clubul Doi')])

        second = self.client.get('/api/public/clubs/')
        self.assertEqual(len(second.data), 1, 'al doilea raspuns ar fi trebuit sa vina din cache')

    def test_saving_content_drops_the_cache(self):
        Club.objects.create(name='Clubul Unu')
        self.client.get('/api/public/clubs/')

        # Salvarea obisnuita trece prin semnale si invalideaza tot.
        Club.objects.create(name='Clubul Doi')

        refreshed = self.client.get('/api/public/clubs/')
        self.assertEqual(len(refreshed.data), 2)

    def test_query_parameter_order_shares_one_entry(self):
        from ..public_cache import _cache_key

        factory_a = self.client.get('/api/public/documents/?category=regulament&page=1').wsgi_request
        factory_b = self.client.get('/api/public/documents/?page=1&category=regulament').wsgi_request
        self.assertEqual(_cache_key(factory_a), _cache_key(factory_b))

    def test_news_detail_is_never_cached(self):
        """Contine `my_reaction`, deci e al fiecaruia in parte."""
        one = User.objects.create_user(username='unu', email='unu@example.com', password='x', first_name='U', last_name='N')
        post = NewsPost.objects.create(
            title='Stire', slug='stire', content='<p>x</p>', published=True, author=one,
        )
        two = User.objects.create_user(username='doi', email='doi@example.com', password='x', first_name='D', last_name='O')

        self.client.force_authenticate(user=one)
        reacted = self.client.post(f'/api/public/news/{post.slug}/react/', {'type': 'like'}, format='json')
        self.assertEqual(reacted.status_code, 200, reacted.data)
        mine = self.client.get(f'/api/public/news/{post.slug}/')
        self.assertEqual(mine.data['my_reaction'], 'like')

        self.client.force_authenticate(user=two)
        theirs = self.client.get(f'/api/public/news/{post.slug}/')
        self.assertIsNone(theirs.data['my_reaction'], 'reactia unui utilizator a ajuns la altul')

    def test_host_is_part_of_the_key(self):
        """Serializatoarele construiesc URL-uri absolute din gazda cererii."""
        from ..public_cache import _cache_key

        localhost = self.client.get('/api/public/clubs/', HTTP_HOST='localhost').wsgi_request
        lan = self.client.get('/api/public/clubs/', HTTP_HOST='127.0.0.1').wsgi_request
        self.assertNotEqual(_cache_key(localhost), _cache_key(lan))

    def test_event_list_survives_an_anonymous_and_an_authenticated_caller(self):
        Event.objects.create(
            title='Eveniment', slug='eveniment',
            start_date=timezone.now(), end_date=timezone.now(),
            event_types=['competition'], is_publicly_visible=True,
        )
        anon = self.client.get('/api/public/events/')
        user = User.objects.create_user(username='x', email='x@example.com', password='x', first_name='X', last_name='Y')
        self.client.force_authenticate(user=user)
        logged_in = self.client.get('/api/public/events/')
        self.assertEqual(anon.data, logged_in.data)
