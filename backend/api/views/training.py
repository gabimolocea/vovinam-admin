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
            # `ValidationError` in this module resolves to django.core.exceptions.ValidationError
            # (the `from .models import *` below the rest_framework import shadows it), which
            # DRF's exception handler doesn't render as JSON and surfaces as an opaque 500
            # instead of a 400. Import DRF's explicitly here so the friendly message actually
            # reaches the client.
            from rest_framework.exceptions import ValidationError as DRFValidationError
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
