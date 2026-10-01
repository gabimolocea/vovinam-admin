"""Cine vorbeste cu serverul din sala.

Testele astea pazesc ceva ce se citeste cu cinci minute inainte de start, ca
sa se stie daca placutele si tabletele chiar sunt legate. Daca ar minti -
aratand conectat ceva ce nu e, sau invers - ar fi mai rau decat sa nu existe
deloc: cineva s-ar baza pe el si ar afla adevarul la primul meci.
"""

from unittest.mock import patch

from django.test import TestCase, override_settings

from ..connectivity import FEREASTRA_SECUNDE, inregistreaza
from ..public_cache import invalidate_public_cache

# Agentul pe care il trimite HTTPClient din Arduino, nesuprascris de
# firmware-ul nostru (devices/referee-esp32c3).
AGENT_PLACUTA = 'ESP32HTTPClient'
AGENT_TABLETA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/605.1.15'


@override_settings(IS_LOCAL_EVENT_SERVER=True)
class ConnectivityTests(TestCase):
    def setUp(self):
        invalidate_public_cache()
        from django.core.cache import cache
        cache.delete('sala:aparate')

    def _citeste(self):
        raspuns = self.client.get('/api/local/connectivity/', HTTP_HOST='localhost')
        self.assertEqual(raspuns.status_code, 200)
        return raspuns.data

    def test_tells_boards_apart_from_tablets(self):
        inregistreaza('192.168.0.31', AGENT_PLACUTA)
        inregistreaza('192.168.0.32', AGENT_PLACUTA)
        inregistreaza('192.168.0.50', AGENT_TABLETA)

        date = self._citeste()

        # Numarul de placute e cifra pe care o citeste cineva inainte de
        # start: "am pornit sase, vad sase".
        self.assertEqual(date['placute'], 2)
        self.assertEqual(date['browsere'], 1)

    def test_a_device_that_went_quiet_drops_off(self):
        inregistreaza('192.168.0.31', AGENT_PLACUTA)

        # O placuta scoasa din priza nu mai cere nimic. Daca ar ramane in
        # lista, cineva ar crede ca e pornita si ar cauta defectiunea in
        # altceva.
        with patch('api.connectivity._acum', return_value=__import__('time').time() + FEREASTRA_SECUNDE + 5):
            date = self._citeste()

        self.assertEqual(date['placute'], 0)
        self.assertEqual(date['aparate'], [])

    def test_the_same_device_is_counted_once(self):
        for _ in range(5):
            inregistreaza('192.168.0.31', AGENT_PLACUTA)

        self.assertEqual(self._citeste()['placute'], 1)

    def test_says_how_long_ago_each_one_spoke(self):
        inregistreaza('192.168.0.31', AGENT_PLACUTA)

        aparat = self._citeste()['aparate'][0]

        self.assertEqual(aparat['adresa'], '192.168.0.31')
        self.assertEqual(aparat['fel'], 'placuta')
        self.assertLess(aparat['acum_secunde'], 5)

    def test_a_broken_cache_does_not_break_scoring(self):
        # Evidenta asta trece prin fiecare cerere, inclusiv prin cea care
        # trimite nota unui arbitru. Daca ar putea arunca, ar opri
        # competitia pentru o informatie care nu conteaza deloc atunci.
        with patch('api.connectivity.cache.set', side_effect=RuntimeError('cache picat')):
            inregistreaza('192.168.0.31', AGENT_PLACUTA)   # nu trebuie sa arunce

    def test_requests_register_themselves(self):
        # Capatul celalalt: nu doar functia, ci si middleware-ul legat in
        # lant - o cerere obisnuita trebuie sa se vada in lista.
        #
        # Il adaugam aici fiindca in mod normal e pus de settings_local, iar
        # testele ruleaza cu configurarea obisnuita.
        from django.conf import settings as cfg
        lant = [*cfg.MIDDLEWARE, 'api.connectivity.ConnectivityMiddleware']

        with override_settings(MIDDLEWARE=lant, IS_LOCAL_EVENT_SERVER=True):
            # REMOTE_ADDR altul decat cel al clientului de test: evidenta e
            # tinuta pe adresa, deci cererea de verificare (care vine tot de
            # la 127.0.0.1) ar suprascrie intrarea placutei. In sala nu se
            # intampla - fiecare aparat are adresa lui - dar testul ar
            # masura altceva decat crede.
            self.client.get(
                '/api/public/clubs/',
                HTTP_HOST='localhost',
                HTTP_USER_AGENT=AGENT_PLACUTA,
                REMOTE_ADDR='192.168.0.31',
            )
            self.assertEqual(self._citeste()['placute'], 1)


class ConnectivityIsLocalOnlyTests(TestCase):
    @override_settings(IS_LOCAL_EVENT_SERVER=False)
    def test_the_middleware_removes_itself_in_the_cloud(self):
        from django.core.exceptions import MiddlewareNotUsed

        from ..connectivity import ConnectivityMiddleware

        # In cloud n-are ce cauta: adresele vizitatorilor nu ne privesc, si
        # ar fi o verificare pe fiecare cerere, degeaba.
        with self.assertRaises(MiddlewareNotUsed):
            ConnectivityMiddleware(lambda request: None)
