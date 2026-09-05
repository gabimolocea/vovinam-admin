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
