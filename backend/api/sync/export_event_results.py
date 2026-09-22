from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.utils import timezone

from api.models import (
    Category,
    CategoryAthlete,
    CategoryAthleteScore,
    CategoryRefereeScore,
    CategoryTeam,
    FightAthleteWeight,
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


def _category_result_dict(
    category: Category,
    athlete_places: dict[int, dict[int, int]] | None = None,
    team_places: dict[int, dict[int, int]] | None = None,
) -> dict[str, Any]:
    """athlete_places/team_places map category_id -> {place: athlete_id/team_id},
    derived from CategoryAthlete.place / CategoryTeam.place.

    Those per-enrollment `place` values are what the local competition
    actually writes: advance_match_winner -> _set_category_place (see
    api/views/matches.py) only ever sets CategoryAthlete.place, and never
    the category's own first_place/second_place/third_place FKs. Since
    import_event_results writes those FKs on cloud unconditionally, a pack
    built straight off the (locally always-empty) FKs would actively blank
    out whatever cloud had. Fall back to the derived value so a push
    carries the real podium instead of erasing it - an explicitly set FK
    still wins, since that's a deliberate admin decision.
    """
    category_id = category.id

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
        derived = (athlete_places or {}).get(category_id, {})
        payload.update(
            {
                'first_place_id': getattr(category, 'first_place_id', None) or derived.get(1),
                'second_place_id': getattr(category, 'second_place_id', None) or derived.get(2),
                'third_place_id': getattr(category, 'third_place_id', None) or derived.get(3),
            }
        )
    elif category.type in {'team', 'teams'}:
        derived = (team_places or {}).get(category_id, {})
        payload.update(
            {
                'first_place_team_id': getattr(category, 'first_place_team_id', None) or derived.get(1),
                'second_place_team_id': getattr(category, 'second_place_team_id', None) or derived.get(2),
                'third_place_team_id': getattr(category, 'third_place_team_id', None) or derived.get(3),
            }
        )

    return payload


def _places_by_category(entries, member_attr: str) -> dict[int, dict[int, int]]:
    """{category_id: {place: member_id}} from CategoryAthlete/CategoryTeam rows.

    Joint 3rd place (both semi-final losers, the federation's rule when a
    category has no bronze match) means `place` is not unique per category -
    a category only has one third_place slot, so the first row in the
    caller's stable ordering wins and the other keeps its own
    CategoryAthlete.place, which is what the bracket and standings screens
    actually read anyway.
    """
    places: dict[int, dict[int, int]] = {}
    for entry in entries:
        if entry.place in (1, 2, 3):
            places.setdefault(entry.category_id, {}).setdefault(entry.place, getattr(entry, member_attr))
    return places


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
    fight_athlete_weights = list(
        FightAthleteWeight.objects.filter(category_id__in=category_ids)
        .order_by('category_id', 'athlete_id')
    )

    # Technique (solo/team) scoring, as the referee app actually records it.
    # CategoryAthleteScore/CategoryRefereeScore are the only place a
    # referee's per-criterion deductions and resulting score live - the
    # CategoryAthlete.ref1_score..ref5_score columns carried above are a
    # separate, admin-typed store that nothing copies back into. Without
    # these two sections everything the five technique referees entered
    # stays on the venue laptop.
    athlete_scores = list(
        CategoryAthleteScore.objects.filter(category_id__in=category_ids)
        .prefetch_related('team_members')
        .order_by('category_id', 'athlete_id', 'referee_id', 'id')
    )
    referee_scores_by_athlete_score: dict[int, list[CategoryRefereeScore]] = {}
    for referee_score in (
        CategoryRefereeScore.objects
        .filter(athlete_score_id__in=[score.id for score in athlete_scores])
        .order_by('athlete_score_id', 'referee_id')
    ):
        referee_scores_by_athlete_score.setdefault(referee_score.athlete_score_id, []).append(referee_score)

    athlete_places = _places_by_category(category_athletes, 'athlete_id')
    team_places = _places_by_category(category_teams, 'team_id')

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
        'category_results': [
            _category_result_dict(category, athlete_places, team_places)
            for category in categories
        ],
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
                'match_type': match.match_type,
                'round_number': match.round_number,
                'bracket_position': match.bracket_position,
                'red_corner_id': match.red_corner_id,
                'blue_corner_id': match.blue_corner_id,
                'central_referee_id': match.central_referee_id,
                'next_match_id': match.next_match_id,
                'loser_next_match_id': match.loser_next_match_id,
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
        'fight_athlete_weights': [
            {
                'category_id': entry.category_id,
                'athlete_id': entry.athlete_id,
                'pre_weight_kg': entry.pre_weight_kg,
                'current_weight_kg': entry.current_weight_kg,
                'is_disqualified': entry.is_disqualified,
                'disqualification_reason': entry.disqualification_reason,
                'place': entry.place,
                'is_weight_locked': entry.is_weight_locked,
            }
            for entry in fight_athlete_weights
        ],
        # Keyed on (category, athlete, referee) - CategoryAthleteScore's own
        # unique_together - since pks diverge between the two instances.
        # Each referee's scores are nested under their result rather than
        # sent as a flat section, so the importer never has to re-resolve a
        # parent whose pk it doesn't know.
        'category_athlete_scores': [
            {
                'category_id': score.category_id,
                'athlete_id': score.athlete_id,
                'referee_id': score.referee_id,
                'score': score.score,
                'type': score.type,
                'group_id': score.group_id,
                'team_name': score.team_name,
                'team_member_ids': [athlete.id for athlete in score.team_members.all()],
                'submitted_by_athlete': score.submitted_by_athlete,
                'placement_claimed': score.placement_claimed,
                'notes': score.notes,
                'status': score.status,
                'submitted_date': score.submitted_date,
                'reviewed_date': score.reviewed_date,
                'admin_notes': score.admin_notes,
                'referee_scores': [
                    {
                        'referee_id': referee_score.referee_id,
                        'deductions': referee_score.deductions,
                        'score': referee_score.score,
                        'submitted_date': referee_score.submitted_date,
                        'notes': referee_score.notes,
                    }
                    for referee_score in referee_scores_by_athlete_score.get(score.id, [])
                ],
            }
            for score in athlete_scores
        ],
    }