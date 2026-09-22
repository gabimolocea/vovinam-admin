"""Match.winner must still resolve from an admin's own live point
adjustments (MatchEvent bonus/penalty/warning) when no referee has
recorded anything at all - e.g. a match run entirely from the admin
panel with no referees assigned to it. Without this, advance_match_winner
always 400s with "Nu exista un castigator pentru acest meci." and the
match can never advance in the bracket."""

from django.test import TestCase

from api.models import Athlete, Category, Match, MatchEvent, MatchRefereeScore, RefereePointEvent


class MatchWinnerFromAdminPointsTests(TestCase):
    def setUp(self):
        self.red = Athlete.objects.create(first_name='Red', last_name='Corner')
        self.blue = Athlete.objects.create(first_name='Blue', last_name='Corner')
        cat = Category.objects.create(name='TestCat')
        self.match = Match.objects.create(
            category=cat,
            match_type='qualifications',
            red_corner=self.red,
            blue_corner=self.blue,
        )

    def test_no_events_at_all_has_no_winner(self):
        self.assertIsNone(self.match.winner)

    def test_admin_points_alone_declare_a_winner(self):
        MatchEvent.objects.create(match=self.match, event_type='bonus_red', corner='red', value=1)

        self.assertEqual(self.match.winner, self.red)

    def test_admin_points_favoring_blue_declare_blue(self):
        MatchEvent.objects.create(match=self.match, event_type='bonus_blue', corner='blue', value=2)
        MatchEvent.objects.create(match=self.match, event_type='penalty_red', corner='red', value=-1)

        self.assertEqual(self.match.winner, self.blue)

    def test_tied_admin_points_have_no_winner(self):
        MatchEvent.objects.create(match=self.match, event_type='bonus_red', corner='red', value=1)
        MatchEvent.objects.create(match=self.match, event_type='bonus_blue', corner='blue', value=1)

        self.assertIsNone(self.match.winner)

    def test_warnings_count_as_minus_two_each(self):
        MatchEvent.objects.create(match=self.match, event_type='bonus_red', corner='red', value=1)
        MatchEvent.objects.create(match=self.match, event_type='warning_red', corner='red', value=0)

        # +1 bonus - 2 (warning) = -1 net for red, blue has 0 -> blue wins.
        self.assertEqual(self.match.winner, self.blue)

    def test_referee_decision_takes_priority_over_admin_points(self):
        """A real referee decision must win even if the admin's own points
        (a separate, non-authoritative data source) point the other way."""
        referee = Athlete.objects.create(first_name='Ref', last_name='One', is_referee=True)
        MatchRefereeScore.objects.create(
            match=self.match, referee=referee, round=None,
            red_corner_score=0, blue_corner_score=1,
        )
        MatchEvent.objects.create(match=self.match, event_type='bonus_red', corner='red', value=5)

        self.assertEqual(self.match.winner, self.blue)

    def test_referee_point_events_take_priority_over_admin_points(self):
        """Same priority check via the other referee-backed path
        (compute_match_results / RefereePointEvent), not just the
        simplified MatchRefereeScore path."""
        refs = [
            Athlete.objects.create(first_name=f'Ref{i}', last_name='Ref', is_referee=True)
            for i in range(3)
        ]
        for r in refs:
            self.match.referees.add(r)
            RefereePointEvent.objects.create(match=self.match, referee=r, side='blue', points=1, event_type='score')
        MatchEvent.objects.create(match=self.match, event_type='bonus_red', corner='red', value=5)

        self.assertEqual(self.match.winner, self.blue)
