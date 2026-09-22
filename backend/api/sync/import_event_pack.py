from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.dateparse import parse_datetime

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
    FightAthleteWeight,
    FightCategory,
    FightGroupEnrollment,
    Group,
    Match,
    MatchFieldAssignment,
    MatchRefereeAssignment,
    MatchRound,
    SoloCategory,
    Team,
    TeamCategory,
    TeamMember,
    TrainingSeminarParticipation,
)
from landing.models import Event


def _section(payload: dict[str, Any], name: str) -> list[dict[str, Any]]:
    value = payload.get(name) or []
    if not isinstance(value, list):
        raise ValidationError({name: 'This section must be a list.'})
    return value


def _safe_fk_id(model, pk):
    if not pk:
        return None
    return pk if model.objects.filter(pk=pk).exists() else None


def _safe_referee_id(pk):
    if not pk:
        return None
    return pk if Athlete.objects.filter(pk=pk, is_referee=True).exists() else None


def _normalize_defaults(model, defaults: dict[str, Any]) -> dict[str, Any]:
    normalized = {}
    for key, value in defaults.items():
        field_name = key[:-3] if key.endswith('_id') else key
        try:
            field = model._meta.get_field(field_name)
        except Exception:
            normalized[key] = value
            continue

        if value is None or key.endswith('_id'):
            normalized[key] = value
            continue

        try:
            normalized[key] = field.to_python(value)
        except Exception:
            normalized[key] = value
    return normalized


def _upsert(model, record_id: int, defaults: dict[str, Any], natural_key_field: str | None = None):
    """natural_key_field names a field with its own DB-level unique
    constraint (e.g. MatchFieldAssignment.match, a OneToOneField) that can
    already hold a row for this record under a *different* pk than
    record_id - this happens whenever the cloud side creates that row
    itself (e.g. import_event_results.py deriving MatchFieldAssignment.
    status from Match.status on results sync) rather than it only ever
    being created here from an event pack. Without checking this first,
    a plain pk-based upsert tries to INSERT a second row for the same
    match/category and violates the unique constraint, permanently
    blocking every later "Web → Local" resync for that event with a 500.
    """
    defaults = _normalize_defaults(model, defaults)

    existing = None
    if natural_key_field is not None:
        natural_key_value = defaults.get(natural_key_field)
        if natural_key_value is not None:
            existing = model.objects.filter(**{natural_key_field: natural_key_value}).first()
    if existing is None:
        existing = model.objects.filter(pk=record_id).first()

    if existing is not None:
        for key, value in defaults.items():
            setattr(existing, key, value)
        existing.save()
        return existing

    if any(field.name == 'version' for field in model._meta.fields):
        instance = model(pk=record_id, **defaults)
        if hasattr(instance, 'generate_sync_hash'):
            instance.sync_hash = instance.generate_sync_hash()
        model.objects.bulk_create([instance])
        return instance

    return model.objects.create(pk=record_id, **defaults)


def _category_model(category_type: str):
    mapping = {
        'solo': SoloCategory,
        'team': TeamCategory,
        'teams': TeamCategory,
        'fight': FightCategory,
    }
    return mapping.get(category_type, Category)


@transaction.atomic
def import_event_pack(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValidationError({'payload': 'A JSON object is required.'})

    event_data = payload.get('event')
    if not isinstance(event_data, dict):
        raise ValidationError({'event': 'This section is required.'})
    if not event_data.get('id'):
        raise ValidationError({'event.id': 'This field is required.'})

    _upsert(
        Event,
        event_data['id'],
        {
            'title': event_data.get('title', ''),
            'slug': event_data.get('slug', ''),
            # The wire payload still carries a single `event_type` string
            # (matches what export_event_pack.py sends) - translate it to
            # the real, possibly multi-valued `event_types` field.
            'event_types': [event_data.get('event_type', 'competition')],
            'start_date': event_data.get('start_date'),
            'end_date': event_data.get('end_date'),
            'address': event_data.get('address') or '',
            'city_id': None,
        },
    )
    event = Event.objects.get(pk=event_data['id'])

    # Importing a pack is this instance taking operational custody of the
    # event, the same status an export puts it in on the cloud side (see
    # OfflineSyncViewSet.event_pack). Without this, mark-local-in-progress
    # (and mark-results-uploaded) always 400 with "Event must be locked for
    # local operation", since a freshly imported Event otherwise starts
    # with sync_locked=False.
    manifest = payload.get('manifest') or {}
    exported_at = manifest.get('exported_at')
    if isinstance(exported_at, str):
        exported_at = parse_datetime(exported_at)
    event.mark_exported_to_local(exported_at=exported_at)
    event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at'])

    clubs_payload = _section(payload, 'clubs')
    athletes_payload = _section(payload, 'athletes')
    groups_payload = _section(payload, 'groups')
    categories_payload = _section(payload, 'categories')
    category_athletes_payload = _section(payload, 'category_athletes')
    category_teams_payload = _section(payload, 'category_teams')
    teams_payload = _section(payload, 'teams')
    team_members_payload = _section(payload, 'team_members')
    fields_payload = _section(payload, 'fields')
    matches_payload = _section(payload, 'matches')
    match_rounds_payload = _section(payload, 'match_rounds')
    competition_referees_payload = _section(payload, 'competition_referees')
    event_enrollments_payload = _section(payload, 'event_enrollments')
    fight_group_enrollments_payload = _section(payload, 'fight_group_enrollments')
    fight_athlete_weights_payload = _section(payload, 'fight_athlete_weights')
    category_field_assignments_payload = _section(payload, 'category_field_assignments')
    match_field_assignments_payload = _section(payload, 'match_field_assignments')
    category_referee_assignments_payload = _section(payload, 'category_referee_assignments')
    match_referee_assignments_payload = _section(payload, 'match_referee_assignments')
    monitor_sessions_payload = _section(payload, 'monitor_sessions')

    group_ids = {entry['id'] for entry in groups_payload}
    category_ids = {entry['id'] for entry in categories_payload}
    field_ids = {entry['id'] for entry in fields_payload}

    Group.objects.filter(event_id=event.id).exclude(pk__in=group_ids).delete()
    Category.objects.filter(event_id=event.id).exclude(pk__in=category_ids).delete()
    CompetitionField.objects.filter(event_id=event.id).exclude(pk__in=field_ids).delete()

    for club in clubs_payload:
        _upsert(
            Club,
            club['id'],
            {
                'name': club.get('name', ''),
                'city_id': None,
                'address': club.get('address'),
                'mobile_number': club.get('mobile_number'),
                'website': club.get('website'),
                'display_order': club.get('display_order', 0),
            },
        )

    for athlete in athletes_payload:
        _upsert(
            Athlete,
            athlete['id'],
            {
                'first_name': athlete.get('first_name', ''),
                'last_name': athlete.get('last_name', ''),
                'date_of_birth': athlete.get('date_of_birth'),
                'club_id': _safe_fk_id(Club, athlete.get('club_id')),
                'city_id': None,
                'current_grade_id': None,
                'federation_role_id': None,
                'title_id': None,
                'registered_date': athlete.get('registered_date'),
                'expiration_date': athlete.get('expiration_date'),
                'is_coach': athlete.get('is_coach', False),
                'is_referee': athlete.get('is_referee', False),
                'status': athlete.get('status', 'approved'),
            },
        )

    for group in groups_payload:
        _upsert(
            Group,
            group['id'],
            {
                'name': group.get('name', ''),
                'event_id': event.id,
                'birth_year_start': group.get('birth_year_start'),
                'birth_year_end': group.get('birth_year_end'),
                'birth_date_start': group.get('birth_date_start'),
                'birth_date_end': group.get('birth_date_end'),
                'allow_younger': group.get('allow_younger', False),
                'allowed_grade_type': group.get('allowed_grade_type', 'all'),
                'display_order': group.get('display_order', 0),
            },
        )

    for category in categories_payload:
        category_model = _category_model(category.get('type'))
        _upsert(
            category_model,
            category['id'],
            {
                'category_number': category.get('category_number'),
                'name': category.get('name', ''),
                'event_id': event.id,
                'gender': category.get('gender', 'mixt'),
                'group_id': _safe_fk_id(Group, category.get('group_id')),
                'birth_year_start': category.get('birth_year_start'),
                'birth_year_end': category.get('birth_year_end'),
                'display_order': category.get('display_order', 0),
            },
        )

    for team in teams_payload:
        Team.objects.get_or_create(pk=team['id'])

    for team_member in team_members_payload:
        _upsert(
            TeamMember,
            team_member['id'],
            {
                'team_id': _safe_fk_id(Team, team_member.get('team_id')),
                'athlete_id': _safe_fk_id(Athlete, team_member.get('athlete_id')),
            },
        )

    fight_category_ids = {category['id'] for category in categories_payload if category.get('type') == 'fight'}
    # An athlete's current fight bracket, as this loop resolves it - see
    # the fight_athlete_weights loop below for why entries there must
    # follow this instead of their own category_id.
    current_fight_category_by_athlete: dict[int, int] = {}

    for category_athlete in category_athletes_payload:
        category_id = _safe_fk_id(Category, category_athlete.get('category_id'))
        athlete_id = _safe_fk_id(Athlete, category_athlete.get('athlete_id'))
        if category_id in fight_category_ids and athlete_id is not None:
            current_fight_category_by_athlete[athlete_id] = category_id
        _upsert(
            CategoryAthlete,
            category_athlete['id'],
            {
                'category_id': category_id,
                'athlete_id': athlete_id,
                'weight': category_athlete.get('weight'),
                'place': category_athlete.get('place'),
                'disqualified': category_athlete.get('disqualified', False),
            },
        )

    for category_team in category_teams_payload:
        _upsert(
            CategoryTeam,
            category_team['id'],
            {
                'category_id': _safe_fk_id(Category, category_team.get('category_id')),
                'team_id': _safe_fk_id(Team, category_team.get('team_id')),
                'place': category_team.get('place'),
                'disqualified': category_team.get('disqualified', False),
            },
        )

    for field in fields_payload:
        _upsert(
            CompetitionField,
            field['id'],
            {
                'event_id': event.id,
                'name': field.get('name', ''),
                'field_number': field.get('field_number', 0),
                'is_active': field.get('is_active', True),
                'start_time': field.get('start_time'),
            },
        )

    for match in matches_payload:
        _upsert(
            Match,
            match['id'],
            {
                'match_number': match.get('match_number'),
                'status': match.get('status', 'scheduled'),
                'display_mode': match.get('display_mode', 'reveal_final'),
                'category_id': _safe_fk_id(Category, match.get('category_id')),
                'field_id': _safe_fk_id(CompetitionField, match.get('field_id')),
                'match_type': match.get('match_type', 'qualifications'),
                'round_number': match.get('round_number', 1),
                'bracket_position': match.get('bracket_position', 0),
                'next_match_id': None,
                'loser_next_match_id': None,
                'red_corner_id': _safe_fk_id(Athlete, match.get('red_corner_id')),
                'blue_corner_id': _safe_fk_id(Athlete, match.get('blue_corner_id')),
                'central_referee_id': _safe_referee_id(match.get('central_referee_id')),
                'name': match.get('name', ''),
            },
        )

    for match in matches_payload:
        Match.objects.filter(pk=match['id']).update(
            next_match_id=_safe_fk_id(Match, match.get('next_match_id')),
            loser_next_match_id=_safe_fk_id(Match, match.get('loser_next_match_id')),
        )

    # A newly-created Match auto-provisions its own 2x2min rounds (see
    # api.signals.create_default_match_rounds) - those aren't part of this
    # pack, and would collide on (match_id, round_number) with the pack's
    # own rounds below, so drop anything not present in the incoming
    # payload before upserting it. The pack is the source of truth for a
    # match's rounds during import.
    MatchRound.objects.filter(match_id__in=[m['id'] for m in matches_payload]).exclude(
        pk__in=[r['id'] for r in match_rounds_payload]
    ).delete()

    for round_obj in match_rounds_payload:
        _upsert(
            MatchRound,
            round_obj['id'],
            {
                'match_id': _safe_fk_id(Match, round_obj.get('match_id')),
                'round_number': round_obj.get('round_number', 1),
                'duration_seconds': round_obj.get('duration_seconds', 180),
                'status': round_obj.get('status', 'scheduled'),
                'started_at': round_obj.get('started_at'),
                'ended_at': round_obj.get('ended_at'),
                'paused_at': round_obj.get('paused_at'),
                'accumulated_pause_seconds': round_obj.get('accumulated_pause_seconds', 0),
                'extra_seconds': round_obj.get('extra_seconds', 0),
            },
        )

    for referee in competition_referees_payload:
        _upsert(
            CompetitionReferee,
            referee['id'],
            {
                'event_id': event.id,
                'athlete_id': _safe_referee_id(referee.get('athlete_id')),
                'notes': referee.get('notes', ''),
            },
        )

    # Event registrations (an athlete/coach signing up before being drawn
    # into a category) - without these, a local venue machine only ever
    # shows whoever already happens to be assigned to a category.
    event_enrollment_ids = {entry['id'] for entry in event_enrollments_payload}
    TrainingSeminarParticipation.objects.filter(event_id=event.id).exclude(pk__in=event_enrollment_ids).delete()
    for enrollment in event_enrollments_payload:
        _upsert(
            TrainingSeminarParticipation,
            enrollment['id'],
            {
                'event_id': event.id,
                'athlete_id': _safe_fk_id(Athlete, enrollment.get('athlete_id')),
                'status': enrollment.get('status', 'approved'),
                'submitted_by_athlete': enrollment.get('submitted_by_athlete', False),
                'notes': enrollment.get('notes'),
                'admin_notes': enrollment.get('admin_notes'),
            },
        )

    # "Etapa 1" fight pre-registration pool - a coach's submitted weight
    # before the athlete is drawn into a specific category. group_ids was
    # already computed above (used to prune stale Groups), so this reuses
    # it to scope the same cleanup-then-upsert pattern.
    fight_group_enrollment_ids = {entry['id'] for entry in fight_group_enrollments_payload}
    FightGroupEnrollment.objects.filter(group_id__in=group_ids).exclude(pk__in=fight_group_enrollment_ids).delete()
    for entry in fight_group_enrollments_payload:
        _upsert(
            FightGroupEnrollment,
            entry['id'],
            {
                'event_id': event.id,
                'group_id': _safe_fk_id(Group, entry.get('group_id')),
                'athlete_id': _safe_fk_id(Athlete, entry.get('athlete_id')),
                'registered_weight_kg': entry.get('registered_weight_kg'),
                'notes': entry.get('notes', ''),
            },
        )

    # The actual weigh-in record - an admin may have entered/corrected this
    # directly (e.g. via Django admin) before the event was ever synced
    # down, so it needs to travel with the pack just like everything else.
    #
    # Upserted by (category, athlete), not by the pack's raw id: creating a
    # CategoryAthlete for a fight category above already auto-creates an
    # empty FightAthleteWeight for the same pair via
    # sync_fight_weight_to_category_athlete (see api/signals.py), with a
    # freshly-assigned local pk that never matches the pack's id. A pk-keyed
    # upsert-then-delete-stale-ids pass would delete that phantom row before
    # creating "our" one - and deleting a FightAthleteWeight cascades via
    # delete_category_athlete_on_fight_weight_remove into deleting the
    # CategoryAthlete we just created too. Keying on the natural
    # (category, athlete) pair finds and fills in that same phantom row
    # instead, sidestepping the cascade and the unique_together conflict a
    # duplicate create() would otherwise hit. No separate stale-row cleanup
    # is needed either: removing a stale CategoryAthlete above already
    # cascades into removing its FightAthleteWeight via that same signal.
    #
    # category_id follows current_fight_category_by_athlete (the athlete's
    # CategoryAthlete-resolved bracket) rather than entry['category_id']
    # directly: if the two sections of a payload ever disagreed about which
    # bracket an athlete is in, trusting this section's own value could
    # create a FightAthleteWeight in a bracket CategoryAthlete just moved
    # them out of - which would resurrect a CategoryAthlete there via the
    # same signal, undoing the move.
    for entry in fight_athlete_weights_payload:
        athlete_id = _safe_fk_id(Athlete, entry.get('athlete_id'))
        if athlete_id is None:
            continue
        category_id = current_fight_category_by_athlete.get(
            athlete_id, _safe_fk_id(FightCategory, entry.get('category_id'))
        )
        if category_id is None:
            continue
        FightAthleteWeight.objects.update_or_create(
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

    # Unlike category_athletes_payload's own upsert above (an in-place
    # field update on the same row/pk, not a delete-then-recreate), moving
    # an athlete to a different bracket doesn't naturally cascade-clean the
    # FightAthleteWeight left behind in their old one. Prune it explicitly,
    # scoped to siblings within the SAME bracket group (same group+gender)
    # so this can't touch a genuinely different fight category the athlete
    # is separately enrolled in (e.g. a different group).
    fight_bracket_by_category_id: dict[int, tuple[int, str]] = {
        row['id']: (row['group_id'], row['gender'])
        for row in FightCategory.objects.filter(event_id=event.id).values('id', 'group_id', 'gender')
    }
    for athlete_id, category_id in current_fight_category_by_athlete.items():
        bracket = fight_bracket_by_category_id.get(category_id)
        if bracket is None:
            continue
        sibling_category_ids = [
            cid for cid, other_bracket in fight_bracket_by_category_id.items()
            if other_bracket == bracket and cid != category_id
        ]
        if sibling_category_ids:
            FightAthleteWeight.objects.filter(athlete_id=athlete_id, category_id__in=sibling_category_ids).delete()

    # _upsert's natural_key_field can reuse an existing row under a pk
    # *different* from assignment['id'] (see _upsert's own docstring) - the
    # stale-cleanup pass below has to exclude by whatever pk was actually
    # kept, not the payload's original id, or it deletes the row it was
    # just told to keep.
    resolved_category_field_assignment_ids = set()
    for assignment in category_field_assignments_payload:
        obj = _upsert(
            CategoryFieldAssignment,
            assignment['id'],
            {
                'category_id': _safe_fk_id(Category, assignment.get('category_id')),
                'field_id': _safe_fk_id(CompetitionField, assignment.get('field_id')),
                'status': assignment.get('status', 'not_started'),
                'scheduled_start_time': assignment.get('scheduled_start_time'),
                'actual_start_time': assignment.get('actual_start_time'),
                'actual_end_time': assignment.get('actual_end_time'),
                'order': assignment.get('order', 0),
                'estimated_duration': assignment.get('estimated_duration', 15),
            },
            natural_key_field='category_id',
        )
        resolved_category_field_assignment_ids.add(obj.id)

    resolved_match_field_assignment_ids = set()
    for assignment in match_field_assignments_payload:
        obj = _upsert(
            MatchFieldAssignment,
            assignment['id'],
            {
                'match_id': _safe_fk_id(Match, assignment.get('match_id')),
                'field_id': _safe_fk_id(CompetitionField, assignment.get('field_id')),
                'status': assignment.get('status', 'not_started'),
                'scheduled_start_time': assignment.get('scheduled_start_time'),
                'actual_start_time': assignment.get('actual_start_time'),
                'actual_end_time': assignment.get('actual_end_time'),
                'order': assignment.get('order', 0),
                'estimated_duration': assignment.get('estimated_duration', 10),
            },
            natural_key_field='match_id',
        )
        resolved_match_field_assignment_ids.add(obj.id)

    for assignment in category_referee_assignments_payload:
        _upsert(
            CategoryRefereeAssignment,
            assignment['id'],
            {
                'category_id': _safe_fk_id(Category, assignment.get('category_id')),
                'referee_1_id': _safe_referee_id(assignment.get('referee_1_id')),
                'referee_2_id': _safe_referee_id(assignment.get('referee_2_id')),
                'referee_3_id': _safe_referee_id(assignment.get('referee_3_id')),
                'referee_4_id': _safe_referee_id(assignment.get('referee_4_id')),
                'referee_5_id': _safe_referee_id(assignment.get('referee_5_id')),
            },
        )

    for assignment in match_referee_assignments_payload:
        _upsert(
            MatchRefereeAssignment,
            assignment['id'],
            {
                'match_id': _safe_fk_id(Match, assignment.get('match_id')),
                'referee_1_id': _safe_referee_id(assignment.get('referee_1_id')),
                'referee_2_id': _safe_referee_id(assignment.get('referee_2_id')),
                'referee_3_id': _safe_referee_id(assignment.get('referee_3_id')),
                'referee_4_id': _safe_referee_id(assignment.get('referee_4_id')),
                'referee_5_id': _safe_referee_id(assignment.get('referee_5_id')),
            },
        )

    for session in monitor_sessions_payload:
        _upsert(
            DisplayMonitorSession,
            session['id'],
            {
                'field_id': _safe_fk_id(CompetitionField, session.get('field_id')),
                'current_category_id': _safe_fk_id(Category, session.get('current_category_id')),
                'current_match_id': _safe_fk_id(Match, session.get('current_match_id')),
                'current_athlete_id': _safe_fk_id(Athlete, session.get('current_athlete_id')),
                'status': session.get('status', 'idle'),
                'break_end_time': session.get('break_end_time'),
                'break_paused': session.get('break_paused', False),
                'break_paused_remaining': session.get('break_paused_remaining', 0),
            },
        )

    match_ids = {entry['id'] for entry in matches_payload}
    match_round_ids = {entry['id'] for entry in match_rounds_payload}
    competition_referee_ids = {entry['id'] for entry in competition_referees_payload}
    category_field_assignment_ids = resolved_category_field_assignment_ids
    match_field_assignment_ids = resolved_match_field_assignment_ids
    category_referee_assignment_ids = {entry['id'] for entry in category_referee_assignments_payload}
    match_referee_assignment_ids = {entry['id'] for entry in match_referee_assignments_payload}
    monitor_session_ids = {entry['id'] for entry in monitor_sessions_payload}
    category_athlete_ids = {entry['id'] for entry in category_athletes_payload}
    category_team_ids = {entry['id'] for entry in category_teams_payload}
    team_ids = {entry['id'] for entry in teams_payload}
    team_member_ids = {entry['id'] for entry in team_members_payload}

    Group.objects.filter(event_id=event.id).exclude(pk__in=group_ids).delete()
    Category.objects.filter(event_id=event.id).exclude(pk__in=category_ids).delete()
    CompetitionField.objects.filter(event_id=event.id).exclude(pk__in=field_ids).delete()
    CompetitionReferee.objects.filter(event_id=event.id).exclude(pk__in=competition_referee_ids).delete()
    CategoryFieldAssignment.objects.filter(category_id__in=category_ids).exclude(pk__in=category_field_assignment_ids).delete()
    CategoryRefereeAssignment.objects.filter(category_id__in=category_ids).exclude(pk__in=category_referee_assignment_ids).delete()
    Match.objects.filter(category_id__in=category_ids).exclude(pk__in=match_ids).delete()
    MatchRound.objects.filter(match_id__in=match_ids).exclude(pk__in=match_round_ids).delete()
    MatchFieldAssignment.objects.filter(match_id__in=match_ids).exclude(pk__in=match_field_assignment_ids).delete()
    MatchRefereeAssignment.objects.filter(match_id__in=match_ids).exclude(pk__in=match_referee_assignment_ids).delete()
    DisplayMonitorSession.objects.filter(field_id__in=field_ids).exclude(pk__in=monitor_session_ids).delete()
    CategoryAthlete.objects.filter(category_id__in=category_ids).exclude(pk__in=category_athlete_ids).delete()
    CategoryTeam.objects.filter(category_id__in=category_ids).exclude(pk__in=category_team_ids).delete()
    TeamMember.objects.filter(team_id__in=team_ids).exclude(pk__in=team_member_ids).delete()

    return {
        'event_id': event.id,
        'imported': {
            'clubs': len(clubs_payload),
            'athletes': len(athletes_payload),
            'groups': len(groups_payload),
            'categories': len(categories_payload),
            'category_athletes': len(category_athletes_payload),
            'category_teams': len(category_teams_payload),
            'teams': len(teams_payload),
            'team_members': len(team_members_payload),
            'fields': len(fields_payload),
            'matches': len(matches_payload),
            'match_rounds': len(match_rounds_payload),
            'competition_referees': len(competition_referees_payload),
            'event_enrollments': len(event_enrollments_payload),
            'fight_group_enrollments': len(fight_group_enrollments_payload),
            'fight_athlete_weights': len(fight_athlete_weights_payload),
            'category_field_assignments': len(category_field_assignments_payload),
            'match_field_assignments': len(match_field_assignments_payload),
            'category_referee_assignments': len(category_referee_assignments_payload),
            'match_referee_assignments': len(match_referee_assignments_payload),
            'monitor_sessions': len(monitor_sessions_payload),
        },
    }