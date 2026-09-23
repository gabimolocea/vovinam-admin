from django.shortcuts import render, get_object_or_404
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
from rest_framework_simplejwt.tokens import RefreshToken
import secrets

from ._common import _event_operational_lock_response, _referee_schedule_conflict_warnings


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


# ═══════════════════════════════════════════════════════
# Auto-assign referees (solo/team categories + fight matches)
# ═══════════════════════════════════════════════════════

REFEREE_SLOTS = 5


def _fill_referee_panel(candidates, competing_club_ids, load, used_athlete_ids=None):
    """Greedily pick up to REFEREE_SLOTS referee athlete ids from
    `candidates` (each a CompetitionReferee with `.athlete` preloaded),
    preferring the least-loaded referees and avoiding a referee whose own
    club already has a seat in this panel or is one of `competing_club_ids`
    (a competitor's own club judging them, or one club dominating the
    panel, being exactly the "influence the result" risk this exists to
    reduce). Falls back to relaxing the club rule rather than leaving a
    slot empty when the roster is too small/concentrated to avoid it."""
    used_athlete_ids = used_athlete_ids or set()
    ranked = sorted(candidates, key=lambda cr: load.get(cr.athlete_id, 0))

    def pick(strict):
        panel_club_ids = set()
        picks = []
        for cr in ranked:
            if cr.athlete_id in used_athlete_ids or cr in picks:
                continue
            club_id = cr.athlete.club_id
            if strict and club_id and (club_id in panel_club_ids or club_id in competing_club_ids):
                continue
            picks.append(cr)
            used_athlete_ids.add(cr.athlete_id)
            if club_id:
                panel_club_ids.add(club_id)
            if len(picks) == REFEREE_SLOTS:
                break
        return picks

    picks = pick(strict=True)
    relaxed = len(picks) < REFEREE_SLOTS
    if relaxed:
        # Not enough conflict-free candidates - fill remaining slots
        # ignoring the club rule, still skipping athletes already picked.
        for cr in ranked:
            if len(picks) == REFEREE_SLOTS:
                break
            if cr.athlete_id in used_athlete_ids:
                continue
            picks.append(cr)
            used_athlete_ids.add(cr.athlete_id)
    for cr in picks:
        load[cr.athlete_id] = load.get(cr.athlete_id, 0) + 1
    return picks, relaxed and len(picks) > 0


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def auto_assign_referees(request, event_id):
    """
    Auto-assign referee panels to solo/team categories and fight matches
    that don't have one yet (gap-fill, same as auto_schedule_fields - a
    manually-built panel is never touched). Unlike tatami scheduling, this
    covers fight matches too: a match's referee slots don't depend on who
    ends up competing in it, since the Match rows already exist once the
    bracket is generated.

    Panels are built to spread load evenly across the roster and to avoid
    seating two referees from the same club together, or a referee whose
    own club has an athlete/team in that specific item, when the roster
    has enough alternatives to do so.
    """
    from landing.models import Event

    try:
        event = Event.objects.get(pk=event_id)
    except Event.DoesNotExist:
        return Response({'error': 'Evenimentul nu a fost găsit.'}, status=404)

    locked = _event_operational_lock_response(event)
    if locked is not None:
        return locked

    roster = list(CompetitionReferee.objects.filter(event=event).select_related('athlete', 'athlete__club'))
    if not roster:
        return Response({'error': 'Evenimentul nu are niciun arbitru în lot.'}, status=400)

    load = {}  # athlete_id -> assignment count so far, for workload balance
    warnings = []
    assigned = 0

    # ── solo/team categories ──
    already_assigned_cat_ids = set(
        CategoryRefereeAssignment.objects.filter(category__event=event).values_list('category_id', flat=True)
    )
    categories = (
        Category.objects.filter(event=event)
        .exclude(id__in=already_assigned_cat_ids)
        .select_related('group')
        .order_by('display_order', 'id')
    )
    categories = [c for c in categories if c.type in ('solo', 'team')]
    for cat in categories:
        if cat.type == 'team':
            # Team categories enroll via CategoryTeam -> Team -> TeamMember,
            # not CategoryAthlete, so their competing clubs come from each
            # enrolled team's members' clubs instead.
            competing_club_ids = set(
                TeamMember.objects.filter(team__categories=cat, athlete__club__isnull=False)
                .values_list('athlete__club_id', flat=True)
            )
        else:
            competing_club_ids = set(
                CategoryAthlete.objects.filter(category=cat, athlete__club__isnull=False)
                .values_list('athlete__club_id', flat=True)
            )
        picks, relaxed = _fill_referee_panel(roster, competing_club_ids, load)
        if not picks:
            continue
        kwargs = {f'referee_{i + 1}_id': picks[i].athlete_id for i in range(len(picks))}
        CategoryRefereeAssignment.objects.create(category=cat, **kwargs)
        assigned += 1
        if relaxed:
            warnings.append(f'"{cat.name}": nu au fost destui arbitri fără conflict de club - panel completat oricum.')

    # ── fight matches ──
    already_assigned_match_ids = set(
        MatchRefereeAssignment.objects.filter(match__category__event=event).values_list('match_id', flat=True)
    )
    matches = (
        Match.objects.filter(category__event=event)
        .exclude(id__in=already_assigned_match_ids)
        .select_related('red_corner__club', 'blue_corner__club')
        .order_by('round_number', 'bracket_position', 'id')
    )
    for m in matches:
        competing_club_ids = {
            a.club_id for a in (m.red_corner, m.blue_corner) if a and a.club_id
        }
        picks, relaxed = _fill_referee_panel(roster, competing_club_ids, load)
        if not picks:
            continue
        kwargs = {f'referee_{i + 1}_id': picks[i].athlete_id for i in range(len(picks))}
        MatchRefereeAssignment.objects.create(match=m, **kwargs)
        assigned += 1
        if relaxed:
            warnings.append(f'Meciul #{m.id}: nu au fost destui arbitri fără conflict de club - panel completat oricum.')

    if assigned == 0:
        return Response({'assigned': 0, 'warnings': [],
                          'detail': 'Nimic de alocat - toate categoriile/meciurile au deja arbitri.'})

    return Response({'assigned': assigned, 'warnings': warnings})


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
            instance = serializer.save()
            data = dict(serializer.data)
            referee_ids = [instance.referee_1_id, instance.referee_2_id, instance.referee_3_id,
                           instance.referee_4_id, instance.referee_5_id]
            warnings = _referee_schedule_conflict_warnings(instance.category, referee_ids)
            if warnings:
                data['warnings'] = warnings
            return Response(data, status=status.HTTP_201_CREATED)
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
                instance = serializer.save()
                data = dict(serializer.data)
                referee_ids = [instance.referee_1_id, instance.referee_2_id, instance.referee_3_id,
                               instance.referee_4_id, instance.referee_5_id]
                warnings = _referee_schedule_conflict_warnings(instance.category, referee_ids)
                if warnings:
                    data['warnings'] = warnings
                return Response(data)
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
        match_id = request.query_params.get('match')
        event_id = request.query_params.get('event_id')
        cutoff = timezone.now() - timedelta(seconds=15)
        qs = RefereePresence.objects.filter(last_ping__gte=cutoff)
        if category_id:
            qs = qs.filter(category_id=category_id)
        if match_id:
            qs = qs.filter(match_id=match_id)
        if event_id:
            qs = qs.filter(Q(category__event_id=event_id) | Q(match__category__event_id=event_id))
        return Response(RefereePresenceSerializer(qs, many=True).data)

    def create(self, request):
        category = request.data.get('category')
        match = request.data.get('match')
        referee = request.data.get('referee')
        if not (category or match) or not referee:
            return Response({'error': 'category or match, and referee, are required'}, status=status.HTTP_400_BAD_REQUEST)
        lookup = {'match_id': match, 'referee_id': referee} if match else {'category_id': category, 'referee_id': referee}
        obj, created = RefereePresence.objects.update_or_create(
            **lookup,
            defaults={'last_ping': timezone.now()}
        )
        return Response(RefereePresenceSerializer(obj).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def clear(self, request):
        category = request.data.get('category')
        match = request.data.get('match')
        referee = request.data.get('referee')
        if not (category or match) or not referee:
            return Response({'error': 'category or match, and referee, are required'}, status=status.HTTP_400_BAD_REQUEST)
        if match:
            RefereePresence.objects.filter(match_id=match, referee_id=referee).delete()
        else:
            RefereePresence.objects.filter(category_id=category, referee_id=referee).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ═══════════════════════════════════════════════════════════════════
# Referee QR login - scan-to-authenticate for referee-scoring, no
# email/password. See RefereeQRLogin's docstring for the token model.
# ═══════════════════════════════════════════════════════════════════

def _get_or_create_referee_user(athlete):
    """Most referee athletes in this app were never given a login (they're
    local club coaches/officials, not registered platform users) - the QR
    flow needs *a* User to mint a JWT for, so provision a minimal one
    on first use. Its password is left unusable: this account is only
    ever reachable through a valid QR token, never a password login."""
    if athlete.user_id:
        return athlete.user
    user = User(
        username=f'referee-{athlete.id}',
        email=f'referee-{athlete.id}@qr.frvv.local',
        first_name=athlete.first_name,
        last_name=athlete.last_name,
        role='athlete',
    )
    user.set_unusable_password()
    user.save()
    athlete.user = user
    athlete.save(update_fields=['user'])
    return user


@api_view(['GET'])
@permission_classes([IsAdmin])
def referee_qr_login_info(request, event_id, athlete_id):
    """Get-or-create this referee's QR login for the event. Never rotates
    an existing token - reopening this screen later in the day must not
    silently invalidate a referee who already scanned in this morning."""
    athlete = get_object_or_404(Athlete, pk=athlete_id)
    qr, _ = RefereeQRLogin.objects.get_or_create(event_id=event_id, referee=athlete)
    if not qr.pin:
        # Row predates the PIN column and was never re-saved.
        qr.pin = RefereeQRLogin.generate_pin()
        qr.save(update_fields=['pin', 'updated_at'])
    return Response({'token': qr.token, 'pin': qr.pin, 'login_path': f'/qr-login/{qr.token}'})


@api_view(['POST'])
@permission_classes([IsAdmin])
def referee_qr_login_reset(request, event_id, athlete_id):
    """Rotate this referee's QR token, so whatever code was previously
    displayed/scanned/photographed immediately stops working."""
    athlete = get_object_or_404(Athlete, pk=athlete_id)
    qr, _ = RefereeQRLogin.objects.get_or_create(event_id=event_id, referee=athlete)
    qr.token = secrets.token_urlsafe(32)
    qr.pin = RefereeQRLogin.generate_pin()
    qr.save(update_fields=['token', 'pin', 'updated_at'])
    return Response({'token': qr.token, 'pin': qr.pin, 'login_path': f'/qr-login/{qr.token}'})


@api_view(['POST'])
@permission_classes([AllowAny])
def referee_qr_login_exchange(request):
    """Public: exchange a QR token for a fresh JWT session. Called by the
    referee-scoring app's /qr-login/:token route the instant a referee
    scans the code - the token itself never expires on its own, only via
    an explicit admin reset (see referee_qr_login_reset), so re-scanning
    the same still-displayed code works any time during the event."""
    token = request.data.get('token')
    if not token:
        return Response({'error': 'Token lipsă.'}, status=status.HTTP_400_BAD_REQUEST)
    qr = RefereeQRLogin.objects.select_related('referee').filter(token=token).first()
    if not qr:
        return Response({'error': 'Cod QR invalid sau resetat. Cere unui admin un cod nou.'}, status=status.HTTP_404_NOT_FOUND)
    user = _get_or_create_referee_user(qr.referee)
    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user).data,
        'tokens': {'refresh': str(refresh), 'access': str(refresh.access_token)},
    })


def _client_ip(request):
    """Behind the venue stack there is no proxy in front of Django, so
    REMOTE_ADDR is the device itself. X-Forwarded-For is honoured only as
    a fallback and only its first hop, for the cloud deployment."""
    remote = request.META.get('REMOTE_ADDR')
    if remote:
        return remote
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return forwarded.split(',')[0].strip() or '0.0.0.0'


@api_view(['POST'])
@permission_classes([AllowAny])
def referee_pin_login_exchange(request):
    """Public: exchange a referee's numeric PIN for a JWT session.

    Same credential as the QR token, in a form a device with a rotary
    encoder and no keyboard can actually enter (see
    devices/referee-esp32c3). The PIN is unique across events, so the
    device sends nothing but the digits - no event to pick, no server-side
    configuration on it beyond the address.

    Five digits is 100,000 codes, which is only acceptable because this
    endpoint refuses to be guessed at: after MAX_FAILURES misses from one
    address inside WINDOW_MINUTES it stops answering, which turns a
    minutes-long script into hours of traffic that is impossible to miss.
    A correct PIN is never recorded and never counts against the limit.
    """
    pin = str(request.data.get('pin', '')).strip()
    ip = _client_ip(request)
    window_start = timezone.now() - timedelta(minutes=RefereePinLoginAttempt.WINDOW_MINUTES)

    recent_failures = RefereePinLoginAttempt.objects.filter(
        ip_address=ip, created_at__gte=window_start,
    ).count()
    if recent_failures >= RefereePinLoginAttempt.MAX_FAILURES:
        return Response(
            {'error': 'Prea multe încercări greșite. Așteaptă câteva minute.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    qr = RefereeQRLogin.objects.select_related('referee').filter(pin=pin).first() if pin else None
    if not qr:
        RefereePinLoginAttempt.objects.create(ip_address=ip, pin_tried=pin[:8])
        # Old rows are only ever read through the window above, so clear
        # them out here rather than adding a scheduled job for it.
        RefereePinLoginAttempt.objects.filter(
            created_at__lt=timezone.now() - timedelta(days=1),
        ).delete()
        remaining = RefereePinLoginAttempt.MAX_FAILURES - recent_failures - 1
        return Response(
            {
                'error': 'PIN invalid. Cere unui admin PIN-ul tău.',
                'attempts_left': max(0, remaining),
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    # Clean slate on success, so a referee who mistyped a few times isn't
    # left one fumble away from a lockout for the rest of the window.
    RefereePinLoginAttempt.objects.filter(ip_address=ip).delete()

    user = _get_or_create_referee_user(qr.referee)
    refresh = RefreshToken.for_user(user)
    return Response({
        'user': UserSerializer(user).data,
        'event_id': qr.event_id,
        'tokens': {'refresh': str(refresh), 'access': str(refresh.access_token)},
    })


# ═══════════════════════════════════════════════════════════════════
# BRACKET GENERATION
# ═══════════════════════════════════════════════════════════════════

import math
from rest_framework.decorators import api_view, permission_classes as perm_dec
