import os
import tempfile
from unittest import mock

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from crud import urls as crud_urls
from crud.middleware import PrimaryHostRedirectMiddleware


class PublicSitePageAddressTests(SimpleTestCase):
    """Each public page answers at one address only - the one its canonical names.

    Google Search Console flagged pages as "Duplicate without user-selected
    canonical": /noutati redirected to /noutati/, whose canonical pointed
    back at /noutati, so Google ignored the canonical entirely.
    """

    def setUp(self):
        self.factory = RequestFactory()
        self.root = tempfile.mkdtemp()
        for route, body in (('', 'home'), ('noutati', 'news list'), ('noutati/un-articol', 'article')):
            os.makedirs(os.path.join(self.root, route), exist_ok=True)
            with open(os.path.join(self.root, route, 'index.html'), 'w') as page:
                page.write(body)
        crud_urls.prerendered_page.cache_clear()
        self.addCleanup(crud_urls.prerendered_page.cache_clear)

    def get(self, path):
        with override_settings(WHITENOISE_ROOT=self.root), \
                mock.patch.object(crud_urls, 'spa_shell', return_value=HttpResponse('shell')):
            return crud_urls.frontend(self.factory.get(path))

    def test_prerendered_route_answers_at_the_bare_path(self):
        response = self.get('/noutati')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'news list')
        self.assertEqual(self.get('/noutati/un-articol').content, b'article')
        self.assertEqual(self.get('/').content, b'home')

    def test_trailing_slash_is_a_permanent_redirect_keeping_the_query(self):
        response = self.get('/noutati/?page=2')
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response['Location'], '/noutati?page=2')

    def test_routes_without_a_prerendered_page_get_the_spa_shell(self):
        self.assertEqual(self.get('/cont').content, b'shell')
        self.assertEqual(self.get('/sportivi/12').content, b'shell')

    def test_paths_cannot_climb_out_of_the_build_folder(self):
        self.assertEqual(self.get('/../../etc').content, b'shell')


@override_settings(
    PRIMARY_SITE_HOST='vovinam.ro',
    PRIMARY_SITE_ALIAS_HOSTS=['www.vovinam.ro', 'vovinam-vietvodao.ro'],
    ALLOWED_HOSTS=['*'],
)
class PrimaryHostRedirectTests(SimpleTestCase):
    def call(self, host, path='/noutati?page=2'):
        middleware = PrimaryHostRedirectMiddleware(lambda request: HttpResponse('page'))
        return middleware(RequestFactory().get(path, HTTP_HOST=host))

    def test_alias_domains_redirect_permanently_to_the_primary_one(self):
        for host in ('www.vovinam.ro', 'vovinam-vietvodao.ro', 'WWW.vovinam.ro:443'):
            response = self.call(host)
            self.assertEqual(response.status_code, 301, host)
            self.assertEqual(response['Location'], 'https://vovinam.ro/noutati?page=2')

    def test_primary_and_other_hosts_pass_through(self):
        for host in ('vovinam.ro', 'admin.vovinam.ro', 'api.vovinam.ro', 'localhost'):
            self.assertEqual(self.call(host).content, b'page', host)
