"""Regression tests guarding against N+1 query regressions on list endpoints.

These pin the query count for /api/clubs/ and /api/teams/ so that a future
change to ClubSerializer/TeamSerializer (or their ViewSet querysets) that
re-introduces a per-row query is caught immediately, instead of only
surfacing as a slow endpoint in production.
"""
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from api.models import Athlete, City, Club, Team, TeamMember


class ClubListQueryCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        city = City.objects.create(name='Query Count City')
        for i in range(5):
            club = Club.objects.create(name=f'Club {i}', city=city)
            Athlete.objects.create(
                first_name=f'Coach{i}', last_name='X', club=club, is_coach=True, status='approved',
            )
            Athlete.objects.create(
                first_name=f'Member{i}', last_name='Y', club=club, is_coach=False, status='approved',
            )

    def test_club_list_query_count_does_not_scale_with_club_count(self):
        # Warm up any lazy one-time caches (content types, etc.) before measuring.
        self.client.get('/api/clubs/')

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get('/api/clubs/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)

        # Without select_related/prefetch_related this was 1 + 5*3 = 16 queries
        # (city + coaches + athletes per club). A small constant bound proves
        # the list no longer scales linearly with the number of clubs.
        self.assertLess(len(ctx.captured_queries), 8, ctx.captured_queries)


class TeamListQueryCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        club = Club.objects.create(name='Team Query Club')
        for i in range(5):
            team = Team.objects.create()
            for j in range(2):
                athlete = Athlete.objects.create(
                    first_name=f'T{i}A{j}', last_name='Z', club=club, status='approved',
                )
                TeamMember.objects.create(team=team, athlete=athlete)

    def test_team_list_query_count_does_not_scale_with_team_count(self):
        self.client.get('/api/teams/')

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get('/api/teams/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)

        # Without prefetch_related this scaled with team*member count via
        # to_representation()'s per-member athlete/club access.
        self.assertLess(len(ctx.captured_queries), 8, ctx.captured_queries)
