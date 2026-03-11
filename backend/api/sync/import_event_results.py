from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from api.models import (
    Athlete,
    Category,
    CategoryAthlete,
    CategoryTeam,
    FightCategory,
    Match,
    MatchEvent,
    MatchRefereeScore,
    MatchRound,
    SoloCategory,
    Team,
    TeamCategory,
    RefereePointEvent,
)
from landing.models import Event


def _section(payload: dict[str, Any], name: str) -> list[dict[str, Any]]:
    value = payload.get(name) or []
    if not isinstance(value, list):
        raise ValidationError({name: 'This section must be a list.'})
    return value


def _category_model(category_type: str):
    mapping = {
        'solo': SoloCategory,
        'team': TeamCategory,
        'teams': TeamCategory,
        'fight': FightCategory,
    }
    return mapping.get(category_type, Category)


def _set_preserved_fields(model, pk: int, values: dict[str, Any]):
    update_values = {key: value for key, value in values.items() if value is not None}
    if update_values:
        model.objects.filter(pk=pk).update(**update_values)


def _existing_event_category_ids(event_id: int) -> set[int]:
    return set(Category.objects.filter(event_id=event_id).values_list('id', flat=True))


def _existing_event_match_ids(event_id: int) -> set[int]:
    return set(Match.objects.filter(category__event_id=event_id).values_list('id', flat=True))


def _resolve_round(match_id: int, round_number: int | None):
    if round_number is None:
        return None
    return MatchRound.objects.filter(match_id=match_id, round_number=round_number).first()


def _upsert_category_athlete(entry: dict[str, Any]):
    obj, _created = CategoryAthlete.objects.update_or_create(
        category_id=entry['category_id'],
        athlete_id=entry['athlete_id'],
        defaults={
            'weight': entry.get('weight'),
            'place': entry.get('place'),
            'disqualified': entry.get('disqualified', False),
            'ref1_score': entry.get('ref1_score'),
            'ref2_score': entry.get('ref2_score'),
            'ref3_score': entry.get('ref3_score'),
            'ref4_score': entry.get('ref4_score'),
            'ref5_score': entry.get('ref5_score'),
        },
    )
    return obj


def _upsert_category_team(entry: dict[str, Any]):
    obj, _created = CategoryTeam.objects.update_or_create(
        category_id=entry['category_id'],
        team_id=entry['team_id'],
        defaults={
            'place': entry.get('place'),
            'disqualified': entry.get('disqualified', False),
            'ref1_score': entry.get('ref1_score'),
            'ref2_score': entry.get('ref2_score'),
            'ref3_score': entry.get('ref3_score'),
            'ref4_score': entry.get('ref4_score'),
            'ref5_score': entry.get('ref5_score'),
        },
    )
    return obj


def _upsert_match(entry: dict[str, Any]):
    obj = Match.objects.filter(pk=entry['id']).first()
    if obj is None:
        raise ValidationError({'matches': f"Match {entry['id']} does not exist in cloud. Creating new local matches is not supported by result sync."})

    obj.field_id = entry.get('field_id')
    obj.status = entry.get('status') or obj.status
    obj.display_mode = entry.get('display_mode') or obj.display_mode
    obj.round_number = entry.get('round_number', obj.round_number)
    obj.bracket_position = entry.get('bracket_position', obj.bracket_position)
    obj.red_corner_id = entry.get('red_corner_id')
    obj.blue_corner_id = entry.get('blue_corner_id')
    obj.central_referee_id = entry.get('central_referee_id')
    obj.match_number = entry.get('match_number') or obj.match_number
    obj.name = entry.get('name') or obj.name
    obj.save()
    return obj


def _upsert_match_round(entry: dict[str, Any]):
    obj, created = MatchRound.objects.get_or_create(
        match_id=entry['match_id'],
        round_number=entry['round_number'],
        defaults={
            'duration_seconds': entry.get('duration_seconds', 180),
            'status': entry.get('status', 'scheduled'),
            'started_at': entry.get('started_at'),
            'ended_at': entry.get('ended_at'),
            'paused_at': entry.get('paused_at'),
            'accumulated_pause_seconds': entry.get('accumulated_pause_seconds', 0),
            'extra_seconds': entry.get('extra_seconds', 0),
        },
    )
    if not created:
        obj.duration_seconds = entry.get('duration_seconds', obj.duration_seconds)
        obj.status = entry.get('status') or obj.status
        obj.started_at = entry.get('started_at')
        obj.ended_at = entry.get('ended_at')
        obj.paused_at = entry.get('paused_at')
        obj.accumulated_pause_seconds = entry.get('accumulated_pause_seconds', obj.accumulated_pause_seconds)
        obj.extra_seconds = entry.get('extra_seconds', obj.extra_seconds)
        obj.save()
    return obj


def _upsert_match_event(entry: dict[str, Any]):
    round_obj = _resolve_round(entry['match_id'], entry.get('round_number'))
    lookup = {
        'match_id': entry['match_id'],
        'round_id': round_obj.id if round_obj else None,
        'event_type': entry.get('event_type'),
        'corner': entry.get('corner', 'none'),
        'value': entry.get('value', 0),
        'notes': entry.get('notes', ''),
        'created_at': entry.get('created_at'),
    }
    obj = MatchEvent.objects.filter(**lookup).first()
    if obj is None:
        obj = MatchEvent.objects.create(
            match_id=entry['match_id'],
            round_id=round_obj.id if round_obj else None,
            event_type=entry.get('event_type'),
            corner=entry.get('corner', 'none'),
            value=entry.get('value', 0),
            notes=entry.get('notes', ''),
            created_by_id=entry.get('created_by_id'),
        )
        _set_preserved_fields(MatchEvent, obj.pk, {'created_at': entry.get('created_at')})
        return obj

    obj.created_by_id = entry.get('created_by_id')
    obj.save(update_fields=['created_by'])
    return obj


def _upsert_point_event(entry: dict[str, Any]):
    lookup = {
        'match_id': entry['match_id'],
        'referee_id': entry['referee_id'],
        'timestamp': entry.get('timestamp'),
        'side': entry.get('side'),
        'points': entry.get('points', 0),
        'event_type': entry.get('event_type', 'score'),
    }
    if entry.get('external_id'):
        obj = RefereePointEvent.objects.filter(external_id=entry['external_id']).first()
    else:
        obj = RefereePointEvent.objects.filter(**lookup).first()

    if obj is None:
        obj = RefereePointEvent.objects.create(
            match_id=entry['match_id'],
            referee_id=entry['referee_id'],
            side=entry.get('side'),
            points=entry.get('points', 0),
            event_type=entry.get('event_type', 'score'),
            processed=entry.get('processed', False),
            external_id=entry.get('external_id'),
            metadata=entry.get('metadata'),
        )
        _set_preserved_fields(
            RefereePointEvent,
            obj.pk,
            {
                'timestamp': entry.get('timestamp'),
                'processed': entry.get('processed', False),
            },
        )
        return obj

    obj.processed = entry.get('processed', obj.processed)
    obj.external_id = entry.get('external_id') or obj.external_id
    obj.metadata = entry.get('metadata')
    obj.save(update_fields=['processed', 'external_id', 'metadata'])
    return obj


def _upsert_match_referee_score(entry: dict[str, Any]):
    round_obj = _resolve_round(entry['match_id'], entry.get('round_number'))
    obj, created = MatchRefereeScore.objects.get_or_create(
        match_id=entry['match_id'],
        referee_id=entry['referee_id'],
        round_id=round_obj.id if round_obj else None,
        defaults={
            'red_corner_score': entry.get('red_corner_score', 0),
            'blue_corner_score': entry.get('blue_corner_score', 0),
            'notes': entry.get('notes'),
        },
    )
    if not created:
        obj.red_corner_score = entry.get('red_corner_score', obj.red_corner_score)
        obj.blue_corner_score = entry.get('blue_corner_score', obj.blue_corner_score)
        obj.notes = entry.get('notes')
        obj.save()
    _set_preserved_fields(MatchRefereeScore, obj.pk, {'submitted_date': entry.get('submitted_date')})
    return obj


@transaction.atomic
def import_event_results(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValidationError({'payload': 'A JSON object is required.'})

    event_data = payload.get('event')
    if not isinstance(event_data, dict):
        raise ValidationError({'event': 'This section is required.'})
    if not event_data.get('id'):
        raise ValidationError({'event.id': 'This field is required.'})

    event = Event.objects.filter(pk=event_data['id']).first()
    if event is None:
        raise ValidationError({'event.id': f"Event {event_data['id']} does not exist in cloud."})
    if not event.sync_locked:
        raise ValidationError({'event': 'Event must be locked for local operation before results can be imported.'})

    category_results_payload = _section(payload, 'category_results')
    category_athletes_payload = _section(payload, 'category_athletes')
    category_teams_payload = _section(payload, 'category_teams')
    matches_payload = _section(payload, 'matches')
    match_rounds_payload = _section(payload, 'match_rounds')
    match_events_payload = _section(payload, 'match_events')
    point_events_payload = _section(payload, 'point_events')
    match_referee_scores_payload = _section(payload, 'match_referee_scores')

    existing_category_ids = _existing_event_category_ids(event.id)
    existing_match_ids = _existing_event_match_ids(event.id)

    for entry in category_results_payload:
        if entry['id'] not in existing_category_ids:
            raise ValidationError({'category_results': f"Category {entry['id']} does not exist in cloud. Creating new local categories is not supported by result sync."})

    for entry in matches_payload:
        if entry['id'] not in existing_match_ids:
            raise ValidationError({'matches': f"Match {entry['id']} does not exist in cloud. Creating new local matches is not supported by result sync."})

    imported = {
        'category_results': 0,
        'category_athletes': 0,
        'category_teams': 0,
        'matches': 0,
        'match_rounds': 0,
        'match_events': 0,
        'point_events': 0,
        'match_referee_scores': 0,
    }

    for entry in category_results_payload:
        category_model = _category_model(entry.get('type'))
        category = category_model.objects.get(pk=entry['id'])
        if entry.get('type') in {'solo', 'fight'}:
            for field in ('first_place_id', 'second_place_id', 'third_place_id'):
                athlete_id = entry.get(field)
                if athlete_id and not Athlete.objects.filter(pk=athlete_id).exists():
                    raise ValidationError({'category_results': f'Athlete {athlete_id} does not exist in cloud.'})
                setattr(category, field, athlete_id)
        elif entry.get('type') in {'team', 'teams'}:
            for field in ('first_place_team_id', 'second_place_team_id', 'third_place_team_id'):
                team_id = entry.get(field)
                if team_id and not Team.objects.filter(pk=team_id).exists():
                    raise ValidationError({'category_results': f'Team {team_id} does not exist in cloud.'})
                setattr(category, field, team_id)
        category.save()
        imported['category_results'] += 1

    for entry in category_athletes_payload:
        if entry['category_id'] not in existing_category_ids:
            raise ValidationError({'category_athletes': f"Category {entry['category_id']} does not exist in cloud. Creating new local categories is not supported by result sync."})
        if not Athlete.objects.filter(pk=entry['athlete_id']).exists():
            raise ValidationError({'category_athletes': f"Athlete {entry['athlete_id']} does not exist in cloud. Creating new local athletes is not supported by result sync."})
        _upsert_category_athlete(entry)
        imported['category_athletes'] += 1

    for entry in category_teams_payload:
        if entry['category_id'] not in existing_category_ids:
            raise ValidationError({'category_teams': f"Category {entry['category_id']} does not exist in cloud. Creating new local categories is not supported by result sync."})
        if not Team.objects.filter(pk=entry['team_id']).exists():
            raise ValidationError({'category_teams': f"Team {entry['team_id']} does not exist in cloud."})
        _upsert_category_team(entry)
        imported['category_teams'] += 1

    for entry in matches_payload:
        _upsert_match(entry)
        imported['matches'] += 1

    for entry in match_rounds_payload:
        if entry['match_id'] not in existing_match_ids:
            raise ValidationError({'match_rounds': f"Match {entry['match_id']} does not exist in cloud."})
        _upsert_match_round(entry)
        imported['match_rounds'] += 1

    for entry in match_events_payload:
        if entry['match_id'] not in existing_match_ids:
            raise ValidationError({'match_events': f"Match {entry['match_id']} does not exist in cloud."})
        _upsert_match_event(entry)
        imported['match_events'] += 1

    for entry in point_events_payload:
        if entry['match_id'] not in existing_match_ids:
            raise ValidationError({'point_events': f"Match {entry['match_id']} does not exist in cloud."})
        if not Athlete.objects.filter(pk=entry['referee_id'], is_referee=True).exists():
            raise ValidationError({'point_events': f"Referee {entry['referee_id']} does not exist in cloud."})
        _upsert_point_event(entry)
        imported['point_events'] += 1

    for entry in match_referee_scores_payload:
        if entry['match_id'] not in existing_match_ids:
            raise ValidationError({'match_referee_scores': f"Match {entry['match_id']} does not exist in cloud."})
        if not Athlete.objects.filter(pk=entry['referee_id'], is_referee=True).exists():
            raise ValidationError({'match_referee_scores': f"Referee {entry['referee_id']} does not exist in cloud."})
        _upsert_match_referee_score(entry)
        imported['match_referee_scores'] += 1

    event.mark_results_uploaded()
    event.save(update_fields=['local_sync_status', 'results_uploaded_at'])

    return {
        'event_id': event.id,
        'imported': imported,
        'local_sync_status': event.local_sync_status,
        'sync_locked': event.sync_locked,
    }