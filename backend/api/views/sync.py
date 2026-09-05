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


class OfflineSyncViewSet(viewsets.ViewSet):
    """Offline snapshot and results upload endpoints for competition manager.

    Restricted to admins: these endpoints can inject/overwrite competition data
    for ANY event, so plain authentication is not sufficient authorization.
    """
    permission_classes = [IsAdmin]

    @action(detail=False, methods=['get'], url_path='event-pack')
    def event_pack(self, request):
        event_id = request.query_params.get('event_id')
        if not event_id:
            return Response({'detail': 'event_id query param is required.'}, status=400)

        try:
            from ..sync.export_event_pack import build_event_pack

            payload = build_event_pack(event_id=int(event_id))
            event = Event.objects.get(pk=payload['event']['id'])
            event.mark_exported_to_local(exported_at=payload['manifest']['exported_at'])
            event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at'])

            return Response(payload)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=404)

    @action(detail=False, methods=['post'], url_path='event-pack/import')
    def import_event_pack(self, request):
        try:
            from ..sync.import_event_pack import import_event_pack

            return Response(import_event_pack(request.data), status=200)
        except (DjangoValidationError, ValidationError) as exc:
            detail = getattr(exc, 'message_dict', None) or getattr(exc, 'detail', None) or str(exc)
            return Response({'detail': detail}, status=400)

    @action(detail=False, methods=['get'], url_path='event-results')
    def event_results(self, request):
        event_id = request.query_params.get('event_id')
        if not event_id:
            return Response({'detail': 'event_id query param is required.'}, status=400)

        try:
            from ..sync.export_event_results import build_event_results_pack

            return Response(build_event_results_pack(event_id=int(event_id)))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=404)

    @action(detail=False, methods=['post'], url_path='event-results/import')
    def import_event_results(self, request):
        try:
            from ..sync.import_event_results import import_event_results

            return Response(import_event_results(request.data), status=200)
        except (DjangoValidationError, ValidationError) as exc:
            detail = getattr(exc, 'message_dict', None) or getattr(exc, 'detail', None) or str(exc)
            return Response({'detail': detail}, status=400)

    @action(detail=False, methods=['get'], url_path='athletes')
    def athletes(self, request):
        athletes = Athlete.objects.filter(status='approved', is_deleted=False)
        serializer = OfflineAthleteSerializer(athletes, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='clubs')
    def clubs(self, request):
        clubs = Club.objects.all()
        serializer = OfflineClubSerializer(clubs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='competition-pack')
    def competition_pack(self, request):
        from landing.models import Event

        competitions = Event.objects.filter(event_type='competition')
        categories = Category.objects.filter(event__in=competitions)
        matches = Match.objects.filter(category__in=categories)

        return Response({
            'competitions': OfflineCompetitionSerializer(competitions, many=True).data,
            'categories': OfflineCategorySerializer(categories, many=True).data,
            'matches': OfflineMatchSerializer(matches, many=True).data,
        })

    @action(detail=False, methods=['post'], url_path='results')
    def results(self, request):
        results = request.data.get('results', [])
        if not isinstance(results, list):
            return Response({'detail': 'results must be a list'}, status=400)

        created = []
        failed = []

        for item in results:
            try:
                category_id = item.get('category_id') or item.get('category')
                if not category_id:
                    raise ValidationError({'category_id': 'This field is required.'})

                category = Category.objects.get(pk=category_id)
                result_type = item.get('type') or category.type
                score = item.get('score')
                placement_claimed = item.get('placement_claimed')
                notes = item.get('notes')

                payload = {
                    'category': category.id,
                    'type': result_type,
                    'score': score,
                    'placement_claimed': placement_claimed,
                    'notes': notes,
                    'submitted_by_athlete': False,
                    'status': 'pending'
                }

                if result_type == 'teams':
                    team_member_ids = item.get('team_member_ids') or item.get('team_members') or []
                    team_name = item.get('team_name')
                    payload['team_members'] = team_member_ids
                    payload['team_name'] = team_name
                    serializer = OfflineCategoryAthleteScoreSerializer(data=payload)
                    serializer.is_valid(raise_exception=True)
                    obj = serializer.save()
                else:
                    athlete_id = item.get('athlete_id') or item.get('athlete')
                    if not athlete_id:
                        raise ValidationError({'athlete_id': 'This field is required for solo/fight results.'})
                    payload['athlete'] = athlete_id
                    serializer = OfflineCategoryAthleteScoreSerializer(data=payload)
                    serializer.is_valid(raise_exception=True)
                    obj = serializer.save()

                created.append({'id': obj.id, 'category': obj.category_id})
            except Exception as exc:
                failed.append({'item': item, 'error': str(exc)})

        return Response({
            'created': created,
            'failed': failed,
        })
