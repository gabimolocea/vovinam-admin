"""Descarcarea launcherului din pagina de instalare.

Partea care conteaza nu e cazul fericit, ci celelalte: GitHub cazut, nicio
versiune publicata inca, sau un server fara iesire la internet. In toate,
pagina de instalare trebuie sa se deschida si sa spuna ce se intampla -
pentru ca omul care o citeste pregateste un laptop pentru o competitie si
nu are pe cine intreba.
"""

from unittest.mock import patch

import requests
from rest_framework.test import APITestCase

from ..public_cache import invalidate_public_cache

RELEASE_GITHUB = {
    'tag_name': 'v1.2.0',
    'published_at': '2026-10-01T18:00:00Z',
    'html_url': 'https://github.com/gabimolocea/vovinam-admin/releases/tag/v1.2.0',
    'assets': [
        {
            'name': 'FRVV Competition Launcher-1.2.0-arm64.dmg',
            'size': 101_000_000,
            'browser_download_url': 'https://github.com/x/releases/download/v1.2.0/arm64.dmg',
        },
        {
            'name': 'FRVV Competition Launcher-1.2.0.dmg',
            'size': 106_000_000,
            'browser_download_url': 'https://github.com/x/releases/download/v1.2.0/intel.dmg',
        },
        {
            'name': 'FRVV Competition Launcher Setup 1.2.0.exe',
            'size': 95_000_000,
            'browser_download_url': 'https://github.com/x/releases/download/v1.2.0/setup.exe',
        },
        # Fisierele astea insotesc orice release facut de electron-builder
        # si nu trebuie sa ajunga niciodata pe un buton de descarcare.
        {'name': 'latest-mac.yml', 'size': 500, 'browser_download_url': 'https://x/latest-mac.yml'},
        {'name': 'arm64.dmg.blockmap', 'size': 900, 'browser_download_url': 'https://x/blockmap'},
    ],
}


def _raspuns(status_code=200, json_data=None):
    class Fals:
        def __init__(self):
            self.status_code = status_code

        def json(self):
            if json_data is None:
                raise ValueError('nu e JSON')
            return json_data
    return Fals()


class LauncherReleaseTests(APITestCase):
    def setUp(self):
        invalidate_public_cache()

    # ── cazul fericit ────────────────────────────────────────────────
    @patch('api.views.launcher_release.requests.get')
    def test_gives_one_file_per_kind_of_laptop(self, get):
        get.return_value = _raspuns(json_data=RELEASE_GITHUB)

        raspuns = self.client.get('/api/public/launcher/latest/', HTTP_HOST='localhost')

        self.assertEqual(raspuns.status_code, 200)
        self.assertTrue(raspuns.data['disponibil'])
        self.assertEqual(raspuns.data['versiune'], 'v1.2.0')
        chei = [f['cheie'] for f in raspuns.data['fisiere']]
        self.assertEqual(chei, ['mac-arm64', 'mac-intel', 'windows'])

    @patch('api.views.launcher_release.requests.get')
    def test_apple_and_intel_macs_do_not_get_the_same_file(self, get):
        get.return_value = _raspuns(json_data=RELEASE_GITHUB)

        fisiere = {f['cheie']: f for f in self.client.get(
            '/api/public/launcher/latest/', HTTP_HOST='localhost').data['fisiere']}

        # Ambele se termina in .dmg si difera doar prin "arm64" din nume:
        # o potrivire facuta neatent le-ar da pe amandoua la fel, iar
        # aplicatia pur si simplu n-ar porni pe jumatate din Mac-uri.
        self.assertIn('arm64', fisiere['mac-arm64']['nume'])
        self.assertNotIn('arm64', fisiere['mac-intel']['nume'])
        self.assertNotEqual(fisiere['mac-arm64']['url'], fisiere['mac-intel']['url'])

    @patch('api.views.launcher_release.requests.get')
    def test_the_bookkeeping_files_never_reach_a_button(self, get):
        get.return_value = _raspuns(json_data=RELEASE_GITHUB)

        nume = [f['nume'] for f in self.client.get(
            '/api/public/launcher/latest/', HTTP_HOST='localhost').data['fisiere']]

        for nedorit in ('latest-mac.yml', 'arm64.dmg.blockmap'):
            self.assertNotIn(nedorit, nume)

    @patch('api.views.launcher_release.requests.get')
    def test_download_sends_the_browser_to_the_right_file(self, get):
        get.return_value = _raspuns(json_data=RELEASE_GITHUB)

        raspuns = self.client.get('/api/public/launcher/download/windows/', HTTP_HOST='localhost')

        self.assertEqual(raspuns.status_code, 302)
        self.assertEqual(raspuns['Location'], 'https://github.com/x/releases/download/v1.2.0/setup.exe')

    # ── cand ceva nu merge ───────────────────────────────────────────
    @patch('api.views.launcher_release.requests.get')
    def test_the_page_still_opens_when_github_is_down(self, get):
        get.side_effect = requests.ConnectionError('fara retea')

        raspuns = self.client.get('/api/public/launcher/latest/', HTTP_HOST='localhost')

        # 200, nu 500: pagina de instalare trebuie sa se deschida oricum si
        # sa arate legatura de rezerva.
        self.assertEqual(raspuns.status_code, 200)
        self.assertFalse(raspuns.data['disponibil'])
        self.assertEqual(raspuns.data['fisiere'], [])
        self.assertIn('releases', raspuns.data['pagina_release'])

    @patch('api.views.launcher_release.requests.get')
    def test_the_page_still_opens_before_the_first_release(self, get):
        get.return_value = _raspuns(status_code=404)

        raspuns = self.client.get('/api/public/launcher/latest/', HTTP_HOST='localhost')

        self.assertEqual(raspuns.status_code, 200)
        self.assertFalse(raspuns.data['disponibil'])

    @patch('api.views.launcher_release.requests.get')
    def test_download_falls_back_to_the_releases_page(self, get):
        get.side_effect = requests.Timeout('prea incet')

        raspuns = self.client.get('/api/public/launcher/download/mac-arm64/', HTTP_HOST='localhost')

        self.assertEqual(raspuns.status_code, 302)
        self.assertIn('releases', raspuns['Location'])

    @patch('api.views.launcher_release.requests.get')
    def test_an_unknown_kind_is_a_plain_404(self, get):
        get.return_value = _raspuns(json_data=RELEASE_GITHUB)

        raspuns = self.client.get('/api/public/launcher/download/linux/', HTTP_HOST='localhost')

        self.assertEqual(raspuns.status_code, 404)

    @patch('api.views.launcher_release.requests.get')
    def test_github_is_asked_once_for_many_visitors(self, get):
        get.return_value = _raspuns(json_data=RELEASE_GITHUB)

        for _ in range(5):
            self.client.get('/api/public/launcher/latest/', HTTP_HOST='localhost')

        # GitHub lasa 60 de cereri pe ora de la aceeasi adresa. Fara cache,
        # o pagina deschisa des le-ar consuma si ar incepe sa raspunda cu
        # eroare taman cand cineva pregateste laptopul.
        self.assertEqual(get.call_count, 1)
