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

from ._common import _event_operational_guard_response


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

        my_enrollments = self.request.query_params.get('my', None)
        if my_enrollments and str(my_enrollments).lower() in ('1', 'true', 'yes'):
            athlete = getattr(self.request.user, 'athlete', None)
            queryset = queryset.filter(athlete=athlete) if athlete else queryset.none()

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
        payload = request.data.copy()
        if not user.is_admin:
            athlete_id = payload.get('athlete')
            if not athlete_id:
                own_athlete = getattr(user, 'athlete', None)
                if not own_athlete:
                    return Response({'error': 'Nu aveți un profil de sportiv asociat.'}, status=400)
                athlete_id = own_athlete.id
                payload['athlete'] = athlete_id
            if athlete_id:
                try:
                    target_athlete = Athlete.objects.get(pk=athlete_id)
                except Athlete.DoesNotExist:
                    return Response({'error': 'Sportivul nu a fost găsit.'}, status=404)
                own_athlete = getattr(user, 'athlete', None)
                is_self_enrollment = own_athlete and target_athlete.id == own_athlete.id
                user_club = getattr(own_athlete, 'club_id', None)
                if not is_self_enrollment and (not user_club or target_athlete.club_id != user_club):
                    return Response({'error': 'Poți înscrie doar sportivi din clubul tău.'}, status=403)

        serializer = self.serializer_class(data=payload)
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


class FightGroupEnrollmentViewSet(viewsets.ViewSet):
    """
    Pre-registration pool for fight athletes per group.
    Athletes are weighted first, then assigned to concrete fight categories.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = FightGroupEnrollmentSerializer

    def get_queryset(self):
        queryset = FightGroupEnrollment.objects.select_related('athlete', 'athlete__club', 'group', 'event').all()

        event_id = self.request.query_params.get('event')
        group_id = self.request.query_params.get('group')
        athlete_id = self.request.query_params.get('athlete')
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        if group_id:
            queryset = queryset.filter(group_id=group_id)
        if athlete_id:
            queryset = queryset.filter(athlete_id=athlete_id)

        my_club = self.request.query_params.get('my_club', None)
        if my_club and str(my_club).lower() in ('1', 'true', 'yes'):
            user = self.request.user
            if user and hasattr(user, 'athlete') and user.athlete and user.athlete.club_id:
                queryset = queryset.filter(athlete__club_id=user.athlete.club_id)
            else:
                queryset = queryset.none()

        return queryset

    def list(self, request):
        serializer = self.serializer_class(self.get_queryset(), many=True)
        return Response(serializer.data)

    def create(self, request):
        user = request.user
        group_id = request.data.get('group')
        event_id = request.data.get('event')
        athlete_id = request.data.get('athlete')

        group = Group.objects.select_related('event').filter(pk=group_id).first() if group_id else None
        if not group:
            return Response({'error': 'Grupa nu a fost găsită.'}, status=404)

        event = Competition.objects.filter(pk=event_id).first() if event_id else group.event
        if not event:
            return Response({'error': 'Evenimentul nu a fost găsit.'}, status=404)
        if group.event_id != event.id:
            return Response({'error': 'Grupa selectată nu aparține evenimentului.'}, status=400)

        locked = _event_operational_guard_response(user, event)
        if locked:
            return locked

        if not user.is_admin:
            if athlete_id:
                target_athlete = Athlete.objects.filter(pk=athlete_id).first()
                if not target_athlete:
                    return Response({'error': 'Sportivul nu a fost găsit.'}, status=404)
                user_club = getattr(getattr(user, 'athlete', None), 'club_id', None)
                if not user_club or target_athlete.club_id != user_club:
                    return Response({'error': 'Poți înscrie doar sportivi din clubul tău.'}, status=403)

        payload = request.data.copy()
        payload['event'] = event.id

        serializer = self.serializer_class(data=payload)
        if serializer.is_valid():
            instance = serializer.save()
            data = serializer.data
            athlete = getattr(instance, 'athlete', None)
            if athlete:
                warnings = group.eligibility_warnings(athlete) + athlete.visa_warnings()
                if warnings:
                    data = dict(data)
                    data['warnings'] = warnings
            return Response(data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        return Response(self.serializer_class(instance).data)

    def partial_update(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        locked = _event_operational_guard_response(request.user, instance.event)
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
        locked = _event_operational_guard_response(request.user, instance.event)
        if locked:
            return locked
        instance.delete()
        return Response(status=204)


class FightAthleteWeightViewSet(viewsets.ViewSet):
    """
    ViewSet for FightAthleteWeight - fight category weigh-in data.
    Tracks registered weight, match day weight, disqualification.
    """
    permission_classes = [IsAdminOrReadOnly]
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
            status='approved',
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
