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

from ._common import (
    _compute_video_offset_ms,
    _is_category_assigned_referee,
    _log_category_score_event,
    _resolve_recording_session,
)


class CategoryRefereeScoreViewSet(viewsets.ViewSet):
    """ViewSet for referees to submit scores for athletes/teams in solo/team categories.
    Read access allowed for public display; write requires authentication.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    
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

        target_category = None
        if request.data.get('athlete_score'):
            target_score = CategoryAthleteScore.objects.select_related('category').filter(
                pk=request.data['athlete_score'],
            ).first()
            target_category = target_score.category if target_score else None
        elif request.data.get('category'):
            target_category = Category.objects.filter(pk=request.data['category']).first()
        if not target_category:
            return Response({'error': 'Category not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_admin and not _is_category_assigned_referee(target_category, user.athlete):
            return Response({'error': 'Nu ești arbitru alocat acestei categorii.'}, status=status.HTTP_403_FORBIDDEN)
        
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
            (hasattr(user, 'athlete') and user.athlete == score.referee
             and _is_category_assigned_referee(score.athlete_score.category, user.athlete))):
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
        if self.request.user and getattr(self.request.user, 'is_admin', False):
            serializer.save(submitted_by_athlete=False, status=self.request.data.get('status') or 'approved')
            return

        if not hasattr(self.request.user, 'athlete'):
            raise ValidationError("Only athletes can submit competition results")
        
        # The serializer will handle setting the athlete and logging the activity
        serializer.save()

    def update(self, request, *args, **kwargs):
        """Allow athletes to update their own scores, and coaches to update their club athletes' scores"""
        instance = self.get_object()

        if request.user and getattr(request.user, 'is_admin', False):
            return super().update(request, *args, **kwargs)
        
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
        ).select_related('category__event', 'reviewed_by', 'athlete').prefetch_related('team_members').distinct()
        
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
        ).select_related('category__event', 'reviewed_by', 'athlete').prefetch_related('team_members').distinct()
        
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
