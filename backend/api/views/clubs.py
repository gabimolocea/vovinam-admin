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


class ClubViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Club.objects.all()
    serializer_class = ClubSerializer

    def list(self, request):
        # select_related('city') + prefetch_related(...) avoid N+1 queries:
        # to_representation() reads instance.city, and get_coaches()/get_athletes()
        # each query a reverse FK per club without this.
        queryset = Club.objects.select_related('city').prefetch_related(
            'coaches__club__city', 'coaches__current_grade',
            'athletes__club__city', 'athletes__current_grade',
        ).order_by('display_order', 'name')
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

    def partial_update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        instance.delete()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder clubs.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each club based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        for idx, club_id in enumerate(order):
            Club.objects.filter(pk=club_id).update(display_order=idx)
        return Response({'status': 'ok'})
