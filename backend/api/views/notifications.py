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


def _build_resolved_status_map(notifications):
    """For each '*_submitted' notification (a request awaiting the reviewer's
    action), look up whether the underlying item has since moved past
    'pending' - so the frontend can grey out/mark cards already dealt with.
    Batched per type (one query per type, not per notification) rather than
    looking each one up individually."""
    grade_ids, seminar_ids, visa_ids, result_ids, photo_athlete_ids = set(), set(), set(), set(), set()
    for n in notifications:
        data = n.action_data or {}
        if n.notification_type == 'grade_submitted' and data.get('grade_history_id'):
            grade_ids.add(data['grade_history_id'])
        elif n.notification_type == 'seminar_submitted' and data.get('participation_id'):
            seminar_ids.add(data['participation_id'])
        elif n.notification_type == 'visa_submitted' and data.get('visa_id'):
            visa_ids.add(data['visa_id'])
        elif n.notification_type == 'result_submitted' and n.related_result_id:
            result_ids.add(n.related_result_id)
        elif n.notification_type == 'profile_image_submitted' and data.get('athlete_id'):
            photo_athlete_ids.add(data['athlete_id'])

    grade_status = dict(GradeHistory.objects.filter(id__in=grade_ids).values_list('id', 'status'))
    seminar_status = dict(TrainingSeminarParticipation.objects.filter(id__in=seminar_ids).values_list('id', 'status'))
    visa_status = dict(Visa.objects.filter(id__in=visa_ids).values_list('id', 'status'))
    result_status = dict(CategoryAthleteScore.objects.filter(id__in=result_ids).values_list('id', 'status'))
    photo_status = dict(Athlete.objects.filter(id__in=photo_athlete_ids).values_list('id', 'profile_image_status'))

    status_map = {}
    for n in notifications:
        data = n.action_data or {}
        current = None
        if n.notification_type == 'grade_submitted':
            current = grade_status.get(data.get('grade_history_id'))
        elif n.notification_type == 'seminar_submitted':
            current = seminar_status.get(data.get('participation_id'))
        elif n.notification_type == 'visa_submitted':
            current = visa_status.get(data.get('visa_id'))
        elif n.notification_type == 'result_submitted':
            current = result_status.get(n.related_result_id)
        elif n.notification_type == 'profile_image_submitted':
            current = photo_status.get(data.get('athlete_id'))
        if current and current != 'pending':
            status_map[n.id] = current
    return status_map


class NotificationViewSet(viewsets.ModelViewSet):
    """ViewSet for user notifications"""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Return notifications for the current user"""
        # select_related('recipient') avoids one query per notification for
        # NotificationSerializer's recipient_name field (source='recipient.__str__') —
        # previously every row re-fetched the *same* user row from scratch.
        return Notification.objects.filter(recipient=self.request.user).select_related('recipient')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        items = page if page is not None else list(queryset)
        context = self.get_serializer_context()
        context['resolved_status_map'] = _build_resolved_status_map(items)
        serializer = self.get_serializer(items, many=True, context=context)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications"""
        from ..notification_utils import get_unread_notification_count
        count = get_unread_notification_count(request.user)
        return Response({'unread_count': count})
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a specific notification as read"""
        notification = self.get_object()
        notification.mark_as_read()
        return Response({'message': 'Notification marked as read'})
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read for the current user"""
        from ..notification_utils import mark_notifications_as_read
        updated_count = mark_notifications_as_read(request.user)
        return Response({
            'message': f'{updated_count} notifications marked as read',
            'updated_count': updated_count
        })
    
    @action(detail=False, methods=['post'])
    def mark_selected_read(self, request):
        """Mark selected notifications as read"""
        serializer = NotificationActionSerializer(data=request.data)
        if serializer.is_valid():
            notification_ids = serializer.validated_data.get('notification_ids', [])
            if notification_ids:
                from ..notification_utils import mark_notifications_as_read
                updated_count = mark_notifications_as_read(request.user, notification_ids)
                return Response({
                    'message': f'{updated_count} notifications marked as read',
                    'updated_count': updated_count
                })
            else:
                return Response({'error': 'No notification IDs provided'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class NotificationSettingsViewSet(viewsets.ModelViewSet):
    """ViewSet for user notification settings"""
    serializer_class = NotificationSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return notification settings for the current user"""
        return NotificationSettings.objects.filter(user=self.request.user)
    
    def get_object(self):
        """Get or create notification settings for the current user"""
        settings, created = NotificationSettings.objects.get_or_create(user=self.request.user)
        return settings
    
    def update(self, request, *args, **kwargs):
        """Update notification settings"""
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# Grade History Submission Views
