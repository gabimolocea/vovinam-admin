from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Athlete,
    CategoryAthlete,
    CategoryFieldAssignment,
    CategoryRefereeAssignment,
    Club,
    CompetitionField,
    CompetitionReferee,
    FieldBreak,
    Group,
    SoloCategory,
    Team,
    TeamCategory,
    User,
)
from landing.models import Event


class AutoScheduleFieldsTests(TestCase):
    """auto_schedule_fields: /api/events/<id>/auto-schedule-fields/

    A new event_type='competition' Event auto-provisions 2 default tatamis
    ("Teren 1"/"Teren 2") and the federation's 6 standard groups (Grupa 0-3,
    then "Sen. Gr. Mici"/"Sen. Gr. Mari" - both with an open birth_year_end,
    which is exactly the structural "senior" signal the view looks for) via
    api/signals.py's post_save receivers - so setUp reuses those instead of
    creating competing ones (their (event, field_number)/(event, name)
    uniqueness would collide with hand-made duplicates otherwise).
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='sched-admin', email='sched-admin@example.com',
            password='testpass123', role='admin', is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

        now = timezone.now()
        self.event = Event.objects.create(
            title='Scheduling Test Event', slug='scheduling-test-event',
            start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        self.field1, self.field2 = CompetitionField.objects.filter(event=self.event).order_by('field_number')
        self.group0 = Group.objects.get(event=self.event, name='Grupa 0')
        self.group1 = Group.objects.get(event=self.event, name='Grupa 1')
        self.senior_group = Group.objects.get(event=self.event, name='Sen. Gr. Mici')

    def _athlete(self, name):
        return Athlete.objects.create(first_name=name, last_name='Test', status='approved')

    def _category(self, group, name, display_order=0):
        cat = SoloCategory.objects.create(name=name, event=self.event, group=group, display_order=display_order)
        CategoryAthlete.objects.create(category=cat, athlete=self._athlete(f'{name}-athlete'))
        return cat

    def _team_category(self, group, name, display_order=0, members=None):
        cat = TeamCategory.objects.create(name=name, event=self.event, group=group, display_order=display_order)
        team, _created = Team.get_or_create_by_members(
            members or [self._athlete(f'{name}-m1'), self._athlete(f'{name}-m2')], category=cat,
        )
        return cat, team

    def test_team_category_with_no_solo_enrollment_is_still_scheduled(self):
        # Team categories enroll via Team/TeamMember, not CategoryAthlete -
        # a category with 0 CategoryAthlete rows but an enrolled team must
        # still be picked up, not silently skipped as "empty".
        team_cat, _team = self._team_category(self.group0, 'Team Solo')
        self.assertEqual(team_cat.enrolled_athletes.count(), 0)

        res = self.client.post(f'/api/events/{self.event.id}/auto-schedule-fields/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(CategoryFieldAssignment.objects.filter(category=team_cat).exists())

    def test_senior_group_scheduled_last_regardless_of_display_order(self):
        # Sen. Gr. Mici's own display_order (5, from DEFAULT_GROUPS) is
        # already after Grupa 0/1 (1/2) - assert via the *structural* rule
        # (birth_year_end unset) by also covering group1, whose
        # display_order sits between them.
        senior_cat = self._category(self.senior_group, 'Senior Solo')
        cat0 = self._category(self.group0, 'Grupa0 Solo')
        cat1 = self._category(self.group1, 'Grupa1 Solo')

        res = self.client.post(f'/api/events/{self.event.id}/auto-schedule-fields/')
        self.assertEqual(res.status_code, 200, res.data)

        all_assignments = list(CategoryFieldAssignment.objects.select_related('category').order_by('field_id', 'order'))
        senior_assignment = next(a for a in all_assignments if a.category_id == senior_cat.id)
        same_field_others = [a for a in all_assignments if a.field_id == senior_assignment.field_id and a.category_id != senior_cat.id]
        for other in same_field_others:
            self.assertLess(other.order, senior_assignment.order)

    def test_gap_fill_only_leaves_existing_assignment_untouched(self):
        cat0 = self._category(self.group0, 'Grupa0 Solo')
        cat1 = self._category(self.group1, 'Grupa1 Solo')
        manual = CategoryFieldAssignment.objects.create(category=cat1, field=self.field2, order=7, estimated_duration=99)

        res = self.client.post(f'/api/events/{self.event.id}/auto-schedule-fields/')
        self.assertEqual(res.status_code, 200, res.data)

        manual.refresh_from_db()
        self.assertEqual(manual.field_id, self.field2.id)
        self.assertEqual(manual.estimated_duration, 99)
        # cat0 (still unassigned) must have been picked up by this run.
        self.assertTrue(CategoryFieldAssignment.objects.filter(category=cat0).exists())

    def test_same_athlete_back_to_back_gets_separated_or_a_break(self):
        shared_athlete = self._athlete('Shared')
        cat_a = SoloCategory.objects.create(name='Cat A', event=self.event, group=self.group0, display_order=10)
        cat_b = SoloCategory.objects.create(name='Cat B', event=self.event, group=self.group0, display_order=11)
        cat_c = SoloCategory.objects.create(name='Cat C', event=self.event, group=self.group0, display_order=12)
        CategoryAthlete.objects.create(category=cat_a, athlete=shared_athlete)
        CategoryAthlete.objects.create(category=cat_b, athlete=shared_athlete)
        CategoryAthlete.objects.create(category=cat_c, athlete=self._athlete('Other'))

        res = self.client.post(f'/api/events/{self.event.id}/auto-schedule-fields/')
        self.assertEqual(res.status_code, 200, res.data)

        assignments = {a.category_id: a for a in CategoryFieldAssignment.objects.filter(category__in=[cat_a, cat_b, cat_c])}
        a, b = assignments[cat_a.id], assignments[cat_b.id]
        if a.field_id == b.field_id:
            # Same field: either no longer adjacent (something now sits
            # between them in `order`), or a FieldBreak was inserted
            # between their order positions.
            if abs(a.order - b.order) == 1:
                lo, hi = sorted([a.order, b.order])
                self.assertTrue(
                    FieldBreak.objects.filter(field_id=a.field_id, order__gt=lo, order__lt=hi).exists(),
                    'Expected a rest break between the athlete\'s two back-to-back categories.',
                )

    def test_requires_at_least_one_active_field(self):
        empty_event = Event.objects.create(
            title='No Fields Event', slug='no-fields-event',
            start_date=timezone.now(), end_date=timezone.now() + timedelta(days=1), event_type='competition',
        )
        CompetitionField.objects.filter(event=empty_event).update(is_active=False)
        res = self.client.post(f'/api/events/{empty_event.id}/auto-schedule-fields/')
        self.assertEqual(res.status_code, 400)


class AutoAssignRefereesTests(TestCase):
    """auto_assign_referees: /api/events/<id>/auto-assign-referees/"""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username='ref-admin', email='ref-admin@example.com',
            password='testpass123', role='admin', is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

        now = timezone.now()
        self.event = Event.objects.create(
            title='Referee Test Event', slug='referee-test-event',
            start_date=now, end_date=now + timedelta(days=1), event_type='competition',
        )
        self.club_a = Club.objects.create(name='Club A')
        self.other_clubs = [Club.objects.create(name=f'Club Other{i}') for i in range(5)]

        self.category = SoloCategory.objects.create(name='Referee Test Solo', event=self.event)
        competitor = Athlete.objects.create(first_name='Competitor', last_name='One', status='approved', club=self.club_a)
        CategoryAthlete.objects.create(category=self.category, athlete=competitor)

        # 1 referee from the competing club, 5 from 5 distinct other clubs -
        # a strict pick (which also avoids seating two referees from the
        # same club together) should always be able to fill a 5-seat panel
        # from those alternatives alone, avoiding the home-club referee.
        self.home_club_ref = self._referee('Home', self.club_a)
        self.other_refs = [self._referee(f'Other{i}', self.other_clubs[i]) for i in range(5)]

    def _referee(self, name, club):
        athlete = Athlete.objects.create(first_name=name, last_name='Ref', status='approved', club=club, is_referee=True)
        return CompetitionReferee.objects.create(event=self.event, athlete=athlete)

    def test_avoids_competing_club_referee_when_alternatives_exist(self):
        res = self.client.post(f'/api/events/{self.event.id}/auto-assign-referees/')
        self.assertEqual(res.status_code, 200, res.data)

        assignment = CategoryRefereeAssignment.objects.get(category=self.category)
        picked_ids = {assignment.referee_1_id, assignment.referee_2_id, assignment.referee_3_id,
                      assignment.referee_4_id, assignment.referee_5_id}
        self.assertNotIn(self.home_club_ref.athlete_id, picked_ids)
        self.assertFalse(res.data.get('warnings'))

    def test_gap_fill_only_leaves_existing_panel_untouched(self):
        existing = CategoryRefereeAssignment.objects.create(category=self.category, referee_1=self.home_club_ref.athlete)
        res = self.client.post(f'/api/events/{self.event.id}/auto-assign-referees/')
        self.assertEqual(res.status_code, 200, res.data)
        existing.refresh_from_db()
        self.assertEqual(existing.referee_1_id, self.home_club_ref.athlete_id)
        self.assertIsNone(existing.referee_2_id)

    def test_small_roster_relaxes_club_rule_and_reports_a_warning(self):
        # Trim the roster down to just the one home-club referee.
        CompetitionReferee.objects.exclude(pk=self.home_club_ref.pk).delete()
        res = self.client.post(f'/api/events/{self.event.id}/auto-assign-referees/')
        self.assertEqual(res.status_code, 200, res.data)
        assignment = CategoryRefereeAssignment.objects.get(category=self.category)
        self.assertEqual(assignment.referee_1_id, self.home_club_ref.athlete_id)
        self.assertTrue(res.data.get('warnings'))

    def test_team_category_avoids_referee_from_a_competing_teams_club(self):
        # Team categories enroll via Team/TeamMember, not CategoryAthlete -
        # club-conflict detection has to follow that path too, not just
        # come up empty and let a home-club referee slip through.
        team_cat = TeamCategory.objects.create(name='Referee Test Team', event=self.event)
        member_a = Athlete.objects.create(first_name='TeamA', last_name='One', status='approved', club=self.club_a)
        member_b = Athlete.objects.create(first_name='TeamA', last_name='Two', status='approved', club=self.club_a)
        Team.get_or_create_by_members([member_a, member_b], category=team_cat)

        res = self.client.post(f'/api/events/{self.event.id}/auto-assign-referees/')
        self.assertEqual(res.status_code, 200, res.data)

        assignment = CategoryRefereeAssignment.objects.get(category=team_cat)
        picked_ids = {assignment.referee_1_id, assignment.referee_2_id, assignment.referee_3_id,
                      assignment.referee_4_id, assignment.referee_5_id}
        self.assertNotIn(self.home_club_ref.athlete_id, picked_ids)

    def test_requires_a_referee_roster(self):
        CompetitionReferee.objects.all().delete()
        res = self.client.post(f'/api/events/{self.event.id}/auto-assign-referees/')
        self.assertEqual(res.status_code, 400)
