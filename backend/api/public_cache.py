"""Cache pentru răspunsurile publice ale site-ului.

Site-ul public cere aceleași câteva liste la fiecare vizitator: noutăți,
evenimente, cluburi, staff, arbitri, documente. Niciuna nu depinde de cine
întreabă și niciuna nu se schimbă mai des de câteva ori pe săptămână, dar
fiecare costă aceleași interogări și aceeași serializare, pe o instanță de
0,5 GB care răspunde lent la rece.

Ce NU se pune aici: tot ce se uită la `request.user`. Deocamdată asta
înseamnă detaliul unui articol și galeria - amândouă întorc `my_reaction`,
iar un răspuns pus în cache ar da reacția unui om altuia. Vezi
`cache_public_response` și lista de la apelurile din
`api/views/public_content.py`.
"""
import os
import tempfile
from functools import wraps
from urllib.parse import parse_qsl, urlencode

from django.core.cache import cache
from rest_framework.response import Response

DEFAULT_TIMEOUT = 300

# Versiunea continutului, tinuta ca data de modificare a unui fisier gol.
#
# Cache-ul implicit e in memoria procesului, iar in productie gunicorn are
# doua. Daca versiunea ar sta tot in cache, o salvare din admin ar invalida
# doar procesul care a primit-o, iar celalalt ar servi continut vechi pana
# la expirare - adica exact genul de "am publicat stirea si nu apare" care
# ajunge raportat ca defectiune.
#
# Un fisier e vazut de toate procesele de pe aceeasi masina (containerul e
# unul singur, cu doua procese), iar `os.stat` costa microsecunde - nimic
# fata de interogarile si serializarea pe care le inlocuieste. Fara Redis,
# fara tabel nou, fara pas de instalare.
_VERSION_FILE = os.path.join(tempfile.gettempdir(), 'frvv-public-content-version')


def _version():
    try:
        return int(os.stat(_VERSION_FILE).st_mtime_ns)
    except OSError:
        return 0


def invalidate_public_cache():
    """Scoate din uz tot ce e in cache, dintr-o miscare.

    Nu stergem chei una cate una: versiunea intra in fiecare cheie, deci
    schimbarea ei le face pe toate de negasit, iar ele expira singure.
    """
    try:
        with open(_VERSION_FILE, 'a'):
            os.utime(_VERSION_FILE, None)
    except OSError:
        # Nu putem scrie (sistem de fisiere read-only, drepturi): raspunsurile
        # raman in cache pana expira. Mai bine asa decat o eroare la salvare.
        pass


def _cache_key(request):
    # Gazda intra in cheie fiindca serializatoarele construiesc URL-uri
    # absolute pentru imagini (`request.build_absolute_uri`): acelasi
    # raspuns servit catre localhost si catre adresa din LAN ar trimite
    # pozele la gazda gresita.
    # Parametrii sortati: `?page=2&category=x` si `?category=x&page=2` cer
    # acelasi lucru si merita aceeasi intrare in cache.
    query = urlencode(sorted(parse_qsl(request.META.get('QUERY_STRING', ''), keep_blank_values=True)))
    return f'public:{_version()}:{request.get_host()}:{request.path}?{query}'


def cache_public_response(timeout=DEFAULT_TIMEOUT):
    """Pune in cache raspunsul unei metode de view care nu depinde de user.

    Se aplica doar pe GET-uri care intorc 200. Orice altceva (POST-uri de
    reactii sau comentarii, erori) trece neatins.
    """
    def decorator(view_method):
        @wraps(view_method)
        def wrapper(self, request, *args, **kwargs):
            if request.method != 'GET':
                return view_method(self, request, *args, **kwargs)

            key = _cache_key(request)
            cached = cache.get(key)
            if cached is not None:
                return Response(cached)

            response = view_method(self, request, *args, **kwargs)
            if response.status_code == 200:
                cache.set(key, response.data, timeout)
            return response
        return wrapper
    return decorator
