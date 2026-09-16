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
from ..permissions import IsAdminOrReadOnly, IsAdmin, IsOwnerOrAdmin, IsClubCoachOrAdmin, IsAthleteOwnerCoachOrAdmin, IsResultReviewerOrAdmin
from rest_framework.response import Response
from rest_framework.reverse import reverse
from django.conf import settings
from django.core.files.base import ContentFile
import logging
from pathlib import Path
from django.db import IntegrityError


class TrainingSeminarParticipationViewSet(viewsets.ModelViewSet):
    """ViewSet for athlete training seminar participation submissions with approval workflow"""
    serializer_class = TrainingSeminarParticipationSerializer
    # Allow coaches to manage their club athletes' seminar participations
    permission_classes = [IsAthleteOwnerCoachOrAdmin]
    
    def perform_create(self, serializer):
        """Set the athlete and submitted_by_athlete flag when creating.

        `athlete` is read-only on the serializer (so a client can't spoof
        submitting for someone else), so a coach logging a participation
        for one of their own club's athletes passes it as a plain
        `athlete` id in the request body instead - read directly off
        `request.data` here and trusted like an admin (no self-submission
        flag, no pending review). Anyone else can only submit for
        themselves, exactly as before."""
        from rest_framework.exceptions import ValidationError as DRFValidationError

        requester_athlete = getattr(self.request.user, 'athlete', None)
        is_admin = bool(self.request.user and getattr(self.request.user, 'is_admin', False))

        target_athlete = requester_athlete
        requested_athlete_id = self.request.data.get('athlete')
        if requested_athlete_id and (is_admin or (requester_athlete and requester_athlete.is_coach)):
            try:
                candidate = Athlete.objects.get(pk=requested_athlete_id)
            except (Athlete.DoesNotExist, ValueError, TypeError):
                candidate = None
            if candidate and (is_admin or candidate.club_id == requester_athlete.club_id):
                target_athlete = candidate

        if not target_athlete:
            raise DRFValidationError({'athlete': 'Sportivul este obligatoriu.'})

        submitted_by_athlete = not is_admin and target_athlete == requester_athlete

        try:
            serializer.save(athlete=target_athlete, submitted_by_athlete=submitted_by_athlete)
        except IntegrityError:
            # `ValidationError` in this module resolves to django.core.exceptions.ValidationError
            # (the `from .models import *` below the rest_framework import shadows it), which
            # DRF's exception handler doesn't render as JSON and surfaces as an opaque 500
            # instead of a 400. Import DRF's explicitly here so the friendly message actually
            # reaches the client.
            raise DRFValidationError({'event': 'You have already submitted participation for this event.'})
    
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

        # Default behaviour: admins get everything; a club coach gets their
        # whole club's participations (needed so e.g. approve()'s
        # get_object() can find a club-mate's pending submission, not just
        # their own - same scoping as GradeHistorySubmissionViewSet); anyone
        # else just their own.
        user = self.request.user
        if user.is_authenticated and (getattr(user, 'is_admin', False) or getattr(user, 'role', None) == 'admin'):
            return TrainingSeminarParticipation.objects.all().select_related('event', 'athlete')
        if hasattr(user, 'athlete') and user.athlete:
            if user.athlete.is_coach and user.athlete.club_id:
                return TrainingSeminarParticipation.objects.filter(athlete__club_id=user.athlete.club_id).select_related('event', 'athlete')
            return TrainingSeminarParticipation.objects.filter(athlete=user.athlete).select_related('event')
        return TrainingSeminarParticipation.objects.none()
    
    @action(detail=False, methods=['get'])
    def pending_review(self, request):
        """Seminar participations pending review: all of them for admins, or
        just the submitting coach's own club's athletes for club coaches -
        same pattern as grade/visa/score pending_review."""
        user = request.user
        if getattr(user, 'is_admin', False) or getattr(user, 'role', None) == 'admin':
            qs = TrainingSeminarParticipation.objects.filter(status='pending')
        elif hasattr(user, 'athlete') and user.athlete and user.athlete.is_coach and user.athlete.club_id:
            qs = TrainingSeminarParticipation.objects.filter(athlete__club_id=user.athlete.club_id, status='pending')
        else:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        qs = qs.select_related('athlete', 'event').order_by('-submitted_date')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def extract_diploma(self, request):
        """Best-effort AI reading of an uploaded seminar certificate photo,
        returning a suggested seminar event so the athlete can review and
        prefill the participation submission form. Never creates or
        modifies anything by itself."""
        if not hasattr(request.user, 'athlete'):
            return Response({'error': 'User does not have an athlete profile'}, status=status.HTTP_400_BAD_REQUEST)

        image = request.FILES.get('image') or request.FILES.get('participation_certificate')
        if not image:
            return Response({'error': 'Trimite o imagine cu certificatul (câmpul "image").'}, status=status.HTTP_400_BAD_REQUEST)

        from ..diploma_ocr import extract_seminar_certificate_fields
        try:
            result = extract_seminar_certificate_fields(image)
        except Exception:
            logging.getLogger(__name__).exception('Seminar certificate OCR failed')
            return Response(
                {'error': 'Nu am putut citi automat certificatul. Completează câmpurile manual.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsResultReviewerOrAdmin])
    def approve(self, request, pk=None):
        """Approve a seminar participation - the athlete's club coach or an admin."""
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
    
    @action(detail=True, methods=['post'], permission_classes=[IsResultReviewerOrAdmin])
    def reject(self, request, pk=None):
        """Reject a seminar participation - the athlete's club coach or an admin."""
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
    
    @action(detail=True, methods=['post'], permission_classes=[IsResultReviewerOrAdmin])
    def request_revision(self, request, pk=None):
        """Request revision of a seminar participation - the athlete's club coach or an admin."""
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
