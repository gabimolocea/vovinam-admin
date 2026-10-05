"""Masa centrala a unui teren: cine intra, si cat de departe ajunge.

Testul care conteaza cel mai mult e `test_nu_atinge_alt_teren`: un token valid
pentru Terenul 1 nu are voie sa opreasca proba de pe Terenul 2. Fara el,
"acces doar la pagina Live" ar insemna acces la toata competitia, doar cu o
interfata mai mica.
"""
from datetime import date

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
