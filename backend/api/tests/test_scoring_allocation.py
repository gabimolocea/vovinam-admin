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
        """Central penalty should be split proportionally across referees based on raw contributions."""
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
        # allocations: total_raw_red = 5 -> ref1 share 3/5 -> allocated 3; ref2 share 2/5 -> allocated 2
        # so adjusted red for ref1 and ref2 should be 0
        # find referee ids
        r1 = self.refs[1].id
        r2 = self.refs[2].id
        self.assertEqual(per[r1]['adj_red'], 0)
        self.assertEqual(per[r2]['adj_red'], 0)

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
        # check allocations: total_raw_blue = 5 -> refs 1 and 2 have 2 and 3 -> allocations 2 and 2 (rounded)
        per = res['per_ref']
        r1 = self.refs[1].id
        r2 = self.refs[2].id
        # adjusted blue should be raw - allocated (2-2=0, 3-2=1)
        self.assertTrue(per[r1]['adj_blue'] in (0, -0))
        self.assertEqual(per[r2]['adj_blue'], 1)
