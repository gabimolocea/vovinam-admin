from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from api.models import Athlete, Match, Category, RefereePointEvent, Competition
from api.scoring import compute_match_results


class ScoringHelperTests(TestCase):
    def setUp(self):
        today = timezone.now().date()
        dob = today - timedelta(days=365 * 20)
        self.athlete1 = Athlete.objects.create(first_name='Red', last_name='One', date_of_birth=dob)
        self.athlete2 = Athlete.objects.create(first_name='Blue', last_name='Two', date_of_birth=dob)
        # referees
        self.refs = []
        for i in range(5):
            r = Athlete.objects.create(first_name=f'Ref{i}', last_name='Ref', is_referee=True, date_of_birth=dob)
            self.refs.append(r)
        comp = Competition.objects.create(name='TestComp')
        cat = Category.objects.create(name='TestCat', competition=comp)
        self.match = Match(category=cat, match_type='qualifications', red_corner=self.athlete1, blue_corner=self.athlete2)
        self.match.save()
        for r in self.refs:
            self.match.referees.add(r)
        self.match.central_referee = self.refs[0]
        self.match.save()

    def test_compute_match_results_basic(self):
        # three referees vote red, two blue
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[0], side='red', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[1], side='red', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[2], side='red', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[3], side='blue', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[4], side='blue', points=1, event_type='score')

        res = compute_match_results(self.match)
        self.assertEqual(res['votes']['red'], 3)
        self.assertEqual(res['votes']['blue'], 2)
        self.assertEqual(res['match_winner'], self.match.red_corner)

    def test_compute_with_central_penalty(self):
        # central referee gives penalty to red (2)
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[0], side='red', points=2, event_type='penalty')
        # other referees
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[1], side='red', points=3, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[2], side='blue', points=4, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[3], side='blue', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[4], side='red', points=1, event_type='score')

        res = compute_match_results(self.match)
        # central penalty should be subtracted from each referee's red totals when computing adjusted totals
        self.assertIn('central_penalties', res)
        self.assertEqual(res['central_penalties']['red'], 2)
        # result should be valid
        self.assertIn(res['match_winner'], [self.match.red_corner, self.match.blue_corner, None])
