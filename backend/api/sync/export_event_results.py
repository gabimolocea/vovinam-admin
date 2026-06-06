from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.utils import timezone

from api.models import (
    Category,
    CategoryAthlete,
    CategoryTeam,
    Match,
    MatchEvent,
    MatchRefereeScore,
    MatchRound,
    RefereePointEvent,
)
from landing.models import Event


@dataclass(frozen=True)
class EventResultsManifest:
    schema_version: int
    event_id: int
    exported_at: Any
    origin: str = 'local'
    payload_type: str = 'event_results'

    def as_dict(self) -> dict[str, Any]:
        return {
            'schema_version': self.schema_version,
            'event_id': self.event_id,
            'exported_at': self.exported_at,
            'origin': self.origin,
            'payload_type': self.payload_type,
        }


SCHEMA_VERSION = 1


def _category_result_dict(category: Category) -> dict[str, Any]:
    if category.type == 'solo':
        category = category.solocategory
    elif category.type in {'team', 'teams'}:
        category = category.teamcategory
    elif category.type == 'fight':
        category = category.fightcategory

    payload = {
        'id': category.id,
        'type': category.type,
    }

    if category.type in {'solo', 'fight'}:
        payload.update(
            {
                'first_place_id': getattr(category, 'first_place_id', None),
                'second_place_id': getattr(category, 'second_place_id', None),
                'third_place_id': getattr(category, 'third_place_id', None),
            }
        )
    elif category.type in {'team', 'teams'}:
        payload.update(
            {
                'first_place_team_id': getattr(category, 'first_place_team_id', None),
                'second_place_team_id': getattr(category, 'second_place_team_id', None),
                'third_place_team_id': getattr(category, 'third_place_team_id', None),
            }
        )

    return payload


def build_event_results_pack(*, event_id: int) -> dict[str, Any]:
    event = Event.objects.filter(pk=event_id).first()
    if event is None:
        raise ValueError(f'Event {event_id} was not found.')

    categories = list(Category.objects.filter(event_id=event_id).order_by('display_order', 'id'))
    category_ids = [category.id for category in categories]

    category_athletes = list(
        CategoryAthlete.objects.filter(category_id__in=category_ids)
        .order_by('category_id', 'athlete_id')
    )
    category_teams = list(
        CategoryTeam.objects.filter(category_id__in=category_ids)
        .order_by('category_id', 'team_id')
    )

    matches = list(
        Match.objects.filter(category_id__in=category_ids)
        .order_by('category_id', 'round_number', 'bracket_position', 'id')
    )
    match_ids = [match.id for match in matches]

    match_rounds = list(MatchRound.objects.filter(match_id__in=match_ids).order_by('match_id', 'round_number'))
    round_number_by_id = {round_obj.id: round_obj.round_number for round_obj in match_rounds}

    match_events = list(MatchEvent.objects.filter(match_id__in=match_ids).order_by('match_id', 'created_at', 'id'))
    point_events = list(
        RefereePointEvent.objects.filter(match_id__in=match_ids).order_by('match_id', 'timestamp', 'id')
    )
    referee_scores = list(
        MatchRefereeScore.objects.filter(match_id__in=match_ids)
        .order_by('match_id', 'referee_id', 'round_id', 'id')
    )

    manifest = EventResultsManifest(
        schema_version=SCHEMA_VERSION,
        event_id=event.id,
        exported_at=timezone.now(),
    )

    return {
        'manifest': manifest.as_dict(),
        'event': {
            'id': event.id,
            'sync_mode': event.sync_mode,
            'sync_locked': event.sync_locked,
            'local_sync_status': event.local_sync_status,
            'exported_to_local_at': event.exported_to_local_at,
        },
        'category_results': [_category_result_dict(category) for category in categories],
        'category_athletes': [
            {
                'category_id': entry.category_id,
                'athlete_id': entry.athlete_id,
                'weight': entry.weight,
                'place': entry.place,
                'disqualified': entry.disqualified,
                'ref1_score': entry.ref1_score,
                'ref2_score': entry.ref2_score,
                'ref3_score': entry.ref3_score,
                'ref4_score': entry.ref4_score,
                'ref5_score': entry.ref5_score,
            }
            for entry in category_athletes
        ],
        'category_teams': [
            {
                'category_id': entry.category_id,
                'team_id': entry.team_id,
                'place': entry.place,
                'disqualified': entry.disqualified,
                'ref1_score': entry.ref1_score,
                'ref2_score': entry.ref2_score,
                'ref3_score': entry.ref3_score,
                'ref4_score': entry.ref4_score,
                'ref5_score': entry.ref5_score,
            }
            for entry in category_teams
        ],
        'matches': [
            {
                'id': match.id,
                'category_id': match.category_id,
                'field_id': match.field_id,
                'status': match.status,
                'display_mode': match.display_mode,
                'round_number': match.round_number,
                'bracket_position': match.bracket_position,
                'red_corner_id': match.red_corner_id,
                'blue_corner_id': match.blue_corner_id,
                'central_referee_id': match.central_referee_id,
                'match_number': match.match_number,
                'name': match.name,
            }
            for match in matches
        ],
        'match_rounds': [
            {
                'match_id': round_obj.match_id,
                'round_number': round_obj.round_number,
                'duration_seconds': round_obj.duration_seconds,
                'status': round_obj.status,
                'started_at': round_obj.started_at,
                'ended_at': round_obj.ended_at,
                'paused_at': round_obj.paused_at,
                'accumulated_pause_seconds': round_obj.accumulated_pause_seconds,
                'extra_seconds': round_obj.extra_seconds,
            }
            for round_obj in match_rounds
        ],
        'match_events': [
            {
                'match_id': event_obj.match_id,
                'round_number': round_number_by_id.get(event_obj.round_id),
                'event_type': event_obj.event_type,
                'corner': event_obj.corner,
                'value': event_obj.value,
                'notes': event_obj.notes,
                'created_by_id': event_obj.created_by_id,
                'created_at': event_obj.created_at,
            }
            for event_obj in match_events
        ],
        'point_events': [
            {
                'match_id': event_obj.match_id,
                'referee_id': event_obj.referee_id,
                'timestamp': event_obj.timestamp,
                'side': event_obj.side,
                'points': event_obj.points,
                'event_type': event_obj.event_type,
                'processed': event_obj.processed,
                'external_id': event_obj.external_id,
                'metadata': event_obj.metadata,
            }
            for event_obj in point_events
        ],
        'match_referee_scores': [
            {
                'match_id': score.match_id,
                'referee_id': score.referee_id,
                'round_number': round_number_by_id.get(score.round_id),
                'red_corner_score': score.red_corner_score,
                'blue_corner_score': score.blue_corner_score,
                'submitted_date': score.submitted_date,
                'notes': score.notes,
            }
            for score in referee_scores
        ],
    }