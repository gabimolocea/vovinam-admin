"""Ultima versiune a launcherului, pentru pagina de instalare.

Pana acum pagina trimitea omul pe GitHub, la lista de Release-uri, de unde
trebuia sa desfaca sectiunea "Assets" si sa aleaga singur dintre mai multe
fisiere - exact genul de pas la care se opreste cineva care pregateste
laptopul si nu stie ce e un "asset". Acum alegerea o face serverul: pagina
primeste fisierele deja impartite pe sistem si procesor, iar butonul
descarca direct.

Intrebam GitHub de aici, nu din browser, din doua motive. Intai, GitHub
lasa doar 60 de cereri pe ora de la aceeasi adresa cand nu esti
autentificat, iar cu raspunsul tinut in cache ajungem la cateva pe ora
pentru toata lumea. Al doilea, asa adresele din pagina raman pe domeniul
nostru si nu se schimba niciodata, chiar daca maine mutam fisierele in alta
parte.
"""

import logging

import requests
from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ..public_cache import cache_public_response

logger = logging.getLogger(__name__)

GITHUB_REPO = 'gabimolocea/vovinam-admin'
GITHUB_API = f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest'
RELEASES_PAGE = f'https://github.com/{GITHUB_REPO}/releases/latest'

# Cat asteptam GitHub. Scurt dinadins: daca nu raspunde, pagina trebuie sa
# se incarce oricum si sa arate legatura de rezerva, nu sa stea cu rotita.
TIMEOUT_SECONDE = 6

# Numele fisierelor scoase de electron-builder, traduse in ceva ce poate fi
# pus pe un buton. Cheia e ce primeste pagina inapoi si ce apare in adresa
# de descarcare, deci nu se schimba fara sa se schimbe si pagina.
VARIANTE = [
    {
        'cheie': 'mac-arm64',
        'sistem': 'mac',
        'eticheta': 'Mac cu procesor Apple',
        'detaliu': 'M1, M2, M3, M4 — Mac-urile din 2020 încoace',
        'potrivire': lambda nume: nume.endswith('.dmg') and 'arm64' in nume,
    },
    {
        'cheie': 'mac-intel',
        'sistem': 'mac',
        'eticheta': 'Mac cu procesor Intel',
        'detaliu': 'Mac-urile mai vechi de 2020',
        'potrivire': lambda nume: nume.endswith('.dmg') and 'arm64' not in nume,
    },
    {
        'cheie': 'windows',
        'sistem': 'windows',
        'eticheta': 'Windows',
        'detaliu': 'Orice PC cu Windows 10 sau 11',
        'potrivire': lambda nume: nume.endswith('.exe'),
    },
]


def _ultimul_release():
    """Ce spune GitHub despre ultima versiune, sau None daca nu putem afla.

    Nu lasam nicio exceptie sa iasa: pagina de instalare trebuie sa se
    deschida si cand GitHub e cazut, cand nu exista inca niciun Release,
    sau cand serverul nostru n-are iesire la internet. In toate cazurile
    pagina arata legatura de rezerva si spune ce s-a intamplat.
    """
    try:
        raspuns = requests.get(
            GITHUB_API,
            headers={'Accept': 'application/vnd.github+json'},
            timeout=TIMEOUT_SECONDE,
        )
    except requests.RequestException as exc:
        logger.warning('Nu am putut interoga GitHub pentru ultimul release: %s', exc)
        return None

    if raspuns.status_code != 200:
        # 404 inseamna, de obicei, ca nu s-a publicat inca nimic - normal
        # inainte de prima eticheta, nu o defectiune.
        logger.warning('GitHub a raspuns %s pentru ultimul release.', raspuns.status_code)
        return None

    try:
        return raspuns.json()
    except ValueError:
        logger.warning('Raspunsul GitHub pentru ultimul release nu era JSON.')
        return None


def _fisiere(release):
    fisiere = []
    for varianta in VARIANTE:
        asset = next(
            (a for a in release.get('assets') or [] if varianta['potrivire'](a.get('name', ''))),
            None,
        )
        if not asset:
            continue
        fisiere.append({
            'cheie': varianta['cheie'],
            'sistem': varianta['sistem'],
            'eticheta': varianta['eticheta'],
            'detaliu': varianta['detaliu'],
            'nume': asset.get('name'),
            'marime_mb': round((asset.get('size') or 0) / 1048576, 1),
            'url': asset.get('browser_download_url'),
        })
    return fisiere


@api_view(['GET'])
@permission_classes([AllowAny])
@cache_public_response(timeout=600)
def latest_launcher_release(request):
    """Ce se afiseaza pe pagina de instalare din panoul de administrare."""
    release = _ultimul_release()
    if not release:
        return Response({
            'disponibil': False,
            'pagina_release': RELEASES_PAGE,
            'fisiere': [],
        })

    return Response({
        'disponibil': True,
        'versiune': release.get('tag_name'),
        'publicat_la': release.get('published_at'),
        'pagina_release': release.get('html_url') or RELEASES_PAGE,
        'fisiere': _fisiere(release),
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def download_launcher(request, cheie):
    """Trimite browserul la fisierul potrivit din ultima versiune.

    Adresa asta e stabila - `/api/public/launcher/download/mac-arm64/` arata
    la fel si peste un an - deci poate fi pusa intr-un e-mail sau intr-un
    ghid tiparit fara sa ramana in urma la urmatoarea versiune.

    Fisierul in sine vine de pe serverele GitHub, nu prin noi: sunt o suta
    de megaocteti, iar trecerea lor prin aplicatie ar ocupa degeaba un
    proces de fiecare data, fara niciun castig pentru cel care descarca.
    """
    release = _ultimul_release()
    if release:
        fisier = next((f for f in _fisiere(release) if f['cheie'] == cheie), None)
        if fisier:
            return HttpResponseRedirect(fisier['url'])

    if not any(v['cheie'] == cheie for v in VARIANTE):
        return Response(
            {'detail': f'Nu există o variantă numită „{cheie}”.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Varianta exista, dar nu si fisierul ei: trimitem omul la lista de
    # versiuni, unde poate vedea el ce s-a publicat, in loc sa-i dam o
    # eroare de la care n-ar sti ce sa faca.
    return HttpResponseRedirect(RELEASES_PAGE)
