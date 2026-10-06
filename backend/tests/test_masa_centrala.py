"""Masa centrala a unui teren: cine intra, si cat de departe ajunge.

Testul care conteaza cel mai mult e `test_nu_atinge_alt_teren`: un token valid
pentru Terenul 1 nu are voie sa opreasca proba de pe Terenul 2. Fara el,
"acces doar la pagina Live" ar insemna acces la toata competitia, doar cu o
interfata mai mica.
"""
from datetime import date, timedelta

from django.utils import timezone

from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (
    Athlete, Category, CategoryAthleteScore, CategoryFieldAssignment,
    CategoryRefereeScore, CompetitionField, DisplayMonitorSession,
    RefereeQRLogin, User,
)
from landing.models import Event


class MasaCentralaTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event = Event.objects.create(
            title='Cupa', slug='cupa-masa', start_date=date(2026, 1, 1), end_date=date(2026, 1, 2),
        )
        terenuri = list(CompetitionField.objects.filter(event=self.event).order_by('field_number'))
        while len(terenuri) < 2:
            terenuri.append(CompetitionField.objects.create(
                event=self.event, name=f'Teren {len(terenuri) + 1}', field_number=len(terenuri) + 1,
            ))
        self.teren1, self.teren2 = terenuri[0], terenuri[1]

        self.arbitru = Athlete.objects.create(first_name='Dan', last_name='Masă', is_referee=True)
        self.qr = RefereeQRLogin.objects.create(
            event=self.event, referee=self.arbitru,
            token=RefereeQRLogin.generate_token() if hasattr(RefereeQRLogin, 'generate_token') else 'tok-masa',
            pin='54321',
        )

        self.proba1 = Category.objects.create(name='Quyen T1', event=self.event)
        self.alocare1 = CategoryFieldAssignment.objects.create(category=self.proba1, field=self.teren1)
        self.proba2 = Category.objects.create(name='Quyen T2', event=self.event)
        self.alocare2 = CategoryFieldAssignment.objects.create(category=self.proba2, field=self.teren2)

    def _intra(self, teren, pin='54321'):
        return self.client.post('/api/masa-centrala-login/', {'pin': pin, 'field': teren.pk}, format='json')

    def _cu_tokenul(self, raspuns):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {raspuns.json()['tokens']['access']}")

    # ── intrarea ────────────────────────────────────────────────────────
    def test_pinul_corect_deschide_masa_terenului(self):
        r = self._intra(self.teren1)
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.assertEqual(r.json()['field']['id'], self.teren1.pk)
        self.assertEqual(r.json()['referee']['id'], self.arbitru.pk)

    def test_pinul_gresit_nu_deschide_nimic(self):
        self.assertEqual(self._intra(self.teren1, pin='00000').status_code, 404)

    def test_pinul_de_la_alt_eveniment_e_refuzat(self):
        alt = Event.objects.create(
            title='Alta', slug='alta-masa', start_date=date(2026, 3, 1), end_date=date(2026, 3, 2),
        )
        teren_strain = (CompetitionField.objects.filter(event=alt).first()
                        or CompetitionField.objects.create(event=alt, name='T', field_number=1))
        self.assertEqual(self._intra(teren_strain).status_code, 403)

    # ── cat de departe ajunge ───────────────────────────────────────────
    def test_porneste_si_incheie_proba_de_pe_terenul_lui(self):
        self._cu_tokenul(self._intra(self.teren1))
        r = self.client.patch(f'/api/category-field-assignments/{self.alocare1.pk}/',
                              {'status': 'in_progress'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:300])
        self.alocare1.refresh_from_db()
        self.assertIsNotNone(self.alocare1.actual_start_time)

    def test_nu_atinge_alt_teren(self):
        self._cu_tokenul(self._intra(self.teren1))
        r = self.client.patch(f'/api/category-field-assignments/{self.alocare2.pk}/',
                              {'status': 'in_progress'}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])
        self.alocare2.refresh_from_db()
        self.assertEqual(self.alocare2.status, 'not_started')

    def test_nu_schimba_ecranul_altui_teren(self):
        sesiune2 = DisplayMonitorSession.objects.create(field=self.teren2, current_category=self.proba2)
        self._cu_tokenul(self._intra(self.teren1))
        r = self.client.patch(f'/api/monitor-sessions/{sesiune2.pk}/',
                              {'current_athlete': None}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:300])

    def test_scrie_nota_manual_pe_terenul_lui_dar_nu_pe_altul(self):
        rezultat1 = CategoryAthleteScore.objects.create(category=self.proba1, type='solo')
        rezultat2 = CategoryAthleteScore.objects.create(category=self.proba2, type='solo')
        nota1 = CategoryRefereeScore.objects.create(
            athlete_score=rezultat1, referee=self.arbitru, score=90)
        nota2 = CategoryRefereeScore.objects.create(
            athlete_score=rezultat2, referee=self.arbitru, score=90)

        self._cu_tokenul(self._intra(self.teren1))
        self.assertEqual(self.client.patch(
            f'/api/category-referee-score/{nota1.pk}/', {'score': 80}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(
            f'/api/category-referee-score/{nota2.pk}/').status_code, 403)
        nota2.refresh_from_db()
        self.assertEqual(int(nota2.score), 90)

    def test_fara_token_nu_se_scrie_nimic(self):
        self.client.credentials()
        self.assertIn(self.client.patch(
            f'/api/category-field-assignments/{self.alocare1.pk}/',
            {'status': 'in_progress'}, format='json').status_code, (401, 403))

    def test_istoricul_retine_arbitrul_de_la_masa(self):
        """Tot rostul PIN-ului: numele omului de pe scaun, nu un cont comun."""
        self._cu_tokenul(self._intra(self.teren1))
        self.client.patch(f'/api/category-field-assignments/{self.alocare1.pk}/',
                          {'status': 'in_progress'}, format='json')
        from api.models import CategoryFlowEvent
        ev = CategoryFlowEvent.objects.filter(category=self.proba1, action='start').first()
        self.assertIsNotNone(ev)
        self.assertIsNotNone(ev.created_by)
        self.assertEqual(ev.created_by.first_name, 'Dan')

    # ── ce NU are voie, desi permisiunea de pe viewset o lasa sa intre ──
    def test_nu_rearanjeaza_programul(self):
        """`update` i-a fost deschis ca sa porneasca proba; restul, nu."""
        self._cu_tokenul(self._intra(self.teren1))
        r = self.client.post('/api/category-field-assignments/bulk-reorder/', {
            'items': [{'id': self.alocare1.pk, 'field': self.teren2.pk, 'order': 9}],
        }, format='json')
        self.assertEqual(r.status_code, 403, r.content[:200])
        self.alocare1.refresh_from_db()
        self.assertEqual(self.alocare1.field_id, self.teren1.pk)

    def test_nu_sterge_alocari(self):
        self._cu_tokenul(self._intra(self.teren1))
        self.assertEqual(self.client.delete(
            f'/api/category-field-assignments/{self.alocare1.pk}/').status_code, 403)
        self.assertTrue(CategoryFieldAssignment.objects.filter(pk=self.alocare1.pk).exists())

    def test_nu_muta_o_proba_pe_terenul_lui(self):
        """Altfel ar putea aduce la el o probă de pe alt teren și apoi o conduce."""
        self._cu_tokenul(self._intra(self.teren1))
        r = self.client.post('/api/category-field-assignments/', {
            'category': self.proba2.pk, 'field': self.teren1.pk,
        }, format='json')
        self.assertEqual(r.status_code, 403, r.content[:200])

    def test_nu_creeaza_ecran_pe_alt_teren(self):
        self._cu_tokenul(self._intra(self.teren1))
        r = self.client.post('/api/monitor-sessions/', {'field': self.teren2.pk}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:200])


class ExpirarePinTest(TestCase):
    """PIN-ul tine pana la finalul zilei, nu pentru totdeauna.

    Ziua intreaga, dinadins: un arbitru intra si iese de cateva ori si trebuie
    sa poata rescana acelasi cod inca afisat. Dar peste noapte nu mai are ce
    apara - acelasi PIN deschide si masa centrala a unui teren.
    """

    def setUp(self):
        self.client = APIClient()
        self.event = Event.objects.create(
            title='Cupa', slug='cupa-exp', start_date=date(2026, 1, 1), end_date=date(2026, 1, 2),
        )
        self.teren = (CompetitionField.objects.filter(event=self.event).first()
                      or CompetitionField.objects.create(event=self.event, name='T', field_number=1))
        self.arbitru = Athlete.objects.create(first_name='Ana', last_name='Pin', is_referee=True)
        self.qr = RefereeQRLogin.objects.create(
            event=self.event, referee=self.arbitru, token='tok-exp', pin='77777',
        )

    def test_codul_nou_se_naste_valabil(self):
        """Chiar si la un eveniment cu datele in trecut."""
        self.qr.prelungeste_pana_la_finalul_zilei()
        self.assertTrue(self.qr.este_valabil())
        self.assertGreater(self.qr.expires_at, timezone.now())

    def test_pinul_merge_cat_timp_nu_a_expirat(self):
        self.qr.prelungeste_pana_la_finalul_zilei()
        self.qr.save()
        r = self.client.post('/api/masa-centrala-login/',
                             {'pin': '77777', 'field': self.teren.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:200])

    def test_pinul_expirat_nu_mai_deschide_masa(self):
        self.qr.expires_at = timezone.now() - timedelta(minutes=1)
        self.qr.save()
        r = self.client.post('/api/masa-centrala-login/',
                             {'pin': '77777', 'field': self.teren.pk}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertIn('expirat', r.json()['error'])

    def test_pinul_expirat_nu_mai_deschide_nici_device_ul(self):
        self.qr.expires_at = timezone.now() - timedelta(minutes=1)
        self.qr.save()
        r = self.client.post('/api/referee-pin-login/', {'pin': '77777'}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertIn('expirat', r.json()['error'])

    def test_codul_qr_expirat_e_refuzat(self):
        self.qr.expires_at = timezone.now() - timedelta(minutes=1)
        self.qr.save()
        r = self.client.post('/api/referee-qr-login/', {'token': 'tok-exp'}, format='json')
        self.assertEqual(r.status_code, 404)
        self.assertIn('expirat', r.json()['error'])

    def test_expirarea_nu_conteaza_ca_incercare_gresita(self):
        """Altfel un arbitru care mai incearca de doua ori s-ar bloca singur."""
        from api.models import RefereePinLoginAttempt
        self.qr.expires_at = timezone.now() - timedelta(minutes=1)
        self.qr.save()
        self.client.post('/api/masa-centrala-login/',
                         {'pin': '77777', 'field': self.teren.pk}, format='json')
        self.assertEqual(RefereePinLoginAttempt.objects.count(), 0)

    def test_ziua_se_socoteste_in_fusul_salii_nu_in_UTC(self):
        """Serverul merge pe UTC, sala e in Romania.

        Socotit in UTC, "finalul zilei" cade la ora 3 dimineata la Ploiesti -
        in mijlocul noptii de dupa competitie, nu la capatul ei. Si mai rau,
        cine lucreaza intre miezul noptii si ora 3 ar primi un cod care moare
        peste cateva minute.
        """
        from zoneinfo import ZoneInfo
        from django.conf import settings
        from datetime import datetime as dt

        fus = ZoneInfo(settings.FUS_ORAR_SALA)
        # 01:00 la Ploiesti inseamna inca ziua de ieri in UTC.
        noaptea = dt(2026, 5, 30, 1, 0, tzinfo=fus)
        sfarsit = RefereeQRLogin.sfarsitul_zilei(None, acum=noaptea)
        local = sfarsit.astimezone(fus)
        self.assertEqual((local.hour, local.minute), (0, 0))
        self.assertEqual(local.date(), date(2026, 5, 31))
        # Aproape o zi intreaga, nu cateva minute.
        self.assertGreater((sfarsit - noaptea).total_seconds() / 3600, 22)


class MasaCentralaLaLupteTest(TestCase):
    """La lupte, cel de la masa nu e printre cei cinci care dau note - e al
    saselea. Regula "doar arbitrii alocati meciului" l-ar fi oprit tocmai pe
    el, iar restul endpointurilor de lupta cereau admin, deci masa nu
    functiona deloc acolo.
    """

    def setUp(self):
        self.client = APIClient()
        self.event = Event.objects.create(
            title='Cupa', slug='cupa-lupte', start_date=date(2026, 1, 1), end_date=date(2026, 1, 2),
        )
        terenuri = list(CompetitionField.objects.filter(event=self.event).order_by('field_number'))
        while len(terenuri) < 2:
            terenuri.append(CompetitionField.objects.create(
                event=self.event, name=f'Teren {len(terenuri) + 1}', field_number=len(terenuri) + 1))
        self.teren1, self.teren2 = terenuri[0], terenuri[1]

        self.arbitru = Athlete.objects.create(first_name='Vlad', last_name='Masă', is_referee=True)
        RefereeQRLogin.objects.create(
            event=self.event, referee=self.arbitru, token='tok-lupte', pin='31337',
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.proba = Category.objects.create(name='Lupte', event=self.event)
        self.meci1 = self._meci(self.teren1)
        self.meci2 = self._meci(self.teren2)

    def _meci(self, teren):
        from api.models import Match, MatchFieldAssignment
        m = Match.objects.create(category=self.proba, match_number=teren.field_number)
        MatchFieldAssignment.objects.create(match=m, field=teren)
        return m

    def _intra(self, teren):
        r = self.client.post('/api/masa-centrala-login/',
                             {'pin': '31337', 'field': teren.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['tokens']['access']}")

    def test_porneste_meciul_de_pe_terenul_lui(self):
        self._intra(self.teren1)
        r = self.client.patch(f'/api/match-field-assignments/{self.meci1.field_assignment.pk}/',
                              {'status': 'in_progress'}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:200])

    def test_nu_atinge_meciul_altui_teren(self):
        self._intra(self.teren1)
        r = self.client.patch(f'/api/match-field-assignments/{self.meci2.field_assignment.pk}/',
                              {'status': 'completed'}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:200])

    def test_nu_schimba_meciul_altui_teren(self):
        self._intra(self.teren1)
        r = self.client.patch(f'/api/matches/{self.meci2.pk}/', {'status': 'completed'}, format='json')
        self.assertEqual(r.status_code, 403, r.content[:200])

    def test_conduce_rundele_doar_pe_terenul_lui(self):
        self._intra(self.teren1)
        bun = self.client.post('/api/match-rounds/',
                               {'match': self.meci1.pk, 'round_number': 9}, format='json')
        self.assertIn(bun.status_code, (200, 201), bun.content[:200])
        rau = self.client.post('/api/match-rounds/',
                               {'match': self.meci2.pk, 'round_number': 9}, format='json')
        self.assertEqual(rau.status_code, 403, rau.content[:200])

    def test_scrie_nota_unui_arbitru_desi_el_nu_e_printre_cei_cinci(self):
        """Tot rostul: la lupte masa nu e arbitru alocat, dar introduce note."""
        self._intra(self.teren1)
        altul = Athlete.objects.create(first_name='Ana', last_name='Colț', is_referee=True)
        r = self.client.post('/api/match-referee-scores/', {
            'match': self.meci1.pk, 'referee': altul.pk, 'red_score': 3, 'blue_score': 1,
        }, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])
        from api.models import MatchRefereeScore
        self.assertTrue(MatchRefereeScore.objects.filter(match=self.meci1, referee=altul).exists())


class SursaNoteiTest(TestCase):
    """Cine a scris nota: arbitrul insusi, sau altcineva in locul lui.

    Tabelul pune colt rosu pe `competition_admin`. Pana acum sursa se deducea
    din "e admin sau nu", ceea ce cu masa centrala se strica in amandoua
    felurile: nota pusa de masa in casuta ALTUIA nu mai era insemnata deloc -
    tocmai urma care conteaza la o contestatie - iar propria lui nota primea
    colt rosu ca si cum i-ar fi schimbat-o cineva.
    """

    def setUp(self):
        self.client = APIClient()
        self.event = Event.objects.create(
            title='Cupa', slug='cupa-sursa', start_date=date(2026, 1, 1), end_date=date(2026, 1, 2),
        )
        self.teren = (CompetitionField.objects.filter(event=self.event).first()
                      or CompetitionField.objects.create(event=self.event, name='T', field_number=1))
        self.proba = Category.objects.create(name='Quyen', event=self.event)
        CategoryFieldAssignment.objects.create(category=self.proba, field=self.teren)

        self.eu = Athlete.objects.create(first_name='Dan', last_name='Masă', is_referee=True)
        self.altul = Athlete.objects.create(first_name='Ana', last_name='Colț', is_referee=True)
        from api.models import CategoryRefereeAssignment
        CategoryRefereeAssignment.objects.create(
            category=self.proba, referee_1=self.altul, referee_5=self.eu)
        RefereeQRLogin.objects.create(
            event=self.event, referee=self.eu, token='tok-sursa', pin='24680',
            expires_at=timezone.now() + timedelta(days=1))
        self.rezultat = CategoryAthleteScore.objects.create(
            category=self.proba, athlete=Athlete.objects.create(first_name='X', last_name='Y'), type='solo')

        r = self.client.post('/api/masa-centrala-login/',
                             {'pin': '24680', 'field': self.teren.pk}, format='json')
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['tokens']['access']}")

    def _sursa(self, arbitru):
        from api.models import CategoryRefereeScoreEvent
        return (CategoryRefereeScoreEvent.objects
                .filter(athlete_score=self.rezultat, referee=arbitru)
                .order_by('timestamp', 'id').last().source)

    def test_propria_nota_nu_e_insemnata_ca_interventie(self):
        r = self.client.post('/api/category-referee-score/', {
            'athlete_score': self.rezultat.pk, 'referee': self.eu.pk, 'score': 95,
        }, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])
        self.assertEqual(self._sursa(self.eu), 'referee_app')

    def test_nota_altui_arbitru_ramane_insemnata(self):
        r = self.client.post('/api/category-referee-score/', {
            'athlete_score': self.rezultat.pk, 'referee': self.altul.pk, 'score': 88,
        }, format='json')
        self.assertIn(r.status_code, (200, 201), r.content[:300])
        self.assertEqual(self._sursa(self.altul), 'competition_admin')


class ConflictArbitriTest(TestCase):
    """O probă încheiată nu mai ține niciun arbitru ocupat.

    Un arbitru care a arbitrat dimineața la Terenul 1 poate fi pus după-amiază
    la Terenul 2. Avertizat pentru o suprapunere care s-a consumat deja,
    operatorul învață să treacă peste avertismente - iar atunci nu-l mai
    oprește nici cel adevărat.
    """

    def setUp(self):
        from datetime import datetime
        from api.models import CategoryRefereeAssignment
        self.event = Event.objects.create(
            title='Cupa', slug='cupa-conflict', start_date=date(2026, 1, 1), end_date=date(2026, 1, 2),
        )
        terenuri = list(CompetitionField.objects.filter(event=self.event).order_by('field_number'))
        while len(terenuri) < 2:
            terenuri.append(CompetitionField.objects.create(
                event=self.event, name=f'T{len(terenuri) + 1}', field_number=len(terenuri) + 1))
        self.arbitru = Athlete.objects.create(first_name='Ion', last_name='Dublu', is_referee=True)

        ora = timezone.make_aware(datetime(2026, 1, 1, 10, 0))
        self.a = Category.objects.create(name='Proba A', event=self.event)
        self.aloc_a = CategoryFieldAssignment.objects.create(
            category=self.a, field=terenuri[0], scheduled_start_time=ora, estimated_duration=30)
        CategoryRefereeAssignment.objects.create(category=self.a, referee_1=self.arbitru)

        self.b = Category.objects.create(name='Proba B', event=self.event)
        self.aloc_b = CategoryFieldAssignment.objects.create(
            category=self.b, field=terenuri[1], scheduled_start_time=ora, estimated_duration=30)

    def _avertismente(self):
        from api.views._common import _referee_schedule_conflict_warnings
        self.b.refresh_from_db()
        return _referee_schedule_conflict_warnings(self.b, [self.arbitru.pk])

    def test_suprapunerea_reala_e_semnalata(self):
        self.assertTrue(self._avertismente())

    def test_proba_incheiata_nu_mai_produce_conflict(self):
        self.aloc_a.status = 'completed'
        self.aloc_a.save(update_fields=['status'])
        self.assertEqual(self._avertismente(), [])

    def test_nici_proba_incheiata_nu_mai_primeste_avertismente(self):
        self.aloc_b.status = 'completed'
        self.aloc_b.save(update_fields=['status'])
        self.assertEqual(self._avertismente(), [])


class InghetareScorTest(TestCase):
    """Un rezultat anunțat în sală nu are voie să se schimbe după.

    Scorul unui meci în timp real se număra de fiecare dată din apăsări, după
    regula de atunci. Când regula s-a schimbat - de la doi arbitri pe fază la
    trei - toate meciurile deja încheiate au început să arate alt scor decât
    cel anunțat. Testele de aici păzesc contrariul.
    """

    def setUp(self):
        from api.models import FightCategory, Match, RefereePointEvent
        self.event = Event.objects.create(
            title='Cupa', slug='cupa-inghet', start_date=date(2026, 1, 1), end_date=date(2026, 1, 2),
        )
        cat = FightCategory.objects.create(name='Lupta', event=self.event, display_order=1)
        self.meci = Match.objects.create(category=cat, match_number='M9', display_mode='real_time')
        self.arbitri = [
            Athlete.objects.create(first_name=f'A{i}', last_name='Ref', is_referee=True)
            for i in range(4)
        ]
        self.baza = 1_700_000_000_000
        self.RefereePointEvent = RefereePointEvent

    def _apasa(self, arbitru, la_ms, puncte=2):
        return self.RefereePointEvent.objects.create(
            match=self.meci, referee=arbitru, side='red', points=puncte,
            event_type='score', validation_status='validated',
            metadata={'round': 1, 'round_id': 1, 'client_timestamp_ms': self.baza + la_ms},
        )

    def test_scorul_se_scrie_la_incheiere(self):
        for i, a in enumerate(self.arbitri[:3]):
            self._apasa(a, i * 200)
        self.assertIsNone(self.meci.scores_frozen_at)
        self.meci.status = 'completed'
        self.meci.save()
        self.meci.refresh_from_db()
        self.assertIsNotNone(self.meci.scores_frozen_at)
        self.assertEqual((self.meci.final_red_score, self.meci.final_blue_score), (2, 0))

    def test_apasarile_de_dupa_nu_mai_schimba_rezultatul(self):
        """Nici măcar o fază nouă adăugată după încheiere."""
        for i, a in enumerate(self.arbitri[:3]):
            self._apasa(a, i * 200)
        self.meci.status = 'completed'
        self.meci.save()
        for i, a in enumerate(self.arbitri[:3]):
            self._apasa(a, 5000 + i * 200)
        self.meci.refresh_from_db()
        self.assertEqual(self.meci.scorul_final(), (2, 0), 'rezultatul a fost rescris după încheiere')

    def test_a_doua_salvare_nu_rescrie(self):
        for i, a in enumerate(self.arbitri[:3]):
            self._apasa(a, i * 200)
        self.meci.status = 'completed'
        self.meci.save()
        self.meci.refresh_from_db()
        intai = self.meci.scores_frozen_at
        self.meci.save()
        self.meci.refresh_from_db()
        self.assertEqual(self.meci.scores_frozen_at, intai)

    def test_un_meci_neincheiat_se_numara_mai_departe(self):
        for i, a in enumerate(self.arbitri[:3]):
            self._apasa(a, i * 200)
        self.assertEqual(self.meci.scorul_final(), (2, 0))
        for i, a in enumerate(self.arbitri[:3]):
            self._apasa(a, 5000 + i * 200)
        self.assertEqual(self.meci.scorul_final(), (4, 0), 'înainte de încheiere scorul e viu')

    def test_resetul_dezgheata_rezultatul(self):
        """Un meci scos din «încheiat» nu mai are rezultat final.

        Lăsat înghețat, ar fi arătat scorul vechi pe un meci care urmează să
        fie rejucat - și nimeni n-ar fi înțeles de unde vine.
        """
        for i, a in enumerate(self.arbitri[:3]):
            self._apasa(a, i * 200)
        self.meci.status = 'completed'
        self.meci.save()
        self.meci.refresh_from_db()
        self.assertIsNotNone(self.meci.scores_frozen_at)

        self.meci.status = 'scheduled'
        self.meci.save()
        self.meci.refresh_from_db()
        self.assertIsNone(self.meci.scores_frozen_at)
        self.assertIsNone(self.meci.final_red_score)
        # Si se numara iar din apasari.
        self.assertEqual(self.meci.scorul_final(), (2, 0))
