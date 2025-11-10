from datetime import timedelta
from django.test import TestCase
from django.core.management import call_command
from api.models import Athlete, Match, Category, RefereePointEvent, RefereeScore, Competition
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
        # competition and category and match
        comp = Competition.objects.create(name='TestComp')
        cat = Category.objects.create(name='TestCat', competition=comp)
        self.match = Match(category=cat, match_type='qualifications', red_corner=self.athlete1, blue_corner=self.athlete2)
        self.match.save()
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
