"""Regression tests for MatchAdmin views that recompute Match.winner.

Match.winner is a read-only @property (computed from compute_match_results()/
calculate_winner_simplified()). Older admin code tried to assign to it
(`match.winner = ...; match.save()`), which raises AttributeError since the
property has no setter. These attempts were wrapped in broad try/except
blocks, so the admin views appeared to run but actually swallowed an
AttributeError on every call - in the AJAX views this meant an always-500
JSON error response. This test module locks in the fix: these views must
succeed and must not attempt to persist Match.winner.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from api.models import Athlete, Category, Match, RefereePointEvent, RefereeScore

User = get_user_model()


class MatchAdminWinnerRecomputeTests(TestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            username='matchadmin',
            email='matchadmin@example.com', password='x'
        )
        self.client.force_login(self.admin_user)

        self.red = Athlete.objects.create(first_name='Red', last_name='Corner')
        self.blue = Athlete.objects.create(first_name='Blue', last_name='Corner')
        self.refs = [
            Athlete.objects.create(first_name=f'Ref{i}', last_name='Ref', is_referee=True)
            for i in range(5)
        ]
        cat = Category.objects.create(name='TestCat')
        self.match = Match.objects.create(
            category=cat,
            match_type='qualifications',
            red_corner=self.red,
            blue_corner=self.blue,
        )
        for r in self.refs:
            self.match.referees.add(r)
        self.match.central_referee = self.refs[0]
        self.match.save()

        # 3 referees favor red, 2 favor blue -> red should win by majority.
        for r in self.refs[:3]:
            RefereePointEvent.objects.create(match=self.match, referee=r, side='red', points=1, event_type='score')
        for r in self.refs[3:]:
            RefereePointEvent.objects.create(match=self.match, referee=r, side='blue', points=1, event_type='score')

    def test_recompute_results_view_succeeds_and_reports_winner(self):
        """The AJAX recompute endpoint must return ok:True, not a 500 caused by
        the previously-broken `match.winner = ...` assignment."""
        url = reverse('admin:api_match_recompute_results', args=[self.match.pk])
        response = self.client.post(url)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get('ok'))
        self.assertIsNotNone(data.get('match_winner'))
        self.assertEqual(data['match_winner']['id'], self.red.pk)

        # RefereeScore rows are real persisted fields and should reflect the vote.
        self.assertEqual(RefereeScore.objects.filter(match=self.match).count(), 5)

        # Match.winner remains read-only and reflects the computed result live.
        self.match.refresh_from_db()
        self.assertEqual(self.match.winner, self.red)

    def test_add_central_penalty_view_succeeds(self):
        """Posting a central penalty must not crash on the read-only
        Match.winner property and should still update RefereeScore rows."""
        url = reverse('admin:api_match_add_central_penalty', args=[self.match.pk])
        response = self.client.post(
            url,
            data={'side': 'red', 'points': 1, 'reason': 'test penalty'},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get('ok'))
        self.assertTrue(RefereePointEvent.objects.filter(match=self.match, event_type='penalty').exists())
