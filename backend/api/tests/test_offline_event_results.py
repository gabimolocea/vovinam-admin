import json
import tempfile
from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import (
    Athlete,
    CategoryAthlete,
    City,
    Club,
    CompetitionField,
    FightCategory,
    Group,
    Match,
    MatchEvent,
    MatchRefereeScore,
    MatchRound,
    RefereePointEvent,
)
from landing.models import Event

User = get_user_model()


class OfflineEventResultsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            username='offline-results-admin',
            email='offline-results-admin@example.com',
            password='testpass123',
            role='admin',
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin_user)

        self.city = City.objects.create(name='Offline Results City')
        self.club = Club.objects.create(name='Offline Results Club', city=self.city)
        now = timezone.now()

        self.event = Event.objects.create(
            title='Offline Results Event',
            slug='offline-results-event',
            start_date=now,
            end_date=now + timedelta(days=1),
            city=self.city,
            address='Local venue',
            event_type='competition',
            sync_mode='local_event',
            sync_locked=True,
            local_sync_status='exported',
            exported_to_local_at=now,
        )

        self.group = Group.objects.create(
            name='Cadets',
            event=self.event,
            birth_year_start=2010,
            birth_year_end=2012,
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

        self.category = FightCategory.objects.create(
            name='Fight A',
            event=self.event,
            group=self.group,
            display_order=1,
        )
        self.category.first_place = self.red_corner
        self.category.second_place = self.blue_corner
        self.category.save()

        self.category_red = CategoryAthlete.objects.create(
            category=self.category,
            athlete=self.red_corner,
            weight=Decimal('55.00'),
            place=1,
        )
        self.category_blue = CategoryAthlete.objects.create(
            category=self.category,
            athlete=self.blue_corner,
            weight=Decimal('56.00'),
            place=2,
            disqualified=True,
        )

        self.field = CompetitionField.objects.get(event=self.event, field_number=1)
        self.match = Match.objects.create(
            category=self.category,
            field=self.field,
            match_type='finals',
            status='completed',
            red_corner=self.red_corner,
            blue_corner=self.blue_corner,
            central_referee=self.referee,
        )
        # A new Match auto-provisions its 2x2min rounds (see api.signals) -
        # replace them with this test's own custom round.
        MatchRound.objects.filter(match=self.match).delete()
        self.round = MatchRound.objects.create(
            match=self.match,
            round_number=1,
            duration_seconds=180,
            status='completed',
            started_at=now,
            ended_at=now + timedelta(minutes=3),
            extra_seconds=5,
        )
        self.match_event = MatchEvent.objects.create(
            match=self.match,
            round=self.round,
            event_type='warning_red',
            corner='red',
            value=1,
            notes='Local warning',
            created_by=self.referee,
        )
        self.point_event = RefereePointEvent.objects.create(
            match=self.match,
            referee=self.referee,
            side='red',
            points=1,
            event_type='score',
            processed=True,
            external_id='local-score-1',
            metadata={'round': 1},
        )
        self.score = MatchRefereeScore.objects.create(
            match=self.match,
            referee=self.referee,
            round=self.round,
            red_corner_score=Decimal('10.00'),
            blue_corner_score=Decimal('9.00'),
            notes='Local final score',
        )

    def test_event_results_export_and_import_syncs_operational_data(self):
        export_response = self.client.get(f'/api/offline/event-results/?event_id={self.event.id}')

        self.assertEqual(export_response.status_code, 200)
        payload = export_response.json()
        self.assertEqual(payload['manifest']['event_id'], self.event.id)
        self.assertEqual(payload['event']['id'], self.event.id)
        self.assertEqual(len(payload['matches']), 1)
        self.assertEqual(len(payload['match_rounds']), 1)
        self.assertEqual(len(payload['match_events']), 1)
        self.assertEqual(len(payload['point_events']), 1)
        self.assertEqual(len(payload['match_referee_scores']), 1)

        self.category.first_place = None
        self.category.second_place = None
        self.category.save()
        self.category_red.place = None
        self.category_red.weight = Decimal('50.00')
        self.category_red.save()
        self.category_blue.place = None
        self.category_blue.disqualified = False
        self.category_blue.save()
        self.match.status = 'scheduled'
        self.match.save()
        self.round.status = 'scheduled'
        self.round.extra_seconds = 0
        self.round.save()
        MatchEvent.objects.all().delete()
        RefereePointEvent.objects.all().delete()
        MatchRefereeScore.objects.all().delete()

        import_response = self.client.post('/api/offline/event-results/import/', payload, format='json')

        self.assertEqual(import_response.status_code, 200)
        result = import_response.json()
        self.assertEqual(result['event_id'], self.event.id)
        self.assertEqual(result['imported']['match_events'], 1)
        self.assertEqual(result['imported']['point_events'], 1)
        self.assertEqual(result['local_sync_status'], 'results_uploaded')
        self.assertTrue(result['sync_locked'])

        self.event.refresh_from_db()
        self.category.refresh_from_db()
        self.category_red.refresh_from_db()
        self.category_blue.refresh_from_db()
        self.match.refresh_from_db()
        self.round.refresh_from_db()

        self.assertEqual(self.event.local_sync_status, 'results_uploaded')
        self.assertIsNotNone(self.event.results_uploaded_at)
        self.assertEqual(self.category.first_place_id, self.red_corner.id)
        self.assertEqual(self.category.second_place_id, self.blue_corner.id)
        self.assertEqual(self.category_red.place, 1)
        self.assertEqual(self.category_red.weight, Decimal('55.00'))
        self.assertEqual(self.category_blue.place, 2)
        self.assertTrue(self.category_blue.disqualified)
        self.assertEqual(self.match.status, 'completed')
        self.assertEqual(self.round.status, 'completed')
        self.assertEqual(self.round.extra_seconds, 5)
        self.assertEqual(MatchEvent.objects.filter(match=self.match).count(), 1)
        self.assertEqual(RefereePointEvent.objects.filter(match=self.match).count(), 1)
        self.assertEqual(MatchRefereeScore.objects.filter(match=self.match).count(), 1)

    def test_event_results_import_moves_athlete_between_fight_brackets_without_duplicating(self):
        """LAN reassigning an athlete to a different weight bracket within
        the same group+gender (post-weigh-in) must move their enrollment,
        not leave a stale duplicate behind in the old bracket."""
        heavier_bracket = FightCategory.objects.create(
            name='Fight B',
            event=self.event,
            group=self.group,
            display_order=2,
        )

        export_response = self.client.get(f'/api/offline/event-results/?event_id={self.event.id}')
        payload = export_response.json()
        red_entry = next(e for e in payload['category_athletes'] if e['athlete_id'] == self.red_corner.id)
        red_entry['category_id'] = heavier_bracket.id
        red_entry['weight'] = '60.00'

        import_response = self.client.post('/api/offline/event-results/import/', payload, format='json')

        self.assertEqual(import_response.status_code, 200)
        remaining = CategoryAthlete.objects.filter(athlete=self.red_corner)
        self.assertEqual(remaining.count(), 1)
        self.assertEqual(remaining.first().category_id, heavier_bracket.id)
        self.assertEqual(remaining.first().weight, Decimal('60.00'))
        self.assertFalse(CategoryAthlete.objects.filter(category=self.category, athlete=self.red_corner).exists())

    def test_event_results_import_creates_match_added_locally_after_export(self):
        """A match created on the LAN server after the event pack was
        already exported (e.g. "Adaugă meci de bronz", added once the
        semifinals were decided) has no matching row in cloud yet. Before
        this was fixed, _upsert_match rejected it outright, and since the
        whole import runs in one transaction, that silently rolled back
        the ENTIRE results sync - not just the new match, but every other
        athlete's place/weight/scores in the same payload too."""
        third_place = Athlete.objects.create(
            first_name='Third', last_name='Place', club=self.club, city=self.city, status='approved',
        )
        bronze_field = CompetitionField.objects.get(event=self.event, field_number=2)
        bronze_match = Match.objects.create(
            category=self.category,
            field=bronze_field,
            match_type='bronze',
            status='completed',
            red_corner=third_place,
            blue_corner=self.blue_corner,
            next_match=None,
            loser_next_match=None,
        )
        CategoryAthlete.objects.create(category=self.category, athlete=third_place, place=3)

        export_response = self.client.get(f'/api/offline/event-results/?event_id={self.event.id}')
        payload = export_response.json()
        self.assertEqual(len(payload['matches']), 2)

        # Simulate cloud never having seen this match - it was created on
        # the LAN server after the event pack export.
        bronze_match_id = bronze_match.id
        bronze_match.delete()
        self.assertFalse(Match.objects.filter(id=bronze_match_id).exists())

        import_response = self.client.post('/api/offline/event-results/import/', payload, format='json')

        self.assertEqual(import_response.status_code, 200)
        result = import_response.json()
        self.assertEqual(result['imported']['matches'], 2)

        recreated = Match.objects.get(id=bronze_match_id)
        self.assertEqual(recreated.match_type, 'bronze')
        self.assertEqual(recreated.category_id, self.category.id)
        self.assertEqual(recreated.red_corner_id, third_place.id)
        self.assertEqual(recreated.blue_corner_id, self.blue_corner.id)
        self.assertEqual(recreated.status, 'completed')
        # The other athlete's place from the SAME payload must have landed
        # too - this is exactly what silently rolled back before the fix.
        self.assertEqual(CategoryAthlete.objects.get(category=self.category, athlete=third_place).place, 3)

    def test_event_results_import_rejects_new_local_category(self):
        export_response = self.client.get(f'/api/offline/event-results/?event_id={self.event.id}')
        payload = export_response.json()
        payload['category_results'].append({'id': 999999, 'type': 'fight', 'first_place_id': self.red_corner.id})

        response = self.client.post('/api/offline/event-results/import/', payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('Creating new local categories is not supported', str(response.json()['detail']))

    def test_event_results_import_requires_locked_event(self):
        self.event.sync_locked = False
        self.event.sync_mode = 'cloud'
        self.event.local_sync_status = 'idle'
        self.event.save(update_fields=['sync_locked', 'sync_mode', 'local_sync_status'])

        export_response = self.client.get(f'/api/offline/event-results/?event_id={self.event.id}')
        payload = export_response.json()
        response = self.client.post('/api/offline/event-results/import/', payload, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('must be locked for local operation', str(response.json()['detail']))

    def test_event_results_commands_round_trip(self):
        stdout = StringIO()
        with tempfile.NamedTemporaryFile(mode='r+', suffix='.json') as handle:
            call_command('export_event_results', event_id=self.event.id, output_path=handle.name)
            handle.seek(0)
            payload = json.load(handle)

            MatchEvent.objects.all().delete()
            RefereePointEvent.objects.all().delete()
            MatchRefereeScore.objects.all().delete()

            with open(handle.name, 'w', encoding='utf-8') as writable:
                json.dump(payload, writable)
                writable.write('\n')

            call_command('import_event_results', input_path=handle.name, stdout=stdout)

        self.assertEqual(MatchEvent.objects.filter(match=self.match).count(), 1)
        self.assertEqual(RefereePointEvent.objects.filter(match=self.match).count(), 1)
        self.assertEqual(MatchRefereeScore.objects.filter(match=self.match).count(), 1)
        self.assertIn(f'Imported event results for event {self.event.id}', stdout.getvalue())