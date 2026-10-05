"""Istoricul probei: restaurarea notelor si cronologia desfasurarii.

Doua lucruri care, daca se strica, se strica tacut: o restaurare care nu
readuce exact ce era, si o cronologie care ramane goala pentru ca scrierea ei
e inghitita de `except`. Amandoua se vad doar daca sunt verificate aici.
"""
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from api.models import (
    Athlete, CategoryAthleteScore, CategoryFlowEvent, CategoryFieldAssignment,
    Category, CategoryRefereeScore, CategoryRefereeScoreEvent, CompetitionField,
    DisplayMonitorSession, User,
)
from landing.models import Event


class IstoricProbaTest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='sef', email='sef@test.ro', password='x', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

        self.event = Event.objects.create(
            title='Cupa', slug='cupa', start_date=date(2026, 1, 1), end_date=date(2026, 1, 2),
        )
        self.category = Category.objects.create(name='Quyen Nam', event=self.event)
        # Evenimentul isi face singur terenurile, deci il luam pe cel existent.
        self.field = (CompetitionField.objects.filter(event=self.event).first()
                      or CompetitionField.objects.create(
                          name='Teren 1', field_number=1, event=self.event))
        self.assignment = CategoryFieldAssignment.objects.create(
            category=self.category, field=self.field,
        )
        self.sportiv = Athlete.objects.create(first_name='Ion', last_name='Pop')
        self.arbitri = [
            Athlete.objects.create(first_name=f'Arbitru{i}', last_name='Test', is_referee=True)
            for i in range(3)
        ]
        self.rezultat = CategoryAthleteScore.objects.create(
            category=self.category, athlete=self.sportiv, type='solo',
        )

    def _trimite_note(self, valori):
        for arbitru, valoare in zip(self.arbitri, valori):
            raspuns = self.client.post('/api/category-referee-score/', {
                'athlete_score': self.rezultat.pk,
                'referee': arbitru.pk,
                'score': valoare,
            }, format='json')
            self.assertIn(raspuns.status_code, (200, 201), raspuns.content[:300])

    def _note_curente(self):
        return {s.referee_id: int(s.score) for s in self.rezultat.referee_scores.all()}

    def test_restaurarea_readuce_notele_sterse(self):
        self._trimite_note([95, 92, 90])
        initiale = self._note_curente()
        self.assertEqual(len(initiale), 3)

        ultimul = (CategoryRefereeScoreEvent.objects
                   .filter(athlete_score=self.rezultat).order_by('timestamp', 'id').last())

        # Resetarea probei, exact cum o face pagina Live: fiecare nota stearsa.
        for sid in list(self.rezultat.referee_scores.values_list('id', flat=True)):
            self.assertEqual(self.client.delete(f'/api/category-referee-score/{sid}/').status_code, 204)
        self.assertEqual(self._note_curente(), {})

        raspuns = self.client.post('/api/category-referee-score-events/restore/', {
            'athlete_score': self.rezultat.pk, 'to_event': ultimul.pk,
        }, format='json')
        self.assertEqual(raspuns.status_code, 200, raspuns.content[:300])
        self.assertEqual(self._note_curente(), initiale)

    def test_restaurarea_anuleaza_o_modificare_manuala(self):
        self._trimite_note([95, 92, 90])
        inainte = (CategoryRefereeScoreEvent.objects
                   .filter(athlete_score=self.rezultat).order_by('timestamp', 'id').last())
        initiale = self._note_curente()

        # Un admin schimba nota unui arbitru din tabel.
        scor = self.rezultat.referee_scores.get(referee=self.arbitri[0])
        self.assertEqual(self.client.patch(
            f'/api/category-referee-score/{scor.pk}/', {'score': 10}, format='json',
        ).status_code, 200)
        self.assertEqual(self._note_curente()[self.arbitri[0].pk], 10)

        raspuns = self.client.post('/api/category-referee-score-events/restore/', {
            'athlete_score': self.rezultat.pk, 'to_event': inainte.pk,
        }, format='json')
        self.assertEqual(raspuns.status_code, 200, raspuns.content[:300])
        self.assertEqual(self._note_curente(), initiale)

    def test_restaurarea_intra_ea_insasi_in_istoric(self):
        """Altfel ar fi o scriere din care nu se mai poate iesi."""
        self._trimite_note([95])
        tinta = (CategoryRefereeScoreEvent.objects
                 .filter(athlete_score=self.rezultat).order_by('timestamp', 'id').last())
        scor = self.rezultat.referee_scores.first()
        self.client.patch(f'/api/category-referee-score/{scor.pk}/', {'score': 50}, format='json')
        self.client.post('/api/category-referee-score-events/restore/', {
            'athlete_score': self.rezultat.pk, 'to_event': tinta.pk,
        }, format='json')
        self.assertTrue(CategoryRefereeScoreEvent.objects.filter(
            athlete_score=self.rezultat, source='system').exists())

    def test_nota_necunoscuta_jurnalului_nu_e_stearsa(self):
        """O nota fara urma in jurnal nu poate fi refacuta, deci nu se atinge."""
        self._trimite_note([95])
        tinta = (CategoryRefereeScoreEvent.objects
                 .filter(athlete_score=self.rezultat).order_by('timestamp', 'id').last())
        # Scrisa direct in baza: niciun eveniment, ca la un import.
        CategoryRefereeScore.objects.create(
            athlete_score=self.rezultat, referee=self.arbitri[2], score=88,
        )
        raspuns = self.client.post('/api/category-referee-score-events/restore/', {
            'athlete_score': self.rezultat.pk, 'to_event': tinta.pk,
        }, format='json')
        self.assertEqual(raspuns.status_code, 200)
        self.assertIn(self.arbitri[2].pk, raspuns.json()['untouched_referees'])
        self.assertEqual(self._note_curente()[self.arbitri[2].pk], 88)

    def test_cronologia_retine_inceputul_si_sfarsitul_probei(self):
        self.assertEqual(self.client.patch(
            f'/api/category-field-assignments/{self.assignment.pk}/',
            {'status': 'in_progress'}, format='json').status_code, 200)
        self.assignment.refresh_from_db()
        self.assertIsNotNone(self.assignment.actual_start_time)

        self.assertEqual(self.client.patch(
            f'/api/category-field-assignments/{self.assignment.pk}/',
            {'status': 'completed'}, format='json').status_code, 200)
        self.assignment.refresh_from_db()
        self.assertIsNotNone(self.assignment.actual_end_time)

        actiuni = list(CategoryFlowEvent.objects
                       .filter(category=self.category).values_list('action', flat=True))
        self.assertEqual(actiuni, ['start', 'finish'])

    def test_cronologia_retine_prezentarea_si_oprirea(self):
        sesiune = DisplayMonitorSession.objects.create(
            field=self.field, current_category=self.category,
        )
        self.assertEqual(self.client.patch(
            f'/api/monitor-sessions/{sesiune.pk}/',
            {'current_athlete': self.sportiv.pk}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(
            f'/api/monitor-sessions/{sesiune.pk}/',
            {'current_athlete': None}, format='json').status_code, 200)

        momente = list(CategoryFlowEvent.objects
                       .filter(category=self.category).values_list('action', 'athlete_id'))
        self.assertEqual(momente, [('present', self.sportiv.pk), ('stop', self.sportiv.pk)])

    def test_cronologia_se_poate_citi_pe_proba(self):
        self.client.patch(f'/api/category-field-assignments/{self.assignment.pk}/',
                          {'status': 'in_progress'}, format='json')
        raspuns = self.client.get(f'/api/category-flow-events/?category={self.category.pk}')
        self.assertEqual(raspuns.status_code, 200)
        self.assertEqual([e['action'] for e in raspuns.json()], ['start'])
