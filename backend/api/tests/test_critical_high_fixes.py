"""
Regression tests for the "critical + high" findings fixed after the second
backend audit pass (notifications, offline sync auth, bracket endpoints,
athlete approval metadata, club/coach sync, visa freshness, seminar duplicate
validation, field-count guard, and supporter can_edit enforcement).
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import (
    Athlete,
    CategoryAthleteScore,
    CategoryRefereeScore,
    Club,
    CompetitionField,
    CategoryFieldAssignment,
    FightCategory,
    FightGroupEnrollment,
    Group,
    Notification,
    QRCodeAssignment,
    SoloCategory,
    SupporterAthleteRelation,
    Team,
    TeamCategory,
    TeamMember,
    TrainingSeminarParticipation,
    User,
    Visa,
)
from api.notification_utils import create_competition_notification
from api.serializers import TrainingSeminarParticipationSerializer
from landing.models import Event


def _auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


class NotificationCompetitionTests(TestCase):
    """`related_competition` must exist on Notification and competition.start_date
    (not the nonexistent `.date`) must be used, or this call crashes."""

    def test_create_competition_notification_does_not_crash(self):
        athlete_user = User.objects.create_user(
            username='athlete1', email='a1@example.com', password='pass12345', role='athlete'
        )
        now = timezone.now()
        competition = Event.objects.create(
            title='Cupa Test',
            slug='cupa-test',
            start_date=now,
            end_date=now + timedelta(days=1),
            event_type='competition',
        )
        create_competition_notification(competition, notification_type='competition_created')
        notif = Notification.objects.filter(recipient=athlete_user, notification_type='competition_created').first()
        self.assertIsNotNone(notif)
        self.assertEqual(notif.related_competition_id, competition.pk)


class OfflineSyncAuthTests(TestCase):
    """Offline sync import endpoints must not be reachable by any authenticated user."""

    def test_athlete_cannot_import_event_pack(self):
        user = User.objects.create_user(
            username='plain-athlete', email='pa@example.com', password='pass12345', role='athlete'
        )
        client = _auth_client(user)
        resp = client.post('/api/offline/event-pack/import/', {}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_admin_permission_class_is_admin_only(self):
        from api.views import OfflineSyncViewSet
        from api.permissions import IsAdmin
        self.assertIn(IsAdmin, OfflineSyncViewSet.permission_classes)


class BracketEndpointAuthTests(TestCase):
    """generate_brackets/advance_match_winner must require authentication (previously AllowAny)."""

    def test_advance_match_winner_requires_auth(self):
        client = APIClient()
        resp = client.post('/api/matches/1/advance-winner/')
        self.assertIn(resp.status_code, (401, 403))

    def test_generate_brackets_requires_auth(self):
        client = APIClient()
        resp = client.post('/api/categories/1/generate-brackets/')
        self.assertIn(resp.status_code, (401, 403))


class AthleteApprovalMetadataTests(TestCase):
    """reject()/request_revision() must clear legacy approved_date/approved_by
    so a previously-approved-then-rejected athlete is not still treated as approved."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username='approval-admin', email='aa@example.com', password='pass12345', role='admin'
        )
        self.athlete_user = User.objects.create_user(
            username='approval-athlete', email='apa@example.com', password='pass12345', role='athlete'
        )
        self.athlete = Athlete.objects.create(
            first_name='Rej', last_name='Ected', status='pending', user=self.athlete_user
        )

    def test_reject_clears_approval_metadata(self):
        self.athlete.approve(self.admin)
        self.athlete.refresh_from_db()
        self.assertIsNotNone(self.athlete.approved_date)
        self.assertTrue(self.athlete.can_add_results)

        self.athlete.reject(self.admin, 'no longer valid')
        self.athlete.refresh_from_db()
        self.assertIsNone(self.athlete.approved_date)
        self.assertIsNone(self.athlete.approved_by)
        self.assertFalse(self.athlete.can_add_results)

    def test_request_revision_clears_approval_metadata(self):
        self.athlete.approve(self.admin)
        self.athlete.request_revision(self.admin, 'please update docs')
        self.athlete.refresh_from_db()
        self.assertIsNone(self.athlete.approved_date)
        self.assertIsNone(self.athlete.approved_by)


class ClubDeleteCoachSyncTests(TestCase):
    """Deleting a Club must not leave former coaches permanently stuck with is_coach=True."""

    def test_is_coach_reset_when_only_club_deleted(self):
        coach = Athlete.objects.create(first_name='Coach', last_name='One', is_coach=True)
        club = Club.objects.create(name='Solo Club')
        club.coaches.add(coach)
        coach.refresh_from_db()
        self.assertTrue(coach.is_coach)

        club.delete()
        coach.refresh_from_db()
        self.assertFalse(coach.is_coach)


class VisaFreshnessTests(TestCase):
    """visa_status must be computed live, not stored/stale, and use local date."""

    def test_visa_status_reflects_expiry_without_resave(self):
        athlete = Athlete.objects.create(first_name='Vi', last_name='Sa')
        expired_visa = Visa.objects.create(
            athlete=athlete,
            visa_type='medical',
            issued_date=timezone.localdate() - timedelta(days=400),
            health_status='denied',
        )
        # No save() called after construction's initial save -- status must
        # still be correct because it's computed live, not cached.
        self.assertEqual(expired_visa.visa_status, 'Expired')

        valid_visa = Visa.objects.create(
            athlete=athlete,
            visa_type='annual',
            issued_date=timezone.localdate() - timedelta(days=10),
        )
        self.assertEqual(valid_visa.visa_status, 'Valid')


class SeminarDuplicateValidationTests(TestCase):
    """The duplicate check must validate on `event` (the actual unique_together
    field), not the unused legacy `seminar` field."""

    def test_duplicate_event_submission_is_rejected(self):
        user = User.objects.create_user(
            username='seminar-athlete', email='sa@example.com', password='pass12345', role='athlete'
        )
        athlete = Athlete.objects.create(first_name='Sem', last_name='Inar', user=user, status='approved')
        now = timezone.now()
        event = Event.objects.create(
            title='Seminar Test', slug='seminar-test', start_date=now, end_date=now + timedelta(days=1),
            event_type='seminar',
        )
        TrainingSeminarParticipation.objects.create(athlete=athlete, event=event, submitted_by_athlete=True)

        class DummyRequest:
            pass

        req = DummyRequest()
        req.user = user
        serializer = TrainingSeminarParticipationSerializer(
            data={'event': event.pk}, context={'request': req}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('event', serializer.errors)


class FieldCountGuardTests(TestCase):
    """Reducing field count must not silently destroy active category assignments."""

    def test_set_count_blocks_reduction_with_active_assignment(self):
        admin = User.objects.create_user(
            username='field-admin', email='fa@example.com', password='pass12345', role='admin'
        )
        now = timezone.now()
        event = Event.objects.create(
            title='Field Count Event', slug='field-count-event', start_date=now,
            end_date=now + timedelta(days=1), event_type='competition',
        )
        # A signal auto-creates 2 default fields ("Teren 1"/"Teren 2") when a
        # competition Event is created.
        field1 = CompetitionField.objects.get(event=event, field_number=1)
        category = FightCategory.objects.create(name='Fight Cat', event=event)
        CategoryFieldAssignment.objects.create(category=category, field=field1, order=1)

        client = _auth_client(admin)
        # count=0 forces deletion of every field, including the assigned one.
        resp = client.post(
            '/api/competition-fields/set-count/',
            {'event_id': event.pk, 'count': 0},
            format='json',
        )
        self.assertEqual(resp.status_code, 409)
        self.assertTrue(CompetitionField.objects.filter(pk=field1.pk).exists())


class SupporterCanEditTests(TestCase):
    """A supporter with can_edit=True must actually be able to update the
    athlete's profile through AthleteViewSet (the flag was previously stored
    but never checked anywhere)."""

    def test_supporter_with_can_edit_can_update_athlete(self):
        supporter_user = User.objects.create_user(
            username='supporter1', email='sup@example.com', password='pass12345', role='supporter'
        )
        athlete = Athlete.objects.create(first_name='Ward', last_name='Ed', status='approved')
        SupporterAthleteRelation.objects.create(
            supporter=supporter_user, athlete=athlete, relationship='parent', can_edit=True, status='approved',
        )
        client = _auth_client(supporter_user)
        resp = client.patch(f'/api/athletes/{athlete.pk}/', {'first_name': 'Warden'}, format='json')
        self.assertEqual(resp.status_code, 200)
        athlete.refresh_from_db()
        self.assertEqual(athlete.first_name, 'Warden')

    def test_supporter_without_can_edit_is_forbidden(self):
        supporter_user = User.objects.create_user(
            username='supporter2', email='sup2@example.com', password='pass12345', role='supporter'
        )
        athlete = Athlete.objects.create(first_name='Locked', last_name='Down', status='approved')
        SupporterAthleteRelation.objects.create(
            supporter=supporter_user, athlete=athlete, relationship='parent', can_edit=False, status='approved',
        )
        client = _auth_client(supporter_user)
        resp = client.patch(f'/api/athletes/{athlete.pk}/', {'first_name': 'Nope'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_pending_relation_grants_no_permission(self):
        supporter_user = User.objects.create_user(
            username='supporter3', email='sup3@example.com', password='pass12345', role='supporter'
        )
        athlete = Athlete.objects.create(first_name='Wait', last_name='Ing', status='approved')
        SupporterAthleteRelation.objects.create(
            supporter=supporter_user, athlete=athlete, relationship='parent', can_edit=True,
        )  # status defaults to 'pending'
        client = _auth_client(supporter_user)
        resp = client.patch(f'/api/athletes/{athlete.pk}/', {'first_name': 'Nope'}, format='json')
        self.assertEqual(resp.status_code, 403)


class TeamGetOrCreateByMembersTests(TestCase):
    """Sanity check the locking wrapper didn't break normal find-or-create behavior."""

    def test_reuses_existing_team_for_same_members(self):
        a1 = Athlete.objects.create(first_name='M', last_name='One')
        a2 = Athlete.objects.create(first_name='M', last_name='Two')
        team1, created1 = Team.get_or_create_by_members([a1, a2])
        team2, created2 = Team.get_or_create_by_members([a2, a1])  # order doesn't matter
        self.assertTrue(created1)
        self.assertFalse(created2)
        self.assertEqual(team1.pk, team2.pk)


class TeamImmutabilityTests(TestCase):
    """Once a team has an approved placement, its membership must be frozen."""

    def test_team_member_cannot_be_removed_after_approved_result(self):
        admin = User.objects.create_user(
            username='team-admin2', email='ta2@example.com', password='pass12345', role='admin'
        )
        a1 = Athlete.objects.create(first_name='Fr', last_name='Ozen1')
        a2 = Athlete.objects.create(first_name='Fr', last_name='Ozen2')
        team, _ = Team.get_or_create_by_members([a1, a2])
        now = timezone.now()
        event = Event.objects.create(
            title='Team Immutability Event', slug='team-immutability-event', start_date=now,
            end_date=now + timedelta(days=1), event_type='competition',
        )
        category = TeamCategory.objects.create(name='Frozen Cat', event=event)
        category.first_place_team = team
        category.save(update_fields=['first_place_team'])

        member = team.members.first()
        client = _auth_client(admin)
        resp = client.delete(f'/api/team-members/{member.pk}/')
        self.assertEqual(resp.status_code, 409)
        self.assertTrue(TeamMember.objects.filter(pk=member.pk).exists())


class SupporterConsentFlowTests(TestCase):
    """A supporter-athlete relation must start 'pending' and only grant
    permissions once approved by the athlete (or an admin)."""

    def test_relation_starts_pending_and_athlete_can_approve(self):
        supporter_user = User.objects.create_user(
            username='consent-supporter', email='cs@example.com', password='pass12345', role='supporter'
        )
        athlete_user = User.objects.create_user(
            username='consent-athlete', email='ca@example.com', password='pass12345', role='athlete'
        )
        athlete = Athlete.objects.create(first_name='Con', last_name='Sent', user=athlete_user, status='approved')

        supporter_client = _auth_client(supporter_user)
        resp = supporter_client.post(
            '/api/supporter-athlete-relations/',
            {'athlete': athlete.pk, 'relationship': 'parent', 'can_edit': True},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        relation_id = resp.data['id']
        self.assertEqual(resp.data['status'], 'pending')

        athlete_client = _auth_client(athlete_user)
        approve_resp = athlete_client.post(f'/api/supporter-athlete-relations/{relation_id}/approve/')
        self.assertEqual(approve_resp.status_code, 200)
        self.assertEqual(approve_resp.data['status'], 'approved')


class RefereeScoreReopenTests(TestCase):
    """Editing a referee score after the parent result was approved must
    reopen it to 'pending' for re-review."""

    def test_editing_score_after_approval_reopens_result(self):
        admin = User.objects.create_user(
            username='score-admin', email='sca@example.com', password='pass12345', role='admin'
        )
        now = timezone.now()
        event = Event.objects.create(
            title='Score Reopen Event', slug='score-reopen-event', start_date=now,
            end_date=now + timedelta(days=1), event_type='competition',
        )
        category = SoloCategory.objects.create(name='Solo Reopen', event=event)
        athlete = Athlete.objects.create(first_name='Sc', last_name='Ore', is_referee=False)
        referee = Athlete.objects.create(first_name='Re', last_name='Feree', is_referee=True)
        result = CategoryAthleteScore.objects.create(
            category=category, athlete=athlete, type='solo', submitted_by_athlete=False,
        )
        self.assertEqual(result.status, 'approved')

        score = CategoryRefereeScore.objects.create(athlete_score=result, referee=referee, score=95)
        result.refresh_from_db()
        self.assertEqual(result.status, 'pending')

        score.score = 90
        score.save()
        result.refresh_from_db()
        self.assertEqual(result.status, 'pending')


class QRCodeAutoExpiryTests(TestCase):
    """A QRCodeAssignment without an explicit expires_at must auto-expire
    shortly after its competition ends."""

    def test_qr_code_gets_auto_expiry_from_event_end_date(self):
        now = timezone.now()
        event = Event.objects.create(
            title='QR Expiry Event', slug='qr-expiry-event', start_date=now,
            end_date=now + timedelta(days=2), event_type='competition',
        )
        category = SoloCategory.objects.create(name='QR Cat', event=event)
        referee = Athlete.objects.create(first_name='Q', last_name='Ref', is_referee=True)
        qr = QRCodeAssignment.objects.create(referee=referee, category=category, code='abc123')
        self.assertIsNotNone(qr.expires_at)
        self.assertGreater(qr.expires_at, event.end_date)


class GroupEligibilityWarningTests(TestCase):
    """Age/grade eligibility mismatches must warn, not block."""

    def test_out_of_range_age_produces_warning_but_still_enrolls(self):
        admin = User.objects.create_user(
            username='elig-admin', email='ea@example.com', password='pass12345', role='admin'
        )
        now = timezone.now()
        event = Event.objects.create(
            title='Eligibility Event', slug='eligibility-event', start_date=now,
            end_date=now + timedelta(days=1), event_type='competition',
        )
        group = Group.objects.create(
            name='U12', event=event, birth_year_start=2013, birth_year_end=2015,
        )
        athlete = Athlete.objects.create(
            first_name='Old', last_name='Timer', status='approved',
            date_of_birth=timezone.datetime(1990, 1, 1).date(),
        )
        client = _auth_client(admin)
        resp = client.post(
            '/api/fight-group-enrollments/',
            {'group': group.pk, 'event': event.pk, 'athlete': athlete.pk},
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIn('warnings', resp.data)
        self.assertTrue(FightGroupEnrollment.objects.filter(group=group, athlete=athlete).exists())


class VisaWarningTests(TestCase):
    """Visa expiry must be a non-blocking warning."""

    def test_visa_warnings_lists_missing_visas(self):
        athlete = Athlete.objects.create(first_name='No', last_name='Visa')
        warnings = athlete.visa_warnings()
        self.assertEqual(len(warnings), 2)  # medical + annual both missing

