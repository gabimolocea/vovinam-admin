from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from api.models import Athlete, Club, FightCategory, Match, RefereePointEvent
from api.views._common import _auto_validate_real_time_point_event
from landing.models import Event


class RealTimePointValidationTests(TestCase):
    """Un punct se validează doar dacă doi arbitri diferiți îl dau pentru
    aceeași fază, la mai puțin de 1,5 secunde unul de altul.

    Partea grea nu e numărătoarea, ci ce înseamnă „aceeași fază". Doi
    pumni la o secundă distanță sunt două faze; două apăsări ale
    aceluiași arbitru pe aceeași fază sunt una singură. Fără distincția
    asta, o confirmare primită pentru prima fază valida și faza a doua,
    iar sportivul lua puncte pe care niciun al doilea arbitru nu le-a
    văzut.
    """

    def setUp(self):
        now = timezone.now()
        self.event = Event.objects.create(
            title='CN Test', slug='cn-test-rtp',
            start_date=now, end_date=now + timedelta(days=1),
            event_type='competition',
        )
        self.category = FightCategory.objects.create(
            name='Lupta A', event=self.event, display_order=1,
        )
        club = Club.objects.create(name='CS Test')
        self.match = Match.objects.create(
            category=self.category, match_number='M1', display_mode='real_time',
        )
        self.ref_a = Athlete.objects.create(
            first_name='Arbitru', last_name='A', club=club, status='approved', is_referee=True,
        )
        self.ref_b = Athlete.objects.create(
            first_name='Arbitru', last_name='B', club=club, status='approved', is_referee=True,
        )
        self.ref_c = Athlete.objects.create(
            first_name='Arbitru', last_name='C', club=club, status='approved', is_referee=True,
        )
        self.base_ms = 1_700_000_000_000

    def press(self, referee, at_ms, side='red', points=1):
        """O apăsare de buton, urmată de verificarea pe care o face
        serverul la fiecare punct primit."""
        ev = RefereePointEvent.objects.create(
            match=self.match, referee=referee, side=side, points=points,
            event_type='score', validation_status='pending',
            metadata={'round': 1, 'client_timestamp_ms': self.base_ms + at_ms},
        )
        _auto_validate_real_time_point_event(ev)
        ev.refresh_from_db()
        return ev

    def test_three_referees_agreeing_validate_the_point(self):
        first = self.press(self.ref_a, 0)
        self.assertEqual(first.validation_status, 'pending', 'primul singur nu se validează')

        second = self.press(self.ref_b, 300)
        first.refresh_from_db()
        self.assertEqual(second.validation_status, 'pending', 'doi nu ajung')
        self.assertEqual(first.validation_status, 'pending')

        third = self.press(self.ref_c, 500)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(third.validation_status, 'validated')
        self.assertEqual(first.validation_status, 'validated')
        self.assertEqual(second.validation_status, 'validated')

    def test_one_referee_alone_never_validates(self):
        only = self.press(self.ref_a, 0)
        self.assertEqual(only.validation_status, 'pending')

    def test_a_referee_pressing_twice_does_not_score_twice(self):
        """Nervi sau atingere dublă: aceeași fază, două apăsări. Colegii
        apasă o dată fiecare, deci faza e reală - dar valorează un punct, nu
        două. Apăsarea dublă a lui A nu ține nici loc de al treilea arbitru."""
        spam_1 = self.press(self.ref_a, 0)
        spam_2 = self.press(self.ref_a, 200)
        peer = self.press(self.ref_b, 300)
        peer.refresh_from_db()
        self.assertEqual(peer.validation_status, 'pending',
                         'două apăsări ale aceluiași om rămân un singur arbitru')

        peer_2 = self.press(self.ref_c, 400)

        spam_1.refresh_from_db()
        spam_2.refresh_from_db()
        peer.refresh_from_db()
        validated = [e for e in (spam_1, spam_2) if e.validation_status == 'validated']

        self.assertEqual(peer.validation_status, 'validated')
        self.assertEqual(peer_2.validation_status, 'validated')
        self.assertEqual(len(validated), 1, 'doar una din cele două apăsări intră în scor')

    def test_a_confirmation_is_not_reused_for_the_next_phase(self):
        """Scenariul real: doi pumni consecutivi la o secundă distanță.
        Arbitrii A, B și C îl văd pe primul; doar A îl vede pe al doilea. Al
        doilea punct trebuie să rămână neconfirmat, nu să se valideze
        sprijinindu-se pe confirmările primite pentru primul."""
        punch_1_a = self.press(self.ref_a, 0)
        punch_1_b = self.press(self.ref_b, 300)
        punch_1_c = self.press(self.ref_c, 400)
        punch_2_a = self.press(self.ref_a, 1600)

        punch_1_a.refresh_from_db()
        punch_1_b.refresh_from_db()
        punch_1_c.refresh_from_db()

        self.assertEqual(punch_1_a.validation_status, 'validated')
        self.assertEqual(punch_1_b.validation_status, 'validated')
        self.assertEqual(punch_1_c.validation_status, 'validated')
        self.assertEqual(punch_2_a.validation_status, 'pending',
                         'a doua fază n-a fost văzută de ceilalți arbitri')

    def test_two_referees_are_not_enough(self):
        """Trei din cinci e regula de concurs; doi au fost doar pentru teste."""
        a = self.press(self.ref_a, 0)
        b = self.press(self.ref_b, 300)
        a.refresh_from_db()
        self.assertEqual(a.validation_status, 'pending')
        self.assertEqual(b.validation_status, 'pending')

    def test_the_second_phase_validates_when_the_peers_confirm_it(self):
        """Continuarea: dacă B și C văd și al doilea pumn, punctul intră."""
        self.press(self.ref_a, 0)
        self.press(self.ref_b, 300)
        self.press(self.ref_c, 400)
        punch_2_a = self.press(self.ref_a, 2000)
        punch_2_b = self.press(self.ref_b, 2200)
        punch_2_c = self.press(self.ref_c, 2300)

        punch_2_a.refresh_from_db()
        punch_2_b.refresh_from_db()
        self.assertEqual(punch_2_a.validation_status, 'validated')
        self.assertEqual(punch_2_b.validation_status, 'validated')
        self.assertEqual(punch_2_c.validation_status, 'validated')

    def test_presses_further_apart_than_the_window_do_not_pair(self):
        first = self.press(self.ref_a, 0)
        late = self.press(self.ref_b, 1600)

        first.refresh_from_db()
        self.assertEqual(first.validation_status, 'pending')
        self.assertEqual(late.validation_status, 'pending')

    def test_different_sides_do_not_pair(self):
        red = self.press(self.ref_a, 0, side='red')
        blue = self.press(self.ref_b, 200, side='blue')

        red.refresh_from_db()
        self.assertEqual(red.validation_status, 'pending')
        self.assertEqual(blue.validation_status, 'pending')
