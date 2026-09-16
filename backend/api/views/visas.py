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


class AnnualVisaViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    # Use the unified Visa model under the hood (filter by type) so the
    # endpoint continues to work while we migrate data into Visa.
    serializer_class = None  # set in __init__ below

    def get_queryset(self, request=None):
        from ..models import Visa
        queryset = Visa.objects.filter(visa_type='annual')
        # my_club - scope to the requesting coach's own club, mirroring
        # AthleteViewSet's my_club filter, instead of returning every visa
        # in the whole federation on every request.
        my_club = request.query_params.get('my_club') if request else None
        if my_club and str(my_club).lower() in ('1', 'true', 'yes'):
            user = request.user
            if user and user.is_authenticated and getattr(user, 'athlete', None) and user.athlete.club_id:
                queryset = queryset.filter(athlete__club_id=user.athlete.club_id)
            else:
                queryset = queryset.none()
        return queryset

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Dynamically set serializer to VisaSerializer to avoid circular imports on startup
        try:
            from ..serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = AnnualVisaSerializer

    def list(self, request):
        queryset = self.get_queryset(request)
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

    def get_queryset(self, request=None):
        from ..models import Visa
        queryset = Visa.objects.filter(visa_type='medical')
        my_club = request.query_params.get('my_club') if request else None
        if my_club and str(my_club).lower() in ('1', 'true', 'yes'):
            user = request.user
            if user and user.is_authenticated and getattr(user, 'athlete', None) and user.athlete.club_id:
                queryset = queryset.filter(athlete__club_id=user.athlete.club_id)
            else:
                queryset = queryset.none()
        return queryset

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            from ..serializers import VisaSerializer
            self.serializer_class = VisaSerializer
        except Exception:
            self.serializer_class = MedicalVisaSerializer

    def list(self, request):
        queryset = self.get_queryset(request)
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


class VisaSubmissionViewSet(viewsets.ModelViewSet):
    """ViewSet for athlete visa (medical/annual) submissions with approval
    workflow - mirrors GradeHistorySubmissionViewSet/TrainingSeminarParticipationViewSet."""
    serializer_class = VisaSubmissionSerializer
    permission_classes = [IsAthleteOwnerCoachOrAdmin]

    def perform_create(self, serializer):
        try:
            serializer.save()
        except IntegrityError:
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError({'issued_date': 'Ai trimis deja o viză de acest tip pentru această dată.'})

    def get_queryset(self):
        qs = Visa.objects.select_related('athlete')
        user = self.request.user

        if getattr(user, 'is_admin', False) or getattr(user, 'role', None) == 'admin':
            pass
        elif hasattr(user, 'athlete') and user.athlete:
            if user.athlete.is_coach and user.athlete.club_id:
                qs = qs.filter(athlete__club_id=user.athlete.club_id)
            else:
                qs = qs.filter(athlete=user.athlete)
        else:
            return Visa.objects.none()

        visa_type = self.request.query_params.get('visa_type')
        if visa_type:
            qs = qs.filter(visa_type=visa_type)

        athlete_id = self.request.query_params.get('athlete')
        if athlete_id:
            qs = qs.filter(athlete_id=athlete_id)

        return qs.order_by('-submitted_date')

    @action(detail=False, methods=['post'])
    def extract_diploma(self, request):
        """Best-effort AI reading of an uploaded medical/annual visa photo,
        returning a suggested issued date so the athlete can review and
        prefill the visa submission form. Never creates or modifies
        anything by itself."""
        if not hasattr(request.user, 'athlete'):
            return Response({'error': 'User does not have an athlete profile'}, status=status.HTTP_400_BAD_REQUEST)

        image = request.FILES.get('image')
        if not image:
            return Response({'error': 'Trimite o imagine cu legitimația (câmpul "image").'}, status=status.HTTP_400_BAD_REQUEST)

        from ..diploma_ocr import extract_visa_certificate_fields
        try:
            result = extract_visa_certificate_fields(image)
        except Exception:
            logging.getLogger(__name__).exception('Visa certificate OCR failed')
            return Response(
                {'error': 'Nu am putut citi automat legitimația. Completează câmpurile manual.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(result)

    @action(detail=False, methods=['get'])
    def pending_review(self, request):
        """Visa submissions pending review: all of them for admins, or just
        the submitting coach's own club's athletes for club coaches."""
        user = request.user
        if getattr(user, 'is_admin', False) or getattr(user, 'role', None) == 'admin':
            qs = Visa.objects.filter(status='pending', submitted_by_athlete=True)
        elif hasattr(user, 'athlete') and user.athlete and user.athlete.is_coach and user.athlete.club_id:
            qs = Visa.objects.filter(
                athlete__club_id=user.athlete.club_id, status='pending', submitted_by_athlete=True
            )
        else:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        qs = qs.select_related('athlete').order_by('-submitted_date')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsResultReviewerOrAdmin])
    def approve(self, request, pk=None):
        visa = self.get_object()
        serializer = VisaApprovalSerializer(data=request.data)
        if serializer.is_valid():
            visa.approve(request.user, serializer.validated_data.get('notes', ''))
            return Response({'message': 'Visa approved successfully', 'status': visa.status})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsResultReviewerOrAdmin])
    def reject(self, request, pk=None):
        visa = self.get_object()
        serializer = VisaApprovalSerializer(data=request.data)
        if serializer.is_valid():
            visa.reject(request.user, serializer.validated_data.get('notes', ''))
            return Response({'message': 'Visa rejected successfully', 'status': visa.status})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], permission_classes=[IsResultReviewerOrAdmin])
    def request_revision(self, request, pk=None):
        visa = self.get_object()
        serializer = VisaApprovalSerializer(data=request.data)
        if serializer.is_valid():
            visa.request_revision(request.user, serializer.validated_data.get('notes', ''))
            return Response({'message': 'Revision requested successfully', 'status': visa.status})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# TrainingSeminarViewSet removed - use Events API instead
