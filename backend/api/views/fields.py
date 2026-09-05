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
