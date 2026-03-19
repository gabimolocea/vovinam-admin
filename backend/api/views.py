from django.shortcuts import render
from datetime import datetime, timedelta
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from django.db import models
from django.db.models import Prefetch, Q
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import ValidationError
from .serializers import *
from .models import *
from .permissions import IsAdminOrReadOnly, IsAdmin, IsOwnerOrAdmin, IsClubCoachOrAdmin, IsAthleteOwnerCoachOrAdmin
from rest_framework.response import Response
from rest_framework.reverse import reverse
from django.conf import settings
from django.core.files.base import ContentFile
import logging
from pathlib import Path

# Ensure logger output appears in the console for debugging
logging.basicConfig(level=logging.WARNING, format='%(asctime)s %(levelname)s %(name)s %(message)s')
from django.db import IntegrityError
# Create your views here.


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


class RefereeAssignedCategoriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            athlete = request.user.athlete
        except Exception:
            return Response([], status=status.HTTP_200_OK)

        assignments = CategoryRefereeAssignment.objects.filter(
            Q(referee_1=athlete) |
            Q(referee_2=athlete) |
            Q(referee_3=athlete) |
            Q(referee_4=athlete) |
            Q(referee_5=athlete)
        ).select_related('category', 'category__group', 'category__field_assignment__field')

        # Build set of category IDs currently live on a monitor
        cat_ids = [a.category_id for a in assignments]
        live_category_ids = set(
            DisplayMonitorSession.objects.filter(
                current_category__in=cat_ids,
            ).exclude(status='idle').values_list('current_category_id', flat=True)
        )

        data = []
        for assignment in assignments:
            cat = assignment.category
            field_assignment = getattr(cat, 'field_assignment', None)
            field = field_assignment.field if field_assignment else None
            referee_position = next(
                (f'A{i}' for i in range(1, 6) if getattr(assignment, f'referee_{i}_id', None) == athlete.id),
                None,
            )

            # Priority: monitor session displaying > field assignment status
            if cat.id in live_category_ids:
                fs = 'in_progress'
            elif field_assignment:
                fs = field_assignment.status
            else:
                fs = None

            data.append({
                'id': cat.id,
                'name': cat.name,
                'type': cat.type,
                'gender': cat.gender,
                'group_name': cat.group.name if getattr(cat, 'group', None) else None,
                'field_status': fs,
                'field_id': field.id if field else None,
                'field_name': field.name if field else None,
                'field_number': field.field_number if field else None,
                'referee_position': referee_position,
            })

        return Response(data)


class RefereeAssignedMatchesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            athlete = request.user.athlete
        except Exception:
            return Response([], status=status.HTTP_200_OK)

        assignments = MatchRefereeAssignment.objects.filter(
            Q(referee_1=athlete) |
            Q(referee_2=athlete) |
            Q(referee_3=athlete) |
            Q(referee_4=athlete) |
            Q(referee_5=athlete)
        ).select_related(
            'match',
            'match__field',
            'match__field_assignment__field',
            'match__category',
            'match__category__field_assignment__field',
        )

        position_by_match_id = {
            assignment.match_id: next(
                (f'A{i}' for i in range(1, 6) if getattr(assignment, f'referee_{i}_id', None) == athlete.id),
                None,
            )
            for assignment in assignments
        }
        match_by_id = {assignment.match_id: assignment.match for assignment in assignments}

        match_ids = assignments.values_list('match_id', flat=True)
        matches = Match.objects.filter(pk__in=match_ids).select_related('category')
        serializer = MatchSerializer(matches, many=True)
        result = serializer.data

        # Build set of match IDs currently live on a monitor
        live_match_ids = set(
            DisplayMonitorSession.objects.filter(
                current_match__in=match_ids,
                status='displaying',
            ).values_list('current_match_id', flat=True)
        )

        # Annotate field_status: check MatchFieldAssignment, monitor session,
        # and CategoryFieldAssignment (in priority order)
        for item in result:
            mid = item.get('id')
            match_obj = match_by_id.get(mid)
            match_field_assignment = getattr(match_obj, 'field_assignment', None) if match_obj else None
            category_obj = getattr(match_obj, 'category', None) if match_obj else None
            category_field_assignment = getattr(category_obj, 'field_assignment', None) if category_obj else None

            resolved_field = None
            if match_field_assignment and match_field_assignment.field:
                resolved_field = match_field_assignment.field
            elif getattr(match_obj, 'field', None):
                resolved_field = match_obj.field
            elif category_field_assignment and category_field_assignment.field:
                resolved_field = category_field_assignment.field

            # 1. If the match is currently displayed on a monitor → in_progress
            if mid in live_match_ids:
                item['field_status'] = 'in_progress'
            else:
                # 2. Check the match's own MatchFieldAssignment
                if match_field_assignment and match_field_assignment.status:
                    item['field_status'] = match_field_assignment.status
                # 3. Fallback: check CategoryFieldAssignment
                elif category_field_assignment:
                    item['field_status'] = category_field_assignment.status
                else:
                    item['field_status'] = None

            item['field_id'] = resolved_field.id if resolved_field else item.get('field_id')
            item['field_name'] = resolved_field.name if resolved_field else item.get('field_name')
            item['field_number'] = resolved_field.field_number if resolved_field else item.get('field_number')
            item['referee_position'] = position_by_match_id.get(mid)

        return Response(result)


@api_view(['GET'])
@permission_classes([AllowAny])
def athlete_detail(request, pk):
    """Public-facing athlete detail endpoint used by the frontend.

    This complements the ViewSet detail route which may not always be available
    during dynamic registrations in development. Returning this as a plain
    function-based view ensures a stable URL for public athlete pages.
    """
    try:
        athlete = Athlete.objects.get(pk=pk)
    except Athlete.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=404)
    serializer = AthleteSerializer(athlete, context={'request': request})
    return Response(serializer.data)


@api_view(["GET"])
def health(request):
    """Simple health endpoint used by CI readiness checks."""
    # Check database connectivity
    db_status = "ok"
    db_error = None
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as e:
        db_status = "failed"
        db_error = str(e)

    payload = {"status": "ok", "database": db_status}
    if db_error:
        if getattr(settings, 'DEBUG', False):
            payload["database_error"] = db_error[:200]
        else:
            payload["database_error"] = "unavailable"
    return Response(payload)


@api_view(["GET"])
def get_csrf_token(request):
    """
    Returns a CSRF token for the frontend to use.
    This endpoint ensures the csrftoken cookie is set.
    """
    from django.middleware.csrf import get_token
    return Response({'csrfToken': get_token(request)})

@api_view(['GET'])
def get_category_referees(request, pk):
    """
    Get the list of assigned referees for a category (via CategoryAthleteScore).
    Used by admin to filter referee dropdown.
    """
    try:
        athlete_score = CategoryAthleteScore.objects.select_related(
            'category__referee_assignment'
        ).get(pk=pk)
        
        if not athlete_score.category:
            return Response({'referees': []})
        
        try:
            assignment = athlete_score.category.referee_assignment
            referees = []
            for i in range(1, 6):
                ref = getattr(assignment, f'referee_{i}', None)
                if ref:
                    referees.append({
                        'id': ref.id,
                        'name': f"{ref.first_name} {ref.last_name}",
                        'position': f'R{i}'
                    })
            return Response({'referees': referees})
        except:
            return Response({'referees': []})
    except CategoryAthleteScore.DoesNotExist:
        return Response({'referees': []}, status=404)


class CityViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = City.objects.all()
    serializer_class = CitySerializer

    def list(self, request):
        queryset = City.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """Return a single athlete by PK."""
        try:
            instance = self.queryset.get(pk=pk)
        except Athlete.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)
    
class CompetitionViewSet(viewsets.ViewSet):
    """
    Compatibility viewset: expose Events marked as competition under the legacy /competitions/ endpoint.
    This returns a list of competitions with nested categories like the old Competition model used to provide.
    """
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        from landing.models import Event
        event_type = request.query_params.get('event_type') or 'competition'
        events = Event.objects.filter(event_type=event_type)
        status_filter = request.query_params.get('status')
        if status_filter:
            events = events.filter(status=status_filter)
        elif event_type == 'competition' and request.user.is_authenticated and request.user.role == 'referee' and not request.user.is_admin:
            events = events.filter(status='ongoing')
        # Prefetch categories + field assignments to avoid N+1 queries
        events = events.prefetch_related(
            'categories__field_assignment__field'
        )
        data = []
        for ev in events:
            cats = []
            for cat in ev.categories.all():
                assignment = getattr(cat, 'field_assignment', None)
                field = assignment.field if assignment else None
                cats.append({
                    'id': cat.id,
                    'name': cat.name,
                    'type': cat.type,
                    'gender': cat.gender,
                    'field_status': assignment.status if assignment else None,
                    'field_id': field.id if field else None,
                    'field_name': field.name if field else None,
                    'field_number': field.field_number if field else None,
                })
            data.append({
                'id': ev.id,
                'name': ev.title,
                'place': ev.address,
                'address': ev.address,
                'city': ev.city_id,
                'city_name': ev.city.name if ev.city_id else None,
                'start_date': ev.start_date,
                'end_date': ev.end_date,
                'coach_registration_deadline': ev.coach_registration_deadline,
                'effective_coach_registration_deadline': getattr(ev, 'effective_coach_registration_deadline', ev.start_date),
                'event_type': ev.event_type,
                'status': getattr(ev, 'status', None),
                'sync_mode': ev.sync_mode,
                'sync_locked': ev.sync_locked,
                'local_sync_status': ev.local_sync_status,
                'exported_to_local_at': ev.exported_to_local_at,
                'results_uploaded_at': getattr(ev, 'results_uploaded_at', None),
                'sync_completed_at': getattr(ev, 'sync_completed_at', None),
                'operational_lock_active': getattr(ev, 'operational_lock_active', False),
                'description': ev.description,
                'categories': cats
            })
        return Response(data)

    def _serialize_event(self, ev, include_categories=False):
        """Helper to serialize an Event into the competition response format."""
        data = {
            'id': ev.id,
            'name': ev.title,
            'place': ev.address,
            'address': ev.address,
            'city': ev.city_id,
            'city_name': ev.city.name if ev.city_id else None,
            'start_date': ev.start_date,
            'end_date': ev.end_date,
            'coach_registration_deadline': ev.coach_registration_deadline,
            'effective_coach_registration_deadline': getattr(ev, 'effective_coach_registration_deadline', ev.start_date),
            'event_type': ev.event_type,
            'status': getattr(ev, 'status', None),
            'sync_mode': ev.sync_mode,
            'sync_locked': ev.sync_locked,
            'local_sync_status': ev.local_sync_status,
            'exported_to_local_at': ev.exported_to_local_at,
            'results_uploaded_at': getattr(ev, 'results_uploaded_at', None),
            'sync_completed_at': getattr(ev, 'sync_completed_at', None),
            'operational_lock_active': getattr(ev, 'operational_lock_active', False),
            'description': ev.description,
        }
        if include_categories:
            cats = []
            for cat in Category.objects.filter(event=ev).select_related('field_assignment__field'):
                assignment = getattr(cat, 'field_assignment', None)
                field = assignment.field if assignment else None
                cats.append({
                    'id': cat.id,
                    'name': cat.name,
                    'type': cat.type,
                    'gender': cat.gender,
                    'field_status': assignment.status if assignment else None,
                    'field_id': field.id if field else None,
                    'field_name': field.name if field else None,
                    'field_number': field.field_number if field else None,
                })
            data['categories'] = cats
        return data

    def _parse_event_datetime(self, value, fallback=None):
        if value in [None, '']:
            return fallback
        parsed = parse_datetime(value)
        if parsed is not None:
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            return parsed
        parsed_date = parse_date(value)
        if parsed_date is not None:
            return timezone.make_aware(datetime.combine(parsed_date, datetime.min.time()))
        raise ValidationError({'start_date': ['Invalid date format.']})

    def _default_coach_deadline(self, start_dt):
        return start_dt

    def retrieve(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
            status_filter = request.query_params.get('status')
            if status_filter and ev.status != status_filter:
                return Response({'detail': 'Not found.'}, status=404)
            if request.user.is_authenticated and request.user.role == 'referee' and not request.user.is_admin:
                if ev.status != 'ongoing':
                    return Response({'detail': 'Not found.'}, status=404)
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        return Response(self._serialize_event(ev, include_categories=True))

    def create(self, request):
        from landing.models import Event
        from .models import City
        from django.utils.text import slugify
        d = request.data
        title = d.get('name', '').strip()
        if not title:
            return Response({'name': ['This field is required.']}, status=400)
        start_date = d.get('start_date')
        if not start_date:
            return Response({'start_date': ['This field is required.']}, status=400)
        try:
            parsed_start_date = self._parse_event_datetime(start_date)
            parsed_end_date = self._parse_event_datetime(d.get('end_date'), fallback=parsed_start_date)
        except ValidationError as exc:
            return Response(exc.detail, status=400)
        city = None
        city_id = d.get('city')
        if city_id not in [None, '']:
            city = City.objects.filter(pk=city_id).first()
            if not city:
                return Response({'city': ['Invalid city selected.']}, status=400)
        # Build a unique slug
        base_slug = slugify(title) or 'competition'
        slug = base_slug
        counter = 1
        while Event.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{counter}'
            counter += 1
        coach_deadline = self._parse_event_datetime(
            d.get('coach_registration_deadline'),
            fallback=self._default_coach_deadline(parsed_start_date),
        )
        exported_to_local_at = self._parse_event_datetime(d.get('exported_to_local_at'))
        results_uploaded_at = self._parse_event_datetime(d.get('results_uploaded_at'))
        sync_completed_at = self._parse_event_datetime(d.get('sync_completed_at'))
        ev = Event.objects.create(
            title=title,
            slug=slug,
            address=d.get('address', '') or d.get('location', '') or d.get('place', ''),
            city=city,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
            coach_registration_deadline=coach_deadline,
            description=d.get('description', ''),
            event_type='competition',
            status=d.get('status', 'upcoming'),
            sync_mode=d.get('sync_mode', 'cloud') or 'cloud',
            sync_locked=_coerce_bool(d.get('sync_locked'), default=False),
            local_sync_status=d.get('local_sync_status', 'idle') or 'idle',
            exported_to_local_at=exported_to_local_at,
            results_uploaded_at=results_uploaded_at,
            sync_completed_at=sync_completed_at,
        )
        return Response(self._serialize_event(ev), status=201)

    def partial_update(self, request, pk=None):
        from landing.models import Event
        from .models import City
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        d = request.data
        sync_only_fields = {'sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at', 'results_uploaded_at', 'sync_completed_at'}
        requested_fields = set(d.keys())
        if getattr(ev, 'operational_lock_active', False) and requested_fields - sync_only_fields:
            locked = _event_operational_lock_response(ev)
            if locked is not None:
                return locked
        if 'name' in d:
            ev.title = d['name']
        if 'address' in d or 'location' in d or 'place' in d:
            ev.address = d.get('address', d.get('location', d.get('place', ev.address)))
        if 'city' in d:
            city_id = d.get('city')
            if city_id in [None, '']:
                ev.city = None
            else:
                city = City.objects.filter(pk=city_id).first()
                if not city:
                    return Response({'city': ['Invalid city selected.']}, status=400)
                ev.city = city
        if 'start_date' in d:
            try:
                ev.start_date = self._parse_event_datetime(d['start_date'], fallback=ev.start_date)
            except ValidationError as exc:
                return Response(exc.detail, status=400)
        if 'end_date' in d:
            try:
                ev.end_date = self._parse_event_datetime(d['end_date'], fallback=ev.end_date)
            except ValidationError as exc:
                return Response(exc.detail, status=400)
        if 'coach_registration_deadline' in d:
            try:
                ev.coach_registration_deadline = self._parse_event_datetime(
                    d.get('coach_registration_deadline'),
                    fallback=self._default_coach_deadline(ev.start_date),
                )
            except ValidationError as exc:
                return Response({'coach_registration_deadline': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        elif 'start_date' in d and not ev.coach_registration_deadline:
            ev.coach_registration_deadline = self._default_coach_deadline(ev.start_date)
        if 'description' in d:
            ev.description = d['description']
        if 'status' in d:
            ev.status = d['status']
        if 'sync_mode' in d:
            ev.sync_mode = d.get('sync_mode') or ev.sync_mode
        if 'sync_locked' in d:
            ev.sync_locked = _coerce_bool(d.get('sync_locked'), default=ev.sync_locked)
        if 'local_sync_status' in d:
            ev.local_sync_status = d.get('local_sync_status') or ev.local_sync_status
        if 'exported_to_local_at' in d:
            try:
                ev.exported_to_local_at = self._parse_event_datetime(d.get('exported_to_local_at'))
            except ValidationError as exc:
                return Response({'exported_to_local_at': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        if 'results_uploaded_at' in d:
            try:
                ev.results_uploaded_at = self._parse_event_datetime(d.get('results_uploaded_at'))
            except ValidationError as exc:
                return Response({'results_uploaded_at': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        if 'sync_completed_at' in d:
            try:
                ev.sync_completed_at = self._parse_event_datetime(d.get('sync_completed_at'))
            except ValidationError as exc:
                return Response({'sync_completed_at': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        ev.save()
        return Response(self._serialize_event(ev, include_categories=True))

    @action(detail=True, methods=['post'], url_path='complete-local-sync')
    def complete_local_sync(self, request, pk=None):
        from landing.models import Event

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if ev.local_sync_status not in {'results_uploaded', 'completed'}:
            return Response(
                {'detail': 'Event results must be imported from local before sync can be completed.'},
                status=400,
            )

        ev.complete_local_sync()
        ev.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'sync_completed_at'])
        return Response(self._serialize_event(ev, include_categories=True), status=200)

    @action(detail=True, methods=['post'], url_path='mark-results-uploaded')
    def mark_results_uploaded(self, request, pk=None):
        from landing.models import Event

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not ev.sync_locked:
            return Response({'detail': 'Event must be locked for local operation.'}, status=400)

        ev.mark_results_uploaded()
        ev.save(update_fields=['local_sync_status', 'results_uploaded_at'])
        return Response(self._serialize_event(ev, include_categories=True), status=200)

    @action(detail=True, methods=['post'], url_path='mark-local-in-progress')
    def mark_local_in_progress(self, request, pk=None):
        from landing.models import Event

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not ev.sync_locked:
            return Response({'detail': 'Event must be locked for local operation.'}, status=400)
        if ev.local_sync_status not in {'exported', 'local_in_progress'}:
            return Response({'detail': 'Event must be exported for local operation before it can be marked as in progress.'}, status=400)

        ev.mark_local_in_progress()
        ev.save(update_fields=['local_sync_status'])
        return Response(self._serialize_event(ev, include_categories=True), status=200)

    @action(detail=True, methods=['post'], url_path='generate-standard-groups-categories')
    def generate_standard_groups_categories(self, request, pk=None):
        from landing.models import Event
        from .competition_defaults import ensure_standard_competition_groups_and_categories

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        result = ensure_standard_competition_groups_and_categories(ev)
        return Response({
            'detail': 'Standard groups and categories generated successfully.',
            'result': result,
            'competition': self._serialize_event(ev, include_categories=True),
        })

    def destroy(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        ev.delete()
        return Response(status=204)

    @action(detail=True, methods=['get'], permission_classes=[IsAdminOrReadOnly], url_path='stats')
    def stats(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        categories = Category.objects.filter(event=ev)
        fields_active = CompetitionField.objects.filter(event=ev).count()

        referee_ids = set()
        for assignment in CategoryRefereeAssignment.objects.filter(category__in=categories):
            for ref in [assignment.referee_1, assignment.referee_2, assignment.referee_3, assignment.referee_4, assignment.referee_5]:
                if ref_id := getattr(ref, 'id', None):
                    referee_ids.add(ref_id)

        match_ids = Match.objects.filter(category__in=categories).values_list('id', flat=True)
        for assignment in MatchRefereeAssignment.objects.filter(match_id__in=match_ids):
            for ref in [assignment.referee_1, assignment.referee_2, assignment.referee_3, assignment.referee_4, assignment.referee_5]:
                if ref_id := getattr(ref, 'id', None):
                    referee_ids.add(ref_id)

        scores_submitted = (
            CategoryRefereeScore.objects.filter(athlete_score__category__in=categories).count()
            + MatchRefereeScore.objects.filter(match__category__in=categories).count()
        )

        pending_approval = CategoryAthleteScore.objects.filter(category__in=categories, status='pending').count()

        return Response({
            'fields_active': fields_active,
            'referees_assigned': len(referee_ids),
            'scores_submitted': scores_submitted,
            'pending_approval': pending_approval,
        })
    

class ClubViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = Club.objects.all()
    serializer_class = ClubSerializer

    def list(self, request):
        queryset = Club.objects.all().order_by('display_order', 'name')
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder clubs.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each club based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        for idx, club_id in enumerate(order):
            Club.objects.filter(pk=club_id).update(display_order=idx)
        return Response({'status': 'ok'})

class OfflineSyncViewSet(viewsets.ViewSet):
    """Offline snapshot and results upload endpoints for competition manager."""
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='event-pack')
    def event_pack(self, request):
        event_id = request.query_params.get('event_id')
        if not event_id:
            return Response({'detail': 'event_id query param is required.'}, status=400)

        try:
            from .sync.export_event_pack import build_event_pack

            payload = build_event_pack(event_id=int(event_id))
            event = Event.objects.get(pk=payload['event']['id'])
            event.mark_exported_to_local(exported_at=payload['manifest']['exported_at'])
            event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at'])

            return Response(payload)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=404)

    @action(detail=False, methods=['post'], url_path='event-pack/import')
    def import_event_pack(self, request):
        try:
            from .sync.import_event_pack import import_event_pack

            return Response(import_event_pack(request.data), status=200)
        except (DjangoValidationError, ValidationError) as exc:
            detail = getattr(exc, 'message_dict', None) or getattr(exc, 'detail', None) or str(exc)
            return Response({'detail': detail}, status=400)

    @action(detail=False, methods=['get'], url_path='event-results')
    def event_results(self, request):
        event_id = request.query_params.get('event_id')
        if not event_id:
            return Response({'detail': 'event_id query param is required.'}, status=400)

        try:
            from .sync.export_event_results import build_event_results_pack

            return Response(build_event_results_pack(event_id=int(event_id)))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=404)

    @action(detail=False, methods=['post'], url_path='event-results/import')
    def import_event_results(self, request):
        try:
            from .sync.import_event_results import import_event_results

            return Response(import_event_results(request.data), status=200)
        except (DjangoValidationError, ValidationError) as exc:
            detail = getattr(exc, 'message_dict', None) or getattr(exc, 'detail', None) or str(exc)
            return Response({'detail': detail}, status=400)

    @action(detail=False, methods=['get'], url_path='athletes')
    def athletes(self, request):
        athletes = Athlete.objects.filter(status='approved', is_deleted=False)
        serializer = OfflineAthleteSerializer(athletes, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='clubs')
    def clubs(self, request):
        clubs = Club.objects.all()
        serializer = OfflineClubSerializer(clubs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='competition-pack')
    def competition_pack(self, request):
        from landing.models import Event

        competitions = Event.objects.filter(event_type='competition')
        categories = Category.objects.filter(event__in=competitions)
        matches = Match.objects.filter(category__in=categories)

        return Response({
            'competitions': OfflineCompetitionSerializer(competitions, many=True).data,
            'categories': OfflineCategorySerializer(categories, many=True).data,
            'matches': OfflineMatchSerializer(matches, many=True).data,
        })

    @action(detail=False, methods=['post'], url_path='results')
    def results(self, request):
        results = request.data.get('results', [])
        if not isinstance(results, list):
            return Response({'detail': 'results must be a list'}, status=400)

        created = []
        failed = []

        for item in results:
            try:
                category_id = item.get('category_id') or item.get('category')
                if not category_id:
                    raise ValidationError({'category_id': 'This field is required.'})

                category = Category.objects.get(pk=category_id)
                result_type = item.get('type') or category.type
                score = item.get('score')
                placement_claimed = item.get('placement_claimed')
                notes = item.get('notes')

                payload = {
                    'category': category.id,
                    'type': result_type,
                    'score': score,
                    'placement_claimed': placement_claimed,
                    'notes': notes,
                    'submitted_by_athlete': False,
                    'status': 'pending'
                }

                if result_type == 'teams':
                    team_member_ids = item.get('team_member_ids') or item.get('team_members') or []
                    team_name = item.get('team_name')
                    payload['team_members'] = team_member_ids
                    payload['team_name'] = team_name
                    serializer = OfflineCategoryAthleteScoreSerializer(data=payload)
                    serializer.is_valid(raise_exception=True)
                    obj = serializer.save()
                else:
                    athlete_id = item.get('athlete_id') or item.get('athlete')
                    if not athlete_id:
                        raise ValidationError({'athlete_id': 'This field is required for solo/fight results.'})
                    payload['athlete'] = athlete_id
                    serializer = OfflineCategoryAthleteScoreSerializer(data=payload)
                    serializer.is_valid(raise_exception=True)
                    obj = serializer.save()

                created.append({'id': obj.id, 'category': obj.category_id})
            except Exception as exc:
                failed.append({'item': item, 'error': str(exc)})

        return Response({
            'created': created,
            'failed': failed,
        })

class AthleteViewSet(viewsets.ModelViewSet):
    """Public athlete endpoints plus profile creation and admin actions.

    - list/retrieve: public (AllowAny)
    - create/update: authenticated users (profile creation uses AthleteProfileSerializer)
    - admin-only actions: approve/process_application
    """
    queryset = Athlete.objects.all()
    serializer_class = AthleteSerializer
    
    def get_permissions(self):
        """Use different permissions based on action"""
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [IsClubCoachOrAdmin()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        """Use minimal serializer for list, full for detail"""
        if self.action == 'retrieve':
            return AthleteDetailSerializer
        return AthleteMinimalSerializer

    def get_queryset(self):
        """Optimize queryset with select_related and prefetch_related"""
        queryset = Athlete.objects.select_related(
            'user',
            'club',
            'city',
            'current_grade',
            'federation_role',
            'title',
            'reviewed_by'
        ).prefetch_related(
            'grade_history',
            'visas',
            'team_members'
        )
        
        # Apply filters
        club_id = self.request.query_params.get('club')
        if club_id:
            queryset = queryset.filter(club_id=club_id)

        # my_club filter — returns athletes from the authenticated user's club
        my_club = self.request.query_params.get('my_club')
        if my_club and str(my_club).lower() in ('1', 'true', 'yes'):
            user = self.request.user
            if user and user.is_authenticated and hasattr(user, 'athlete') and user.athlete and user.athlete.club_id:
                queryset = queryset.filter(club_id=user.athlete.club_id)
            else:
                queryset = queryset.none()
        
        return queryset

    def list(self, request):
        # Support optional filtering by coach status and simple search
        is_coach = request.query_params.get('is_coach')
        is_referee = request.query_params.get('is_referee')
        queryset = self.get_queryset()
        if is_coach is not None:
            if str(is_coach).lower() in ('1', 'true', 'yes'):
                queryset = queryset.filter(is_coach=True)
            else:
                queryset = queryset.filter(is_coach=False)

        if is_referee is not None:
            if str(is_referee).lower() in ('1', 'true', 'yes'):
                queryset = queryset.filter(is_referee=True)
            else:
                queryset = queryset.filter(is_referee=False)

        q = request.query_params.get('q')
        if q:
            queryset = queryset.filter(models.Q(first_name__icontains=q) | models.Q(last_name__icontains=q))

        serializer = self.get_serializer_class()
        ser = serializer(queryset, many=True)
        return Response(ser.data)

    def retrieve(self, request, pk=None):
        athlete = self.get_object()
        serializer = self.get_serializer_class()
        ser = serializer(athlete)
        return Response(ser.data)

    def create(self, request):
        """Create athlete profile.
        
        - Coaches can create athletes for their own club (no user link).
        - Regular users create their own profile (linked to their user account).
        """
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        # Check if this is a coach creating an athlete for their club
        is_coach = hasattr(request.user, 'athlete') and request.user.athlete and request.user.athlete.is_coach
        coach_create = request.data.get('coach_create', False)

        if is_coach and coach_create:
            # Coach creating athlete for their club
            serializer = AthleteSerializer(data=request.data, context={'request': request})
            if serializer.is_valid():
                club = request.user.athlete.club
                athlete = serializer.save(club=club, status='approved')
                # Handle profile image upload
                if 'profile_image' in request.FILES:
                    athlete.profile_image = request.FILES['profile_image']
                    athlete.save()
                return Response(AthleteSerializer(athlete).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Regular user creating their own profile
        if hasattr(request.user, 'athlete') and request.user.athlete:
            return Response({'error': 'You already have an athlete profile.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AthleteProfileSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            athlete = serializer.save(user=request.user, status='pending')
            return Response(AthleteProfileSerializer(athlete).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, pk=None):
        # Allow partial updates via AthleteProfileSerializer when editing own profile
        athlete = self.get_object()
        # Only allow owner or admin to update
        if athlete.user != request.user and not (request.user and request.user.is_admin):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        serializer = AthleteProfileSerializer(athlete, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            updated = serializer.save()
            return Response(AthleteProfileSerializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        athlete = self.get_object()
        if athlete.status != 'pending':
            return Response({'error': 'Athlete profile is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            athlete.approve(request.user)
            return Response({'message': 'Athlete profile approved successfully', 'athlete_id': athlete.id})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def process_application(self, request, pk=None):
        athlete = self.get_object()
        serializer = AthleteProfileApprovalSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        action = serializer.validated_data['action']
        notes = serializer.validated_data.get('notes', '')
        if athlete.status != 'pending':
            return Response({'error': 'Athlete profile is not pending approval'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            if action == 'approve':
                athlete.approve(request.user)
                result_message = 'Athlete profile approved successfully'
            elif action == 'reject':
                athlete.reject(request.user, notes)
                result_message = 'Athlete profile rejected'
            elif action == 'request_revision':
                athlete.request_revision(request.user, notes)
                result_message = 'Revision requested'
            return Response({'message': result_message})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get', 'post', 'put'], permission_classes=[permissions.IsAuthenticated], url_path='my-profile')
    def my_profile(self, request):
        """Convenience endpoint for the current user's athlete profile.

        - GET /api/athletes/my-profile/ -> returns current user's profile
        - POST -> create a new profile for current user (if none)
        - PUT -> update current user's profile (if owner)
        """
        user = request.user
        if request.method == 'GET':
            try:
                athlete = Athlete.objects.get(user=user)
                serializer = AthleteProfileSerializer(athlete)
                return Response(serializer.data)
            except Athlete.DoesNotExist:
                return Response({'error': 'No athlete profile found'}, status=status.HTTP_404_NOT_FOUND)

        if request.method == 'POST':
            # create profile for current user
            if hasattr(user, 'athlete') and user.athlete:
                return Response({'error': 'You already have an athlete profile'}, status=status.HTTP_400_BAD_REQUEST)
            serializer = AthleteProfileSerializer(data=request.data, context={'request': request})
            if serializer.is_valid():
                athlete = serializer.save(user=user, status='pending')
                return Response(AthleteProfileSerializer(athlete).data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if request.method == 'PUT':
            try:
                athlete = Athlete.objects.get(user=user)
            except Athlete.DoesNotExist:
                return Response({'error': 'No athlete profile found'}, status=status.HTTP_404_NOT_FOUND)

            if athlete.user != user and not user.is_admin:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

            serializer = AthleteProfileSerializer(athlete, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                updated = serializer.save()
                # If the athlete was in revision_required and user updated, resubmit
                if updated.status == 'revision_required':
                    updated.resubmit()
                return Response(AthleteProfileSerializer(updated).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CoachesViewSet(viewsets.ViewSet):
    """Lightweight endpoint that returns a compact list of coach-athletes for frontend selects.

    GET /api/coaches/?q=<name>
    """
    permission_classes = [AllowAny]

    def list(self, request):
        queryset = Athlete.objects.filter(is_coach=True)
        q = request.query_params.get('q')
        if q:
            queryset = queryset.filter(models.Q(first_name__icontains=q) | models.Q(last_name__icontains=q))
        # Use a minimal serializer to keep payload small
        serializer = CoachSimpleSerializer(queryset, many=True)
        return Response(serializer.data)


class TitleViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Title.objects.all()
    serializer_class = TitleSerializer

    def list(self, request):
        queryset = Title.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
    

class FederationRoleViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = FederationRole.objects.all()
    serializer_class = FederationRoleSerializer
    def list(self, request):
        queryset = FederationRole.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)
    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)
    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)
class GradeViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    def list(self, request):
        queryset = Grade.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)
    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)
    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)

class TeamViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Team.objects.all()
    serializer_class = TeamSerializer

    def list(self, request):
        queryset = Team.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        # Ensure name field is provided (required by database)
        data = request.data.copy()
        if not data.get('name'):
            # Generate a temporary name - will be overridden when members are added
            import uuid
            data['name'] = f"Team {str(uuid.uuid4())[:8]}"
        
        serializer = self.serializer_class(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(_event_for_team(instance))
        if locked is not None:
            return locked
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(_event_for_team(instance))
        if locked is not None:
            return locked
        instance.delete()
        return Response(status=204)
    

class TeamMemberViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = TeamMember.objects.all()
    serializer_class = TeamMemberSerializer

    def list(self, request):
        queryset = self.queryset.all()
        team_id = request.query_params.get('team_id')
        if team_id:
            queryset = queryset.filter(team_id=team_id)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        team = Team.objects.filter(pk=request.data.get('team')).first()
        locked = _event_operational_lock_response(_event_for_team(team))
        if locked is not None:
            return locked
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        try:
            instance = self.queryset.get(pk=pk)
            serializer = self.serializer_class(instance)
            return Response(serializer.data)
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

    def destroy(self, request, pk=None):
        try:
            instance = self.queryset.get(pk=pk)
            locked = _event_operational_lock_response(_event_for_team(instance.team))
            if locked is not None:
                return locked
            instance.delete()
            return Response(status=204)
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)


class MatchViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = Match.objects.all()
    serializer_class = MatchSerializer

    def list(self, request):
        queryset = Match.objects.all()
        event_id = request.query_params.get('event_id')
        field_id = request.query_params.get('field_id')
        category_id = request.query_params.get('category_id')
        if event_id:
            queryset = queryset.filter(category__event_id=event_id)
        if field_id:
            queryset = queryset.filter(
                Q(field_assignment__field_id=field_id) | Q(field_id=field_id)
            )
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        category = Category.objects.select_related('event').filter(pk=request.data.get('category')).first()
        locked = _event_operational_lock_response(getattr(category, 'event', None))
        if locked is not None:
            return locked
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        queryset = self.queryset.get(pk=pk)
        serializer = self.serializer_class(queryset)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(getattr(getattr(instance, 'category', None), 'event', None))
        if locked is not None:
            return locked
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def partial_update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(getattr(getattr(instance, 'category', None), 'event', None))
        if locked is not None:
            return locked
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(getattr(getattr(instance, 'category', None), 'event', None))
        if locked is not None:
            return locked
        instance.delete()
        return Response(status=204)

    @action(detail=True, methods=['get', 'post', 'delete'], permission_classes=[AllowAny])
    def point_events(self, request, pk=None):
        """List or create referee point events for a match (async mode).

        GET returns the audit trail. POST creates a RefereePointEvent.
        DELETE clears the audit trail for the match.
        """
        from .serializers import RefereePointEventSerializer

        try:
            match = Match.objects.get(pk=pk)
        except Match.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if request.method == 'GET':
            events = match.point_events.all().order_by('timestamp')
            validation_status = request.query_params.get('validation_status')
            if validation_status:
                events = events.filter(validation_status=validation_status)
            referee_id = request.query_params.get('referee_id')
            if referee_id:
                events = events.filter(referee_id=referee_id)
            serializer = RefereePointEventSerializer(events, many=True)
            return Response(serializer.data)

        if request.method == 'DELETE':
            if not request.user or not request.user.is_authenticated or not getattr(request.user, 'is_admin', False):
                return Response({'error': 'Only admins can clear point events.'}, status=status.HTTP_403_FORBIDDEN)
            locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
            if locked is not None:
                return locked
            deleted_count, _ = match.point_events.all().delete()
            return Response({'deleted': deleted_count}, status=status.HTTP_200_OK)

        locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
        if locked is not None:
            return locked

        is_admin = bool(request.user and request.user.is_authenticated and getattr(request.user, 'is_admin', False))
        requester_athlete = getattr(request.user, 'athlete', None) if request.user and request.user.is_authenticated else None

        if not is_admin:
            if not request.user or not request.user.is_authenticated:
                return Response({'error': 'Authentication required.'}, status=status.HTTP_403_FORBIDDEN)
            if not requester_athlete or not getattr(requester_athlete, 'is_referee', False):
                return Response({'error': 'Only referees or admins can submit point events.'}, status=status.HTTP_403_FORBIDDEN)
            if not _is_match_assigned_referee(match, requester_athlete):
                return Response({'error': 'Nu ești arbitru alocat acestui meci.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data.copy()
        data['match'] = pk
        requested_referee_id = data.get('referee')
        if not requested_referee_id:
            try:
                data['referee'] = request.user.athlete.id
            except Exception:
                return Response({'error': 'Nu aveți un profil de arbitru asociat.'}, status=400)
        elif not is_admin:
            try:
                if int(requested_referee_id) != requester_athlete.id:
                    return Response({'error': 'Poți trimite puncte doar în numele tău.'}, status=status.HTTP_403_FORBIDDEN)
            except (TypeError, ValueError):
                return Response({'error': 'Referee invalid.'}, status=status.HTTP_400_BAD_REQUEST)

        recording_session = _resolve_recording_session(
            request,
            event=getattr(getattr(match, 'category', None), 'event', None),
            field=getattr(match, 'field', None),
        )
        if recording_session:
            data['recording_session'] = recording_session.id

        if not data.get('validation_status'):
            data['validation_status'] = 'pending' if match.display_mode == 'real_time' else 'validated'

        serializer = RefereePointEventSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            validation_status = serializer.validated_data.get('validation_status', 'validated')
            ev = serializer.save(
                created_by=(request.user if getattr(request, 'user', None) and request.user.is_authenticated else None),
                validated_at=(timezone.now() if validation_status == 'validated' else None),
                video_offset_ms=_compute_video_offset_ms(recording_session),
            )

            affected_events = [ev]
            if match.display_mode == 'real_time':
                affected_events = _auto_validate_real_time_point_event(ev) or [ev]

            try:
                for referee_id in {item.referee_id for item in affected_events if item.validation_status == 'validated'}:
                    _sync_point_events_to_match_referee_scores(ev.match_id, referee_id)
            except Exception:
                pass
            ev.refresh_from_db()
            return Response(RefereePointEventSerializer(ev).data, status=201)
        return Response(serializer.errors, status=400)
    
class AnnualVisaViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    # Use the unified Visa model under the hood (filter by type) so the
    # endpoint continues to work while we migrate data into Visa.
    serializer_class = None  # set in __init__ below

    def get_queryset(self):
        from .models import Visa
        return Visa.objects.filter(visa_type='annual')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Dynamically set serializer to VisaSerializer to avoid circular imports on startup
        try:
            from .serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = AnnualVisaSerializer

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


class CategoryViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = CategorySerializer

    def get_queryset(self):
        team_member_queryset = TeamMember.objects.select_related('athlete__club')
        team_queryset = Team.objects.prefetch_related(
            Prefetch('members', queryset=team_member_queryset),
            'categories',
        )
        enrolled_team_queryset = CategoryTeam.objects.select_related('team').prefetch_related(
            Prefetch('team__members', queryset=team_member_queryset),
        )

        return Category.objects.select_related(
            'event',
            'group',
            'solocategory',
            'fightcategory',
            'teamcategory',
            'solocategory__first_place',
            'solocategory__second_place',
            'solocategory__third_place',
            'fightcategory__first_place',
            'fightcategory__second_place',
            'fightcategory__third_place',
            'teamcategory__first_place_team',
            'teamcategory__second_place_team',
            'teamcategory__third_place_team',
        ).prefetch_related(
            Prefetch(
                'enrolled_athletes',
                queryset=CategoryAthlete.objects.select_related('athlete__club', 'athlete__current_grade'),
            ),
            Prefetch('enrolled_teams', queryset=enrolled_team_queryset),
            Prefetch('teams', queryset=team_queryset),
        )

    def _create_category(self, data):
        """Create the right Category subclass based on category_type."""
        cat_type = data.pop('category_type', 'solo')
        model_map = {
            'solo': SoloCategory,
            'team': TeamCategory,
            'fight': FightCategory,
        }
        model_cls = model_map.get(cat_type, SoloCategory)
        return model_cls.objects.create(**data)

    def list(self, request):
        queryset = self.get_queryset()
        event_id = request.query_params.get('event')
        if event_id:
            try:
                event_id_int = int(str(event_id).split(':')[0])
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid event id.'}, status=400)
            queryset = queryset.filter(event_id=event_id_int)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        d = request.data.copy()
        name = d.get('name', '').strip()
        if not name:
            return Response({'name': ['This field is required.']}, status=400)
        from landing.models import Event
        event = Event.objects.filter(pk=d.get('event')).first() if d.get('event') else None
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked
        create_data = {
            'name': name,
            'event_id': d.get('event'),
            'gender': d.get('gender', 'mixt'),
            'category_type': d.get('category_type', 'solo'),
        }
        group_id = d.get('group') or d.get('group_id')
        if group_id:
            create_data['group_id'] = group_id
        cat = self._create_category(create_data)
        serializer = self.serializer_class(cat)
        return Response(serializer.data, status=201)

    def retrieve(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        locked = _event_operational_lock_response(getattr(instance, 'event', None))
        if locked is not None:
            return locked
        # Only allow updating safe fields (name, gender, display_order)
        allowed = {'name', 'gender', 'display_order'}
        data = {k: v for k, v in request.data.items() if k in allowed}
        for field, value in data.items():
            setattr(instance, field, value)
        instance.save(update_fields=list(data.keys()))
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            cat = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        locked = _event_operational_lock_response(getattr(cat, 'event', None))
        if locked is not None:
            return locked
        cat.delete()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='bulk-add')
    def bulk_add(self, request):
        """Bulk add categories to an event.
        Accepts { event_id: int, categories: [{ name, category_type, gender, group_id? }] }
        Skips duplicates (same name + event + group).
        """
        event_id = request.data.get('event_id')
        items = request.data.get('categories', [])
        if not event_id or not items:
            return Response({'detail': 'event_id and categories are required.'}, status=400)
        from landing.models import Event
        try:
            event = Event.objects.get(pk=event_id)
        except Event.DoesNotExist:
            return Response({'detail': 'Event not found.'}, status=404)
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked

        # Build set of (name, group_id) pairs that already exist
        existing_pairs = set(
            Category.objects.filter(event_id=event_id)
            .values_list('name', 'group_id')
        )
        created = []
        for item in items:
            name = item.get('name', '').strip()
            if not name:
                continue
            group_id = item.get('group') or item.get('group_id') or None
            if group_id:
                group_id = int(group_id)
            if (name, group_id) in existing_pairs:
                continue
            create_data = {
                'name': name,
                'event_id': event_id,
                'gender': item.get('gender', 'mixt'),
                'category_type': item.get('category_type', 'solo'),
            }
            if group_id:
                create_data['group_id'] = group_id
            cat = self._create_category(create_data)
            created.append(cat)
            existing_pairs.add((name, group_id))

        serializer = self.serializer_class(created, many=True)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder categories within a group.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each category based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        first_category = Category.objects.select_related('event').filter(pk=order[0]).first()
        locked = _event_operational_lock_response(getattr(first_category, 'event', None))
        if locked is not None:
            return locked
        for idx, cat_id in enumerate(order):
            Category.objects.filter(pk=cat_id).update(display_order=idx)
        return Response({'status': 'ok'})


class DiplomaTemplateViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = DiplomaTemplateSerializer

    TEMPLATE_KIND_ORDER = ['first_place', 'second_place', 'third_place', 'participation']
    CATEGORY_SCOPE_ORDER = ['solo', 'team', 'fight', 'all']

    def get_queryset(self):
        return DiplomaTemplate.objects.select_related('event').all()

    def _normalize_payload(self, request):
        data = {}
        if hasattr(request.data, 'keys'):
            for key in request.data.keys():
                if hasattr(request.data, 'getlist'):
                    values = request.data.getlist(key)
                    data[key] = values if len(values) > 1 else values[0]
                else:
                    data[key] = request.data.get(key)
        else:
            data = dict(request.data)

        placements = data.get('placements')
        if isinstance(placements, list) and len(placements) == 1:
            placements = placements[0]
        if isinstance(placements, str):
            import json

            placements = placements.strip()
            data['placements'] = json.loads(placements) if placements else []
        elif placements in [None, '']:
            data['placements'] = []

        if 'is_active' in data:
            data['is_active'] = _coerce_bool(data.get('is_active'), default=True)
        return data

    def list(self, request):
        queryset = self.get_queryset()
        event_id = request.query_params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        serializer = self.serializer_class(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    def create(self, request):
        payload = self._normalize_payload(request)
        serializer = self.serializer_class(data=payload, context={'request': request})
        if serializer.is_valid():
            instance = serializer.save()
            return Response(self.serializer_class(instance, context={'request': request}).data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance, context={'request': request})
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        payload = self._normalize_payload(request)
        serializer = self.serializer_class(instance, data=payload, partial=True, context={'request': request})
        if serializer.is_valid():
            updated = serializer.save()
            return Response(self.serializer_class(updated, context={'request': request}).data)
        return Response(serializer.errors, status=400)

    def _get_duplicate_slot(self, instance):
        used_slots = set(
            self.get_queryset()
            .filter(event=instance.event)
            .exclude(pk=instance.pk)
            .values_list('template_kind', 'category_scope')
        )

        preferred_slots = [
            (instance.template_kind, scope)
            for scope in self.CATEGORY_SCOPE_ORDER
            if scope != instance.category_scope
        ] + [
            (kind, instance.category_scope)
            for kind in self.TEMPLATE_KIND_ORDER
            if kind != instance.template_kind
        ] + [
            (kind, scope)
            for kind in self.TEMPLATE_KIND_ORDER
            for scope in self.CATEGORY_SCOPE_ORDER
            if (kind, scope) != (instance.template_kind, instance.category_scope)
        ]

        for slot in preferred_slots:
            if slot not in used_slots:
                return slot
        return None

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        duplicate_slot = self._get_duplicate_slot(instance)
        if not duplicate_slot:
            return Response(
                {'detail': 'Nu mai există combinații disponibile pentru duplicarea diplomei în acest eveniment.'},
                status=400,
            )

        template_kind, category_scope = duplicate_slot
        file_bytes = instance.pdf_file.read() if instance.pdf_file else b''
        if instance.pdf_file:
            instance.pdf_file.close()

        original_name = Path(instance.pdf_file.name or 'template.pdf').name
        stem = Path(original_name).stem
        suffix = Path(original_name).suffix or '.pdf'

        duplicate = DiplomaTemplate(
            event=instance.event,
            title=f'{instance.title} (copie)',
            template_kind=template_kind,
            category_scope=category_scope,
            preview_orientation=instance.preview_orientation,
            placements=instance.placements,
            is_active=instance.is_active,
        )
        duplicate.pdf_file.save(f'{stem}-copy{suffix}', ContentFile(file_bytes), save=False)
        duplicate.save()

        serializer = self.serializer_class(duplicate, context={'request': request})
        return Response(serializer.data, status=201)

    def destroy(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        instance.delete()
        return Response(status=204)


class CategoryAthleteViewSet(viewsets.ViewSet):
    """
    ViewSet for CategoryAthlete - basic enrollment without scores.
    Coaches can only enroll athletes from their own club.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CategoryAthleteSerializer

    def get_queryset(self):
        queryset = CategoryAthlete.objects.select_related('athlete', 'category').all()
        
        # Filter by category if provided
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)

        # Filter by event if provided
        event_id = self.request.query_params.get('event', None)
        if event_id is not None:
            queryset = queryset.filter(category__event_id=event_id)

        # Filter by club — coaches see only their club's enrollments
        my_club = self.request.query_params.get('my_club', None)
        if my_club and str(my_club).lower() in ('1', 'true', 'yes'):
            user = self.request.user
            if user and hasattr(user, 'athlete') and user.athlete and user.athlete.club_id:
                queryset = queryset.filter(athlete__club_id=user.athlete.club_id)
            else:
                queryset = queryset.none()
        
        return queryset

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        # Non-admin users (coaches) can only enroll athletes from their own club
        user = request.user
        category_id = request.data.get('category')
        if category_id:
            category = Category.objects.select_related('event').filter(pk=category_id).first()
            if not category:
                return Response({'error': 'Categoria nu a fost găsită.'}, status=404)
            locked = _event_operational_guard_response(user, category.event)
            if locked:
                return locked
        if not user.is_admin:
            athlete_id = request.data.get('athlete')
            if athlete_id:
                try:
                    target_athlete = Athlete.objects.get(pk=athlete_id)
                except Athlete.DoesNotExist:
                    return Response({'error': 'Sportivul nu a fost găsit.'}, status=404)
                user_club = getattr(getattr(user, 'athlete', None), 'club_id', None)
                if not user_club or target_athlete.club_id != user_club:
                    return Response({'error': 'Poți înscrie doar sportivi din clubul tău.'}, status=403)

        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        locked = _event_operational_guard_response(request.user, getattr(instance.category, 'event', None))
        if locked:
            return locked
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        locked = _event_operational_guard_response(request.user, getattr(instance.category, 'event', None))
        if locked:
            return locked
        instance.delete()
        return Response(status=204)


class FightAthleteWeightViewSet(viewsets.ViewSet):
    """
    ViewSet for FightAthleteWeight - fight category weigh-in data.
    Tracks registered weight, match day weight, disqualification.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = FightAthleteWeightSerializer

    def get_queryset(self):
        queryset = FightAthleteWeight.objects.select_related('athlete', 'athlete__club', 'category').all()
        category_id = self.request.query_params.get('category')
        event_id = self.request.query_params.get('event')
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        if event_id:
            queryset = queryset.filter(category__event_id=event_id)
        return queryset

    def list(self, request):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return Response(serializer.data)

    def create(self, request):
        category_id = request.data.get('category')
        if category_id:
            category = Category.objects.select_related('event').filter(pk=category_id).first()
            if not category:
                return Response({'error': 'Categoria nu a fost găsită.'}, status=404)
            locked = _event_operational_guard_response(request.user, category.event)
            if locked:
                return locked
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
            return Response(self.serializer_class(instance).data)
        except FightAthleteWeight.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

    def partial_update(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
            locked = _event_operational_guard_response(request.user, getattr(instance.category, 'event', None))
            if locked:
                return locked
            serializer = self.serializer_class(instance, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=400)
        except FightAthleteWeight.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

    def update(self, request, pk=None):
        return self.partial_update(request, pk)

    def destroy(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
            locked = _event_operational_guard_response(request.user, getattr(instance.category, 'event', None))
            if locked:
                return locked
            instance.delete()
            return Response(status=204)
        except FightAthleteWeight.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)


class CategoryTeamViewSet(viewsets.ViewSet):
    """
    ViewSet for CategoryTeam - team enrollment in categories.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CategoryTeamSerializer

    def get_queryset(self):
        queryset = CategoryTeam.objects.select_related('team', 'category').all()
        
        # Filter by category if provided
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)

        # Filter by event if provided
        event_id = self.request.query_params.get('event', None)
        if event_id is not None:
            queryset = queryset.filter(category__event_id=event_id)
        
        # Filter by club if provided
        club_id = self.request.query_params.get('club', None)
        if club_id is not None:
            queryset = queryset.filter(team__club_id=club_id)
        
        return queryset

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        category = Category.objects.select_related('event').filter(pk=request.data.get('category')).first()
        locked = _event_operational_guard_response(request.user, getattr(category, 'event', None))
        if locked:
            return locked
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        locked = _event_operational_guard_response(request.user, getattr(instance.category, 'event', None))
        if locked:
            return locked
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def update(self, request, pk=None):
        return self.partial_update(request, pk)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        locked = _event_operational_guard_response(request.user, getattr(instance.category, 'event', None))
        if locked:
            return locked
        instance.delete()
        return Response(status=204)


# FrontendTheme API removed — this viewset was intentionally deleted to disable theme management via the API.


class GradeHistoryViewSet(viewsets.ViewSet):
    permission_classes = [IsAthleteOwnerCoachOrAdmin]
    serializer_class = GradeHistorySerializer

    def get_queryset(self):
        qs = GradeHistory.objects.select_related('athlete__club', 'grade', 'event', 'examiner_1', 'examiner_2').all()
        user = self.request.user

        if user.is_staff or getattr(user, 'role', None) == 'admin':
            pass
        elif hasattr(user, 'athlete') and user.athlete:
            if user.athlete.is_coach and user.athlete.club_id:
                qs = qs.filter(athlete__club_id=user.athlete.club_id)
            else:
                qs = qs.filter(athlete=user.athlete)
        else:
            return GradeHistory.objects.none()

        athlete_id = self.request.query_params.get('athlete')
        if athlete_id:
            qs = qs.filter(athlete_id=athlete_id)

        return qs.order_by('-obtained_date', '-id')

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


class MedicalVisaViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    # Proxy to the unified Visa model using visa_type='medical'
    serializer_class = None

    def get_queryset(self):
        from .models import Visa
        return Visa.objects.filter(visa_type='medical')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            from .serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = MedicalVisaSerializer

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        instance.delete()
        return Response(status=204)


# TrainingSeminarViewSet removed - use Events API instead

class GroupViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Group.objects.all()
    serializer_class = GroupSerializer

    def list(self, request):
        queryset = self.queryset
        event_id = request.query_params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        from landing.models import Event
        event = Event.objects.filter(pk=request.data.get('event')).first() if request.data.get('event') else None
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(getattr(instance, 'event', None))
        if locked is not None:
            return locked
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(getattr(instance, 'event', None))
        if locked is not None:
            return locked
        instance.delete()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder groups within an event.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each group based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        first_group = Group.objects.select_related('event').filter(pk=order[0]).first()
        locked = _event_operational_lock_response(getattr(first_group, 'event', None))
        if locked is not None:
            return locked
        for idx, group_id in enumerate(order):
            Group.objects.filter(pk=group_id).update(display_order=idx)
        return Response({'status': 'ok'})

@api_view(['GET'])
def api_root(request, format=None):
    """
    API Root - Lists all available endpoints
    """
    return Response({
        # Main API endpoints
        'city': reverse('city-list', request=request, format=format),
        'club': reverse('club-list', request=request, format=format),
        'competition': reverse('competition-list', request=request, format=format),
        'athlete': reverse('athlete-list', request=request, format=format),
        'title': reverse('title-list', request=request, format=format),
        'federation-role': reverse('federation-role-list', request=request, format=format),
        'grade': reverse('grade-list', request=request, format=format),
        'team': reverse('team-list', request=request, format=format),
        'match': reverse('match-list', request=request, format=format),
        'category': reverse('category-list', request=request, format=format),
        'grade-history': reverse('grade-history-list', request=request, format=format),
        'medical-visa': reverse('medical-visa-list', request=request, format=format),
        'training-seminar': reverse('training-seminar-list', request=request, format=format),
        'group': reverse('group-list', request=request, format=format),
        
        # Additional APIs
        '_other_apis': {
            'description': 'Other available API endpoints',
            'landing_api': {
                'url': request.build_absolute_uri('/landing/'),
                'description': 'Landing page content management API (news, events, about, contact)'
            },
            'admin': {
                'url': request.build_absolute_uri('/admin/'),
                'description': 'Django admin interface'
            }
        }
    })


# Authentication Views
from rest_framework import status
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated, AllowAny


class RegisterView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            })
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)




class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                return Response({"error": "Invalid token"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"message": "Successfully logged out"}, status=status.HTTP_200_OK)


class SessionCheckView(APIView):
    """Check if user has an active Django session (e.g., from admin login)"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        # Check if user is authenticated via Django session
        if request.user.is_authenticated:
            return Response({
                'authenticated': True,
                'user': UserSerializer(request.user).data
            })
        else:
            return Response({
                'authenticated': False,
                'user': None
            })


class SessionLoginView(APIView):
    """Convert Django session authentication to JWT tokens"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        # Check if user is authenticated via Django session
        if request.user.is_authenticated:
            refresh = RefreshToken.for_user(request.user)
            return Response({
                'user': UserSerializer(request.user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                }
            })
        else:
            return Response(
                {'error': 'No active session found'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )


class SessionLogoutView(APIView):
    """Logout from Django session"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        from django.contrib.auth import logout
        logout(request)
        return Response({'message': 'Session logged out successfully'})


# =====================================
# ATHLETE WORKFLOW VIEWS
# =====================================


class SupporterAthleteRelationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing supporter-athlete relationships"""
    serializer_class = SupporterAthleteRelationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.is_supporter:
            return SupporterAthleteRelation.objects.filter(supporter=user)
        elif user.is_admin:
            return SupporterAthleteRelation.objects.all()
        else:
            return SupporterAthleteRelation.objects.none()
    
    def perform_create(self, serializer):
        """Create relationship for current supporter"""
        if not self.request.user.is_supporter:
            raise ValidationError("Only supporters can create athlete relationships.")
        
        serializer.save(supporter=self.request.user)


class UserRegistrationView(APIView):
    """Enhanced user registration with role selection"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # Generate tokens
            refresh = RefreshToken.for_user(user)
            
            return Response({
                'user': UserProfileSerializer(user).data,
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token),
                },
                'message': 'Registration successful'
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserProfileView(APIView):
    """User profile management"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """Get current user profile"""
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)
    
    def put(self, request):
        """Update current user profile"""
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PendingApprovalsView(APIView):
    """Admin view for pending athlete profile approvals"""
    permission_classes = [IsAdmin]
    
    def get(self, request):
        """Get all pending athlete profiles"""
        pending_athletes = Athlete.objects.filter(status='pending').order_by('-submitted_date')
        serializer = AthleteProfileSerializer(pending_athletes, many=True)
        return Response({
            'pending_count': pending_athletes.count(),
            'profiles': serializer.data
        })
    
    def post(self, request):
        """Handle approval/rejection actions"""
        profile_id = request.data.get('profile_id')
        action = request.data.get('action')  # 'approve', 'reject', 'request_revision'
        admin_notes = request.data.get('admin_notes', '')
        
        if not profile_id or not action:
            return Response(
                {'error': 'profile_id and action are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if action not in ['approve', 'reject', 'request_revision']:
            return Response(
                {'error': 'action must be approve, reject, or request_revision'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            athlete = Athlete.objects.get(id=profile_id)
            
            if athlete.status != 'pending':
                return Response(
                    {'error': 'Athlete profile is not in pending status'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Use the athlete workflow methods
            if action == 'approve':
                athlete.approve(request.user)
            elif action == 'reject':
                athlete.reject(request.user, admin_notes)
            elif action == 'request_revision':
                athlete.request_revision(request.user, admin_notes)
            
            serializer = AthleteProfileSerializer(athlete)
            return Response({
                'message': f'Athlete profile {action}d successfully',
                'profile': serializer.data
            })
            
        except Athlete.DoesNotExist:
            return Response(
                {'error': 'Athlete profile not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class MyAthleteProfileView(APIView):
    """User's own athlete profile management"""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """Get current user's athlete profile"""
        try:
            athlete = Athlete.objects.get(user=request.user)
            serializer = AthleteProfileSerializer(athlete)
            return Response(serializer.data)
        except Athlete.DoesNotExist:
            return Response(
                {'error': 'No athlete profile found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
def athlete_profiles_compat(request, subpath=''):
    """Compatibility shim: redirect any /api/athlete-profiles/* requests to /api/athletes/*.

    Returns a 307 Temporary Redirect with Deprecation and Link headers so clients
    can migrate. The Location header points to the replacement URL.
    """
    try:
        # Build the new absolute URL by replacing the path segment
        original = request.get_full_path()
        new_path = original.replace('/api/athlete-profiles', '/api/athletes')
        new_url = request.build_absolute_uri(new_path)
    except Exception:
        # Fallback to site-root replacement
        new_url = request.build_absolute_uri('/api/athletes/')

    body = {
        'detail': 'This endpoint has moved. See Location header for the replacement URL.',
        'replacement': new_url,
        'deprecated': True
    }

    resp = JsonResponse(body, status=307)
    resp['Location'] = new_url
    resp['Deprecation'] = 'true'
    resp['Link'] = f'<{new_url}>; rel="replacement"'
    return resp


# Reference Data Endpoints for Athlete Workflow
@api_view(['GET'])
def sports_list(request):
    """Get list of available sports/disciplines for Vovinam Viet Vo Dao."""
    sports = [
        {'id': 1, 'name': 'Quyen (Forms)', 'code': 'quyen'},
        {'id': 2, 'name': 'Song Luyện (Combat Choreography)', 'code': 'song_luyen'},
        {'id': 3, 'name': 'Đối Kháng (Fighting)', 'code': 'doi_khang'},
        {'id': 4, 'name': 'Tự Vệ (Self Defense)', 'code': 'tu_ve'},
        {'id': 5, 'name': 'Biểu Diễn (Performance)', 'code': 'bieu_dien'},
    ]
    return Response(sports)

@api_view(['GET'])
def categories_list(request):
    """Get list of available categories."""
    try:
        categories = Category.objects.all()
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data)
    except Exception as e:
        # Return empty list if no categories exist
        return Response([])

@api_view(['GET'])
def clubs_list(request):
    """Get list of available clubs."""
    try:
        clubs = Club.objects.all()
        serializer = ClubSerializer(clubs, many=True)
        return Response(serializer.data)
    except Exception as e:
        # Return empty list if no clubs exist
        return Response([])


class CategoryRefereeScoreViewSet(viewsets.ViewSet):
    """ViewSet for referees to submit scores for athletes/teams in solo/team categories.
    Read access allowed for public display; write requires authentication.
    """
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List referee scores - unauthenticated/public see all (read-only),
        referees see their own, admins see all"""
        user = request.user
        
        if not user or not user.is_authenticated:
            # Public / display access — return all (read-only, filtered by params)
            queryset = CategoryRefereeScore.objects.all()
        elif user.is_staff or (hasattr(user, 'role') and user.role == 'admin'):
            # Admins see all referee scores
            queryset = CategoryRefereeScore.objects.all()
        elif hasattr(user, 'athlete') and user.athlete.is_referee:
            # Referees see only their own scores
            queryset = CategoryRefereeScore.objects.filter(referee=user.athlete)
        else:
            # Other authenticated users — return all (read-only)
            queryset = CategoryRefereeScore.objects.all()
        
        queryset = queryset.select_related('athlete_score__athlete', 'athlete_score__category', 'referee')

        # Filter by category
        category_id = request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(athlete_score__category_id=category_id)

        # Filter by athlete
        athlete_id = request.query_params.get('athlete')
        if athlete_id:
            queryset = queryset.filter(athlete_score__athlete_id=athlete_id)

        athlete_score_id = request.query_params.get('athlete_score')
        if athlete_score_id:
            queryset = queryset.filter(athlete_score_id=athlete_score_id)

        # Filter by event
        event_id = request.query_params.get('event_id')
        if event_id:
            queryset = queryset.filter(athlete_score__category__event_id=event_id)

        serializer = CategoryRefereeScoreSerializer(queryset, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new referee score.
        Accepts either:
          - athlete_score (ID) directly, OR
          - category + athlete (IDs) — will find/create the CategoryAthleteScore automatically
        Admins can also supply a 'referee' field to score on behalf of a specific referee.
        """
        user = request.user
        
        # Determine the referee ID
        is_admin = user.is_staff or (hasattr(user, 'role') and user.role == 'admin')
        
        if is_admin and request.data.get('referee'):
            # Admin scoring on behalf of a referee
            referee_id = request.data['referee']
        elif hasattr(user, 'athlete') and user.athlete.is_referee:
            referee_id = user.athlete.id
        elif is_admin:
            return Response(
                {'error': 'Admin must specify a referee ID'},
                status=status.HTTP_400_BAD_REQUEST
            )
        else:
            return Response(
                {'error': 'Only referees or admins can submit scores'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Build a clean plain dict for the serializer
        incoming = request.data
        clean = {
            'referee': referee_id,
            'score': incoming.get('score', 100),
        }
        if incoming.get('notes'):
            clean['notes'] = incoming['notes']
        
        # Resolve athlete_score
        if incoming.get('athlete_score'):
            clean['athlete_score'] = incoming['athlete_score']
        elif incoming.get('category') and incoming.get('team_id'):
            category_id = incoming['category']
            team_id = incoming['team_id']
            try:
                cat = Category.objects.get(pk=category_id)
            except Category.DoesNotExist:
                return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)

            try:
                team = Team.objects.prefetch_related('members__athlete__club').get(pk=team_id)
            except Team.DoesNotExist:
                return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

            team_member_ids = [member.athlete_id for member in team.members.all() if member.athlete_id]
            existing_team_score = None
            for candidate in CategoryAthleteScore.objects.filter(category_id=category_id, type='teams').prefetch_related('team_members'):
                if set(candidate.team_members.values_list('id', flat=True)) == set(team_member_ids):
                    existing_team_score = candidate
                    break

            if existing_team_score is None:
                athlete_id = team_member_ids[0] if team_member_ids else None
                existing_team_score = CategoryAthleteScore.objects.create(
                    category_id=category_id,
                    athlete_id=athlete_id,
                    type='teams',
                    status='approved',
                    team_name=team.name,
                )
                if team_member_ids:
                    existing_team_score.team_members.set(team_member_ids)

            if existing_team_score.team_name != team.name:
                existing_team_score.team_name = team.name
                existing_team_score.save(update_fields=['team_name'])

            clean['athlete_score'] = existing_team_score.id
        elif incoming.get('category') and incoming.get('athlete'):
            # Frontend sends category + athlete IDs — resolve to CategoryAthleteScore
            category_id = incoming['category']
            athlete_id = incoming['athlete']
            try:
                cat = Category.objects.get(pk=category_id)
            except Category.DoesNotExist:
                return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)

            normalized_type = (cat.type or 'solo')
            if normalized_type == 'team':
                normalized_type = 'teams'
            
            athlete_score_obj, _ = CategoryAthleteScore.objects.get_or_create(
                category_id=category_id,
                athlete_id=athlete_id,
                defaults={'type': normalized_type, 'status': 'approved'}
            )

            if athlete_score_obj.type == 'team':
                athlete_score_obj.type = 'teams'
                athlete_score_obj.save(update_fields=['type'])

            clean['athlete_score'] = athlete_score_obj.id
        else:
            return Response(
                {'error': 'Provide athlete_score, category + team_id, or category + athlete'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = CategoryRefereeScoreSerializer(data=clean)
        if serializer.is_valid():
            # Validate that the athlete_score is for solo/team category
            athlete_score = serializer.validated_data['athlete_score']
            if athlete_score.type not in ['solo', 'team', 'teams']:
                return Response(
                    {'error': 'Referee scoring is only applicable to solo and team categories'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # If referee already scored this athlete, update instead of error
            existing = CategoryRefereeScore.objects.filter(
                athlete_score=athlete_score,
                referee_id=referee_id
            ).first()

            recording_session = _resolve_recording_session(
                request,
                event=getattr(getattr(athlete_score, 'category', None), 'event', None),
                field=getattr(getattr(getattr(athlete_score, 'category', None), 'field_assignment', None), 'field', None),
            )
            
            if existing:
                previous_score = existing.score
                existing.score = serializer.validated_data.get('score', existing.score)
                existing.notes = serializer.validated_data.get('notes', existing.notes)
                existing.save()
                _log_category_score_event(
                    athlete_score=existing.athlete_score,
                    referee=existing.referee,
                    action='update',
                    source='competition_admin' if is_admin else 'referee_app',
                    created_by=request.user if request.user.is_authenticated else None,
                    score_value=existing.score,
                    previous_score=previous_score,
                    notes=existing.notes,
                    recording_session=recording_session,
                )
                return Response(CategoryRefereeScoreSerializer(existing).data)
            
            instance = serializer.save()
            _log_category_score_event(
                athlete_score=instance.athlete_score,
                referee=instance.referee,
                action='create',
                source='competition_admin' if is_admin else 'referee_app',
                created_by=request.user if request.user.is_authenticated else None,
                score_value=instance.score,
                previous_score=None,
                notes=instance.notes,
                recording_session=recording_session,
            )
            return Response(CategoryRefereeScoreSerializer(instance).data, status=status.HTTP_201_CREATED)
        
        # If serializer failed due to unique_together, try updating the existing record
        if 'non_field_errors' in serializer.errors:
            try:
                existing = CategoryRefereeScore.objects.get(
                    athlete_score_id=clean['athlete_score'],
                    referee_id=referee_id
                )
                previous_score = existing.score
                existing.score = clean.get('score', existing.score)
                existing.notes = clean.get('notes', existing.notes)
                existing.save()
                recording_session = _resolve_recording_session(
                    request,
                    event=getattr(getattr(existing.athlete_score, 'category', None), 'event', None),
                    field=getattr(getattr(getattr(existing.athlete_score, 'category', None), 'field_assignment', None), 'field', None),
                )
                _log_category_score_event(
                    athlete_score=existing.athlete_score,
                    referee=existing.referee,
                    action='update',
                    source='competition_admin' if is_admin else 'referee_app',
                    created_by=request.user if request.user.is_authenticated else None,
                    score_value=existing.score,
                    previous_score=previous_score,
                    notes=existing.notes,
                    recording_session=recording_session,
                )
                return Response(CategoryRefereeScoreSerializer(existing).data)
            except CategoryRefereeScore.DoesNotExist:
                pass
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Get a specific referee score"""
        try:
            score = CategoryRefereeScore.objects.select_related(
                'athlete_score__athlete', 'athlete_score__category', 'referee'
            ).get(pk=pk)
        except CategoryRefereeScore.DoesNotExist:
            return Response({'error': 'Score not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # Check permissions
        user = request.user
        if not (user.is_staff or 
                (hasattr(user, 'role') and user.role == 'admin') or
                (hasattr(user, 'athlete') and user.athlete == score.referee)):
            return Response(
                {'error': 'You do not have permission to view this score'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = CategoryRefereeScoreSerializer(score)
        return Response(serializer.data)
    
    def update(self, request, pk=None):
        """Update a referee score (only by the referee who created it or admin)"""
        try:
            score = CategoryRefereeScore.objects.get(pk=pk)
        except CategoryRefereeScore.DoesNotExist:
            return Response({'error': 'Score not found'}, status=status.HTTP_404_NOT_FOUND)
        
        user = request.user
        
        # Check permissions: only the referee who created it or admin can update
        if not (user.is_staff or
                (hasattr(user, 'role') and user.role == 'admin') or
                (hasattr(user, 'athlete') and user.athlete == score.referee)):
            return Response(
                {'error': 'You can only update your own scores'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        previous_score = score.score
        serializer = CategoryRefereeScoreSerializer(score, data=request.data, partial=True)
        if serializer.is_valid():
            instance = serializer.save()
            recording_session = _resolve_recording_session(
                request,
                event=getattr(getattr(instance.athlete_score, 'category', None), 'event', None),
                field=getattr(getattr(getattr(instance.athlete_score, 'category', None), 'field_assignment', None), 'field', None),
            )
            _log_category_score_event(
                athlete_score=instance.athlete_score,
                referee=instance.referee,
                action='update',
                source='competition_admin' if (user.is_staff or (hasattr(user, 'role') and user.role == 'admin')) else 'referee_app',
                created_by=request.user if request.user.is_authenticated else None,
                score_value=instance.score,
                previous_score=previous_score,
                notes=instance.notes,
                recording_session=recording_session,
            )
            return Response(CategoryRefereeScoreSerializer(instance).data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def destroy(self, request, pk=None):
        """Delete a referee score (only admin)"""
        try:
            score = CategoryRefereeScore.objects.get(pk=pk)
        except CategoryRefereeScore.DoesNotExist:
            return Response({'error': 'Score not found'}, status=status.HTTP_404_NOT_FOUND)
        
        user = request.user
        
        # Only admins can delete
        if not (user.is_staff or (hasattr(user, 'role') and user.role == 'admin')):
            return Response(
                {'error': 'Only admins can delete referee scores'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        recording_session = _resolve_recording_session(
            request,
            event=getattr(getattr(score.athlete_score, 'category', None), 'event', None),
            field=getattr(getattr(getattr(score.athlete_score, 'category', None), 'field_assignment', None), 'field', None),
        )
        _log_category_score_event(
            athlete_score=score.athlete_score,
            referee=score.referee,
            action='delete',
            source='competition_admin',
            created_by=request.user if request.user.is_authenticated else None,
            score_value=None,
            previous_score=score.score,
            notes=score.notes,
            recording_session=recording_session,
        )
        score.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CategoryRefereeScoreEventViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        queryset = CategoryRefereeScoreEvent.objects.select_related(
            'athlete_score__athlete', 'athlete_score__category', 'referee', 'recording_session'
        )

        athlete_score_id = request.query_params.get('athlete_score')
        if athlete_score_id:
            queryset = queryset.filter(athlete_score_id=athlete_score_id)

        category_id = request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(athlete_score__category_id=category_id)

        event_id = request.query_params.get('event_id')
        if event_id:
            queryset = queryset.filter(athlete_score__category__event_id=event_id)

        referee_id = request.query_params.get('referee_id')
        if referee_id:
            queryset = queryset.filter(referee_id=referee_id)

        recording_session_id = request.query_params.get('recording_session')
        if recording_session_id:
            queryset = queryset.filter(recording_session_id=recording_session_id)

        serializer = CategoryRefereeScoreEventSerializer(queryset.order_by('timestamp', 'id'), many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = CategoryRefereeScoreEventSerializer(data=request.data)
        if serializer.is_valid():
            recording_session = None
            athlete_score = serializer.validated_data['athlete_score']
            if serializer.validated_data.get('recording_session'):
                recording_session = serializer.validated_data['recording_session']
            else:
                recording_session = _resolve_recording_session(
                    request,
                    event=getattr(getattr(athlete_score, 'category', None), 'event', None),
                    field=getattr(getattr(getattr(athlete_score, 'category', None), 'field_assignment', None), 'field', None),
                )
            instance = serializer.save(
                created_by=request.user if request.user.is_authenticated else None,
                recording_session=recording_session,
                video_offset_ms=_compute_video_offset_ms(recording_session),
            )
            return Response(CategoryRefereeScoreEventSerializer(instance).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class FieldRecordingSessionViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        queryset = FieldRecordingSession.objects.select_related('event', 'field')

        event_id = request.query_params.get('event_id')
        if event_id:
            queryset = queryset.filter(event_id=event_id)

        field_id = request.query_params.get('field_id')
        if field_id:
            queryset = queryset.filter(field_id=field_id)

        status_value = request.query_params.get('status')
        if status_value:
            queryset = queryset.filter(status=status_value)

        serializer = FieldRecordingSessionSerializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = FieldRecordingSessionSerializer(data=request.data)
        if serializer.is_valid():
            instance = serializer.save()
            return Response(FieldRecordingSessionSerializer(instance).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        try:
            instance = FieldRecordingSession.objects.select_related('event', 'field').get(pk=pk)
        except FieldRecordingSession.DoesNotExist:
            return Response({'error': 'Recording session not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(FieldRecordingSessionSerializer(instance).data)

    def update(self, request, pk=None):
        try:
            instance = FieldRecordingSession.objects.get(pk=pk)
        except FieldRecordingSession.DoesNotExist:
            return Response({'error': 'Recording session not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = FieldRecordingSessionSerializer(instance, data=request.data, partial=True)
        if serializer.is_valid():
            instance = serializer.save()
            return Response(FieldRecordingSessionSerializer(instance).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        try:
            instance = FieldRecordingSession.objects.get(pk=pk)
        except FieldRecordingSession.DoesNotExist:
            return Response({'error': 'Recording session not found'}, status=status.HTTP_404_NOT_FOUND)

        ended_at = parse_datetime(request.data.get('ended_at')) if request.data.get('ended_at') else timezone.now()
        instance.status = request.data.get('status', 'stopped')
        instance.ended_at = ended_at
        for field_name in ['recording_file_name', 'recording_file_path', 'recording_url', 'notes']:
            if field_name in request.data:
                setattr(instance, field_name, request.data.get(field_name) or '')
        if 'metadata' in request.data and isinstance(request.data.get('metadata'), dict):
            instance.metadata = request.data['metadata']
        instance.save()
        return Response(FieldRecordingSessionSerializer(instance).data)


class CategoryAthleteScoreViewSet(viewsets.ModelViewSet):
    """ViewSet for managing athlete category scores with approval workflow"""
    serializer_class = CategoryAthleteScoreSerializer
    permission_classes = [IsAthleteOwnerCoachOrAdmin]

    def get_queryset(self):
        """Return scores based on user role and visibility (includes individual and team results)"""
        user = self.request.user
        
        # Get base queryset based on user role
        if user.is_staff or hasattr(user, 'role') and user.role == 'admin':
            # Admins can see all scores (individual and team)
            queryset = CategoryAthleteScore.objects.all().select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members')
        elif hasattr(user, 'athlete'):
            athlete = user.athlete
            # Athletes can see their own scores + team scores they're part of + approved scores from others
            own_scores = CategoryAthleteScore.objects.filter(athlete=athlete)
            team_scores = CategoryAthleteScore.objects.filter(team_members=athlete)
            approved_scores = CategoryAthleteScore.objects.filter(status='approved').exclude(athlete=athlete).exclude(team_members=athlete)
            
            # Coaches can also see scores from athletes in their club
            if athlete.is_coach and athlete.club:
                club_athletes_scores = CategoryAthleteScore.objects.filter(athlete__club=athlete.club)
                queryset = (own_scores | team_scores | approved_scores | club_athletes_scores).select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members').distinct()
            else:
                queryset = (own_scores | team_scores | approved_scores).select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members').distinct()
        else:
            # Other users only see approved scores
            queryset = CategoryAthleteScore.objects.filter(status='approved').select_related('athlete', 'category__event', 'reviewed_by').prefetch_related('team_members')
        
        # Filter by category if provided in query params
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)

        event_id = self.request.query_params.get('event_id')
        if event_id is not None:
            queryset = queryset.filter(category__event_id=event_id)

        athlete_id = self.request.query_params.get('athlete')
        if athlete_id is not None:
            queryset = queryset.filter(
                models.Q(athlete_id=athlete_id) |
                models.Q(team_members__id=athlete_id)
            ).distinct()
        
        return queryset

    def perform_create(self, serializer):
        """Ensure only athletes can create scores for themselves"""
        if not hasattr(self.request.user, 'athlete'):
            raise ValidationError("Only athletes can submit competition results")
        
        # The serializer will handle setting the athlete and logging the activity
        serializer.save()

    def update(self, request, *args, **kwargs):
        """Allow athletes to update their own scores, and coaches to update their club athletes' scores"""
        instance = self.get_object()
        
        # Check if user has permission
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'Only athletes and coaches can edit results'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        user_athlete = request.user.athlete
        is_own_result = instance.athlete == user_athlete
        is_coach_of_club = (user_athlete.is_coach and 
                           user_athlete.club and 
                           instance.athlete.club == user_athlete.club and
                           user_athlete.club.coaches.filter(pk=user_athlete.pk).exists())
        
        if not (is_own_result or is_coach_of_club) or not instance.submitted_by_athlete:
            return Response(
                {'error': 'You can only edit your own submitted results or your club athletes\' results'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check status
        if instance.status not in ['pending', 'revision_required']:
            return Response(
                {'error': 'Can only edit pending or revision-required results'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Reset status to pending if it was revision_required
        if instance.status == 'revision_required':
            instance.status = 'pending'
            instance.reviewed_date = None
            instance.reviewed_by = None
            instance.admin_notes = ''
            instance.save()
        
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Only allow athletes to delete their own pending scores"""
        instance = self.get_object()
        
        # Check ownership
        if not hasattr(request.user, 'athlete') or instance.athlete != request.user.athlete or not instance.submitted_by_athlete:
            return Response(
                {'error': 'You can only delete your own submitted results'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check status
        if instance.status != 'pending':
            return Response(
                {'error': 'Can only delete pending results'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """Admin action to approve a score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.approve(request.user, notes)
            
            return Response({
                'message': 'Result approved successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """Admin action to reject a score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.reject(request.user, notes)
            
            return Response({
                'message': 'Result rejected successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def request_revision(self, request, pk=None):
        """Admin action to request revision on a score"""
        score = self.get_object()
        serializer = CategoryScoreApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            score.request_revision(request.user, notes)
            
            return Response({
                'message': 'Revision requested successfully',
                'status': score.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def my_results(self, request):
        """Get all results for the current athlete (submitted by them OR team results they're part of)"""
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'User does not have an athlete profile'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get results submitted by this athlete OR team results where they are a member
        scores = CategoryAthleteScore.objects.filter(
            models.Q(athlete=request.user.athlete, submitted_by_athlete=True) |  # Individual results they submitted
            models.Q(team_members=request.user.athlete, type='teams')     # Team results they're part of
        ).select_related('category__competition', 'reviewed_by', 'athlete').prefetch_related('team_members').distinct()
        
        serializer = self.get_serializer(scores, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def all_results(self, request):
        """Get ALL results for the current athlete (both official and submitted)"""
        # Check if an athlete_id parameter is provided (for viewing other athletes)
        athlete_id = request.query_params.get('athlete_id')
        
        if athlete_id:
            # Get results for specific athlete (requires authentication)
            try:
                target_athlete = Athlete.objects.get(id=athlete_id)
            except Athlete.DoesNotExist:
                return Response(
                    {'error': 'Athlete not found'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Get results for current user's athlete
            if not hasattr(request.user, 'athlete'):
                return Response(
                    {'error': 'User does not have an athlete profile'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            target_athlete = request.user.athlete
        
        # Get results for the target athlete with visibility rules:
        # 1. Individual results where they are the athlete 
        # 2. Team results where they are a team member
        base_query = CategoryAthleteScore.objects.filter(
            models.Q(athlete=target_athlete) |                              # All individual results (official + submitted)
            models.Q(team_members=target_athlete, type='teams')      # All team results they're part of
        ).select_related('category__competition', 'reviewed_by', 'athlete').prefetch_related('team_members').distinct()
        
        # Apply visibility rules based on authentication and status
        if athlete_id:
            # Viewing a specific athlete's profile
            if request.user.is_authenticated and hasattr(request.user, 'athlete') and request.user.athlete.id == int(athlete_id):
                # User viewing their own profile - show all results
                scores = base_query
            else:
                # User viewing someone else's profile (or unauthenticated) - only show approved results
                scores = base_query.filter(status='approved')
        else:
            # Viewing current user's own results via my-profile - requires authentication
            if not request.user.is_authenticated:
                return Response(
                    {'error': 'Authentication required when not specifying athlete_id'}, 
                    status=status.HTTP_401_UNAUTHORIZED
                )
            # User viewing their own results via my-profile - show all results
            scores = base_query
        
        serializer = self.get_serializer(scores, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], permission_classes=[IsAdmin])
    def pending_review(self, request):
        """Get all scores pending admin review (individual and team)"""
        scores = CategoryAthleteScore.objects.filter(
            status='pending', 
            submitted_by_athlete=True
        ).select_related('athlete', 'category__event').prefetch_related('team_members')
        serializer = self.get_serializer(scores, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_team_results(self, request):
        """Get all team results for the current athlete"""
        if not hasattr(request.user, 'athlete'):
            return Response(
                {'error': 'User does not have an athlete profile'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get team results where user is submitter or team member
        team_scores = CategoryAthleteScore.objects.filter(
            models.Q(athlete=request.user.athlete, type='teams') |
            models.Q(team_members=request.user.athlete, type='teams')
        ).select_related('category__event', 'reviewed_by').prefetch_related('team_members').distinct()
        
        serializer = self.get_serializer(team_scores, many=True)
        return Response(serializer.data)


# Notification System Views
class NotificationViewSet(viewsets.ModelViewSet):
    """ViewSet for user notifications"""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return notifications for the current user"""
        return Notification.objects.filter(recipient=self.request.user)
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications"""
        from .notification_utils import get_unread_notification_count
        count = get_unread_notification_count(request.user)
        return Response({'unread_count': count})
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a specific notification as read"""
        notification = self.get_object()
        notification.mark_as_read()
        return Response({'message': 'Notification marked as read'})
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read for the current user"""
        from .notification_utils import mark_notifications_as_read
        updated_count = mark_notifications_as_read(request.user)
        return Response({
            'message': f'{updated_count} notifications marked as read',
            'updated_count': updated_count
        })
    
    @action(detail=False, methods=['post'])
    def mark_selected_read(self, request):
        """Mark selected notifications as read"""
        serializer = NotificationActionSerializer(data=request.data)
        if serializer.is_valid():
            notification_ids = serializer.validated_data.get('notification_ids', [])
            if notification_ids:
                from .notification_utils import mark_notifications_as_read
                updated_count = mark_notifications_as_read(request.user, notification_ids)
                return Response({
                    'message': f'{updated_count} notifications marked as read',
                    'updated_count': updated_count
                })
            else:
                return Response({'error': 'No notification IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class NotificationSettingsViewSet(viewsets.ModelViewSet):
    """ViewSet for user notification settings"""
    serializer_class = NotificationSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return notification settings for the current user"""
        return NotificationSettings.objects.filter(user=self.request.user)
    
    def get_object(self):
        """Get or create notification settings for the current user"""
        settings, created = NotificationSettings.objects.get_or_create(user=self.request.user)
        return settings
    
    def update(self, request, *args, **kwargs):
        """Update notification settings"""
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# Grade History Submission Views
class GradeHistorySubmissionViewSet(viewsets.ModelViewSet):
    """ViewSet for athlete grade history submissions with approval workflow"""
    serializer_class = GradeHistorySubmissionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return grade history for the current user, coach club, or all for admin."""
        qs = GradeHistory.objects.select_related('athlete', 'grade', 'event', 'examiner_1', 'examiner_2')
        user = self.request.user

        if getattr(user, 'is_admin', False) or getattr(user, 'role', None) == 'admin':
            pass
        elif hasattr(user, 'athlete') and user.athlete:
            if user.athlete.is_coach and user.athlete.club_id:
                qs = qs.filter(athlete__club_id=user.athlete.club_id)
            else:
                qs = qs.filter(athlete=user.athlete)
        else:
            return GradeHistory.objects.none()

        event_id = self.request.query_params.get('event')
        if event_id:
            qs = qs.filter(event_id=event_id)

        athlete_id = self.request.query_params.get('athlete')
        if athlete_id:
            qs = qs.filter(athlete_id=athlete_id)

        my_club = self.request.query_params.get('my_club')
        if my_club and str(my_club).lower() in ('1', 'true', 'yes') and hasattr(user, 'athlete') and user.athlete and user.athlete.club_id:
            qs = qs.filter(athlete__club_id=user.athlete.club_id)

        return qs.order_by('-submitted_date')

    def create(self, request, *args, **kwargs):
        """Robust create handler: ensure any unexpected post-save failures
        do not leave the client with an unclear 500 when the record was
        actually persisted. Returns serialized object on success.
        """
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        try:
            instance = serializer.save()
        except Exception as e:
            # If save raised, attempt to detect if an instance was created and
            # return a helpful error payload including the traceback so the
            # frontend can surface it during development.
            import logging, traceback
            logger = logging.getLogger(__name__)
            tb = traceback.format_exc()
            logger.error('Unhandled exception during GradeHistorySubmission create: %s\n%s', e, tb)
            # Try to return a serialized instance if serializer.instance is set
            try:
                inst = getattr(serializer, 'instance', None)
                if inst is not None:
                    out_serializer = self.get_serializer(inst)
                    return Response(out_serializer.data, status=status.HTTP_201_CREATED)
            except Exception:
                pass
            return Response({'detail': 'Failed to process submission, please contact support.', 'error': str(e), 'traceback': tb}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        out_serializer = self.get_serializer(instance)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """Admin action to approve a grade history"""
        grade_history = self.get_object()
        serializer = GradeHistoryApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            grade_history.approve(request.user, notes)
            
            return Response({
                'message': 'Grade history approved successfully',
                'status': grade_history.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """Admin action to reject a grade history"""
        grade_history = self.get_object()
        serializer = GradeHistoryApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            grade_history.reject(request.user, notes)
            
            return Response({
                'message': 'Grade history rejected successfully',
                'status': grade_history.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def request_revision(self, request, pk=None):
        """Admin action to request revision of a grade history"""
        grade_history = self.get_object()
        serializer = GradeHistoryApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            grade_history.request_revision(request.user, notes)
            
            return Response({
                'message': 'Revision requested successfully',
                'status': grade_history.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Training Seminar Participation Views
class TrainingSeminarParticipationViewSet(viewsets.ModelViewSet):
    """ViewSet for athlete training seminar participation submissions with approval workflow"""
    serializer_class = TrainingSeminarParticipationSerializer
    # Allow coaches to manage their club athletes' seminar participations
    permission_classes = [IsAthleteOwnerCoachOrAdmin]
    
    def perform_create(self, serializer):
        """Set the athlete and submitted_by_athlete flag when creating"""
        try:
            serializer.save(
                athlete=self.request.user.athlete,
                submitted_by_athlete=True
            )
        except IntegrityError:
            # In case of a race or missed validation, return a friendly 400
            # Use 'event' key as the canonical target now that we prefer events.
            raise ValidationError({'event': 'You have already submitted participation for this event.'})
    
    def get_queryset(self):
        """Return seminar participations for the current user if athlete, all if admin"""
        # Allow filtering by event via query param (for coach enrollment workflow)
        event_param = self.request.query_params.get('event')
        if event_param:
            try:
                event_id = int(event_param)
            except (TypeError, ValueError):
                return TrainingSeminarParticipation.objects.none()
            
            # Return all approved participations for this event (for coach to see who's already enrolled)
            return TrainingSeminarParticipation.objects.filter(
                event__id=event_id,
                status='approved'
            ).select_related('athlete', 'event')
        
        # Allow filtering by athlete via query param when the requester is admin
        athlete_param = self.request.query_params.get('athlete')
        # If an athlete query param is provided and requester is admin, return that athlete's participations
        if athlete_param:
            try:
                athlete_id = int(athlete_param)
            except (TypeError, ValueError):
                return TrainingSeminarParticipation.objects.none()

            # If the requester is admin, return everything for that athlete
            if self.request.user.is_authenticated and getattr(self.request.user, 'role', None) == 'admin':
                return TrainingSeminarParticipation.objects.filter(athlete__id=athlete_id)

            # If the requester is the athlete themself, allow access to their participations
            if hasattr(self.request.user, 'athlete') and getattr(self.request.user.athlete, 'id', None) == athlete_id:
                return TrainingSeminarParticipation.objects.filter(athlete=self.request.user.athlete)

            # Public access: allow anonymous viewers to see only approved participations for the athlete
            return TrainingSeminarParticipation.objects.filter(athlete__id=athlete_id, status='approved')

        # Default behaviour: if the user has an athlete profile, return their participations.
        if hasattr(self.request.user, 'athlete'):
            return TrainingSeminarParticipation.objects.filter(athlete=self.request.user.athlete).select_related('event')
        # Admins who didn't specify an athlete get all participations
        if self.request.user.is_authenticated and getattr(self.request.user, 'role', None) == 'admin':
            return TrainingSeminarParticipation.objects.all().select_related('event', 'athlete')
        return TrainingSeminarParticipation.objects.none()
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """Admin action to approve a seminar participation"""
        participation = self.get_object()
        serializer = TrainingSeminarParticipationApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            participation.approve(request.user, notes)
            
            return Response({
                'message': 'Seminar participation approved successfully',
                'status': participation.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """Admin action to reject a seminar participation"""
        participation = self.get_object()
        serializer = TrainingSeminarParticipationApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            participation.reject(request.user, notes)
            
            return Response({
                'message': 'Seminar participation rejected successfully',
                'status': participation.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def request_revision(self, request, pk=None):
        """Admin action to request revision of a seminar participation"""
        participation = self.get_object()
        serializer = TrainingSeminarParticipationApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            notes = serializer.validated_data.get('notes', '')
            participation.request_revision(request.user, notes)
            
            return Response({
                'message': 'Revision requested successfully',
                'status': participation.status
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EventEnrollmentViewSet(viewsets.ViewSet):
    """ViewSet for coaches to enroll their club athletes in events"""
    permission_classes = [IsAuthenticated]

    def _can_manage_event_enrollment(self, user, athlete):
        if not user or not user.is_authenticated:
            return False

        if getattr(user, 'is_admin', False) or getattr(user, 'role', None) == 'admin':
            return True

        user_athlete = getattr(user, 'athlete', None)
        if user_athlete and athlete.club_id and user_athlete.club_id == athlete.club_id:
            return True

        return SupporterAthleteRelation.objects.filter(
            supporter=user,
            athlete=athlete,
            can_register_competitions=True,
        ).exists()
    
    def create(self, request):
        """Enroll a club athlete in an event"""
        athlete_id = request.data.get('athlete')
        event_id = request.data.get('event')
        
        if not athlete_id or not event_id:
            return Response(
                {'error': 'athlete and event are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            athlete = Athlete.objects.get(id=athlete_id)
            event = Event.objects.get(id=event_id)
        except (Athlete.DoesNotExist, Event.DoesNotExist):
            return Response(
                {'error': 'Athlete or event not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Verify the requester can manage enrollments for this athlete
        if not self._can_manage_event_enrollment(request.user, athlete):
            return Response(
                {'error': 'Nu ai permisiunea să înscrii acest sportiv la eveniment'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if already enrolled
        from landing.models import Event as LandingEvent
        existing = TrainingSeminarParticipation.objects.filter(
            athlete=athlete,
            event=event
        ).exists()
        if existing:
            return Response(
                {'error': 'Athlete is already enrolled in this event'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create the event participation
        participation = TrainingSeminarParticipation.objects.create(
            athlete=athlete,
            event=event,
            submitted_by_athlete=False,
            status='approved'  # Auto-approve coach enrollments
        )
        
        serializer = TrainingSeminarParticipationSerializer(participation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    def destroy(self, request, pk=None):
        """Unenroll a club athlete from an event"""
        try:
            participation = TrainingSeminarParticipation.objects.get(pk=pk)
        except TrainingSeminarParticipation.DoesNotExist:
            return Response(
                {'error': 'Enrollment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Verify the requester can manage enrollments for this athlete
        if not self._can_manage_event_enrollment(request.user, participation.athlete):
            return Response(
                {'error': 'Nu ai permisiunea să retragi acest sportiv din eveniment'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        athlete_id = participation.athlete_id
        participation.delete()
        
        return Response(
            {'message': 'Athlete unenrolled successfully', 'athlete_id': athlete_id},
            status=status.HTTP_200_OK
        )


# ============================================================================
# PWA COMPETITION MANAGEMENT VIEWSETS
# ============================================================================

class CompetitionFieldViewSet(viewsets.ViewSet):
    """ViewSet for managing competition fields/tatamis"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all fields for an event"""
        event_id = request.query_params.get('event_id') or request.query_params.get('competition')
        if event_id:
            fields = CompetitionField.objects.filter(event_id=event_id).order_by('field_number')
        else:
            fields = CompetitionField.objects.all().order_by('field_number')
        
        serializer = CompetitionFieldSerializer(fields, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new competition field"""
        from landing.models import Event
        event = Event.objects.filter(pk=request.data.get('event')).first() if request.data.get('event') else None
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked
        serializer = CompetitionFieldSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='set-count')
    def set_count(self, request):
        """Bulk set the number of fields for an event.
        Accepts { event_id: int, count: int }.
        Creates/deletes fields so the event ends up with exactly `count` terenuri.
        """
        event_id = request.data.get('event_id') or request.data.get('competition')
        count = request.data.get('count')
        if not event_id or count is None:
            return Response({'detail': 'event_id and count are required.'}, status=400)
        try:
            count = int(count)
            if count < 0 or count > 20:
                raise ValueError
        except (ValueError, TypeError):
            return Response({'detail': 'count must be an integer between 0 and 20.'}, status=400)
        from landing.models import Event
        try:
            event = Event.objects.get(pk=event_id, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Competition not found.'}, status=404)
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked

        existing = list(CompetitionField.objects.filter(event_id=event_id).order_by('field_number'))
        current_count = len(existing)

        if count > current_count:
            # Add fields
            for i in range(current_count + 1, count + 1):
                CompetitionField.objects.create(
                    event_id=event_id,
                    name=f'Teren {i}',
                    field_number=i,
                )
        elif count < current_count:
            # Remove from the end (highest field_number first)
            to_delete = existing[count:]
            CompetitionField.objects.filter(id__in=[f.id for f in to_delete]).delete()

        fields = CompetitionField.objects.filter(event_id=event_id).order_by('field_number')
        serializer = CompetitionFieldSerializer(fields, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single competition field"""
        try:
            field = CompetitionField.objects.get(pk=pk)
            serializer = CompetitionFieldSerializer(field)
            return Response(serializer.data)
        except CompetitionField.DoesNotExist:
            return Response({'error': 'Field not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a competition field"""
        try:
            field = CompetitionField.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(field, 'event', None))
            if locked is not None:
                return locked
            serializer = CompetitionFieldSerializer(field, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except CompetitionField.DoesNotExist:
            return Response({'error': 'Field not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        """Partial update a competition field (PATCH)"""
        return self.update(request, pk)
    
    def destroy(self, request, pk=None):
        """Delete a competition field"""
        try:
            field = CompetitionField.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(field, 'event', None))
            if locked is not None:
                return locked
            field.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CompetitionField.DoesNotExist:
            return Response({'error': 'Field not found'}, status=status.HTTP_404_NOT_FOUND)


class FieldBreakViewSet(viewsets.ViewSet):
    """ViewSet for managing breaks/pauses in field schedules"""
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        event_id = request.query_params.get('event_id')
        field_id = request.query_params.get('field_id')
        qs = FieldBreak.objects.select_related('field')
        if event_id:
            qs = qs.filter(field__event_id=event_id)
        if field_id:
            qs = qs.filter(field_id=field_id)
        qs = qs.order_by('order')
        serializer = FieldBreakSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        serializer = FieldBreakSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        try:
            obj = FieldBreak.objects.get(pk=pk)
            return Response(FieldBreakSerializer(obj).data)
        except FieldBreak.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        try:
            obj = FieldBreak.objects.get(pk=pk)
            serializer = FieldBreakSerializer(obj, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except FieldBreak.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            FieldBreak.objects.get(pk=pk).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except FieldBreak.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'], url_path='bulk-reorder')
    def bulk_reorder(self, request):
        """Bulk update order for multiple field breaks.
        Body: { items: [{ id, order }, ...] }
        """
        items = request.data.get('items', [])
        for item in items:
            FieldBreak.objects.filter(pk=item['id']).update(order=item.get('order', 0))
        return Response({'status': 'ok'})


class CategoryFieldAssignmentViewSet(viewsets.ViewSet):
    """ViewSet for category-to-field assignments"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all category-field assignments"""
        event_id = request.query_params.get('event_id')
        field_id = request.query_params.get('field_id')
        
        assignments = CategoryFieldAssignment.objects.all()
        
        if event_id:
            assignments = assignments.filter(field__event_id=event_id)
        if field_id:
            assignments = assignments.filter(field_id=field_id)
        
        assignments = assignments.order_by('order')
        serializer = CategoryFieldAssignmentSerializer(assignments, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a category-field assignment"""
        category = Category.objects.select_related('event').filter(pk=request.data.get('category')).first()
        locked = _event_operational_lock_response(getattr(category, 'event', None))
        if locked is not None:
            return locked
        serializer = CategoryFieldAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single assignment"""
        try:
            assignment = CategoryFieldAssignment.objects.get(pk=pk)
            serializer = CategoryFieldAssignmentSerializer(assignment)
            return Response(serializer.data)
        except CategoryFieldAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a category-field assignment"""
        try:
            assignment = CategoryFieldAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(assignment, 'category', None), 'event', None))
            if locked is not None:
                return locked
            serializer = CategoryFieldAssignmentSerializer(assignment, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except CategoryFieldAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        """Partial update a category-field assignment (PATCH)"""
        return self.update(request, pk)
    
    def destroy(self, request, pk=None):
        """Delete a category-field assignment"""
        try:
            assignment = CategoryFieldAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(assignment, 'category', None), 'event', None))
            if locked is not None:
                return locked
            assignment.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CategoryFieldAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'], url_path='bulk-reorder')
    def bulk_reorder(self, request):
        """Bulk update order and field for multiple category-field assignments.
        Body: { items: [{ id, field, order, estimated_duration }, ...] }
        """
        items = request.data.get('items', [])
        if items:
            assignment = CategoryFieldAssignment.objects.select_related('category__event').filter(pk=items[0].get('id')).first()
            locked = _event_operational_lock_response(getattr(getattr(assignment, 'category', None), 'event', None))
            if locked is not None:
                return locked
        for item in items:
            updates = {'order': item.get('order', 0)}
            if 'field' in item:
                updates['field_id'] = item['field']
            if 'estimated_duration' in item:
                updates['estimated_duration'] = item['estimated_duration']
            CategoryFieldAssignment.objects.filter(pk=item['id']).update(**updates)
        return Response({'status': 'ok'})


class DisplayMonitorSessionViewSet(viewsets.ViewSet):
    """ViewSet for managing display monitor sessions.
    Public read access needed for public-display app (no auth).
    """
    permission_classes = [permissions.AllowAny]
    
    def list(self, request):
        """List all monitor sessions"""
        event_id = request.query_params.get('event_id')
        field_id = request.query_params.get('field')
        sessions = DisplayMonitorSession.objects.all()
        
        if event_id:
            sessions = sessions.filter(field__event_id=event_id)
        if field_id:
            sessions = sessions.filter(field_id=field_id)
        
        serializer = DisplayMonitorSessionSerializer(sessions, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new monitor session"""
        field = CompetitionField.objects.select_related('event').filter(pk=request.data.get('field')).first()
        locked = _event_operational_lock_response(getattr(field, 'event', None))
        if locked is not None:
            return locked
        serializer = DisplayMonitorSessionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single monitor session"""
        try:
            session = DisplayMonitorSession.objects.get(pk=pk)
            serializer = DisplayMonitorSessionSerializer(session)
            return Response(serializer.data)
        except DisplayMonitorSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a monitor session"""
        try:
            session = DisplayMonitorSession.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(session, 'field', None), 'event', None))
            if locked is not None:
                return locked
            serializer = DisplayMonitorSessionSerializer(session, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except DisplayMonitorSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        """Partial update (PATCH) a monitor session"""
        return self.update(request, pk)
    
    def destroy(self, request, pk=None):
        """Delete a monitor session"""
        try:
            session = DisplayMonitorSession.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(session, 'field', None), 'event', None))
            if locked is not None:
                return locked
            session.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except DisplayMonitorSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)


class MatchRoundViewSet(viewsets.ViewSet):
    """ViewSet for managing match rounds in fighting competitions"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all match rounds"""
        match_id = request.query_params.get('match_id')
        event_id = request.query_params.get('event_id')
        rounds = MatchRound.objects.all()
        
        if match_id:
            rounds = rounds.filter(match_id=match_id)
        if event_id:
            rounds = rounds.filter(match__category__event_id=event_id)
        
        rounds = rounds.order_by('round_number')
        serializer = MatchRoundSerializer(rounds, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new match round"""
        match = Match.objects.select_related('category__event').filter(pk=request.data.get('match')).first()
        locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
        if locked is not None:
            return locked
        serializer = MatchRoundSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single match round"""
        try:
            round_obj = MatchRound.objects.get(pk=pk)
            serializer = MatchRoundSerializer(round_obj)
            return Response(serializer.data)
        except MatchRound.DoesNotExist:
            return Response({'error': 'Round not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a match round"""
        try:
            round_obj = MatchRound.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(round_obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            data = request.data.copy()
            next_status = data.get('status')
            if next_status == 'completed':
                if not data.get('ended_at'):
                    data['ended_at'] = timezone.now().isoformat()
                if round_obj.paused_at:
                    pause_duration = int((timezone.now() - round_obj.paused_at).total_seconds())
                    data['accumulated_pause_seconds'] = int(round_obj.accumulated_pause_seconds or 0) + max(pause_duration, 0)
                    data['paused_at'] = None
            elif next_status == 'active' and not data.get('started_at') and not round_obj.started_at:
                data['started_at'] = timezone.now().isoformat()

            serializer = MatchRoundSerializer(round_obj, data=data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except MatchRound.DoesNotExist:
            return Response({'error': 'Round not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def partial_update(self, request, pk=None):
        """Partial update a match round (PATCH)"""
        return self.update(request, pk)
    
    def destroy(self, request, pk=None):
        """Delete a match round"""
        try:
            round_obj = MatchRound.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(round_obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            round_obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except MatchRound.DoesNotExist:
            return Response({'error': 'Round not found'}, status=status.HTTP_404_NOT_FOUND)


def _legacy_metadata_matches(metadata, **expected):
    if not isinstance(metadata, dict):
        return False
    for key, value in expected.items():
        if metadata.get(key) != value:
            return False
    return True


def _delete_legacy_point_events(match_id, predicate):
    ids = [
        event.id
        for event in RefereePointEvent.objects.filter(match_id=match_id)
        if predicate(event)
    ]
    if ids:
        RefereePointEvent.objects.filter(id__in=ids).delete()


def _resolve_legacy_penalty_referee_id(match_obj, event_obj):
    if getattr(match_obj, 'central_referee_id', None):
        return match_obj.central_referee_id
    if getattr(event_obj, 'created_by_id', None):
        try:
            athlete = Athlete.objects.filter(pk=event_obj.created_by_id, is_referee=True).first()
            if athlete:
                return athlete.id
        except Exception:
            pass
    assignment = getattr(match_obj, 'referee_assignment', None)
    if assignment:
        for attr in ('referee_1_id', 'referee_2_id', 'referee_3_id', 'referee_4_id', 'referee_5_id'):
            referee_id = getattr(assignment, attr, None)
            if referee_id:
                return referee_id
    return None


def _sync_match_event_to_legacy(event_obj):
    if event_obj.event_type not in ('penalty_red', 'penalty_blue'):
        return

    match_obj = event_obj.match
    referee_id = _resolve_legacy_penalty_referee_id(match_obj, event_obj)
    if not referee_id:
        return

    metadata = {
        'origin': 'match_event_sync',
        'central': True,
        'match_event_id': event_obj.id,
    }
    if event_obj.round_id:
        try:
            metadata['round'] = event_obj.round.round_number
        except Exception:
            pass

    legacy_event = None
    for candidate in RefereePointEvent.objects.filter(match=match_obj, referee_id=referee_id, event_type='penalty'):
        if _legacy_metadata_matches(candidate.metadata, origin='match_event_sync', match_event_id=event_obj.id):
            legacy_event = candidate
            break

    payload = {
        'side': 'red' if event_obj.corner == 'red' else 'blue',
        'points': event_obj.value,
        'metadata': metadata,
        'created_by': getattr(getattr(event_obj, 'created_by', None), 'user', None),
    }
    if legacy_event:
        for key, value in payload.items():
            setattr(legacy_event, key, value)
        legacy_event.save()
    else:
        RefereePointEvent.objects.create(
            match=match_obj,
            referee_id=referee_id,
            event_type='penalty',
            **payload,
        )


def _sync_match_referee_score_to_legacy(match_id, referee_id):
    scores = list(
        MatchRefereeScore.objects.filter(match_id=match_id, referee_id=referee_id)
        .select_related('round')
        .order_by('round__round_number', 'id')
    )

    _delete_legacy_point_events(
        match_id,
        lambda event: event.referee_id == referee_id
        and event.event_type == 'score'
        and _legacy_metadata_matches(event.metadata, origin='match_referee_score_sync')
    )

    if not scores:
        RefereeScore.objects.filter(match_id=match_id, referee_id=referee_id).delete()
        return

    round_scores = [score for score in scores if score.round_id]
    final_score = next((score for score in scores if score.round_id is None), None)

    total_red = 0
    total_blue = 0
    for score in round_scores:
        round_number = getattr(score.round, 'round_number', None) or 1
        red_points = int(score.red_corner_score or 0)
        blue_points = int(score.blue_corner_score or 0)
        total_red += red_points
        total_blue += blue_points

        RefereePointEvent.objects.create(
            match_id=match_id,
            referee_id=referee_id,
            side='red',
            points=red_points,
            event_type='score',
            processed=True,
            metadata={
                'round': round_number,
                'origin': 'match_referee_score_sync',
                'match_referee_score_id': score.id,
            },
        )
        RefereePointEvent.objects.create(
            match_id=match_id,
            referee_id=referee_id,
            side='blue',
            points=blue_points,
            event_type='score',
            processed=True,
            metadata={
                'round': round_number,
                'origin': 'match_referee_score_sync',
                'match_referee_score_id': score.id,
            },
        )

    if final_score:
        winner = final_score.winner_choice
    elif total_red > total_blue:
        winner = 'red'
    elif total_blue > total_red:
        winner = 'blue'
    else:
        winner = None

    if not round_scores and final_score:
        total_red = int(final_score.red_corner_score or 0)
        total_blue = int(final_score.blue_corner_score or 0)

    RefereeScore.objects.update_or_create(
        match_id=match_id,
        referee_id=referee_id,
        defaults={
            'red_corner_score': total_red,
            'blue_corner_score': total_blue,
            'winner': winner,
        }
    )


class MatchEventViewSet(viewsets.ViewSet):
    """ViewSet for match events: warnings, penalties, pauses, time adjustments"""
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        match_id = request.query_params.get('match_id')
        event_id = request.query_params.get('event_id')
        event_type = request.query_params.get('event_type')
        qs = MatchEvent.objects.all()
        if match_id:
            qs = qs.filter(match_id=match_id)
        if event_id:
            qs = qs.filter(match__category__event_id=event_id)
        if event_type:
            qs = qs.filter(event_type=event_type)
        serializer = MatchEventSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        match = Match.objects.select_related('category__event').filter(pk=data.get('match')).first()
        locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
        if locked is not None:
            return locked
        # Auto-set created_by to current user's athlete if available
        if hasattr(request.user, 'athlete'):
            data.setdefault('created_by', request.user.athlete.id)
        serializer = MatchEventSerializer(data=data)
        if serializer.is_valid():
            event = serializer.save()

            try:
                _sync_match_event_to_legacy(event)
            except Exception:
                pass

            # Handle side-effects for pause/resume/time events
            round_obj = event.round
            if round_obj and event.event_type == 'pause' and round_obj.status == 'active' and not round_obj.paused_at:
                from django.utils import timezone
                round_obj.paused_at = timezone.now()
                round_obj.save(update_fields=['paused_at'])
            elif round_obj and event.event_type == 'resume' and round_obj.paused_at:
                from django.utils import timezone
                pause_duration = int((timezone.now() - round_obj.paused_at).total_seconds())
                round_obj.accumulated_pause_seconds += pause_duration
                round_obj.paused_at = None
                round_obj.save(update_fields=['paused_at', 'accumulated_pause_seconds'])
            elif round_obj and event.event_type in ('time_add', 'time_remove'):
                round_obj.extra_seconds += event.value
                round_obj.save(update_fields=['extra_seconds'])

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        try:
            obj = MatchEvent.objects.get(pk=pk)
            return Response(MatchEventSerializer(obj).data)
        except MatchEvent.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, pk=None):
        try:
            obj = MatchEvent.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            try:
                _delete_legacy_point_events(
                    obj.match_id,
                    lambda event: _legacy_metadata_matches(event.metadata, origin='match_event_sync', match_event_id=obj.id)
                )
            except Exception:
                pass
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except MatchEvent.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


class MatchRefereeScoreViewSet(viewsets.ViewSet):
    """ViewSet for managing individual referee scores in fighting matches"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        match_id = request.query_params.get('match_id')
        event_id = request.query_params.get('event_id')
        round_id = request.query_params.get('round_id')
        qs = MatchRefereeScore.objects.all()
        if match_id:
            qs = qs.filter(match_id=match_id)
        if event_id:
            qs = qs.filter(match__category__event_id=event_id)
        if round_id:
            qs = qs.filter(round_id=round_id)
        serializer = MatchRefereeScoreSerializer(qs, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        data = request.data.copy()
        match = Match.objects.select_related('category__event').filter(pk=data.get('match')).first()
        locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
        if locked is not None:
            return locked
        # Auto-populate referee from authenticated user's athlete profile
        if 'referee' not in data or not data['referee']:
            try:
                data['referee'] = request.user.athlete.id
            except Exception:
                return Response(
                    {'error': 'Nu aveți un profil de arbitru asociat.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        serializer = MatchRefereeScoreSerializer(data=data)
        if serializer.is_valid():
            instance = serializer.save()
            try:
                _sync_match_referee_score_to_legacy(instance.match_id, instance.referee_id)
            except Exception:
                pass
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        try:
            obj = MatchRefereeScore.objects.get(pk=pk)
            return Response(MatchRefereeScoreSerializer(obj).data)
        except MatchRefereeScore.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        try:
            obj = MatchRefereeScore.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            serializer = MatchRefereeScoreSerializer(obj, data=request.data, partial=True)
            if serializer.is_valid():
                instance = serializer.save()
                try:
                    _sync_match_referee_score_to_legacy(instance.match_id, instance.referee_id)
                except Exception:
                    pass
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except MatchRefereeScore.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def partial_update(self, request, pk=None):
        """Partial update (PATCH)"""
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        """Delete a referee score"""
        try:
            obj = MatchRefereeScore.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            match_id = obj.match_id
            referee_id = obj.referee_id
            obj.delete()
            try:
                _sync_match_referee_score_to_legacy(match_id, referee_id)
            except Exception:
                pass
            return Response(status=status.HTTP_204_NO_CONTENT)
        except MatchRefereeScore.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


class QRCodeAssignmentViewSet(viewsets.ViewSet):
    """ViewSet for QR code assignments"""
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        """List all QR code assignments"""
        referee_id = request.query_params.get('referee_id')
        active_only = request.query_params.get('active_only', 'false').lower() == 'true'
        
        qr_codes = QRCodeAssignment.objects.all()
        
        if referee_id:
            qr_codes = qr_codes.filter(referee_id=referee_id)
        if active_only:
            qr_codes = qr_codes.filter(is_active=True)
        
        serializer = QRCodeAssignmentSerializer(qr_codes, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """Create a new QR code assignment"""
        serializer = QRCodeAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def retrieve(self, request, pk=None):
        """Retrieve a single QR code assignment"""
        try:
            qr_code = QRCodeAssignment.objects.get(pk=pk)
            serializer = QRCodeAssignmentSerializer(qr_code)
            return Response(serializer.data)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'QR code not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update(self, request, pk=None):
        """Update a QR code assignment"""
        try:
            qr_code = QRCodeAssignment.objects.get(pk=pk)
            serializer = QRCodeAssignmentSerializer(qr_code, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'QR code not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def destroy(self, request, pk=None):
        """Delete a QR code assignment"""
        try:
            qr_code = QRCodeAssignment.objects.get(pk=pk)
            qr_code.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'QR code not found'}, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=False, methods=['post'])
    def verify_qr_code(self, request):
        """Verify a QR code and get referee assignment"""
        code = request.data.get('code')
        if not code:
            return Response({'error': 'QR code required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            qr_assignment = QRCodeAssignment.objects.get(code=code, is_active=True)
            # Check if QR code has expired
            if qr_assignment.expires_at and timezone.now() > qr_assignment.expires_at:
                return Response({'error': 'QR code has expired'}, status=status.HTTP_400_BAD_REQUEST)
            
            serializer = QRCodeAssignmentSerializer(qr_assignment)
            return Response(serializer.data)
        except QRCodeAssignment.DoesNotExist:
            return Response({'error': 'Invalid or inactive QR code'}, status=status.HTTP_400_BAD_REQUEST)


# ═══════════════════════════════════════════════════════
# Match Field Assignment ViewSet
# ═══════════════════════════════════════════════════════

class MatchFieldAssignmentViewSet(viewsets.ViewSet):
    """ViewSet for assigning matches to competition fields"""
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        event_id = request.query_params.get('event_id')
        field_id = request.query_params.get('field_id')
        qs = MatchFieldAssignment.objects.select_related(
            'match', 'match__category', 'match__red_corner', 'match__blue_corner', 'field'
        )
        if event_id:
            qs = qs.filter(field__event_id=event_id)
        if field_id:
            qs = qs.filter(field_id=field_id)
        qs = qs.order_by('order')
        serializer = MatchFieldAssignmentSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        match = Match.objects.select_related('category__event').filter(pk=request.data.get('match')).first()
        locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
        if locked is not None:
            return locked
        serializer = MatchFieldAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        try:
            obj = MatchFieldAssignment.objects.select_related(
                'match', 'match__category', 'match__red_corner', 'match__blue_corner', 'field'
            ).get(pk=pk)
            return Response(MatchFieldAssignmentSerializer(obj).data)
        except MatchFieldAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        try:
            obj = MatchFieldAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            serializer = MatchFieldAssignmentSerializer(obj, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except MatchFieldAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        """Partial update (PATCH)"""
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            obj = MatchFieldAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except MatchFieldAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['post'], url_path='bulk-reorder')
    def bulk_reorder(self, request):
        """Bulk update order and field for multiple match-field assignments.
        Body: { items: [{ id, field, order }, ...] }
        """
        items = request.data.get('items', [])
        if items:
            assignment = MatchFieldAssignment.objects.select_related('match__category__event').filter(pk=items[0].get('id')).first()
            locked = _event_operational_lock_response(getattr(getattr(getattr(assignment, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
        for item in items:
            MatchFieldAssignment.objects.filter(pk=item['id']).update(
                field_id=item.get('field'), order=item.get('order', 0)
            )
        return Response({'status': 'ok'})


# ═══════════════════════════════════════════════════════
# Category Referee Assignment ViewSet
# ═══════════════════════════════════════════════════════

class CategoryRefereeAssignmentViewSet(viewsets.ViewSet):
    """ViewSet for assigning 5 referees to solo/team categories"""
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        event_id = request.query_params.get('event_id')
        qs = CategoryRefereeAssignment.objects.select_related(
            'category', 'referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5'
        )
        if event_id:
            qs = qs.filter(category__event_id=event_id)
        serializer = CategoryRefereeAssignmentSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        category = Category.objects.select_related('event').filter(pk=request.data.get('category')).first()
        locked = _event_operational_lock_response(getattr(category, 'event', None))
        if locked is not None:
            return locked
        serializer = CategoryRefereeAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        try:
            obj = CategoryRefereeAssignment.objects.select_related(
                'category', 'referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5'
            ).get(pk=pk)
            return Response(CategoryRefereeAssignmentSerializer(obj).data)
        except CategoryRefereeAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        try:
            obj = CategoryRefereeAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(obj, 'category', None), 'event', None))
            if locked is not None:
                return locked
            serializer = CategoryRefereeAssignmentSerializer(obj, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except CategoryRefereeAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        """Partial update (PATCH)"""
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            obj = CategoryRefereeAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(obj, 'category', None), 'event', None))
            if locked is not None:
                return locked
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CategoryRefereeAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


# ═══════════════════════════════════════════════════════
# Match Referee Assignment ViewSet
# ═══════════════════════════════════════════════════════

class MatchRefereeAssignmentViewSet(viewsets.ViewSet):
    """ViewSet for assigning 5 referees to fight matches"""
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        event_id = request.query_params.get('event_id')
        match_id = request.query_params.get('match_id')
        qs = MatchRefereeAssignment.objects.select_related(
            'match', 'referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5'
        )
        if event_id:
            qs = qs.filter(match__category__event_id=event_id)
        if match_id:
            qs = qs.filter(match_id=match_id)
        serializer = MatchRefereeAssignmentSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        match = Match.objects.select_related('category__event').filter(pk=request.data.get('match')).first()
        locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
        if locked is not None:
            return locked
        serializer = MatchRefereeAssignmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        try:
            obj = MatchRefereeAssignment.objects.select_related(
                'match', 'referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5'
            ).get(pk=pk)
            return Response(MatchRefereeAssignmentSerializer(obj).data)
        except MatchRefereeAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        try:
            obj = MatchRefereeAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            serializer = MatchRefereeAssignmentSerializer(obj, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except MatchRefereeAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        """Partial update (PATCH)"""
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            obj = MatchRefereeAssignment.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except MatchRefereeAssignment.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


class CompetitionRefereeViewSet(viewsets.ViewSet):
    """ViewSet for managing referee roster for a competition"""
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        event_id = request.query_params.get('event_id')
        qs = CompetitionReferee.objects.select_related('athlete', 'athlete__club')
        if event_id:
            qs = qs.filter(event_id=event_id)
        serializer = CompetitionRefereeSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        from landing.models import Event
        event = Event.objects.filter(pk=request.data.get('event')).first() if request.data.get('event') else None
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked
        serializer = CompetitionRefereeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        try:
            obj = CompetitionReferee.objects.select_related('athlete', 'athlete__club').get(pk=pk)
            return Response(CompetitionRefereeSerializer(obj).data)
        except CompetitionReferee.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        try:
            obj = CompetitionReferee.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(obj, 'event', None))
            if locked is not None:
                return locked
            serializer = CompetitionRefereeSerializer(obj, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except CompetitionReferee.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, pk=None):
        """Partial update (PATCH)"""
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            obj = CompetitionReferee.objects.get(pk=pk)
            locked = _event_operational_lock_response(getattr(obj, 'event', None))
            if locked is not None:
                return locked
            obj.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except CompetitionReferee.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


class RefereePresenceViewSet(viewsets.ViewSet):
    """Heartbeat-based presence tracking for referees on scoring pages.
    Referees ping every 2s from their scoring panel; admin checks who is active.
    """
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        from datetime import timedelta
        category_id = request.query_params.get('category')
        event_id = request.query_params.get('event_id')
        cutoff = timezone.now() - timedelta(seconds=15)
        qs = RefereePresence.objects.filter(last_ping__gte=cutoff)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if event_id:
            qs = qs.filter(category__event_id=event_id)
        return Response(RefereePresenceSerializer(qs, many=True).data)

    def create(self, request):
        category = request.data.get('category')
        referee = request.data.get('referee')
        if not category or not referee:
            return Response({'error': 'category and referee required'}, status=status.HTTP_400_BAD_REQUEST)
        obj, created = RefereePresence.objects.update_or_create(
            category_id=category, referee_id=referee,
            defaults={'last_ping': timezone.now()}
        )
        return Response(RefereePresenceSerializer(obj).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def clear(self, request):
        category = request.data.get('category')
        referee = request.data.get('referee')
        if not category or not referee:
            return Response({'error': 'category and referee required'}, status=status.HTTP_400_BAD_REQUEST)
        RefereePresence.objects.filter(category_id=category, referee_id=referee).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ═══════════════════════════════════════════════════════════════════
# BRACKET GENERATION
# ═══════════════════════════════════════════════════════════════════

import math
from rest_framework.decorators import api_view, permission_classes as perm_dec


@api_view(['POST'])
@perm_dec([permissions.AllowAny])
def generate_brackets(request, category_id):
    """
    Auto-generate bracket matches for a fight category.
    Supports bracket_type: 'single_elimination' (default) or 'consolation'.
    Consolation adds a bronze match for semi-final/final losers.
    Deletes existing matches for the category and recreates them.
    """
    try:
        category = Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return Response({'error': 'Categoria nu a fost gasita.'}, status=404)

    bracket_type = request.data.get('bracket_type', 'single_elimination')

    # Get enrolled athletes for this category
    enrollments = CategoryAthlete.objects.filter(
        category=category, disqualified=False
    ).select_related('athlete')
    athletes = [e.athlete for e in enrollments]

    if len(athletes) < 2:
        return Response({'error': 'Sunt necesari minim 2 sportivi pentru a genera bracket-ul.'}, status=400)

    # Delete existing matches for this category
    category.matches.all().delete()

    # Determine bracket size (next power of 2)
    n = len(athletes)
    bracket_size = 1
    while bracket_size < n:
        bracket_size *= 2
    
    num_rounds = int(math.log2(bracket_size))
    
    # Seed athletes (simple 1 vs N, 2 vs N-1, etc.)
    import random
    seeded = list(athletes)
    random.shuffle(seeded)  # Random seeding
    
    # Pad with None for byes
    while len(seeded) < bracket_size:
        seeded.append(None)

    # Build matches round by round
    all_matches = {}  # {(round, position): match}
    
    # Create all match slots from finals backwards
    for rnd in range(num_rounds, 0, -1):
        matches_in_round = bracket_size // (2 ** rnd)
        if rnd == num_rounds:
            match_type = 'finals'
        elif rnd == num_rounds - 1 and num_rounds > 1:
            match_type = 'semi-finals'
        elif rnd == num_rounds - 2 and num_rounds > 2:
            match_type = 'quarter-finals'
        else:
            match_type = 'qualifications'
        
        for pos in range(matches_in_round):
            next_match_obj = None
            if rnd < num_rounds:
                next_key = (rnd + 1, pos // 2)
                next_match_obj = all_matches.get(next_key)
            
            match = Match.objects.create(
                category=category,
                match_type=match_type,
                round_number=rnd,
                bracket_position=pos,
                next_match=next_match_obj,
                match_number=f"R{rnd}-M{pos+1}",
            )
            all_matches[(rnd, pos)] = match
    
    # Now fill in round 1 with seeded athletes
    round1_matches = {k: v for k, v in all_matches.items() if k[0] == 1}
    for (rnd, pos), match in sorted(round1_matches.items()):
        idx1 = pos * 2
        idx2 = pos * 2 + 1
        athlete1 = seeded[idx1] if idx1 < len(seeded) else None
        athlete2 = seeded[idx2] if idx2 < len(seeded) else None
        
        match.red_corner = athlete1
        match.blue_corner = athlete2
        match.save()
        
        # If one athlete has a bye (opponent is None), auto-advance them
        if athlete1 and not athlete2 and match.next_match:
            _advance_to_next(match.next_match, match, athlete1)
        elif athlete2 and not athlete1 and match.next_match:
            _advance_to_next(match.next_match, match, athlete2)

    # ── Consolation / Bronze match ──
    if bracket_type == 'consolation':
        # Find semi-final matches
        semi_matches = [m for m in all_matches.values() if m.match_type == 'semi-finals']
        finals_match = [m for m in all_matches.values() if m.match_type == 'finals']

        if len(semi_matches) >= 2:
            # Standard case: 4+ athletes → bronze match between 2 semi-final losers
            bronze = Match.objects.create(
                category=category,
                match_type='bronze',
                round_number=num_rounds,  # Same round as finals
                bracket_position=1,       # Position after finals
                match_number='BRONZE',
            )
            # Link semi-final losers to bronze match
            for sm in semi_matches:
                sm.loser_next_match = bronze
                sm.save()

        elif len(semi_matches) == 1 and finals_match:
            # 3-athlete case: 1 semi + 1 final
            # Bronze: loser(semi) vs loser(final)
            bronze = Match.objects.create(
                category=category,
                match_type='bronze',
                round_number=num_rounds + 1,  # After finals
                bracket_position=0,
                match_number='BRONZE',
            )
            semi_matches[0].loser_next_match = bronze
            semi_matches[0].save()
            finals_match[0].loser_next_match = bronze
            finals_match[0].save()

        elif n == 2 and not semi_matches and finals_match:
            # 2-athlete edge case: no semis, just finals — no bronze possible
            pass

    # Serialize and return
    final_matches = Match.objects.filter(category=category).order_by('round_number', 'bracket_position')
    serializer = MatchSerializer(final_matches, many=True)
    return Response(serializer.data, status=201)


def _advance_to_next(next_match, from_match, athlete):
    """Place an athlete into the correct slot of the next match."""
    if from_match.bracket_position % 2 == 0:
        next_match.red_corner = athlete
    else:
        next_match.blue_corner = athlete
    next_match.save()


@api_view(['POST'])
@perm_dec([permissions.AllowAny])
def advance_match_winner(request, match_id):
    """
    After scoring is complete, advance the winner to the next match in the bracket.
    Also advances the loser to the consolation/bronze match if applicable.
    """
    try:
        match = Match.objects.select_related('red_corner', 'blue_corner', 'next_match', 'loser_next_match').get(pk=match_id)
    except Match.DoesNotExist:
        return Response({'error': 'Meciul nu a fost gasit.'}, status=404)

    winner = match.winner
    if not winner:
        return Response({'error': 'Nu exista un castigator pentru acest meci.'}, status=400)

    result = {}

    # Advance winner to next match
    if match.next_match:
        _advance_to_next(match.next_match, match, winner)
        result['status'] = 'advanced'
        result['next_match_id'] = match.next_match.id
    else:
        result['status'] = 'final'
        result['winner'] = f"{winner.first_name} {winner.last_name}"

    # Advance loser to consolation/bronze match
    if match.loser_next_match:
        loser = match.blue_corner if winner == match.red_corner else match.red_corner
        if loser:
            _advance_to_next(match.loser_next_match, match, loser)
            result['loser_advanced_to'] = match.loser_next_match.id

    return Response(result)
