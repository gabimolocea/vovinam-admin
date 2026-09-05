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


class AnnualVisaViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    # Use the unified Visa model under the hood (filter by type) so the
    # endpoint continues to work while we migrate data into Visa.
    serializer_class = None  # set in __init__ below

    def get_queryset(self):
        from ..models import Visa
        return Visa.objects.filter(visa_type='annual')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Dynamically set serializer to VisaSerializer to avoid circular imports on startup
        try:
            from ..serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = AnnualVisaSerializer

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


class MedicalVisaViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    # Proxy to the unified Visa model using visa_type='medical'
    serializer_class = None

    def get_queryset(self):
        from ..models import Visa
        return Visa.objects.filter(visa_type='medical')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            from ..serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = MedicalVisaSerializer

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


# TrainingSeminarViewSet removed - use Events API instead
