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

import math
from ._common import (
    _auto_validate_real_time_point_event,
    _compute_video_offset_ms,
    _event_operational_lock_response,
    _is_match_assigned_referee,
    _resolve_recording_session,
    _sync_point_events_to_match_referee_scores,
)


class MatchViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Match.objects.all()
    serializer_class = MatchSerializer

    def get_queryset(self):
        return Match.objects.select_related(
            'category__group',
            'red_corner__club',
            'blue_corner__club',
            'central_referee',
            'field',
            'field_assignment__field',
        ).prefetch_related(
            'referees',
            Prefetch(
                'point_events',
                queryset=RefereePointEvent.objects.select_related('referee').order_by('timestamp'),
                to_attr='_prefetched_point_events',
            ),
            Prefetch(
                'simplified_referee_scores',
                queryset=MatchRefereeScore.objects.select_related('referee', 'round'),
                to_attr='_prefetched_simplified_scores',
            ),
            Prefetch(
                'referee_scores',
                queryset=RefereeScore.objects.select_related('referee'),
                to_attr='_prefetched_legacy_scores',
            ),
            Prefetch(
                'events',
                queryset=MatchEvent.objects.only('id', 'match_id', 'event_type', 'value'),
                to_attr='_prefetched_match_events',
            ),
        )

    def list(self, request):
        queryset = self.get_queryset()
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
        queryset = self.get_queryset().get(pk=pk)
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
        from ..serializers import RefereePointEventSerializer

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
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    
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
        if not match:
            return Response({'error': 'Match not found'}, status=status.HTTP_404_NOT_FOUND)
        locked = _event_operational_lock_response(getattr(getattr(match, 'category', None), 'event', None))
        if locked is not None:
            return locked
        is_admin = bool(request.user.is_staff or getattr(request.user, 'role', None) == 'admin')
        requester_athlete = getattr(request.user, 'athlete', None)
        if not is_admin:
            if not requester_athlete or not requester_athlete.is_referee or not _is_match_assigned_referee(match, requester_athlete):
                return Response({'error': 'Nu ești arbitru alocat acestui meci.'}, status=status.HTTP_403_FORBIDDEN)
            data['referee'] = requester_athlete.id
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
            obj = MatchRefereeScore.objects.select_related('match__category__event', 'referee').get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            is_admin = bool(request.user.is_staff or getattr(request.user, 'role', None) == 'admin')
            requester_athlete = getattr(request.user, 'athlete', None)
            if not is_admin and (
                not requester_athlete
                or obj.referee_id != requester_athlete.id
                or not _is_match_assigned_referee(obj.match, requester_athlete)
            ):
                return Response({'error': 'Poți modifica doar propriul scor pentru un meci alocat.'}, status=status.HTTP_403_FORBIDDEN)
            data = request.data.copy()
            if not is_admin:
                data.pop('match', None)
                data.pop('referee', None)
            serializer = MatchRefereeScoreSerializer(obj, data=data, partial=True)
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
            obj = MatchRefereeScore.objects.select_related('match__category__event', 'referee').get(pk=pk)
            locked = _event_operational_lock_response(getattr(getattr(getattr(obj, 'match', None), 'category', None), 'event', None))
            if locked is not None:
                return locked
            is_admin = bool(request.user.is_staff or getattr(request.user, 'role', None) == 'admin')
            requester_athlete = getattr(request.user, 'athlete', None)
            if not is_admin and (
                not requester_athlete
                or obj.referee_id != requester_athlete.id
                or not _is_match_assigned_referee(obj.match, requester_athlete)
            ):
                return Response({'error': 'Poți șterge doar propriul scor pentru un meci alocat.'}, status=status.HTTP_403_FORBIDDEN)
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
        ids = [item.get('id') for item in items]
        assignments = list(MatchFieldAssignment.objects.select_related('match__category__event').filter(pk__in=ids))
        if len(ids) != len(set(ids)) or len(assignments) != len(ids):
            return Response({'detail': 'All assignment ids must exist and be unique.'}, status=400)
        event_ids = {assignment.match.category.event_id for assignment in assignments}
        if len(event_ids) > 1:
            return Response({'detail': 'All assignments must belong to the same event.'}, status=400)
        if assignments:
            locked = _event_operational_lock_response(assignments[0].match.category.event)
            if locked is not None:
                return locked
        requested_field_ids = {item.get('field') for item in items if item.get('field') is not None}
        if requested_field_ids and CompetitionField.objects.filter(
            id__in=requested_field_ids,
            event_id=next(iter(event_ids)),
        ).count() != len(requested_field_ids):
            return Response({'detail': 'All fields must belong to the assignments event.'}, status=400)
        item_by_id = {int(item['id']): item for item in items}
        for assignment in assignments:
            item = item_by_id[assignment.id]
            assignment.field_id = item.get('field')
            assignment.order = item.get('order', 0)
        with transaction.atomic():
            MatchFieldAssignment.objects.bulk_update(assignments, ['field', 'order'])
        return Response({'status': 'ok'})


# ═══════════════════════════════════════════════════════
# Category Referee Assignment ViewSet
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


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
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
    
    # Seed athletes (random shuffle for fairness)
    import random
    seeded_athletes = list(athletes)
    random.shuffle(seeded_athletes)

    num_byes = bracket_size - n
    num_round1_matches = bracket_size // 2

    # Build the flat round-1 slot list so byes are spread one per match
    # instead of clustering at the tail. Padding all the byes onto the end
    # of a single flat list (the previous approach) breaks whenever there's
    # more than one bye: e.g. 5 athletes -> bracket_size 8 -> 3 byes, the
    # last match would get paired (None, None) - a match with no athletes
    # at all, that nobody ever advances out of. Giving the first `num_byes`
    # matches exactly one real athlete + one bye slot each avoids that;
    # this is always possible without doubling up because num_byes is
    # guaranteed to be < num_round1_matches (bracket_size is the smallest
    # power of two >= n).
    seeded = []
    athlete_iter = iter(seeded_athletes)
    for i in range(num_round1_matches):
        seeded.append(next(athlete_iter, None))
        seeded.append(None if i < num_byes else next(athlete_iter, None))

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
        # Find semi-final matches. A semi-final slot with an empty corner
        # is a bye (nobody plays it, so it can never produce a loser) - a
        # 3-athlete bracket always creates 2 semi-final rows (1 real + 1
        # bye feeding the final), so without this filter it's mistaken for
        # a real "2 semis" bracket and the bye's non-existent loser is
        # wired into the bronze match instead of the final's real loser.
        semi_matches = [m for m in all_matches.values() if m.match_type == 'semi-finals' and m.red_corner and m.blue_corner]
        finals_match = [m for m in all_matches.values() if m.match_type == 'finals']

        if len(semi_matches) >= 2:
            # Standard case: 4+ athletes → bronze match between 2 semi-final losers.
            # Takes over the final's round_number (its own column, right before
            # the final's - computeBracketLayout now derives every match's
            # position from its real next_match/loser_next_match feeders rather
            # than "the previous round's paired slot", so bumping the final one
            # round further out doesn't cost it its own semis-derived position).
            bronze = Match.objects.create(
                category=category,
                match_type='bronze',
                round_number=num_rounds,
                bracket_position=0,
                match_number='BRONZE',
            )
            if finals_match:
                finals_match[0].round_number = num_rounds + 1
                finals_match[0].save(update_fields=['round_number'])
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


def _loser_of(match):
    """The athlete who didn't win `match`, or None if it has no winner yet."""
    winner = match.winner
    if not winner:
        return None
    return match.blue_corner if winner == match.red_corner else match.red_corner


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def add_bronze_match(request, category_id):
    """
    Add a single 3rd-place/bronze match to a bracket that was generated
    without one (bracket_type='single_elimination') - for when the need
    for one is only noticed after the semi-finals (and, in the 3-athlete
    case, the final) have already been played, without wiping and
    regenerating the whole bracket via generate_brackets.

    Mirrors generate_brackets' own 'consolation' branch (same two cases -
    2 semi-final losers, or 1 semi-final + 1 final loser for a 3-athlete
    bracket), but places the two already-decided losers directly into the
    new match's corners instead of only linking loser_next_match for a
    future auto-advance, since their matches are already over. Also
    clears any joint-3rd-place already recorded for them by
    advance_match_winner's no-bronze-playoff fallback, since that's about
    to be superseded by an actual decider.
    """
    try:
        category = Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return Response({'error': 'Categoria nu a fost gasita.'}, status=404)

    matches = Match.objects.filter(category=category).select_related('red_corner', 'blue_corner')
    if matches.filter(match_type='bronze').exists():
        return Response({'error': 'Această categorie are deja un meci de bronz.'}, status=400)

    semi_matches = list(matches.filter(match_type='semi-finals'))
    finals_matches = list(matches.filter(match_type='finals'))
    # A semi-final slot with an empty corner is a bye, not a real match -
    # nobody ever plays it, so it never has a loser. A 3-athlete bracket
    # always creates 2 semi-final rows (1 real + 1 bye feeding the final),
    # which without this filter looks identical to a real "2 semis" bracket
    # and incorrectly demands a loser out of a match that was never played.
    real_semi_matches = [m for m in semi_matches if m.red_corner_id and m.blue_corner_id]

    with transaction.atomic():
        if len(real_semi_matches) >= 2:
            losers = [_loser_of(m) for m in real_semi_matches[:2]]
            if not all(losers):
                return Response({'error': 'Ambele semifinale trebuie să aibă un câștigător înainte de a adăuga meciul de bronz.'}, status=400)
            # Takes over the final's round_number (its own column, right before
            # the final's), and the final is bumped one round further out -
            # see generate_brackets' consolation branch for why sharing a round
            # mis-groups bronze under "Finală" in the tree, and why bumping the
            # final doesn't cost it its own semis-derived position.
            if finals_matches:
                bronze_round = finals_matches[0].round_number
                finals_matches[0].round_number = bronze_round + 1
                finals_matches[0].save(update_fields=['round_number'])
            else:
                bronze_round = max((m.round_number for m in matches), default=0) + 1
            bronze = Match.objects.create(
                category=category, match_type='bronze', round_number=bronze_round,
                bracket_position=0, match_number='BRONZE',
                red_corner=losers[0], blue_corner=losers[1],
            )
            for sm in real_semi_matches[:2]:
                sm.loser_next_match = bronze
                sm.save(update_fields=['loser_next_match'])
            CategoryAthlete.objects.filter(category=category, athlete__in=losers, place=3).update(place=None)

        elif len(real_semi_matches) == 1 and finals_matches:
            semi, final = real_semi_matches[0], finals_matches[0]
            loser_semi = _loser_of(semi)
            loser_final = _loser_of(final)
            if not loser_semi or not loser_final:
                return Response({'error': 'Semifinala și finala trebuie să aibă un câștigător înainte de a adăuga meciul de bronz.'}, status=400)
            bronze = Match.objects.create(
                category=category, match_type='bronze', round_number=final.round_number + 1,
                bracket_position=0, match_number='BRONZE',
                red_corner=loser_semi, blue_corner=loser_final,
            )
            semi.loser_next_match = bronze
            semi.save(update_fields=['loser_next_match'])
            final.loser_next_match = bronze
            final.save(update_fields=['loser_next_match'])
            CategoryAthlete.objects.filter(category=category, athlete__in=[loser_semi, loser_final], place=3).update(place=None)

        else:
            return Response({'error': 'Acest bracket nu are semifinale din care să se formeze un meci de bronz.'}, status=400)

    return Response(MatchSerializer(bronze).data, status=201)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def remove_bronze_match(request, category_id):
    """
    Reverses add_bronze_match: deletes the bronze match, unlinks it from
    whichever semis/final fed into it, and restores the "no bronze
    playoff" fallback - both semi-final losers (or the single real semi's
    loser, for a 3-athlete bracket) automatically share 3rd place again,
    exactly as advance_match_winner already does for a bracket that never
    had a bronze match at all. For admins who add a bronze match by
    mistake.
    """
    try:
        category = Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return Response({'error': 'Categoria nu a fost gasita.'}, status=404)

    bronze = Match.objects.filter(category=category, match_type='bronze').first()
    if not bronze:
        return Response({'error': 'Această categorie nu are un meci de bronz.'}, status=400)

    with transaction.atomic():
        feeders = list(Match.objects.filter(category=category, loser_next_match=bronze))
        for m in feeders:
            m.loser_next_match = None
            m.save(update_fields=['loser_next_match'])

        # The final only ends up in `feeders` (loser_next_match == bronze)
        # for the "1 real semi + final" 3-athlete branch - the "2+ real
        # semis" branch links only the two semis that way and bumps the
        # final's round_number directly, so it has to be looked up
        # separately here regardless of which branch actually created it.
        final = Match.objects.filter(category=category, match_type='finals').first()
        if final and final.round_number == bronze.round_number + 1:
            # add_bronze_match's "2+ real semis" branch bumped the final's
            # round_number out of bronze's own column - put it back
            # exactly where bronze's round_number says it was. The "1 real
            # semi + final" branch never touches the final's round_number
            # at all, so there's nothing to revert in that case.
            final.round_number = bronze.round_number
            final.save(update_fields=['round_number'])

        # Clear whatever place the bronze match itself decided, then let
        # the no-bronze-playoff fallback below recompute it from scratch.
        CategoryAthlete.objects.filter(
            category=category, athlete_id__in=[bronze.red_corner_id, bronze.blue_corner_id], place=3,
        ).update(place=None)

        bronze.delete()

        for m in feeders:
            if m.match_type != 'semi-finals':
                continue
            winner = m.winner
            if not winner:
                continue
            loser = m.blue_corner if winner == m.red_corner else m.red_corner
            if loser:
                CategoryAthlete.objects.filter(category=category, athlete=loser).update(place=3)

    return Response(status=204)


def _advance_to_next(next_match, from_match, athlete):
    """Place an athlete into the correct slot of the next match."""
    if from_match.bracket_position % 2 == 0:
        next_match.red_corner = athlete
    else:
        next_match.blue_corner = athlete
    next_match.save()


def _set_category_place(category, athlete, place):
    """Record an athlete's final placement for a category. CategoryAthlete.place
    is per-athlete (not unique per category), so two athletes can both hold
    place=3 - that's how joint bronze (both semi-final losers, when there's
    no separate bronze match) is represented."""
    if not athlete:
        return
    CategoryAthlete.objects.filter(category=category, athlete=athlete).update(place=place)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def advance_match_winner(request, match_id):
    """
    After scoring is complete, advance the winner to the next match in the bracket.
    Also advances the loser to the consolation/bronze match if applicable.

    Wrapped in a locking transaction so concurrent/duplicate calls (double-click,
    retried requests) cannot place the winner/loser twice or race each other.
    """
    with transaction.atomic():
        try:
            match = Match.objects.select_for_update().select_related(
                'red_corner', 'blue_corner', 'next_match', 'loser_next_match'
            ).get(pk=match_id)
        except Match.DoesNotExist:
            return Response({'error': 'Meciul nu a fost gasit.'}, status=404)

        if match.status == 'cancelled':
            return Response({'error': 'Meciul a fost anulat si nu poate fi avansat.'}, status=400)

        winner = match.winner
        if not winner:
            return Response({'error': 'Nu exista un castigator pentru acest meci.'}, status=400)

        result = {}
        loser = match.blue_corner if winner == match.red_corner else match.red_corner

        # Advance winner to next match
        if match.next_match:
            next_match = Match.objects.select_for_update().get(pk=match.next_match_id)
            already_placed = next_match.red_corner_id == winner.id or next_match.blue_corner_id == winner.id
            if not already_placed:
                _advance_to_next(next_match, match, winner)
            result['status'] = 'advanced'
            result['next_match_id'] = next_match.id
        else:
            result['status'] = 'final'
            result['winner'] = f"{winner.first_name} {winner.last_name}"
            _set_category_place(match.category, winner, 1)
            _set_category_place(match.category, loser, 2)

        # Advance loser to consolation/bronze match
        if match.loser_next_match:
            if loser:
                loser_next_match = Match.objects.select_for_update().get(pk=match.loser_next_match_id)
                already_placed = loser_next_match.red_corner_id == loser.id or loser_next_match.blue_corner_id == loser.id
                if not already_placed:
                    _advance_to_next(loser_next_match, match, loser)
                result['loser_advanced_to'] = loser_next_match.id
        elif match.match_type == 'semi-finals':
            # No bronze playoff in this bracket - the federation's rule for
            # fight categories is that both semi-final losers share 3rd
            # place automatically, with no elimination match for it.
            _set_category_place(match.category, loser, 3)

        if match.match_type == 'bronze':
            _set_category_place(match.category, winner, 3)

        return Response(result)
