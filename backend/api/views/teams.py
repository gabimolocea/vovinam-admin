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
    _event_for_team,
    _event_operational_guard_response,
    _event_operational_lock_response,
)


class TeamViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Team.objects.all()
    serializer_class = TeamSerializer

    def list(self, request):
        # prefetch members->athlete->club and categories to avoid N+1 queries:
        # TeamSerializer.to_representation() walks these per team via
        # _get_team_members/_get_team_categories, which use the prefetch
        # cache automatically when present.
        queryset = Team.objects.prefetch_related(
            'members__athlete__club', 'categories',
        )
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        # Ensure name field is provided (required by database)
        data = request.data.copy()
        if not data.get('name'):
            # Generate a temporary name - will be overridden when members are added
            import uuid
            data['name'] = f"Team {str(uuid.uuid4())[:8]}"
        
        serializer = self.serializer_class(data=data)
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
        locked = _event_operational_lock_response(_event_for_team(instance))
        if locked is not None:
            return locked
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(_event_for_team(instance))
        if locked is not None:
            return locked
        instance.delete()
        return Response(status=204)
    


class TeamMemberViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = TeamMember.objects.all()
    serializer_class = TeamMemberSerializer

    def list(self, request):
        queryset = self.queryset.all()
        team_id = request.query_params.get('team_id')
        if team_id:
            queryset = queryset.filter(team_id=team_id)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        team = Team.objects.filter(pk=request.data.get('team')).first()
        locked = _event_operational_lock_response(_event_for_team(team))
        if locked is not None:
            return locked
        if team and team.has_approved_result:
            return Response(
                {'detail': 'Componența echipei nu poate fi modificată: echipa are deja un rezultat aprobat.'},
                status=409,
            )
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        try:
            instance = self.queryset.get(pk=pk)
            serializer = self.serializer_class(instance)
            return Response(serializer.data)
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

    def destroy(self, request, pk=None):
        try:
            instance = self.queryset.get(pk=pk)
            locked = _event_operational_lock_response(_event_for_team(instance.team))
            if locked is not None:
                return locked
            if instance.team.has_approved_result:
                return Response(
                    {'detail': 'Componența echipei nu poate fi modificată: echipa are deja un rezultat aprobat.'},
                    status=409,
                )
            instance.delete()
            return Response(status=204)
        except TeamMember.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)


class CategoryTeamViewSet(viewsets.ViewSet):
    """
    ViewSet for CategoryTeam - team enrollment in categories.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CategoryTeamSerializer

    def get_queryset(self):
        queryset = CategoryTeam.objects.select_related('team', 'category').all()
        
        # Filter by category if provided
        category_id = self.request.query_params.get('category', None)
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)

        # Filter by event if provided
        event_id = self.request.query_params.get('event', None)
        if event_id is not None:
            queryset = queryset.filter(category__event_id=event_id)
        
        # Filter by club if provided
        club_id = self.request.query_params.get('club', None)
        if club_id is not None:
            queryset = queryset.filter(team__club_id=club_id)
        
        return queryset

    def list(self, request):
        queryset = self.get_queryset()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        category = Category.objects.select_related('event').filter(pk=request.data.get('category')).first()
        locked = _event_operational_guard_response(request.user, getattr(category, 'event', None))
        if locked:
            return locked
        serializer = self.serializer_class(data=request.data)
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

    def update(self, request, pk=None):
        return self.partial_update(request, pk)

    def destroy(self, request, pk=None):
        instance = self.get_queryset().get(pk=pk)
        locked = _event_operational_guard_response(request.user, getattr(instance.category, 'event', None))
        if locked:
            return locked
        instance.delete()
        return Response(status=204)


# FrontendTheme API removed — this viewset was intentionally deleted to disable theme management via the API.
