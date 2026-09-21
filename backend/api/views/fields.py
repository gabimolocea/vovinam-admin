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

from ._common import _event_operational_lock_response
from .matches import MatchViewSet
from .competitions import CompetitionViewSet


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
            event = Event.objects.get(pk=event_id, event_types__icontains=Event.type_query_value('competition'))
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
            blocking = (
                CategoryFieldAssignment.objects.filter(field_id__in=[f.id for f in to_delete])
                .select_related('field', 'category')
            )
            if blocking.exists():
                names = ', '.join(sorted({assignment.field.name for assignment in blocking}))
                return Response(
                    {'detail': f'Nu se poate reduce numărul de terenuri: {names} au categorii alocate. Elimină mai întâi alocările.'},
                    status=409,
                )
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
        ids = [item.get('id') for item in items]
        breaks = list(FieldBreak.objects.select_related('field__event').filter(pk__in=ids))
        if len(ids) != len(set(ids)) or len(breaks) != len(ids):
            return Response({'detail': 'All field break ids must exist and be unique.'}, status=400)
        if len({item.field.event_id for item in breaks}) > 1:
            return Response({'detail': 'All field breaks must belong to the same event.'}, status=400)
        positions = {int(item['id']): item.get('order', 0) for item in items}
        for field_break in breaks:
            field_break.order = positions[field_break.id]
        with transaction.atomic():
            FieldBreak.objects.bulk_update(breaks, ['order'])
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
        ids = [item.get('id') for item in items]
        assignments = list(CategoryFieldAssignment.objects.select_related('category__event').filter(pk__in=ids))
        if len(ids) != len(set(ids)) or len(assignments) != len(ids):
            return Response({'detail': 'All assignment ids must exist and be unique.'}, status=400)
        event_ids = {assignment.category.event_id for assignment in assignments}
        if len(event_ids) > 1:
            return Response({'detail': 'All assignments must belong to the same event.'}, status=400)
        if assignments:
            locked = _event_operational_lock_response(assignments[0].category.event)
            if locked is not None:
                return locked
        requested_field_ids = {item.get('field') for item in items if item.get('field') is not None}
        if requested_field_ids and CompetitionField.objects.filter(
            id__in=requested_field_ids,
            event_id=next(iter(event_ids)),
        ).count() != len(requested_field_ids):
            return Response({'detail': 'All fields must belong to the assignments event.'}, status=400)
        item_by_id = {int(item['id']): item for item in items}
        changed_fields = {'order'}
        for assignment in assignments:
            item = item_by_id[assignment.id]
            assignment.order = item.get('order', 0)
            if 'field' in item:
                assignment.field_id = item['field']
                changed_fields.add('field')
            if 'estimated_duration' in item:
                assignment.estimated_duration = item['estimated_duration']
                changed_fields.add('estimated_duration')
        with transaction.atomic():
            CategoryFieldAssignment.objects.bulk_update(assignments, sorted(changed_fields))
        return Response({'status': 'ok'})


# ═══════════════════════════════════════════════════════
# Auto-scheduling: tatami allocation for solo/team categories
# ═══════════════════════════════════════════════════════

def _group_is_senior(group):
    """Structural "no upper age bound" check (e.g. the live event's own
    "Sen. Gr. Mici"/"Sen. Gr. Mari", both birth_year_start=2008 with no end)
    rather than name-matching, so it isn't tied to a particular label."""
    if not group:
        return False
    return bool(
        (group.birth_year_start or group.birth_date_start)
        and not group.birth_year_end
        and not group.birth_date_end
    )


def _group_sort_key(group):
    """Ascending display_order, ungrouped categories after named groups,
    every senior group last regardless of its own display_order."""
    if not group:
        return (1, 0, 0)
    return (2 if _group_is_senior(group) else 0, group.display_order, group.id)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def auto_schedule_fields(request, event_id):
    """
    Auto-assign solo/team categories to tatamis. Groups are clustered onto
    whichever active field currently has the least scheduled time (seniors
    always last), categories within a group ordered by their own
    display_order. Only fills categories with no existing
    CategoryFieldAssignment - anything already assigned by hand is left
    untouched, so this can be re-run any time to just fill in the rest.

    Fight matches are intentionally out of scope: round 2+ matches don't
    have known participants until the previous round finishes, so they
    can't be pre-scheduled as a block the way a whole category can - they
    stay on the existing manual/live tatami assignment flow.

    Also runs a best-effort local repair pass so the same athlete doesn't
    end up back-to-back with themselves on one tatami (a short FieldBreak
    is inserted when a swap can't separate them) or, as much as possible,
    overlapping across two different tatamis at once. Anything that
    couldn't be resolved is returned in `warnings` for manual fixing with
    the existing drag-and-drop.
    """
    from landing.models import Event
    from collections import defaultdict

    try:
        event = Event.objects.get(pk=event_id)
    except Event.DoesNotExist:
        return Response({'error': 'Evenimentul nu a fost găsit.'}, status=404)

    locked = _event_operational_lock_response(event)
    if locked is not None:
        return locked

    fields = list(CompetitionField.objects.filter(event=event, is_active=True).order_by('field_number'))
    if not fields:
        return Response({'error': 'Evenimentul nu are niciun teren activ.'}, status=400)

    already_assigned_ids = set(
        CategoryFieldAssignment.objects.filter(category__event=event).values_list('category_id', flat=True)
    )
    candidates = (
        Category.objects.filter(event=event)
        .exclude(id__in=already_assigned_ids)
        .select_related('group')
    )
    # Category.type checks hasattr(self, 'solocategory'/...) - a per-instance
    # DB hit each, same pattern already used elsewhere in this codebase
    # (e.g. generate_brackets' consolation branch) rather than a queryset-
    # level type filter, since per-event category counts are small.
    # Enrollment lives on different through models per type: solo athletes
    # via CategoryAthlete (enrolled_athletes), teams via CategoryTeam (teams).
    def _has_enrollment(c):
        if c.type == 'solo':
            return c.enrolled_athletes.exists()
        if c.type == 'team':
            return c.teams.exists()
        return False
    to_schedule = [c for c in candidates if _has_enrollment(c)]

    if not to_schedule:
        return Response({'assigned': 0, 'warnings': [],
                          'detail': 'Nimic de alocat - toate categoriile solo/echipă sunt deja programate.'})

    DEFAULT_DURATION = 15

    by_group = defaultdict(list)
    group_by_id = {}
    for cat in to_schedule:
        by_group[cat.group_id].append(cat)
        group_by_id[cat.group_id] = cat.group
    ordered_group_ids = sorted(by_group.keys(), key=lambda gid: _group_sort_key(group_by_id.get(gid)))

    # Seed each field's queue with its existing assignments, so newly
    # appended categories continue after whatever's already scheduled there.
    existing_assignments = list(CategoryFieldAssignment.objects.filter(field__in=fields))
    field_queue = defaultdict(list)  # field_id -> list of {'kind','duration','category'|'break_label'}
    field_minutes = {f.id: 0 for f in fields}
    for a in sorted(existing_assignments, key=lambda a: a.order):
        field_queue[a.field_id].append({'kind': 'existing', 'duration': a.estimated_duration or DEFAULT_DURATION, 'assignment': a})
        field_minutes[a.field_id] += a.estimated_duration or DEFAULT_DURATION

    new_assignments = []  # CategoryFieldAssignment instances to bulk_create
    for gid in ordered_group_ids:
        cats = sorted(by_group[gid], key=lambda c: (c.display_order, c.id))
        target = min(fields, key=lambda f: field_minutes[f.id])
        for cat in cats:
            assignment = CategoryFieldAssignment(category=cat, field=target, order=0, estimated_duration=DEFAULT_DURATION)
            new_assignments.append(assignment)
            field_queue[target.id].append({'kind': 'new', 'duration': DEFAULT_DURATION, 'assignment': assignment, 'category': cat})
            field_minutes[target.id] += DEFAULT_DURATION

    # ── athlete → category ids, across every category touched by this run ──
    all_category_ids = [item['category'].id if item['kind'] == 'new' else item['assignment'].category_id
                         for items in field_queue.values() for item in items]
    athlete_categories = defaultdict(set)
    for row in CategoryAthlete.objects.filter(category_id__in=all_category_ids).values('athlete_id', 'category_id'):
        athlete_categories[row['athlete_id']].add(row['category_id'])
    # Team categories enroll via CategoryTeam -> Team -> TeamMember instead
    # of CategoryAthlete, so a team's athletes need pulling in separately
    # for the same back-to-back/overlap checks to apply to them too.
    category_team_rows = list(CategoryTeam.objects.filter(category_id__in=all_category_ids).values('category_id', 'team_id'))
    team_athlete_ids = defaultdict(set)
    for row in TeamMember.objects.filter(team_id__in={r['team_id'] for r in category_team_rows}).values('team_id', 'athlete_id'):
        team_athlete_ids[row['team_id']].add(row['athlete_id'])
    for row in category_team_rows:
        for athlete_id in team_athlete_ids[row['team_id']]:
            athlete_categories[athlete_id].add(row['category_id'])
    categories_of = defaultdict(set)
    for athlete_id, cat_ids in athlete_categories.items():
        for cid in cat_ids:
            categories_of[cid].add(athlete_id)

    def shared_athletes(cat_id_a, cat_id_b):
        return categories_of[cat_id_a] & categories_of[cat_id_b]

    def item_category_id(item):
        return item['category'].id if item['kind'] == 'new' else item['assignment'].category_id

    warnings = []
    breaks_to_create = []

    def _next_content_index(items, start):
        """Index of the next non-break item at or after `start`, or None -
        breaks themselves have no category to compare, so every walk below
        hops over them via this instead of touching items[i+1] directly."""
        j = start
        while j < len(items) and items[j]['kind'] == 'break':
            j += 1
        return j if j < len(items) else None

    # ── same-field back-to-back repair ──
    for field_id, items in field_queue.items():
        i = _next_content_index(items, 0)
        while i is not None:
            j = _next_content_index(items, i + 1)
            if j is None:
                break
            # Only a *true* back-to-back pair (nothing already separating
            # them, e.g. a break from an earlier repair in this same pass)
            # needs repairing.
            if j == i + 1 and shared_athletes(item_category_id(items[i]), item_category_id(items[j])):
                swapped = False
                k = _next_content_index(items, j + 1)
                if k is not None and not shared_athletes(item_category_id(items[i]), item_category_id(items[k])):
                    items[j], items[k] = items[k], items[j]
                    swapped = True
                if not swapped:
                    field = next(f for f in fields if f.id == field_id)
                    items.insert(j, {'kind': 'break', 'duration': 10})
                    breaks_to_create.append({'field': field, 'position': j})
                    warnings.append(
                        f'Pauză de 10 min inserată automat pe {field.name} - un sportiv era programat '
                        f'consecutiv în două probe.'
                    )
                    j += 1  # step past the break we just inserted
            i = j

    # ── recompute [start,end) windows (in minutes, relative to each field's own start) ──
    def compute_windows():
        windows = {}  # category_id -> (field_id, start, end)
        for field_id, items in field_queue.items():
            cursor = 0
            for item in items:
                if item['kind'] != 'break':
                    windows[item_category_id(item)] = (field_id, cursor, cursor + item['duration'])
                cursor += item['duration']
        return windows

    windows = compute_windows()

    # ── best-effort cross-field overlap repair (single pass) ──
    for athlete_id, cat_ids in athlete_categories.items():
        cat_ids = list(cat_ids)
        for x in range(len(cat_ids)):
            for y in range(x + 1, len(cat_ids)):
                wa, wb = windows.get(cat_ids[x]), windows.get(cat_ids[y])
                if not wa or not wb or wa[0] == wb[0]:
                    continue  # same field (or unscheduled) - not a cross-field conflict
                if wa[1] < wb[2] and wb[1] < wa[2]:  # overlap
                    field_b_id, items_b = wb[0], field_queue[wb[0]]
                    idx = next((k for k, it in enumerate(items_b) if it['kind'] != 'break' and item_category_id(it) == cat_ids[y]), None)
                    if idx is not None:
                        items_b.append(items_b.pop(idx))
                        windows = compute_windows()
                        wa, wb = windows.get(cat_ids[x]), windows.get(cat_ids[y])
                    if wa and wb and wa[0] != wb[0] and wa[1] < wb[2] and wb[1] < wa[2]:
                        cat_a = Category.objects.get(pk=cat_ids[x])
                        cat_b = Category.objects.get(pk=cat_ids[y])
                        warnings.append(
                            f'{cat_a.name} și {cat_b.name} se suprapun pe terenuri diferite pentru un sportiv '
                            f'înscris la ambele - ajustează manual ordinea.'
                        )

    # ── persist: renumber order per field, create breaks, bulk-create assignments ──
    with transaction.atomic():
        for field_id, items in field_queue.items():
            for order, item in enumerate(items):
                if item['kind'] == 'new':
                    item['assignment'].order = order
                elif item['kind'] == 'existing':
                    if item['assignment'].order != order:
                        item['assignment'].order = order
                        item['assignment'].save(update_fields=['order'])
        CategoryFieldAssignment.objects.bulk_create(new_assignments)
        for b in breaks_to_create:
            FieldBreak.objects.create(field=b['field'], label='Pauză', duration=10, order=b['position'])

    return Response({'assigned': len(new_assignments), 'breaks_added': len(breaks_to_create), 'warnings': warnings})


class DisplayMonitorSessionViewSet(viewsets.ViewSet):
    """ViewSet for managing display monitor sessions.
    Public read access needed for public-display app (no auth).
    """
    permission_classes = [IsAdminOrReadOnly]
    
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

    @action(detail=False, methods=['get'], url_path='field-state')
    def field_state(self, request):
        field_id = request.query_params.get('field')
        if not field_id:
            return Response({'detail': 'field query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        field = CompetitionField.objects.select_related('event', 'event__city').filter(pk=field_id).first()
        if not field:
            return Response({'detail': 'Field not found.'}, status=status.HTTP_404_NOT_FOUND)

        session = DisplayMonitorSession.objects.select_related(
            'field',
            'current_category__group',
            'current_athlete__club',
            'current_match',
        ).filter(field=field).first()

        payload = {
            'field': CompetitionFieldSerializer(field).data,
            'event': CompetitionViewSet()._serialize_event(field.event),
            'session': None,
            'category': None,
            'group': None,
            'athlete': None,
            'match': None,
            'rounds': [],
            'match_referee_scores': [],
            'match_events': [],
            'point_events': [],
            'match_referee_assignment': None,
            'category_referee_scores': [],
        }
        if not session:
            return Response(payload)

        session_data = DisplayMonitorSessionSerializer(session).data
        payload['session'] = session_data
        category = session.current_category
        if category:
            payload['category'] = CategorySerializer(category).data
            payload['group'] = GroupSerializer(category.group).data if category.group_id else None

        if session.current_athlete_id:
            payload['athlete'] = PublicAthleteSerializer(session.current_athlete).data

        if session.current_match_id:
            match = MatchViewSet().get_queryset().get(pk=session.current_match_id)
            payload['match'] = MatchSerializer(match).data
            payload['rounds'] = MatchRoundSerializer(
                MatchRound.objects.filter(match=match).order_by('round_number'),
                many=True,
            ).data
            payload['match_referee_scores'] = MatchRefereeScoreSerializer(
                MatchRefereeScore.objects.filter(match=match).select_related('referee', 'round'),
                many=True,
            ).data
            payload['match_events'] = MatchEventSerializer(
                MatchEvent.objects.filter(match=match).select_related('round', 'created_by'),
                many=True,
            ).data
            payload['point_events'] = RefereePointEventSerializer(
                RefereePointEvent.objects.filter(match=match).select_related('referee').order_by('timestamp'),
                many=True,
            ).data
            assignment = MatchRefereeAssignment.objects.select_related(
                'referee_1', 'referee_2', 'referee_3', 'referee_4', 'referee_5',
            ).filter(match=match).first()
            if assignment:
                payload['match_referee_assignment'] = MatchRefereeAssignmentSerializer(assignment).data
        elif category:
            scores = CategoryRefereeScore.objects.filter(
                athlete_score__category=category,
            ).select_related('athlete_score__athlete', 'referee')
            athlete_score_id = session_data.get('current_athlete_score_id')
            if athlete_score_id:
                scores = scores.filter(athlete_score_id=athlete_score_id)
            elif session.current_athlete_id:
                scores = scores.filter(athlete_score__athlete_id=session.current_athlete_id)
            payload['category_referee_scores'] = CategoryRefereeScoreSerializer(scores, many=True).data

        return Response(payload)
    
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
