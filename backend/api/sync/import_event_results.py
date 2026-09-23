from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from api.models import (
    Athlete,
    Category,
    CategoryAthlete,
    CategoryAthleteScore,
    CategoryRefereeScore,
    CategoryTeam,
    FightAthleteWeight,
    FightCategory,
    Group,
    Match,
    MatchEvent,
    MatchFieldAssignment,
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


def _upsert_category_athlete(entry: dict[str, Any], fight_bracket_by_category_id: dict[int, tuple[int, str]]):
    category_id = entry['category_id']
    athlete_id = entry['athlete_id']

    # Fight categories are mutually-exclusive weight brackets within the
    # same group+gender - an athlete sits in exactly one at a time. LAN
    # moving them to a different bracket (post-weigh-in reassignment)
    # changes which (category_id, athlete_id) pair this entry carries, so
    # a plain update_or_create keyed on that pair can't find the athlete's
    # old bracket row and just creates a second one instead of moving it -
    # leaving the athlete enrolled in both the old and new bracket. Drop
    # any other bracket enrollment for this athlete in the same group+
    # gender first, so cloud ends up with the single bracket LAN chose.
    bracket = fight_bracket_by_category_id.get(category_id)
    if bracket is not None:
        sibling_category_ids = [
            cid for cid, other_bracket in fight_bracket_by_category_id.items()
            if other_bracket == bracket and cid != category_id
        ]
        if sibling_category_ids:
            CategoryAthlete.objects.filter(athlete_id=athlete_id, category_id__in=sibling_category_ids).delete()

    obj, _created = CategoryAthlete.objects.update_or_create(
        category_id=category_id,
        athlete_id=athlete_id,
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


def _upsert_fight_athlete_weight(entry: dict[str, Any], category_id: int):
    """category_id is the athlete's CURRENT bracket as _upsert_category_athlete
    just resolved it, deliberately NOT entry['category_id'] - the caller may
    have only updated the category_athletes section of a payload (e.g. a
    LAN bracket reassignment) without also updating this section, and
    trusting a stale bracket here would create a FightAthleteWeight there.
    Because creating one auto-creates a CategoryAthlete for the same pair
    (see sync_fight_weight_to_category_athlete in api/signals.py), that
    would resurrect the athlete's enrollment in the bracket they were just
    moved out of. Always following CategoryAthlete's resolved bracket
    keeps the two in agreement by construction, so no separate stale-
    sibling cleanup is needed either - moving CategoryAthlete already
    cascades into removing the old bracket's FightAthleteWeight via
    delete_fight_weight_on_unenroll."""
    athlete_id = entry['athlete_id']

    obj, _created = FightAthleteWeight.objects.update_or_create(
        category_id=category_id,
        athlete_id=athlete_id,
        defaults={
            'pre_weight_kg': entry.get('pre_weight_kg'),
            'current_weight_kg': entry.get('current_weight_kg'),
            'is_disqualified': entry.get('is_disqualified', False),
            'disqualification_reason': entry.get('disqualification_reason', ''),
            'place': entry.get('place'),
            'is_weight_locked': entry.get('is_weight_locked', False),
        },
    )
    return obj


def _assert_athlete_identities_match(athletes_payload: list[dict[str, Any]]):
    """Refuse a pack whose athlete ids point at different people here.

    Athlete pks are assigned independently by each database, and the event
    pack only carries the athletes taking part - so someone registered on
    the venue machine on competition day takes the next free *local* id,
    which on cloud belongs to an unrelated athlete. Checking only that the
    id exists (as the sections below do) would pass, and that walk-up's
    enrollment, weigh-in and medal would be filed under a stranger. Names
    are the practical key: date of birth is often missing in real data,
    which is exactly the sort of athlete this happens to.
    """
    if not athletes_payload:
        return

    def normalize(first, last):
        return f"{(last or '').strip().casefold()} {(first or '').strip().casefold()}".strip()

    local_by_id = {entry['id']: entry for entry in athletes_payload if entry.get('id')}
    cloud_by_id = {
        row['id']: row
        for row in Athlete.objects.filter(id__in=local_by_id).values('id', 'first_name', 'last_name')
    }

    mismatches = []
    for athlete_id, local in local_by_id.items():
        cloud = cloud_by_id.get(athlete_id)
        if cloud is None:
            continue  # reported per-section, with the context of what referenced it
        if normalize(local.get('first_name'), local.get('last_name')) != normalize(cloud['first_name'], cloud['last_name']):
            mismatches.append(
                f"id {athlete_id}: local „{local.get('last_name')} {local.get('first_name')}” "
                f"vs cloud „{cloud['last_name']} {cloud['first_name']}”"
            )

    if mismatches:
        raise ValidationError({'athletes': (
            'Acești sportivi au același id pe cele două instanțe, dar sunt persoane diferite - '
            'probabil au fost adăugați direct pe calculatorul din sală. Adaugă-i mai întâi în cloud '
            'și reia sincronizarea locală, altfel rezultatele lor ar ajunge pe altcineva: '
            + '; '.join(mismatches)
        )})


def _upsert_category_athlete_score(entry: dict[str, Any], skipped: list[str]):
    """Technique (solo/team) scoring, keyed on CategoryAthleteScore's own
    unique_together (category, athlete, referee) - pks diverge between the
    two instances. Team results carry athlete=None, where that tuple stops
    being unique (SQL treats NULLs as distinct), so team_name joins the key
    for those.

    An unknown athlete/referee skips just that row instead of raising:
    this whole import is one transaction, and losing an entire day of
    results because one referee was never synced down is far worse than
    landing everything else and reporting the gap (see the returned
    `skipped` list, surfaced to the operator).
    """
    category_id = entry['category_id']
    athlete_id = entry.get('athlete_id')
    referee_id = entry.get('referee_id')

    for label, pk in (('Sportivul', athlete_id), ('Arbitrul', referee_id)):
        if pk is not None and not Athlete.objects.filter(pk=pk).exists():
            skipped.append(f'{label} {pk} lipsește din cloud (rezultat tehnică, categoria {category_id}).')
            return None

    lookup = {'category_id': category_id, 'athlete_id': athlete_id, 'referee_id': referee_id}
    if athlete_id is None:
        lookup['team_name'] = entry.get('team_name')

    group_id = entry.get('group_id')
    obj, _created = CategoryAthleteScore.objects.update_or_create(
        **lookup,
        defaults={
            'score': entry.get('score'),
            'type': entry.get('type', 'solo'),
            'group_id': group_id if Group.objects.filter(pk=group_id).exists() else None,
            'team_name': entry.get('team_name'),
            'submitted_by_athlete': entry.get('submitted_by_athlete', False),
            'placement_claimed': entry.get('placement_claimed'),
            'notes': entry.get('notes'),
            'admin_notes': entry.get('admin_notes'),
        },
    )

    member_ids = [
        pk for pk in (entry.get('team_member_ids') or [])
        if Athlete.objects.filter(pk=pk).exists()
    ]
    obj.team_members.set(member_ids)

    referee_score_count = 0
    for referee_score in entry.get('referee_scores') or []:
        score_referee_id = referee_score.get('referee_id')
        if not Athlete.objects.filter(pk=score_referee_id).exists():
            skipped.append(f'Arbitrul {score_referee_id} lipsește din cloud (scor tehnică, categoria {category_id}).')
            continue
        score_obj, _ = CategoryRefereeScore.objects.update_or_create(
            athlete_score=obj,
            referee_id=score_referee_id,
            defaults={
                'deductions': referee_score.get('deductions') or {},
                'score': referee_score.get('score', 100),
                'notes': referee_score.get('notes'),
            },
        )
        _set_preserved_fields(CategoryRefereeScore, score_obj.pk, {'submitted_date': referee_score.get('submitted_date')})
        referee_score_count += 1

    # Written last, and through the queryset so CategoryRefereeScore.save()'s
    # "a scoring change reopens an approved result" rule (api/models/
    # scoring.py) can't demote what the local server already approved -
    # every referee score above would otherwise flip this back to pending.
    _set_preserved_fields(
        CategoryAthleteScore,
        obj.pk,
        {
            'status': entry.get('status'),
            'submitted_date': entry.get('submitted_date'),
            'reviewed_date': entry.get('reviewed_date'),
        },
    )

    return referee_score_count


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


def _upsert_match(entry: dict[str, Any], existing_category_ids: set[int]):
    """A match created locally after the event pack was exported (e.g. via
    "Adaugă meci de bronz", added mid-competition once semifinals were
    already decided) has no matching row in cloud yet - unlike every match
    that came from the original bracket, which was created in both places
    with the same pk when the event pack was first imported. Previously
    this was rejected outright, which - since this whole import runs in
    one transaction - silently rolled back the ENTIRE results sync (medal
    placements included) the moment any single match like this was in the
    payload, with only a generic, easy-to-miss error surfaced to the admin.

    next_match/loser_next_match are deliberately left unset here - they
    point at other matches in this same payload, which may not exist yet
    this pass. See the second pass in import_event_results.
    """
    obj = Match.objects.filter(pk=entry['id']).first()
    if obj is None:
        category_id = entry.get('category_id')
        if category_id not in existing_category_ids:
            raise ValidationError({'matches': f"Match {entry['id']}: category {category_id} does not exist in cloud."})
        obj = Match(id=entry['id'], category_id=category_id, match_type=entry.get('match_type') or 'qualifications')

    obj.field_id = entry.get('field_id')
    obj.status = entry.get('status') or obj.status
    obj.display_mode = entry.get('display_mode') or obj.display_mode
    obj.match_type = entry.get('match_type') or obj.match_type
    obj.round_number = entry.get('round_number', obj.round_number)
    obj.bracket_position = entry.get('bracket_position', obj.bracket_position)
    obj.red_corner_id = entry.get('red_corner_id')
    obj.blue_corner_id = entry.get('blue_corner_id')
    obj.central_referee_id = entry.get('central_referee_id')
    obj.match_number = entry.get('match_number') or obj.match_number
    obj.name = entry.get('name') or obj.name
    obj.save()

    # MatchFieldAssignment.status ("Status în programare teren" in admin)
    # is a *separate* row/field from Match.status, normally kept in step
    # by LiveFullscreenPage.jsx as a match is played live on this server -
    # and MatchFieldAssignment isn't part of this results pack at all
    # (only import_event_pack.py, the pre-competition side, creates it).
    # A match whose result only ever arrives through sync - either it was
    # created fresh here (see above) with no assignment row yet, or it
    # already had one from the original event-pack import that was simply
    # never updated - must not be left stuck at its default 'not_started'
    # once Match.status says it's actually completed.
    field_status = {'scheduled': 'not_started', 'active': 'in_progress', 'completed': 'completed'}.get(obj.status)
    if field_status and obj.field_id:
        MatchFieldAssignment.objects.update_or_create(match=obj, defaults={'field_id': obj.field_id, 'status': field_status})

    return obj


def _link_match_bracket_pointers(entry: dict[str, Any]):
    """Second pass: set next_match/loser_next_match now that every match in
    this payload is guaranteed to already exist (see _upsert_match)."""
    updates = {}
    if entry.get('next_match_id') is not None:
        updates['next_match_id'] = entry['next_match_id']
    if entry.get('loser_next_match_id') is not None:
        updates['loser_next_match_id'] = entry['loser_next_match_id']
    if updates:
        Match.objects.filter(pk=entry['id']).update(**updates)


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
    fight_athlete_weights_payload = _section(payload, 'fight_athlete_weights')
    category_athlete_scores_payload = _section(payload, 'category_athlete_scores')

    existing_category_ids = _existing_event_category_ids(event.id)
    existing_match_ids = _existing_event_match_ids(event.id)
    fight_bracket_by_category_id: dict[int, tuple[int, str]] = {
        row['id']: (row['group_id'], row['gender'])
        for row in FightCategory.objects.filter(event_id=event.id).values('id', 'group_id', 'gender')
    }

    for entry in category_results_payload:
        if entry['id'] not in existing_category_ids:
            raise ValidationError({'category_results': f"Category {entry['id']} does not exist in cloud. Creating new local categories is not supported by result sync."})

    skipped: list[str] = []
    imported = {
        'category_results': 0,
        'category_athletes': 0,
        'category_teams': 0,
        'category_athlete_scores': 0,
        'category_referee_scores': 0,
        'matches': 0,
        'match_rounds': 0,
        'match_events': 0,
        'point_events': 0,
        'match_referee_scores': 0,
        'fight_athlete_weights': 0,
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

    # An athlete's current fight bracket, as category_athletes just
    # resolved it (post any LAN bracket reassignment) - see
    # _upsert_fight_athlete_weight's docstring for why fight_athlete_weights
    # entries must follow this instead of their own category_id.
    current_fight_category_by_athlete: dict[int, int] = {}

    _assert_athlete_identities_match(_section(payload, 'athletes'))

    for entry in category_athletes_payload:
        if entry['category_id'] not in existing_category_ids:
            raise ValidationError({'category_athletes': f"Category {entry['category_id']} does not exist in cloud. Creating new local categories is not supported by result sync."})
        if not Athlete.objects.filter(pk=entry['athlete_id']).exists():
            raise ValidationError({'category_athletes': f"Athlete {entry['athlete_id']} does not exist in cloud. Creating new local athletes is not supported by result sync."})
        _upsert_category_athlete(entry, fight_bracket_by_category_id)
        imported['category_athletes'] += 1
        if entry['category_id'] in fight_bracket_by_category_id:
            current_fight_category_by_athlete[entry['athlete_id']] = entry['category_id']

    for entry in fight_athlete_weights_payload:
        category_id = current_fight_category_by_athlete.get(entry['athlete_id'], entry['category_id'])
        if category_id not in existing_category_ids:
            raise ValidationError({'fight_athlete_weights': f"Category {category_id} does not exist in cloud. Creating new local categories is not supported by result sync."})
        if not Athlete.objects.filter(pk=entry['athlete_id']).exists():
            raise ValidationError({'fight_athlete_weights': f"Athlete {entry['athlete_id']} does not exist in cloud. Creating new local athletes is not supported by result sync."})
        _upsert_fight_athlete_weight(entry, category_id)
        imported['fight_athlete_weights'] += 1

    for entry in category_teams_payload:
        if entry['category_id'] not in existing_category_ids:
            raise ValidationError({'category_teams': f"Category {entry['category_id']} does not exist in cloud. Creating new local categories is not supported by result sync."})
        if not Team.objects.filter(pk=entry['team_id']).exists():
            raise ValidationError({'category_teams': f"Team {entry['team_id']} does not exist in cloud."})
        _upsert_category_team(entry)
        imported['category_teams'] += 1

    # After category_teams on purpose: saving a CategoryTeam fires
    # sync_admin_scores_to_referee_scores (api/signals.py), which deletes
    # and recreates that result's CategoryRefereeScore rows from the
    # admin-typed ref1..5_score columns - running this first would hand it
    # the referee app's real scores to wipe.
    for entry in category_athlete_scores_payload:
        if entry['category_id'] not in existing_category_ids:
            raise ValidationError({'category_athlete_scores': f"Category {entry['category_id']} does not exist in cloud."})
        referee_score_count = _upsert_category_athlete_score(entry, skipped)
        if referee_score_count is None:
            continue
        imported['category_athlete_scores'] += 1
        imported['category_referee_scores'] += referee_score_count

    for entry in matches_payload:
        _upsert_match(entry, existing_category_ids)
        # A match created locally (e.g. a bronze match added after the
        # event pack export) is now guaranteed to exist - later loops in
        # this function (rounds/events/point events/referee scores) that
        # check membership in this set must see it too, or they'd reject
        # its own child rows even though the match itself just succeeded.
        existing_match_ids.add(entry['id'])
        imported['matches'] += 1

    # Second pass: link next_match/loser_next_match now that every match
    # referenced by this payload is guaranteed to exist (see _upsert_match).
    for entry in matches_payload:
        _link_match_bracket_pointers(entry)

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
        'skipped': skipped,
        'local_sync_status': event.local_sync_status,
        'sync_locked': event.sync_locked,
    }