from django.shortcuts import render
from datetime import datetime, timedelta
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django.db import models, transaction
from django.db.models import Prefetch, Q
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from ..serializers import *
from ..models import *
from ..permissions import IsAdminOrReadOnly, IsAdmin, IsOwnerOrAdmin, IsClubCoachOrAdmin, IsAthleteOwnerCoachOrAdmin
from rest_framework.response import Response
from rest_framework.reverse import reverse
from django.conf import settings
from django.core.files.base import ContentFile
import logging
from pathlib import Path
from django.db import IntegrityError

# Ensure logger output appears in the console for debugging
logging.basicConfig(level=logging.WARNING, format='%(asctime)s %(levelname)s %(name)s %(message)s')


def _get_effective_coach_registration_deadline(event):
    if not event:
        return None
    return getattr(event, 'effective_coach_registration_deadline', None) or getattr(event, 'coach_registration_deadline', None) or getattr(event, 'start_date', None)


def _coach_deadline_locked_response(user, event):
    if not user or getattr(user, 'is_admin', False):
        return None
    deadline = _get_effective_coach_registration_deadline(event)
    if deadline and timezone.now() > deadline:
        return Response(
            {
                'error': 'Deadline-ul pentru completarea centralizatorului de către antrenori a expirat.',
                'coach_registration_deadline': deadline,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _local_server_creation_blocked_response(what):
    """Blocks creating brand-new records on the venue server.

    Primary keys are assigned independently by each database, and the
    event pack a venue machine runs on only carries the athletes taking
    part - so anything created here takes an id that on cloud belongs to
    an unrelated record. import_event_results refuses such a pack (it
    compares athlete names, see api/sync/import_event_results.py), which
    means a walk-up registered here would be discovered only at the end
    of the day, when the results push fails. Better to say so now, while
    there is still time to add them in cloud and pull them down.
    """
    if not getattr(settings, 'IS_LOCAL_EVENT_SERVER', False):
        return None
    return Response(
        {
            'error': (
                f'{what} nu se poate face pe serverul din sală, pentru că '
                'identificatorii creați aici nu ar corespunde cu cei din cloud, iar '
                'trimiterea rezultatelor ar fi respinsă la final. Adaugă în cloud și '
                'apoi folosește „Resincronizează din cloud”.'
            ),
            'is_local_event_server': True,
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _event_operational_lock_response(event):
    # The lock exists to stop the CLOUD instance from accepting operational
    # edits once an event has been exported to a local venue machine - the
    # local machine is the new authority at that point, so it must be
    # exempt from its own lock, or nothing (weigh-ins, assignments, scores)
    # can be entered there for the rest of the event.
    if getattr(settings, 'IS_LOCAL_EVENT_SERVER', False):
        return None
    if not event or not getattr(event, 'operational_lock_active', False):
        return None
    return Response(
        {
            'error': 'Evenimentul este blocat pentru operare locală. Modificările operaționale în cloud sunt dezactivate.',
            'event_id': event.id,
            'sync_mode': getattr(event, 'sync_mode', None),
            'sync_locked': getattr(event, 'sync_locked', False),
            'local_sync_status': getattr(event, 'local_sync_status', None),
        },
        status=getattr(status, 'HTTP_423_LOCKED', 423),
    )


def _event_operational_guard_response(user, event):
    locked = _event_operational_lock_response(event)
    if locked is not None:
        return locked
    return _coach_deadline_locked_response(user, event)


def _referee_schedule_conflict_warnings(category, referee_ids):
    """Non-blocking check: warns if any of ``referee_ids`` are already
    assigned to another category whose scheduled field time-window
    overlaps this category's. Only compares categories that have a
    concrete ``scheduled_start_time`` on their CategoryFieldAssignment —
    categories without a schedule yet are skipped (nothing to compare)."""
    referee_ids = [rid for rid in referee_ids if rid]
    if not referee_ids:
        return []

    assignment = getattr(category, 'field_assignment', None)
    start = getattr(assignment, 'scheduled_start_time', None)
    if not assignment or not start:
        return []
    end = start + timedelta(minutes=assignment.estimated_duration or 15)

    warnings = []
    others = CategoryRefereeAssignment.objects.filter(
        category__field_assignment__scheduled_start_time__isnull=False
    ).exclude(category_id=category.id).select_related(
        'category__field_assignment', 'referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5'
    )
    for other in others:
        other_assignment = other.category.field_assignment
        other_start = other_assignment.scheduled_start_time
        other_end = other_start + timedelta(minutes=other_assignment.estimated_duration or 15)
        if start < other_end and other_start < end:
            for ref in [other.referee_1, other.referee_2, other.referee_3, other.referee_4, other.referee_5]:
                if ref and ref.id in referee_ids:
                    warnings.append(
                        f'{ref.first_name} {ref.last_name} este deja alocat la categoria '
                        f'"{other.category.name}" într-un interval orar suprapus.'
                    )
    return warnings


def _is_match_assigned_referee(match, athlete):
    if not match or not athlete:
        return False
    if getattr(match, 'central_referee_id', None) == athlete.id:
        return True
    if match.referees.filter(pk=athlete.pk).exists():
        return True

    assignment = getattr(match, 'referee_assignment', None)
    if assignment:
        return athlete.id in {
            assignment.referee_1_id,
            assignment.referee_2_id,
            assignment.referee_3_id,
            assignment.referee_4_id,
            assignment.referee_5_id,
        }
    return False


def _is_category_assigned_referee(category, athlete):
    if not category or not athlete:
        return False
    assignment = getattr(category, 'referee_assignment', None)
    if not assignment:
        return False
    return athlete.id in {
        assignment.referee_1_id,
        assignment.referee_2_id,
        assignment.referee_3_id,
        assignment.referee_4_id,
        assignment.referee_5_id,
    }


def _coerce_bool(value, default=False):
    if value in [None, '']:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def _event_for_team(team):
    if not team:
        return None
    enrollment = team.enrolled_categories.select_related('category__event').first()
    if enrollment and enrollment.category_id:
        return getattr(enrollment.category, 'event', None)
    return None


def _get_active_recording_session(event=None, field=None):
    if not event or not field:
        return None
    return FieldRecordingSession.objects.filter(
        event=event,
        field=field,
        status='recording'
    ).order_by('-started_at', '-id').first()


def _compute_video_offset_ms(recording_session, event_timestamp=None):
    if not recording_session or not getattr(recording_session, 'started_at', None):
        return None
    target_timestamp = event_timestamp or timezone.now()
    delta_ms = int((target_timestamp - recording_session.started_at).total_seconds() * 1000)
    return max(delta_ms, 0)


def _resolve_recording_session(request, *, event=None, field=None):
    recording_session_id = request.data.get('recording_session') or request.query_params.get('recording_session')
    if recording_session_id:
        try:
            return FieldRecordingSession.objects.get(pk=recording_session_id)
        except FieldRecordingSession.DoesNotExist:
            raise ValidationError({'recording_session': 'Recording session not found.'})
    return _get_active_recording_session(event=event, field=field)


REAL_TIME_POINT_VALIDATION_WINDOW_MS = 1500
REAL_TIME_POINT_EVENT_CANDIDATE_LOOKBACK_MS = 5000


def _get_point_event_round_signature(event):
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    round_id = metadata.get('round_id')
    round_number = metadata.get('round')
    return round_id, round_number


def _get_point_event_comparison_timestamp_ms(event):
    metadata = event.metadata if isinstance(event.metadata, dict) else {}
    client_timestamp = metadata.get('client_timestamp_ms')
    try:
        if client_timestamp not in [None, '']:
            return int(client_timestamp)
    except (TypeError, ValueError):
        pass

    timestamp = getattr(event, 'timestamp', None)
    if not timestamp:
        return None
    try:
        return int(timestamp.timestamp() * 1000)
    except Exception:
        return None


def _auto_validate_real_time_point_event(event):
    if not event or getattr(getattr(event, 'match', None), 'display_mode', None) != 'real_time':
        return [event] if event else []

    if event.event_type != 'score':
        return [event] if event else []

    window_start = event.timestamp - timedelta(milliseconds=REAL_TIME_POINT_EVENT_CANDIDATE_LOOKBACK_MS)
    window_end = event.timestamp + timedelta(milliseconds=REAL_TIME_POINT_EVENT_CANDIDATE_LOOKBACK_MS)
    round_id, round_number = _get_point_event_round_signature(event)
    event_comparison_timestamp = _get_point_event_comparison_timestamp_ms(event)

    # Doar evenimentele inca in asteptare pot corobora. Unul deja validat
    # si-a consumat faza: daca l-am lasa sa sprijine si punctul urmator,
    # o singura apasare a unui coleg ar valida doua faze diferite - la doi
    # pumni la o secunda distanta, al doilea punct s-ar valida singur, pe
    # baza confirmarii primite pentru primul.
    candidates = RefereePointEvent.objects.filter(
        match_id=event.match_id,
        side=event.side,
        points=event.points,
        event_type=event.event_type,
        validation_status='pending',
        timestamp__gte=window_start,
        timestamp__lte=window_end,
    ).select_related('match', 'referee').order_by('timestamp', 'id')

    def _distance_ms(candidate):
        candidate_ts = _get_point_event_comparison_timestamp_ms(candidate)
        if event_comparison_timestamp is not None and candidate_ts is not None:
            return abs(candidate_ts - event_comparison_timestamp)
        try:
            return abs(int((candidate.timestamp - event.timestamp).total_seconds() * 1000))
        except Exception:
            return 0

    # Cel mult un eveniment de fiecare arbitru: cel mai apropiat in timp de
    # cel care declanseaza verificarea. Un arbitru care apasa de doua ori
    # pentru aceeasi faza - din graba sau din nervi - nu trebuie sa produca
    # doua puncte doar pentru ca un coleg a apasat o data. Apasarea in plus
    # ramane in asteptare si nu intra in scor.
    best_by_referee = {}
    for candidate in candidates:
        candidate_comparison_timestamp = _get_point_event_comparison_timestamp_ms(candidate)
        if event_comparison_timestamp is not None and candidate_comparison_timestamp is not None:
            diff_ms = abs(candidate_comparison_timestamp - event_comparison_timestamp)
            if diff_ms >= REAL_TIME_POINT_VALIDATION_WINDOW_MS:
                continue
        candidate_round_id, candidate_round_number = _get_point_event_round_signature(candidate)
        if round_id and candidate_round_id and candidate_round_id != round_id:
            continue
        if not round_id and round_number and candidate_round_number and candidate_round_number != round_number:
            continue

        previous = best_by_referee.get(candidate.referee_id)
        if previous is None or _distance_ms(candidate) < _distance_ms(previous):
            best_by_referee[candidate.referee_id] = candidate

    matched_events = list(best_by_referee.values())

    unique_referees = {item.referee_id for item in matched_events if item.referee_id}
    if len(unique_referees) < 2:
        return []

    validated_at = timezone.now()
    RefereePointEvent.objects.filter(
        id__in=[item.id for item in matched_events],
        validation_status='pending',
    ).update(validation_status='validated', validated_at=validated_at)

    return list(RefereePointEvent.objects.filter(id__in=[item.id for item in matched_events]).order_by('timestamp', 'id'))


def _log_category_score_event(*, athlete_score, referee, action, source, created_by=None, score_value=None, previous_score=None, notes=None, recording_session=None, metadata=None):
    CategoryRefereeScoreEvent.objects.create(
        athlete_score=athlete_score,
        referee=referee,
        action=action,
        source=source,
        score_value=score_value,
        previous_score=previous_score,
        notes=notes,
        created_by=created_by,
        recording_session=recording_session,
        video_offset_ms=_compute_video_offset_ms(recording_session),
        metadata=metadata or {},
    )


def aggregate_validated_point_phases(events):
    """Punctele validate, numarate pe FAZE, nu pe evenimente.

    O faza confirmata de doi arbitri produce cate un rand de la fiecare.
    Adunate, dau dublu - iar cu cinci arbitri, de cinci ori. Numarul asta
    e cel dupa care se dau medaliile, deci se calculeaza aici, pe server,
    si nu se mai recalculeaza in fiecare interfata.

    Regula e aceeasi cu a validarii (_auto_validate_real_time_point_event):
    aceeasi repriza, aceeasi parte, aceeasi valoare, la mai putin de
    REAL_TIME_POINT_VALIDATION_WINDOW_MS distanta. O faza intra in scor
    doar daca au confirmat-o cel putin doi arbitri distincti.
    """
    scored = [
        e for e in events
        if e.validation_status == 'validated' and e.event_type not in ('penalty', 'deduction')
    ]
    scored.sort(key=lambda e: (_get_point_event_comparison_timestamp_ms(e) or 0, e.id))

    groups = {}
    for event in scored:
        round_id, round_number = _get_point_event_round_signature(event)
        key = (round_id or round_number or 'unassigned', event.side, event.points, event.event_type)
        stamp = _get_point_event_comparison_timestamp_ms(event) or 0
        bucket = groups.setdefault(key, [])
        if bucket and stamp - bucket[-1]['anchor'] < REAL_TIME_POINT_VALIDATION_WINDOW_MS:
            bucket[-1]['referees'].add(event.referee_id)
        else:
            bucket.append({'anchor': stamp, 'event': event, 'referees': {event.referee_id}})

    red = blue = 0
    for bucket in groups.values():
        for phase in bucket:
            if len(phase['referees']) < 2:
                continue
            if phase['event'].side == 'blue':
                blue += phase['event'].points or 0
            else:
                red += phase['event'].points or 0
    return red, blue


def _sync_point_events_to_match_referee_scores(match_id, referee_id):
    match = Match.objects.filter(pk=match_id).first()
    if not match:
        return

    events = RefereePointEvent.objects.filter(
        match_id=match_id,
        referee_id=referee_id,
        validation_status='validated',
    ).order_by('timestamp', 'id')

    totals_by_round = {}
    for event in events:
        metadata = event.metadata or {}
        round_id = metadata.get('round_id')
        round_number = metadata.get('round')
        key = round_id or round_number
        if key in [None, '']:
            continue
        bucket = totals_by_round.setdefault(key, {
            'round_id': round_id,
            'round_number': round_number,
            'red': 0,
            'blue': 0,
        })
        if event.side == 'red':
            bucket['red'] += event.points or 0
        elif event.side == 'blue':
            bucket['blue'] += event.points or 0

    kept_score_ids = []
    for data in totals_by_round.values():
        round_obj = None
        if data['round_id']:
            round_obj = MatchRound.objects.filter(pk=data['round_id'], match_id=match_id).first()
        if round_obj is None and data['round_number'] not in [None, '']:
            round_obj = MatchRound.objects.filter(match_id=match_id, round_number=data['round_number']).first()
        if round_obj is None:
            continue
        score_obj, _ = MatchRefereeScore.objects.update_or_create(
            match_id=match_id,
            referee_id=referee_id,
            round=round_obj,
            defaults={
                'red_corner_score': data['red'],
                'blue_corner_score': data['blue'],
                'notes': 'Auto-aggregated from referee point events',
            }
        )
        kept_score_ids.append(score_obj.id)

    stale_scores = MatchRefereeScore.objects.filter(match_id=match_id, referee_id=referee_id).exclude(round__isnull=True)
    if kept_score_ids:
        stale_scores = stale_scores.exclude(id__in=kept_score_ids)
    stale_scores.delete()
