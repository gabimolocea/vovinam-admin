"""Cine vorbeste cu serverul din sala, chiar acum.

Pana acum nu exista nicio cale de a verifica lanțul inainte de start:
tabletele deschise, device-urile pornite, reteaua in regula. Se afla la primul
meci, cand un arbitru apasa un buton si nu se intampla nimic - adica exact
cand nu mai e timp.

Tinem minte, pentru fiecare adresa care ne-a cerut ceva, cand a facut-o
ultima oara si ce fel de aparat pare sa fie. Nimic in baza de date: sunt
date care conteaza doua minute si care s-ar sterge oricum la final. Stau in
cache-ul procesului, cu termen scurt.

Merge doar pe serverul din sala (IS_LOCAL_EVENT_SERVER). In cloud ar fi si
inutil, si o scurgere de informatie: acolo adresele vizitatorilor nu ne
privesc.
"""

import time

from django.conf import settings
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Cat timp un aparat ramane "conectat" dupa ultima cerere. Device-urile Arbitru intreaba
# masa centrala in fiecare secunda, iar o tableta deschisa face cereri des,
# deci un minut e generos chiar si pentru una lasata pe o pagina linistita.
FEREASTRA_SECUNDE = 60

_CHEIE = 'sala:aparate'

# Prefixele din User-Agent dupa care recunoastem device-urile. HTTPClient din
# Arduino nu-si schimba agentul, iar firmware-ul nostru nu-l suprascrie.
_SEMNE_DEVICE = ('ESP32', 'ESP8266', 'arduino')

# Un browser nu spune cine e, dar spune de unde vine: cererile catre API
# sunt catre alt port decat pagina, deci poarta antetul Origin. Iar fiecare
# aplicatie din sala sta pe portul ei.
#
# Conteaza fiindca arbitrii nu stau doar pe device-uri - unii intra de pe
# telefon, din aplicatia de arbitraj. Fara impartirea asta ar aparea la gramada
# cu ecranul public si cu laptopul de secretariat, iar cifra "cati arbitri
# sunt conectati" - singura care conteaza inainte de start - n-ar exista.
_PORT_APLICATIE = {
    '5176': 'arbitraj',
    '5191': 'administrare',
    '5177': 'ecran',
}


def _acum():
    return time.time()


def inregistreaza(ip, user_agent, origine=''):
    """Chemata la fiecare cerere. Nu arunca niciodata: o evidenta care cade
    n-are voie sa opreasca o cerere de arbitraj."""
    try:
        aparate = cache.get(_CHEIE) or {}
        fel = _fel(user_agent or '', origine or '')

        # Un telefon deschide pe rand mai multe pagini, si nu toate cererile
        # poarta originea. Pastram ultimul fel cunoscut, ca sa nu alunece in
        # "altul" la prima cerere fara antet.
        vechi = aparate.get(ip) or {}
        if fel == 'altul' and vechi.get('fel'):
            fel = vechi['fel']

        aparate[ip] = {'vazut': _acum(), 'fel': fel}

        # Curatam aici, nu cu un proces separat: lista are cateva zeci de
        # randuri, iar asa nu exista nimic de pornit si de oprit.
        limita = _acum() - FEREASTRA_SECUNDE * 4
        aparate = {k: v for k, v in aparate.items() if v['vazut'] >= limita}

        cache.set(_CHEIE, aparate, FEREASTRA_SECUNDE * 4)
    except Exception:  # noqa: BLE001 - vezi mai sus
        pass


def _fel(agent, origine):
    if any(s.lower() in agent.lower() for s in _SEMNE_DEVICE):
        return 'device'

    # Originea arata "http://gazda:port"; ne intereseaza doar portul.
    port = origine.rsplit(':', 1)[-1] if ':' in origine else ''
    return _PORT_APLICATIE.get(port, 'altul')


class ConnectivityMiddleware:
    """Trece prin fiecare cerere si noteaza de unde a venit."""

    def __init__(self, get_response):
        self.get_response = get_response
        if not getattr(settings, 'IS_LOCAL_EVENT_SERVER', False):
            # Django opreste din lant un middleware care ridica asta la
            # pornire - exact ce vrem in cloud, fara nicio verificare la
            # fiecare cerere.
            from django.core.exceptions import MiddlewareNotUsed
            raise MiddlewareNotUsed()

    def __call__(self, request):
        # Prima din X-Forwarded-For daca exista (nginx, proxy), altfel
        # adresa directa.
        # Cel care citeste lista nu se numara pe el insusi: altfel
        # launcherul, care intreaba din patru in patru secunde, ar aparea
        # mereu ca "alt aparat" si ar incurca socoteala.
        if request.path.startswith('/api/local/connectivity'):
            return self.get_response(request)

        inaintat = request.META.get('HTTP_X_FORWARDED_FOR', '')
        ip = inaintat.split(',')[0].strip() if inaintat else request.META.get('REMOTE_ADDR', '')
        if ip:
            inregistreaza(
                ip,
                request.META.get('HTTP_USER_AGENT', ''),
                request.META.get('HTTP_ORIGIN', '') or request.META.get('HTTP_REFERER', ''),
            )
        return self.get_response(request)


@api_view(['GET'])
@permission_classes([AllowAny])
def connectivity(request):
    """Ce aparate au vorbit cu serverul in ultimul minut.

    Deschis fara autentificare dinadins: se cheama din launcher inainte de
    autentificare, iar pe reteaua din sala nu e nimic de ascuns in el. In
    cloud nu exista - middleware-ul se dezactiveaza acolo, iar ruta e
    inregistrata doar pe serverul local.
    """
    if not getattr(settings, 'IS_LOCAL_EVENT_SERVER', False):
        # In cloud nu exista. Verificat aici, nu la inregistrarea rutelor:
        # acolo s-ar citi o singura data, la pornire.
        from django.http import Http404
        raise Http404()

    aparate = cache.get(_CHEIE) or {}
    limita = _acum() - FEREASTRA_SECUNDE

    recente = [
        {
            'adresa': ip,
            'fel': date.get('fel', 'altul'),
            'acum_secunde': int(_acum() - date['vazut']),
        }
        for ip, date in aparate.items()
        if date['vazut'] >= limita
    ]
    recente.sort(key=lambda a: (a['fel'], a['adresa']))

    def cati(*feluri):
        return sum(1 for a in recente if a['fel'] in feluri)

    return Response({
        'fereastra_secunde': FEREASTRA_SECUNDE,
        # Cifra care conteaza inainte de start: cati arbitri sunt legati, fie
        # de pe device, fie de pe telefon din aplicatia de arbitraj.
        'arbitri': cati('device', 'arbitraj'),
        'device_arbitru': cati('device'),
        'telefoane_arbitraj': cati('arbitraj'),
        'administrare': cati('administrare'),
        'ecrane': cati('ecran'),
        'altele': cati('altul'),
        'aparate': recente,
    })
