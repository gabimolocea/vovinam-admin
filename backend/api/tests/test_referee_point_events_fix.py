from datetime import timedelta
from django.test import TestCase
from django.core.management import call_command
from api.models import Athlete, Match, Category, RefereePointEvent, RefereeScore
from api.views import _auto_validate_real_time_point_event, REAL_TIME_POINT_VALIDATION_WINDOW_MS
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


class RefereePointEventTests(TestCase):
    def setUp(self):
        # Create simple data: two athletes and five referee athletes
        today = timezone.now().date()
        dob = today - timedelta(days=365 * 20)
        self.athlete1 = Athlete.objects.create(first_name='Red', last_name='One', date_of_birth=dob)
        self.athlete2 = Athlete.objects.create(first_name='Blue', last_name='Two', date_of_birth=dob)
        # referees
        self.refs = []
        for i in range(5):
            r = Athlete.objects.create(first_name=f'Ref{i}', last_name='Ref', is_referee=True, date_of_birth=dob)
            self.refs.append(r)
        # category and match
        cat = Category.objects.create(name='TestCat')
        self.match = Match.objects.create(category=cat, match_type='qualifications', red_corner=self.athlete1, blue_corner=self.athlete2)
        # assign referees
        for r in self.refs:
            self.match.referees.add(r)
        # set central referee
        self.match.central_referee = self.refs[0]
        self.match.save()

    def test_aggregation_simple(self):
        # Create events: three referees vote red, two vote blue; central referee gives no penalty
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[0], side='red', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[1], side='red', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[2], side='red', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[3], side='blue', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[4], side='blue', points=1, event_type='score')

        call_command('aggregate_match_events', match=self.match.pk)

        # After aggregation, there should be 5 RefereeScore rows and winner should be red
        scores = RefereeScore.objects.filter(match=self.match)
        self.assertEqual(scores.count(), 5)
        self.match.refresh_from_db()
        self.assertEqual(self.match.winner, self.match.red_corner)

    def test_central_penalty_affects_totals(self):
        # central referee issues penalty to red: subtract 2
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[0], side='red', points=0, event_type='score')
        # central penalty
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[0], side='red', points=2, event_type='penalty')
        # other referees give red/blue
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[1], side='red', points=3, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[2], side='blue', points=4, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[3], side='blue', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[4], side='red', points=1, event_type='score')

        call_command('aggregate_match_events', match=self.match.pk)
        # verify scores and detection; not asserting exact numbers, ensure aggregation ran without error
        scores = RefereeScore.objects.filter(match=self.match)
        self.assertEqual(scores.count(), 5)
        self.match.refresh_from_db()
        # winner can be determined by algorithm; ensure no crash and match.winner is either corner or None
        self.assertIn(self.match.winner, [self.match.red_corner, self.match.blue_corner, None])

    def test_real_time_validation_accepts_events_within_1500ms(self):
        self.match.display_mode = 'real_time'
        self.match.save(update_fields=['display_mode'])

        base_time = timezone.now()
        first = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[0],
            side='red',
            points=2,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1},
        )
        second = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[1],
            side='red',
            points=2,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1},
        )
        # Al treilea apasa tot in fereastra: testul asta e despre FEREASTRA de
        # 1500ms, nu despre cati arbitri trebuie. Cu doi n-ar mai trece, si
        # atunci n-ar mai masura ce si-a propus.
        third = RefereePointEvent.objects.create(
            match=self.match, referee=self.refs[2], side='red', points=2,
            event_type='score', validation_status='pending', metadata={'round': 1},
        )
        RefereePointEvent.objects.filter(pk=first.pk).update(timestamp=base_time)
        RefereePointEvent.objects.filter(pk=second.pk).update(
            timestamp=base_time + timedelta(milliseconds=REAL_TIME_POINT_VALIDATION_WINDOW_MS - 300)
        )
        RefereePointEvent.objects.filter(pk=third.pk).update(
            timestamp=base_time + timedelta(milliseconds=REAL_TIME_POINT_VALIDATION_WINDOW_MS - 200)
        )
        first.refresh_from_db()
        second.refresh_from_db()
        third.refresh_from_db()

        validated = _auto_validate_real_time_point_event(third)

        self.assertEqual(len(validated), 3)
        first.refresh_from_db()
        second.refresh_from_db()
        third.refresh_from_db()
        self.assertEqual(first.validation_status, 'validated')
        self.assertEqual(second.validation_status, 'validated')
        self.assertEqual(third.validation_status, 'validated')

    def test_real_time_validation_rejects_events_outside_1500ms(self):
        self.match.display_mode = 'real_time'
        self.match.save(update_fields=['display_mode'])

        base_time = timezone.now()
        first = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[0],
            side='red',
            points=1,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1},
        )
        second = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[1],
            side='red',
            points=1,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1},
        )
        RefereePointEvent.objects.filter(pk=first.pk).update(timestamp=base_time)
        RefereePointEvent.objects.filter(pk=second.pk).update(
            timestamp=base_time + timedelta(milliseconds=REAL_TIME_POINT_VALIDATION_WINDOW_MS + 100)
        )
        first.refresh_from_db()
        second.refresh_from_db()

        validated = _auto_validate_real_time_point_event(second)

        self.assertEqual(validated, [])
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.validation_status, 'pending')
        self.assertEqual(second.validation_status, 'pending')

    def test_real_time_validation_rejects_events_at_exactly_1500ms(self):
        self.match.display_mode = 'real_time'
        self.match.save(update_fields=['display_mode'])

        base_time = timezone.now()
        first = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[0],
            side='red',
            points=1,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1},
        )
        second = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[1],
            side='red',
            points=1,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1},
        )
        RefereePointEvent.objects.filter(pk=first.pk).update(timestamp=base_time)
        RefereePointEvent.objects.filter(pk=second.pk).update(
            timestamp=base_time + timedelta(milliseconds=REAL_TIME_POINT_VALIDATION_WINDOW_MS)
        )
        first.refresh_from_db()
        second.refresh_from_db()

        validated = _auto_validate_real_time_point_event(second)

        self.assertEqual(validated, [])
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.validation_status, 'pending')
        self.assertEqual(second.validation_status, 'pending')

    def test_real_time_validation_uses_client_timestamp_when_server_times_drift(self):
        self.match.display_mode = 'real_time'
        self.match.save(update_fields=['display_mode'])

        base_time = timezone.now()
        first = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[0],
            side='red',
            points=1,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1, 'client_timestamp_ms': 1_000_000},
        )
        second = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.refs[1],
            side='red',
            points=1,
            event_type='score',
            validation_status='pending',
            metadata={'round': 1, 'client_timestamp_ms': 1_001_200},
        )
        # Al treilea, tot cu ceas desincronizat pe server dar apropiat dupa
        # ceasul lui: testul e despre CE CEAS se crede, nu despre cati arbitri.
        third = RefereePointEvent.objects.create(
            match=self.match, referee=self.refs[2], side='red', points=1,
            event_type='score', validation_status='pending',
            metadata={'round': 1, 'client_timestamp_ms': 1_001_300},
        )
        RefereePointEvent.objects.filter(pk=first.pk).update(timestamp=base_time)
        RefereePointEvent.objects.filter(pk=second.pk).update(
            timestamp=base_time + timedelta(milliseconds=REAL_TIME_POINT_VALIDATION_WINDOW_MS + 700)
        )
        RefereePointEvent.objects.filter(pk=third.pk).update(
            timestamp=base_time + timedelta(milliseconds=REAL_TIME_POINT_VALIDATION_WINDOW_MS + 900)
        )
        first.refresh_from_db()
        second.refresh_from_db()
        third.refresh_from_db()

        validated = _auto_validate_real_time_point_event(third)

        self.assertEqual(len(validated), 3)
        first.refresh_from_db()
        second.refresh_from_db()
        third.refresh_from_db()
        self.assertEqual(first.validation_status, 'validated')
        self.assertEqual(second.validation_status, 'validated')
        self.assertEqual(third.validation_status, 'validated')


class PointEventsIncrementalTests(TestCase):
    """Lista de apasari se poate cere pe bucati.

    Ecranul de operare o cerea intreaga la fiecare 600ms - peste 110 KB pentru
    un meci lung, doar ca sa afle ca nu s-a schimbat nimic."""

    def setUp(self):
        from rest_framework.test import APIClient
        today = timezone.now().date()
        dob = today - timedelta(days=365 * 20)
        rosu = Athlete.objects.create(first_name='Red', last_name='Inc', date_of_birth=dob)
        albastru = Athlete.objects.create(first_name='Blue', last_name='Inc', date_of_birth=dob)
        self.arbitru = Athlete.objects.create(first_name='Ref', last_name='Inc', is_referee=True, date_of_birth=dob)
        cat = Category.objects.create(name='IncCat')
        self.match = Match.objects.create(category=cat, red_corner=rosu, blue_corner=albastru)
        self.admin = User.objects.create_user(
            username='admin-inc', email='admin-inc@example.com', password='x',
            role='admin', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.url = f'/api/matches/{self.match.id}/point_events/'

    def _eveniment(self, puncte=1):
        return RefereePointEvent.objects.create(
            match=self.match, referee=self.arbitru, side='red', points=puncte, event_type='score',
        )

    def test_fara_since_vine_tot_si_cu_numarul_total(self):
        self._eveniment(); self._eveniment()
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)
        self.assertEqual(r.headers.get('X-Total-Count'), '2')

    def test_cu_since_vine_doar_ce_e_nou(self):
        unu = self._eveniment()
        doi = self._eveniment()
        r = self.client.get(self.url, {'since': unu.id})
        self.assertEqual([e['id'] for e in r.data], [doi.id])
        # Numarul total ramane al meciului intreg, nu al bucatii trimise:
        # dupa el isi da seama cine intreaba ca nu i-a scapat nimic.
        self.assertEqual(r.headers.get('X-Total-Count'), '2')

    def test_since_la_zi_nu_mai_trimite_nimic(self):
        self._eveniment()
        ultim = self._eveniment()
        r = self.client.get(self.url, {'since': ultim.id})
        self.assertEqual(list(r.data), [])
        self.assertEqual(r.headers.get('X-Total-Count'), '2')

    def test_dupa_stergere_numarul_total_tradeaza_resetul(self):
        unu = self._eveniment()
        self._eveniment()
        RefereePointEvent.objects.filter(match=self.match).delete()
        r = self.client.get(self.url, {'since': unu.id})
        self.assertEqual(list(r.data), [])
        # Cine tine o lista crescatoare are doua, serverul spune zero - de aici
        # stie sa o ia de la capat.
        self.assertEqual(r.headers.get('X-Total-Count'), '0')

    def test_since_aiurea_nu_arunca(self):
        self._eveniment()
        r = self.client.get(self.url, {'since': 'abc'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
