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


def _event_operational_lock_response(event):
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

    candidates = RefereePointEvent.objects.filter(
        match_id=event.match_id,
        side=event.side,
        points=event.points,
        event_type=event.event_type,
        timestamp__gte=window_start,
        timestamp__lte=window_end,
    ).exclude(validation_status='rejected').select_related('match', 'referee').order_by('timestamp', 'id')

    matched_events = []
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
        matched_events.append(candidate)

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
