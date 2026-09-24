from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from api.models import Athlete, Club, FightCategory, Match, RefereePointEvent
from api.views._common import aggregate_validated_point_phases
from landing.models import Event


class PointPhaseAggregationTests(TestCase):
    """Scorul unui meci arbitrat în timp real se numără pe faze.

    O fază confirmată de doi arbitri lasă câte un rând de la fiecare.
    Adunate, dau dublu — iar panoul de operare chiar afișa +4 pentru o
    fază de +2 confirmată de doi arbitri. Cu cinci arbitri ar fi arătat
    +10.
    """

    def setUp(self):
        now = timezone.now()
        self.event = Event.objects.create(
            title='CN Faze', slug='cn-faze', start_date=now,
            end_date=now + timedelta(days=1), event_type='competition',
        )
        category = FightCategory.objects.create(name='Lupta', event=self.event, display_order=1)
        club = Club.objects.create(name='CS Faze')
        self.match = Match.objects.create(category=category, match_number='M1', display_mode='real_time')
        self.a = Athlete.objects.create(first_name='A', last_name='Unu', club=club, status='approved', is_referee=True)
        self.b = Athlete.objects.create(first_name='B', last_name='Doi', club=club, status='approved', is_referee=True)
        self.base = 1_700_000_000_000

    def ev(self, referee, at_ms, side='red', points=1, statusul='validated'):
        return RefereePointEvent.objects.create(
            match=self.match, referee=referee, side=side, points=points,
            event_type='score', validation_status=statusul,
            metadata={'round': 1, 'round_id': 1, 'client_timestamp_ms': self.base + at_ms},
        )

    def all_events(self):
        return list(RefereePointEvent.objects.filter(match=self.match).order_by('timestamp', 'id'))

    def test_a_phase_confirmed_by_two_referees_counts_once(self):
        self.ev(self.a, 0, points=2)
        self.ev(self.b, 300, points=2)
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (2, 0))

    def test_a_lone_referee_scores_nothing(self):
        self.ev(self.a, 0)
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (0, 0))

    def test_two_separate_phases_count_separately(self):
        self.ev(self.a, 0)
        self.ev(self.b, 300)
        self.ev(self.a, 2000)
        self.ev(self.b, 2300)
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (2, 0))

    def test_the_same_referee_pressing_twice_does_not_double_the_phase(self):
        self.ev(self.a, 0)
        self.ev(self.a, 200)
        self.ev(self.b, 300)
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (1, 0))

    def test_corners_are_not_merged(self):
        self.ev(self.a, 0, side='red')
        self.ev(self.b, 200, side='blue')
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (0, 0))

    def test_presses_outside_the_window_are_separate_phases(self):
        self.ev(self.a, 0)
        self.ev(self.b, 1600)
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (0, 0))

    def test_pending_events_do_not_score(self):
        self.ev(self.a, 0)
        self.ev(self.b, 300, statusul='pending')
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (0, 0))

    def test_blue_corner_is_counted_too(self):
        self.ev(self.a, 0, side='blue', points=2)
        self.ev(self.b, 400, side='blue', points=2)
        self.assertEqual(aggregate_validated_point_phases(self.all_events()), (0, 2))
