from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from api.models import Athlete, Match, Category, RefereePointEvent, Competition
from api.scoring import compute_match_results


class ScoringAllocationTests(TestCase):
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
        comp = Competition.objects.create(name='AllocComp')
        cat = Category.objects.create(name='AllocCat', competition=comp)
        self.match = Match(category=cat, match_type='qualifications', red_corner=self.athlete1, blue_corner=self.athlete2)
        self.match.save()
        for r in self.refs:
            self.match.referees.add(r)
        # set central referee to refs[0]
        self.match.central_referee = self.refs[0]
        self.match.save()

    def test_proportional_allocation(self):
        """Central penalty is applied fully to each referee (not proportionally split)."""
        # ref0 (central) gives penalty to red of 5
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[0], side='red', points=5, event_type='penalty')
        # other referees score raw red points: ref1=3, ref2=2, others 0
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[1], side='red', points=3, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[2], side='red', points=2, event_type='score')
        # some blue scores as well
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[3], side='blue', points=1, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[4], side='blue', points=1, event_type='score')

        res = compute_match_results(self.match)
        # central penalty aggregated
        self.assertEqual(res['central_penalties']['red'], 5)
        per = res['per_ref']
        # Full penalty applied to each referee: raw + penalty
        # ref1: 3 + 5 = 8, ref2: 2 + 5 = 7
        r1 = self.refs[1].id
        r2 = self.refs[2].id
        self.assertEqual(per[r1]['adj_red'], 8)
        self.assertEqual(per[r2]['adj_red'], 7)

    def test_metadata_marked_central_penalty(self):
        """If a penalty event has metadata['central']=True it should be treated as central even when created by non-central referee."""
        # create a penalty event authored by a non-central referee but marked central
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[3], side='blue', points=4, event_type='penalty', metadata={'central': True})
        # add some blue raw points
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[1], side='blue', points=2, event_type='score')
        RefereePointEvent.objects.create(match=self.match, referee=self.refs[2], side='blue', points=3, event_type='score')

        res = compute_match_results(self.match)
        # central penalties aggregated should include the blue=4
        self.assertEqual(res['central_penalties']['blue'], 4)
        per = res['per_ref']
        r1 = self.refs[1].id
        r2 = self.refs[2].id
        # Full penalty applied to each referee: raw + penalty
        # ref1: 2 + 4 = 6, ref2: 3 + 4 = 7
        self.assertEqual(per[r1]['adj_blue'], 6)
        self.assertEqual(per[r2]['adj_blue'], 7)
