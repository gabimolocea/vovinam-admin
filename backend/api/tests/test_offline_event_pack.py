import json
import tempfile
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Athlete,
    CategoryAthlete,
    CategoryFieldAssignment,
    City,
    Club,
    CompetitionField,
    CompetitionReferee,
    DisplayMonitorSession,
    FightAthleteWeight,
    FightCategory,
    FightGroupEnrollment,
    Group,
    Match,
    MatchFieldAssignment,
    MatchRound,
)
from landing.models import Event

User = get_user_model()


class OfflineEventPackTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username='offline-pack-admin',
            email='offline-pack-admin@example.com',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin_user)

        self.city = City.objects.create(name='Offline Pack City')
        self.club = Club.objects.create(name='Offline Pack Club', city=self.city)
        self.other_club = Club.objects.create(name='Offline Pack Other Club', city=self.city)

        now = timezone.now()
        self.event = Event.objects.create(
            title='Offline Pack Event',
            slug='offline-pack-event',
            start_date=now,
            end_date=now + timedelta(days=1),
            city=self.city,
            address='Local venue',
            event_type='competition',
        )
        self.other_event = Event.objects.create(
            title='Other Event',
            slug='other-event-pack',
            start_date=now,
            end_date=now + timedelta(days=2),
            city=self.city,
            address='Other venue',
            event_type='competition',
        )

        self.group = Group.objects.create(
            name='Cadets',
            event=self.event,
            birth_year_start=2010,
            birth_year_end=2012,
            display_order=1,
        )
        self.other_group = Group.objects.create(
            name='Juniors',
            event=self.other_event,
            birth_year_start=2008,
            birth_year_end=2009,
            display_order=1,
        )

        self.referee = Athlete.objects.create(
            first_name='Ref',
            last_name='One',
            club=self.club,
            city=self.city,
            is_referee=True,
            status='approved',
        )
        self.red_corner = Athlete.objects.create(
            first_name='Red',
            last_name='Corner',
            club=self.club,
            city=self.city,
            status='approved',
        )
        self.blue_corner = Athlete.objects.create(
            first_name='Blue',
            last_name='Corner',
            club=self.club,
            city=self.city,
            status='approved',
        )
        self.other_athlete = Athlete.objects.create(
            first_name='Other',
            last_name='Athlete',
            club=self.other_club,
            city=self.city,
            status='approved',
        )

        self.category = FightCategory.objects.create(
            name='Fight A',
            event=self.event,
            group=self.group,
            display_order=1,
        )
        self.other_category = FightCategory.objects.create(
            name='Fight B',
            event=self.other_event,
            group=self.other_group,
            display_order=1,
        )

        CategoryAthlete.objects.create(category=self.category, athlete=self.red_corner, weight=55)
        CategoryAthlete.objects.create(category=self.category, athlete=self.blue_corner, weight=56)
        CategoryAthlete.objects.create(category=self.other_category, athlete=self.other_athlete, weight=60)

        self.field = CompetitionField.objects.get(event=self.event, field_number=1)
        self.match = Match.objects.create(
            category=self.category,
            field=self.field,
            match_type='finals',
            red_corner=self.red_corner,
            blue_corner=self.blue_corner,
            central_referee=self.referee,
        )
        # A new Match auto-provisions its 2x2min rounds (see api.signals) -
        # replace them with this test's own custom round.
        MatchRound.objects.filter(match=self.match).delete()
        self.round = MatchRound.objects.create(match=self.match, round_number=1, duration_seconds=180)
        CompetitionReferee.objects.create(event=self.event, athlete=self.referee, notes='Central referee')
        self.category_assignment = CategoryFieldAssignment.objects.create(
            category=self.category,
            field=self.field,
            status='in_progress',
            order=1,
            estimated_duration=20,
        )
        self.match_assignment = MatchFieldAssignment.objects.create(
            match=self.match,
            field=self.field,
            status='in_progress',
            order=1,
            estimated_duration=10,
        )
        self.monitor_session = DisplayMonitorSession.objects.create(
            field=self.field,
            current_category=self.category,
            current_match=self.match,
            status='displaying',
        )

    def test_event_pack_requires_event_id(self):
        response = self.client.get('/api/offline/event-pack/')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['detail'], 'event_id query param is required.')

    def test_event_pack_returns_scoped_payload(self):
        response = self.client.get(f'/api/offline/event-pack/?event_id={self.event.id}')

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload['manifest']['event_id'], self.event.id)
        self.assertEqual(payload['event']['id'], self.event.id)

        exported_group_ids = {entry['id'] for entry in payload['groups']}
        self.assertIn(self.group.id, exported_group_ids)
        self.assertNotIn(self.other_group.id, exported_group_ids)
        self.assertTrue(all(entry['event_id'] == self.event.id for entry in payload['groups']))

        exported_category_ids = {entry['id'] for entry in payload['categories']}
        self.assertIn(self.category.id, exported_category_ids)
        self.assertNotIn(self.other_category.id, exported_category_ids)
        self.assertTrue(all(entry['event_id'] == self.event.id for entry in payload['categories']))

        exported_athlete_ids = {entry['id'] for entry in payload['athletes']}
        self.assertIn(self.red_corner.id, exported_athlete_ids)
        self.assertIn(self.blue_corner.id, exported_athlete_ids)
        self.assertIn(self.referee.id, exported_athlete_ids)
        self.assertNotIn(self.other_athlete.id, exported_athlete_ids)

        self.assertEqual(len(payload['matches']), 1)
        self.assertEqual(payload['matches'][0]['id'], self.match.id)
        self.assertEqual(len(payload['match_rounds']), 1)
        self.assertEqual(payload['match_rounds'][0]['match_id'], self.match.id)
        self.assertEqual(len(payload['competition_referees']), 1)
        self.assertEqual(payload['competition_referees'][0]['athlete_id'], self.referee.id)

        self.event.refresh_from_db()
        self.assertEqual(self.event.sync_mode, 'local_event')
        self.assertTrue(self.event.sync_locked)
        self.assertEqual(self.event.local_sync_status, 'exported')
        self.assertIsNotNone(self.event.exported_to_local_at)

    def test_event_pack_returns_404_for_missing_event(self):
        response = self.client.get('/api/offline/event-pack/?event_id=999999')

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['detail'], 'Event 999999 was not found.')

    def test_event_pack_import_recreates_records_and_is_idempotent(self):
        export_response = self.client.get(f'/api/offline/event-pack/?event_id={self.event.id}')
        self.assertEqual(export_response.status_code, 200)
        payload = export_response.json()

        Event.objects.filter(pk=self.event.id).delete()
        Athlete.objects.filter(pk__in=[self.referee.id, self.red_corner.id, self.blue_corner.id]).delete()
        Club.objects.filter(pk=self.club.id).delete()

        import_response = self.client.post('/api/offline/event-pack/import/', payload, format='json')
        self.assertEqual(import_response.status_code, 200)
        self.assertEqual(import_response.json()['event_id'], self.event.id)
        self.assertEqual(import_response.json()['imported']['matches'], 1)

        self.assertTrue(Event.objects.filter(pk=self.event.id, title='Offline Pack Event').exists())
        self.assertTrue(Club.objects.filter(pk=self.club.id, name='Offline Pack Club').exists())
        self.assertTrue(Athlete.objects.filter(pk=self.referee.id, is_referee=True).exists())
        self.assertTrue(Match.objects.filter(pk=self.match.id, category_id=self.category.id).exists())
        self.assertTrue(MatchRound.objects.filter(pk=self.round.id, match_id=self.match.id).exists())
        self.assertTrue(CategoryFieldAssignment.objects.filter(pk=self.category_assignment.id, category_id=self.category.id).exists())
        self.assertTrue(MatchFieldAssignment.objects.filter(pk=self.match_assignment.id, match_id=self.match.id).exists())
        self.assertTrue(DisplayMonitorSession.objects.filter(pk=self.monitor_session.id, field_id=self.field.id).exists())

        imported_field_ids = {entry['id'] for entry in payload['fields']}
        self.assertEqual(
            set(CompetitionField.objects.filter(event_id=self.event.id).values_list('id', flat=True)),
            imported_field_ids,
        )

        payload['event']['title'] = 'Offline Pack Event Imported'
        second_import_response = self.client.post('/api/offline/event-pack/import/', payload, format='json')
        self.assertEqual(second_import_response.status_code, 200)
        self.assertTrue(Event.objects.filter(pk=self.event.id, title='Offline Pack Event Imported').exists())
        self.assertEqual(Match.objects.filter(category__event_id=self.event.id).count(), 1)
        self.assertEqual(MatchRound.objects.filter(match__category__event_id=self.event.id).count(), 1)
        self.assertEqual(CategoryFieldAssignment.objects.filter(category__event_id=self.event.id).count(), 1)
        self.assertEqual(DisplayMonitorSession.objects.filter(field__event_id=self.event.id).count(), 1)

    def test_event_pack_roundtrips_fight_group_enrollments(self):
        """A coach's pre-registration weight (submitted before the athlete
        is drawn into a specific fight category) must survive an
        export/import round trip, or it's invisible on a local venue
        machine until assignment - the actual bug this locks in."""
        enrollment = FightGroupEnrollment.objects.create(
            event_id=self.event.id,
            group=self.group,
            athlete=self.blue_corner,
            registered_weight_kg='57.40',
            notes='cantarire preliminara',
        )

        export_response = self.client.get(f'/api/offline/event-pack/?event_id={self.event.id}')
        self.assertEqual(export_response.status_code, 200)
        payload = export_response.json()
        self.assertEqual(len(payload['fight_group_enrollments']), 1)
        self.assertEqual(payload['fight_group_enrollments'][0]['athlete_id'], self.blue_corner.id)

        FightGroupEnrollment.objects.filter(pk=enrollment.id).delete()

        import_response = self.client.post('/api/offline/event-pack/import/', payload, format='json')
        self.assertEqual(import_response.status_code, 200)
        self.assertEqual(import_response.json()['imported']['fight_group_enrollments'], 1)

        restored = FightGroupEnrollment.objects.get(
            event_id=self.event.id, group=self.group, athlete=self.blue_corner
        )
        self.assertEqual(str(restored.registered_weight_kg), '57.40')
        self.assertEqual(restored.notes, 'cantarire preliminara')

    def test_event_pack_roundtrips_fight_athlete_weight(self):
        """An admin-entered weigh-in (e.g. directly via Django admin, before
        the event was ever synced down) must survive an export/import round
        trip - the actual bug this locks in."""
        # Enrolling blue_corner in setUp already auto-created an empty
        # FightAthleteWeight for this pair (sync_category_athlete_to_fight_weight
        # in api/signals.py) - update it rather than creating a duplicate.
        weight, _created = FightAthleteWeight.objects.update_or_create(
            category=self.category,
            athlete=self.blue_corner,
            defaults={'pre_weight_kg': '58.30'},
        )

        export_response = self.client.get(f'/api/offline/event-pack/?event_id={self.event.id}')
        self.assertEqual(export_response.status_code, 200)
        payload = export_response.json()
        # red_corner's own setUp enrollment auto-creates a FightAthleteWeight
        # too, so this asserts blue_corner's specific entry, not the count.
        blue_entry = next(e for e in payload['fight_athlete_weights'] if e['athlete_id'] == self.blue_corner.id)
        self.assertEqual(blue_entry['pre_weight_kg'], 58.3)

        FightAthleteWeight.objects.filter(pk=weight.id).delete()

        import_response = self.client.post('/api/offline/event-pack/import/', payload, format='json')
        self.assertEqual(import_response.status_code, 200)
        # red_corner's entry is in the payload too (see above), so both get
        # (re-)upserted, not just the one whose row we deleted.
        self.assertEqual(import_response.json()['imported']['fight_athlete_weights'], len(payload['fight_athlete_weights']))

        restored = FightAthleteWeight.objects.get(category=self.category, athlete=self.blue_corner)
        self.assertEqual(str(restored.pre_weight_kg), '58.30')

    def test_event_pack_import_follows_category_athletes_bracket_not_stale_weight_entry(self):
        """If a payload's category_athletes section moved an athlete to a
        different weight bracket but its fight_athlete_weights section still
        names the old one (e.g. hand-edited, or a client that only updates
        one section), the import must not let the stale entry resurrect the
        athlete's enrollment in the bracket they were just moved out of -
        the exact cascade this regression test reproduces:
        creating a FightAthleteWeight for a fight category auto-creates a
        CategoryAthlete for the same pair (sync_fight_weight_to_category_athlete
        in api/signals.py)."""
        heavier_bracket = FightCategory.objects.create(
            name='Fight Heavier',
            event=self.event,
            group=self.group,
            display_order=2,
        )
        FightAthleteWeight.objects.update_or_create(
            category=self.category,
            athlete=self.blue_corner,
            defaults={'pre_weight_kg': '58.30'},
        )

        export_response = self.client.get(f'/api/offline/event-pack/?event_id={self.event.id}')
        payload = export_response.json()

        # Move the athlete's enrollment to the new bracket, but deliberately
        # leave fight_athlete_weights pointing at the old one.
        moved_entry = next(e for e in payload['category_athletes'] if e['athlete_id'] == self.blue_corner.id)
        moved_entry['category_id'] = heavier_bracket.id
        self.assertEqual(payload['fight_athlete_weights'][0]['category_id'], self.category.id)

        import_response = self.client.post('/api/offline/event-pack/import/', payload, format='json')
        self.assertEqual(import_response.status_code, 200)

        remaining = CategoryAthlete.objects.filter(athlete=self.blue_corner)
        self.assertEqual(remaining.count(), 1)
        self.assertEqual(remaining.first().category_id, heavier_bracket.id)
        self.assertFalse(FightAthleteWeight.objects.filter(category=self.category, athlete=self.blue_corner).exists())
        self.assertTrue(FightAthleteWeight.objects.filter(category=heavier_bracket, athlete=self.blue_corner).exists())

    def test_event_pack_import_requires_event_section(self):
        response = self.client.post('/api/offline/event-pack/import/', {'manifest': {}}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('event', response.json()['detail'])

    def test_export_command_writes_json_file(self):
        with tempfile.NamedTemporaryFile(mode='r+', suffix='.json') as handle:
            call_command('export_event_pack', event_id=self.event.id, output_path=handle.name)
            handle.seek(0)
            payload = json.load(handle)

        self.assertEqual(payload['manifest']['event_id'], self.event.id)
        self.assertEqual(payload['event']['id'], self.event.id)
        self.assertEqual(len(payload['matches']), 1)

        self.event.refresh_from_db()
        self.assertEqual(self.event.sync_mode, 'local_event')
        self.assertTrue(self.event.sync_locked)
        self.assertEqual(self.event.local_sync_status, 'exported')
        self.assertIsNotNone(self.event.exported_to_local_at)

    def test_import_command_recreates_event_from_exported_file(self):
        stdout = StringIO()
        with tempfile.NamedTemporaryFile(mode='r+', suffix='.json') as handle:
            call_command('export_event_pack', event_id=self.event.id, output_path=handle.name)

            Event.objects.filter(pk=self.event.id).delete()
            Athlete.objects.filter(pk__in=[self.referee.id, self.red_corner.id, self.blue_corner.id]).delete()
            Club.objects.filter(pk=self.club.id).delete()

            call_command('import_event_pack', input_path=handle.name, stdout=stdout)

        self.assertTrue(Event.objects.filter(pk=self.event.id).exists())
        self.assertTrue(Match.objects.filter(pk=self.match.id).exists())
        self.assertIn(f'Imported event pack for event {self.event.id}', stdout.getvalue())
