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


class GradeViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
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
