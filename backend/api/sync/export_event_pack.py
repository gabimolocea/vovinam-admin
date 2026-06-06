from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.utils import timezone

from api.models import (
    Athlete,
    Category,
    CategoryAthlete,
    CategoryFieldAssignment,
    CategoryRefereeAssignment,
    CategoryTeam,
    Club,
    CompetitionField,
    CompetitionReferee,
    DisplayMonitorSession,
    Group,
    Match,
    MatchFieldAssignment,
    MatchRefereeAssignment,
    MatchRound,
    Team,
    TeamMember,
)
from landing.models import Event


@dataclass(frozen=True)
class EventPackManifest:
    schema_version: int
    event_id: int
    exported_at: Any
    origin: str = 'cloud'

    def as_dict(self) -> dict[str, Any]:
        return {
            'schema_version': self.schema_version,
            'event_id': self.event_id,
            'exported_at': self.exported_at,
            'origin': self.origin,
        }


SCHEMA_VERSION = 1


def _athlete_dict(athlete: Athlete) -> dict[str, Any]:
    return {
        'id': athlete.id,
        'first_name': athlete.first_name,
        'last_name': athlete.last_name,
        'date_of_birth': athlete.date_of_birth,
        'club_id': athlete.club_id,
        'city_id': athlete.city_id,
        'current_grade_id': athlete.current_grade_id,
        'federation_role_id': athlete.federation_role_id,
        'title_id': athlete.title_id,
        'registered_date': athlete.registered_date,
        'expiration_date': athlete.expiration_date,
        'is_coach': athlete.is_coach,
        'is_referee': athlete.is_referee,
        'status': athlete.status,
    }


def _club_dict(club: Club) -> dict[str, Any]:
    return {
        'id': club.id,
        'name': club.name,
        'city_id': club.city_id,
        'address': club.address,
        'mobile_number': club.mobile_number,
        'website': club.website,
        'display_order': club.display_order,
        'modified': club.modified,
    }


def _group_dict(group: Group) -> dict[str, Any]:
    return {
        'id': group.id,
        'name': group.name,
        'event_id': group.event_id,
        'birth_year_start': group.birth_year_start,
        'birth_year_end': group.birth_year_end,
        'birth_date_start': group.birth_date_start,
        'birth_date_end': group.birth_date_end,
        'allow_younger': group.allow_younger,
        'allowed_grade_type': group.allowed_grade_type,
        'display_order': group.display_order,
    }


def _category_dict(category: Category) -> dict[str, Any]:
    return {
        'id': category.id,
        'category_number': category.category_number,
        'name': category.name,
        'event_id': category.event_id,
        'gender': category.gender,
        'group_id': category.group_id,
        'birth_year_start': category.birth_year_start,
        'birth_year_end': category.birth_year_end,
        'display_order': category.display_order,
        'type': category.type,
    }


def _match_dict(match: Match) -> dict[str, Any]:
    return {
        'id': match.id,
        'match_number': match.match_number,
        'status': match.status,
        'display_mode': match.display_mode,
        'category_id': match.category_id,
        'field_id': match.field_id,
        'match_type': match.match_type,
        'round_number': match.round_number,
        'bracket_position': match.bracket_position,
        'next_match_id': match.next_match_id,
        'loser_next_match_id': match.loser_next_match_id,
        'red_corner_id': match.red_corner_id,
        'blue_corner_id': match.blue_corner_id,
        'central_referee_id': match.central_referee_id,
        'name': match.name,
    }


def _field_dict(field: CompetitionField) -> dict[str, Any]:
    return {
        'id': field.id,
        'event_id': field.event_id,
        'name': field.name,
        'field_number': field.field_number,
        'is_active': field.is_active,
        'start_time': field.start_time,
    }


def build_event_pack(*, event_id: int) -> dict[str, Any]:
    event = Event.objects.filter(pk=event_id).first()
    if event is None:
        raise ValueError(f'Event {event_id} was not found.')

    groups = list(Group.objects.filter(event_id=event_id).order_by('display_order', 'id'))
    categories = list(Category.objects.filter(event_id=event_id).select_related('group').order_by('display_order', 'id'))
    category_ids = [category.id for category in categories]

    category_athletes = list(
        CategoryAthlete.objects.filter(category_id__in=category_ids)
        .select_related('athlete')
        .order_by('category_id', 'athlete_id')
    )
    category_teams = list(
        CategoryTeam.objects.filter(category_id__in=category_ids)
        .select_related('team')
        .order_by('category_id', 'team_id')
    )

    team_ids = sorted({entry.team_id for entry in category_teams if entry.team_id})
    teams = list(Team.objects.filter(id__in=team_ids).order_by('id'))
    team_members = list(
        TeamMember.objects.filter(team_id__in=team_ids)
        .select_related('athlete')
        .order_by('team_id', 'id')
    )

    athlete_ids = {
        entry.athlete_id for entry in category_athletes if entry.athlete_id
    }
    athlete_ids.update(member.athlete_id for member in team_members if member.athlete_id)

    competition_referees = list(
        CompetitionReferee.objects.filter(event_id=event_id)
        .select_related('athlete')
        .order_by('athlete__last_name', 'athlete__first_name')
    )
    athlete_ids.update(entry.athlete_id for entry in competition_referees if entry.athlete_id)

    athletes = list(
        Athlete.objects.filter(id__in=athlete_ids)
        .select_related('club', 'city', 'current_grade', 'federation_role', 'title')
        .order_by('last_name', 'first_name')
    )
    club_ids = sorted({athlete.club_id for athlete in athletes if athlete.club_id})
    clubs = list(Club.objects.filter(id__in=club_ids).select_related('city').order_by('name'))

    matches = list(
        Match.objects.filter(category_id__in=category_ids)
        .select_related('category', 'field', 'red_corner', 'blue_corner', 'central_referee')
        .order_by('category_id', 'round_number', 'bracket_position', 'id')
    )
    match_ids = [match.id for match in matches]
    match_rounds = list(MatchRound.objects.filter(match_id__in=match_ids).order_by('match_id', 'round_number'))

    fields = list(CompetitionField.objects.filter(event_id=event_id).order_by('field_number'))
    category_field_assignments = list(
        CategoryFieldAssignment.objects.filter(category_id__in=category_ids).order_by('field_id', 'order', 'category_id')
    )
    match_field_assignments = list(
        MatchFieldAssignment.objects.filter(match_id__in=match_ids).order_by('field_id', 'order', 'match_id')
    )
    category_referee_assignments = list(
        CategoryRefereeAssignment.objects.filter(category_id__in=category_ids).order_by('category_id')
    )
    match_referee_assignments = list(
        MatchRefereeAssignment.objects.filter(match_id__in=match_ids).order_by('match_id')
    )
    monitor_sessions = list(
        DisplayMonitorSession.objects.filter(field__event_id=event_id).order_by('field__field_number')
    )

    manifest = EventPackManifest(
        schema_version=SCHEMA_VERSION,
        event_id=event.id,
        exported_at=timezone.now(),
    )

    return {
        'manifest': manifest.as_dict(),
        'event': {
            'id': event.id,
            'title': event.title,
            'slug': event.slug,
            'event_type': event.event_type,
            'start_date': event.start_date,
            'end_date': event.end_date,
            'address': getattr(event, 'address', None),
            'city_id': getattr(event, 'city_id', None),
        },
        'clubs': [_club_dict(club) for club in clubs],
        'athletes': [_athlete_dict(athlete) for athlete in athletes],
        'groups': [_group_dict(group) for group in groups],
        'categories': [_category_dict(category) for category in categories],
                'display_mode': match.display_mode,
        'category_athletes': [
            {
                'id': entry.id,
                'category_id': entry.category_id,
                'athlete_id': entry.athlete_id,
                'weight': entry.weight,
                'place': entry.place,
                'disqualified': entry.disqualified,
            }
            for entry in category_athletes
        ],
        'category_teams': [
            {
                'id': entry.id,
                'category_id': entry.category_id,
                'team_id': entry.team_id,
                'place': entry.place,
                'disqualified': entry.disqualified,
            }
            for entry in category_teams
        ],
        'teams': [
            {
                'id': team.id,
                'name': team.name,
            }
            for team in teams
        ],
        'team_members': [
            {
                'id': member.id,
                'team_id': member.team_id,
                'athlete_id': member.athlete_id,
            }
            for member in team_members
        ],
        'matches': [_match_dict(match) for match in matches],
        'match_rounds': [
            {
                'id': round_obj.id,
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
        'fields': [_field_dict(field) for field in fields],
        'category_field_assignments': [
            {
                'id': assignment.id,
                'category_id': assignment.category_id,
                'field_id': assignment.field_id,
                'status': assignment.status,
                'scheduled_start_time': assignment.scheduled_start_time,
                'actual_start_time': assignment.actual_start_time,
                'actual_end_time': assignment.actual_end_time,
                'order': assignment.order,
                'estimated_duration': assignment.estimated_duration,
            }
            for assignment in category_field_assignments
        ],
        'match_field_assignments': [
            {
                'id': assignment.id,
                'match_id': assignment.match_id,
                'field_id': assignment.field_id,
                'status': assignment.status,
                'scheduled_start_time': assignment.scheduled_start_time,
                'actual_start_time': assignment.actual_start_time,
                'actual_end_time': assignment.actual_end_time,
                'order': assignment.order,
                'estimated_duration': assignment.estimated_duration,
            }
            for assignment in match_field_assignments
        ],
        'competition_referees': [
            {
                'id': entry.id,
                'event_id': entry.event_id,
                'athlete_id': entry.athlete_id,
                'notes': entry.notes,
            }
            for entry in competition_referees
        ],
        'category_referee_assignments': [
            {
                'id': assignment.id,
                'category_id': assignment.category_id,
                'referee_1_id': assignment.referee_1_id,
                'referee_2_id': assignment.referee_2_id,
                'referee_3_id': assignment.referee_3_id,
                'referee_4_id': assignment.referee_4_id,
                'referee_5_id': assignment.referee_5_id,
            }
            for assignment in category_referee_assignments
        ],
        'match_referee_assignments': [
            {
                'id': assignment.id,
                'match_id': assignment.match_id,
                'referee_1_id': assignment.referee_1_id,
                'referee_2_id': assignment.referee_2_id,
                'referee_3_id': assignment.referee_3_id,
                'referee_4_id': assignment.referee_4_id,
                'referee_5_id': assignment.referee_5_id,
            }
            for assignment in match_referee_assignments
        ],
        'monitor_sessions': [
            {
                'id': session.id,
                'field_id': session.field_id,
                'current_category_id': session.current_category_id,
                'current_match_id': session.current_match_id,
                'current_athlete_id': session.current_athlete_id,
                'status': session.status,
                'break_end_time': session.break_end_time,
                'break_paused': session.break_paused,
                'break_paused_remaining': session.break_paused_remaining,
            }
            for session in monitor_sessions
        ],
    }
