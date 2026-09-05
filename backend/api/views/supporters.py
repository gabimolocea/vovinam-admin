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


class SupporterAthleteRelationViewSet(viewsets.ModelViewSet):
    """ViewSet for managing supporter-athlete relationships.

    A relation is created with status='pending' and grants no permission
    (can_edit/can_register_competitions are inert) until the athlete (or an
    admin) approves it via the `approve`/`reject` actions.
    """
    serializer_class = SupporterAthleteRelationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.is_supporter:
            return SupporterAthleteRelation.objects.filter(supporter=user)
        elif user.is_admin:
            return SupporterAthleteRelation.objects.all()
        else:
            # An athlete needs to see (and act on) pending requests concerning them.
            athlete = getattr(user, 'athlete', None)
            if athlete:
                return SupporterAthleteRelation.objects.filter(athlete=athlete)
            return SupporterAthleteRelation.objects.none()
    
    def perform_create(self, serializer):
        """Create relationship for current supporter, pending athlete/admin approval."""
        if not self.request.user.is_supporter:
            raise ValidationError("Only supporters can create athlete relationships.")

        relation = serializer.save(supporter=self.request.user, status='pending')
        athlete_user = getattr(relation.athlete, 'user', None)
        if athlete_user:
            from ..notification_utils import create_notification
            create_notification(
                recipient=athlete_user,
                notification_type='supporter_request',
                title='Cerere susținător nouă',
                message=(
                    f'{self.request.user.get_full_name() or self.request.user.username} '
                    f'dorește să devină susținător pentru profilul tău. Aprobă sau respinge cererea.'
                ),
            )

    def _can_review(self, user, relation):
        if getattr(user, 'is_admin', False):
            return True
        athlete_user = getattr(relation.athlete, 'user', None)
        return athlete_user is not None and athlete_user == user

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        relation = self.get_object()
        if not self._can_review(request.user, relation):
            return Response({'error': 'Doar sportivul sau un admin poate aproba această cerere.'}, status=403)
        relation.approve(request.user)
        from ..notification_utils import create_notification
        create_notification(
            recipient=relation.supporter,
            notification_type='supporter_approved',
            title='Cerere de susținător aprobată',
            message=f'Cererea ta de a susține profilul lui {relation.athlete} a fost aprobată.',
        )
        return Response(SupporterAthleteRelationSerializer(relation).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        relation = self.get_object()
        if not self._can_review(request.user, relation):
            return Response({'error': 'Doar sportivul sau un admin poate respinge această cerere.'}, status=403)
        relation.reject(request.user)
        from ..notification_utils import create_notification
        create_notification(
            recipient=relation.supporter,
            notification_type='supporter_rejected',
            title='Cerere de susținător respinsă',
            message=f'Cererea ta de a susține profilul lui {relation.athlete} a fost respinsă.',
        )
        return Response(SupporterAthleteRelationSerializer(relation).data)
