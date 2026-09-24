from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone

from api.models import Athlete, Club, Group
from landing.models import Event


class DefaultCompetitionGroupsTests(TestCase):
    """Grupele implicite se calculează din anul competiției.

    Grupele de copii sunt intervale închise [start, end]: start = cel mai
    bătrân admis, end = cel mai tânăr.

    Seniorii sunt o grupă deschisă - start = anul-18, fără end - și se
    citește invers: "2008+" înseamnă născut în 2008 SAU MAI DEVREME, adică
    toți adulții (findMatchingGroups, apps/app/src/lib/centralizator.js).
    Testele de mai jos există ca să nu mai "repare" nimeni asimetria asta
    mutând 18 pe poziția vârstei minime.
    """

    def _event(self, year):
        start = timezone.now().replace(year=year, month=5, day=10)
        return Event.objects.create(
            title=f'CN {year}', slug=f'cn-{year}',
            start_date=start, end_date=start + timedelta(days=1),
            event_type='competition',
        )

    def _age_warnings(self, group, birth_year):
        club = Club.objects.get_or_create(name='CS Test Grupe')[0]
        athlete = Athlete.objects.create(
            first_name='Test', last_name=f'N{birth_year}', club=club,
            status='approved', date_of_birth=date(birth_year, 6, 1),
        )
        return [w for w in group.eligibility_warnings(athlete) if 'grupei de vârstă' in w]

    def test_children_groups_span_the_right_birth_years(self):
        event = self._event(2026)
        groups = {g.name: g for g in Group.objects.filter(event=event)}

        # Grupa 0 sunt copiii de 7-8 ani: născuți 2018 (cei de 8) până
        # 2019 (cei de 7).
        self.assertEqual(groups['Grupa 0'].birth_year_start, 2018)
        self.assertEqual(groups['Grupa 0'].birth_year_end, 2019)
        # Grupa 3, 15-17 ani.
        self.assertEqual(groups['Grupa 3'].birth_year_start, 2009)
        self.assertEqual(groups['Grupa 3'].birth_year_end, 2011)

    def test_senior_groups_are_open_ended(self):
        event = self._event(2026)
        seniors = Group.objects.get(event=event, name='Sen. Gr. Mari')

        self.assertEqual(seniors.birth_year_start, 2008, 'cel mai tânăr senior s-a născut în 2008')
        self.assertIsNone(seniors.birth_year_end, 'seniorii nu au limită de bătrânețe')

    def test_an_adult_raises_no_age_warning_for_seniors(self):
        """Proba care contează: cineva de 38 de ani trebuie să încapă."""
        event = self._event(2026)
        seniors = Group.objects.get(event=event, name='Sen. Gr. Mari')

        self.assertEqual(self._age_warnings(seniors, 1988), [])

    def test_a_child_raises_an_age_warning_in_a_childrens_group(self):
        """Contrapunct: pe interval închis verificarea chiar se aplică,
        altfel testul de mai sus n-ar dovedi nimic."""
        event = self._event(2026)
        grupa_0 = Group.objects.get(event=event, name='Grupa 0')

        self.assertEqual(self._age_warnings(grupa_0, 2018), [])
        self.assertNotEqual(self._age_warnings(grupa_0, 2005), [])

    def test_groups_follow_the_event_year(self):
        """Aceeași grupă, alt an de competiție, alți ani de naștere."""
        older = self._event(2024)
        newer = self._event(2027)

        self.assertEqual(Group.objects.get(event=older, name='Grupa 0').birth_year_start, 2016)
        self.assertEqual(Group.objects.get(event=newer, name='Grupa 0').birth_year_start, 2019)
        self.assertEqual(Group.objects.get(event=older, name='Sen. Gr. Mari').birth_year_start, 2006)
        self.assertEqual(Group.objects.get(event=newer, name='Sen. Gr. Mari').birth_year_start, 2009)
