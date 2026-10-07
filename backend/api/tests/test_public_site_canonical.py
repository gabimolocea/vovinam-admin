import os
import tempfile
from unittest import mock

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

from crud import legacy_urls, urls as crud_urls
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


class LegacyWordPressRedirectTests(TestCase):
    """Old WordPress addresses Search Console listed as noindex - each lands on its page today."""

    def setUp(self):
        from api.models import User
        from landing.models import NewsPost

        author = User.objects.create_user('autor', email='autor@example.com', password='x')
        NewsPost.objects.create(title='Congres', slug='congres-evvf-2025', author=author, content='x', published=True)
        NewsPost.objects.create(title='Ciorna', slug='ciorna', author=author, content='x', published=False)
        visible_events = {'stagiu-national-de-arbitraj-2024'}
        patcher = mock.patch.object(
            legacy_urls, '_event_path',
            side_effect=lambda slug: f'/calendar/{slug}' if slug in visible_events else None,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_old_addresses_map_to_their_current_page(self):
        cases = {
            '/congres-evvf-2025/': '/noutati/congres-evvf-2025',
            '/evenimente_info/stagiu-national-de-arbitraj-2024/': '/calendar/stagiu-national-de-arbitraj-2024',
            '/evenimente_info/congres-evvf-2025/': '/noutati/congres-evvf-2025',
            '/evenimente_info/ceva-sters/': '/calendar',
            '/membri/angel-mititelu/': '/staff',
            '/federatie/arbitri/': '/arbitri',
            '/federatie/staff/': '/staff',
            '/federatie/despre/': '/despre',
            '/category/congres/': '/noutati',
            '/tag/vovinam/': '/noutati',
            '/noutati/page/4/': '/noutati',
            '/privacy-policy/': '/confidentialitate',
            '/wp-content/uploads/2025/05/Regulament-lupta-vovinam-2023.pdf': '/regulament',
        }
        for old, new in cases.items():
            self.assertEqual(legacy_urls.legacy_redirect(old), new, old)

    def test_current_routes_and_unknown_paths_are_left_alone(self):
        for path in ('/', '/despre', '/noutati', '/noutati/congres-evvf-2025', '/cont', '/ciorna/', '/nu-exista/'):
            self.assertIsNone(legacy_urls.legacy_redirect(path), path)

    def test_old_wordpress_files_with_no_replacement_are_gone(self):
        for path in (
            '/wp-content/themes/bricks/*', '/wp-content/uploads/*', '/wp-content/uploads/2024/01/poza.jpg',
            '/feed/', '/congres-evvf-2025/feed/', '/category/campionat-mondial/feed/', '/tag/aparare/feed/',
        ):
            response = crud_urls.frontend(RequestFactory().get(path))
            self.assertEqual(response.status_code, 410, path)

    def test_frontend_view_redirects_in_one_hop(self):
        response = crud_urls.frontend(RequestFactory().get('/congres-evvf-2025/'))
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response['Location'], '/noutati/congres-evvf-2025')
