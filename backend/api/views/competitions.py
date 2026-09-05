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

from ._common import _coerce_bool, _event_operational_lock_response


class CompetitionViewSet(viewsets.ViewSet):
    """
    Compatibility viewset: expose Events marked as competition under the legacy /competitions/ endpoint.
    This returns a list of competitions with nested categories like the old Competition model used to provide.
    """
    permission_classes = [IsAdminOrReadOnly]

    def list(self, request):
        from landing.models import Event
        event_type = request.query_params.get('event_type') or 'competition'
        events = Event.objects.filter(event_type=event_type)
        status_filter = request.query_params.get('status')
        if status_filter:
            events = events.filter(status=status_filter)
        elif event_type == 'competition' and request.user.is_authenticated and request.user.role == 'referee' and not request.user.is_admin:
            events = events.filter(status='ongoing')
        # Prefetch categories + field assignments to avoid N+1 queries
        events = events.prefetch_related(
            'categories__field_assignment__field'
        )
        data = []
        for ev in events:
            cats = []
            for cat in ev.categories.all():
                assignment = getattr(cat, 'field_assignment', None)
                field = assignment.field if assignment else None
                cats.append({
                    'id': cat.id,
                    'name': cat.name,
                    'type': cat.type,
                    'gender': cat.gender,
                    'field_status': assignment.status if assignment else None,
                    'field_id': field.id if field else None,
                    'field_name': field.name if field else None,
                    'field_number': field.field_number if field else None,
                })
            data.append({
                'id': ev.id,
                'name': ev.title,
                'place': ev.address,
                'address': ev.address,
                'city': ev.city_id,
                'city_name': ev.city.name if ev.city_id else None,
                'start_date': ev.start_date,
                'end_date': ev.end_date,
                'coach_registration_deadline': ev.coach_registration_deadline,
                'effective_coach_registration_deadline': getattr(ev, 'effective_coach_registration_deadline', ev.start_date),
                'event_type': ev.event_type,
                'status': getattr(ev, 'status', None),
                'sync_mode': ev.sync_mode,
                'sync_locked': ev.sync_locked,
                'local_sync_status': ev.local_sync_status,
                'exported_to_local_at': ev.exported_to_local_at,
                'results_uploaded_at': getattr(ev, 'results_uploaded_at', None),
                'sync_completed_at': getattr(ev, 'sync_completed_at', None),
                'operational_lock_active': getattr(ev, 'operational_lock_active', False),
                'description': ev.description,
                'categories': cats
            })
        return Response(data)

    def _serialize_event(self, ev, include_categories=False):
        """Helper to serialize an Event into the competition response format."""
        data = {
            'id': ev.id,
            'name': ev.title,
            'place': ev.address,
            'address': ev.address,
            'city': ev.city_id,
            'city_name': ev.city.name if ev.city_id else None,
            'start_date': ev.start_date,
            'end_date': ev.end_date,
            'coach_registration_deadline': ev.coach_registration_deadline,
            'effective_coach_registration_deadline': getattr(ev, 'effective_coach_registration_deadline', ev.start_date),
            'event_type': ev.event_type,
            'status': getattr(ev, 'status', None),
            'sync_mode': ev.sync_mode,
            'sync_locked': ev.sync_locked,
            'local_sync_status': ev.local_sync_status,
            'exported_to_local_at': ev.exported_to_local_at,
            'results_uploaded_at': getattr(ev, 'results_uploaded_at', None),
            'sync_completed_at': getattr(ev, 'sync_completed_at', None),
            'operational_lock_active': getattr(ev, 'operational_lock_active', False),
            'description': ev.description,
        }
        if include_categories:
            cats = []
            for cat in Category.objects.filter(event=ev).select_related('field_assignment__field'):
                assignment = getattr(cat, 'field_assignment', None)
                field = assignment.field if assignment else None
                cats.append({
                    'id': cat.id,
                    'name': cat.name,
                    'type': cat.type,
                    'gender': cat.gender,
                    'field_status': assignment.status if assignment else None,
                    'field_id': field.id if field else None,
                    'field_name': field.name if field else None,
                    'field_number': field.field_number if field else None,
                })
            data['categories'] = cats
        return data

    def _parse_event_datetime(self, value, fallback=None):
        if value in [None, '']:
            return fallback
        parsed = parse_datetime(value)
        if parsed is not None:
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed)
            return parsed
        parsed_date = parse_date(value)
        if parsed_date is not None:
            return timezone.make_aware(datetime.combine(parsed_date, datetime.min.time()))
        raise ValidationError({'start_date': ['Invalid date format.']})

    def _default_coach_deadline(self, start_dt):
        return start_dt

    def retrieve(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
            status_filter = request.query_params.get('status')
            if status_filter and ev.status != status_filter:
                return Response({'detail': 'Not found.'}, status=404)
            if request.user.is_authenticated and request.user.role == 'referee' and not request.user.is_admin:
                if ev.status != 'ongoing':
                    return Response({'detail': 'Not found.'}, status=404)
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        return Response(self._serialize_event(ev, include_categories=True))

    def create(self, request):
        from landing.models import Event
        from ..models import City
        from django.utils.text import slugify
        d = request.data
        title = d.get('name', '').strip()
        if not title:
            return Response({'name': ['This field is required.']}, status=400)
        start_date = d.get('start_date')
        if not start_date:
            return Response({'start_date': ['This field is required.']}, status=400)
        try:
            parsed_start_date = self._parse_event_datetime(start_date)
            parsed_end_date = self._parse_event_datetime(d.get('end_date'), fallback=parsed_start_date)
        except ValidationError as exc:
            return Response(exc.detail, status=400)
        city = None
        city_id = d.get('city')
        if city_id not in [None, '']:
            city = City.objects.filter(pk=city_id).first()
            if not city:
                return Response({'city': ['Invalid city selected.']}, status=400)
        # Build a unique slug
        event_type = d.get('event_type') or 'competition'
        valid_event_types = {choice[0] for choice in Event.EVENT_TYPE_CHOICES}
        if event_type not in valid_event_types:
            return Response({'event_type': ['Invalid event type.']}, status=400)

        base_slug = slugify(title) or event_type
        slug = base_slug
        counter = 1
        while Event.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{counter}'
            counter += 1
        coach_deadline = self._parse_event_datetime(
            d.get('coach_registration_deadline'),
            fallback=self._default_coach_deadline(parsed_start_date),
        )
        exported_to_local_at = self._parse_event_datetime(d.get('exported_to_local_at'))
        results_uploaded_at = self._parse_event_datetime(d.get('results_uploaded_at'))
        sync_completed_at = self._parse_event_datetime(d.get('sync_completed_at'))
        ev = Event.objects.create(
            title=title,
            slug=slug,
            address=d.get('address', '') or d.get('location', '') or d.get('place', ''),
            city=city,
            start_date=parsed_start_date,
            end_date=parsed_end_date,
            coach_registration_deadline=coach_deadline,
            description=d.get('description', ''),
            event_type=event_type,
            status=d.get('status', 'upcoming'),
            sync_mode=d.get('sync_mode', 'cloud') or 'cloud',
            sync_locked=_coerce_bool(d.get('sync_locked'), default=False),
            local_sync_status=d.get('local_sync_status', 'idle') or 'idle',
            exported_to_local_at=exported_to_local_at,
            results_uploaded_at=results_uploaded_at,
            sync_completed_at=sync_completed_at,
        )
        return Response(self._serialize_event(ev), status=201)

    def partial_update(self, request, pk=None):
        from landing.models import Event
        from ..models import City
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        d = request.data
        sync_only_fields = {'sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at', 'results_uploaded_at', 'sync_completed_at'}
        requested_fields = set(d.keys())
        if getattr(ev, 'operational_lock_active', False) and requested_fields - sync_only_fields:
            locked = _event_operational_lock_response(ev)
            if locked is not None:
                return locked
        if 'name' in d:
            ev.title = d['name']
        if 'address' in d or 'location' in d or 'place' in d:
            ev.address = d.get('address', d.get('location', d.get('place', ev.address)))
        if 'city' in d:
            city_id = d.get('city')
            if city_id in [None, '']:
                ev.city = None
            else:
                city = City.objects.filter(pk=city_id).first()
                if not city:
                    return Response({'city': ['Invalid city selected.']}, status=400)
                ev.city = city
        if 'start_date' in d:
            try:
                ev.start_date = self._parse_event_datetime(d['start_date'], fallback=ev.start_date)
            except ValidationError as exc:
                return Response(exc.detail, status=400)
        if 'end_date' in d:
            try:
                ev.end_date = self._parse_event_datetime(d['end_date'], fallback=ev.end_date)
            except ValidationError as exc:
                return Response(exc.detail, status=400)
        if 'coach_registration_deadline' in d:
            try:
                ev.coach_registration_deadline = self._parse_event_datetime(
                    d.get('coach_registration_deadline'),
                    fallback=self._default_coach_deadline(ev.start_date),
                )
            except ValidationError as exc:
                return Response({'coach_registration_deadline': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        elif 'start_date' in d and not ev.coach_registration_deadline:
            ev.coach_registration_deadline = self._default_coach_deadline(ev.start_date)
        if 'description' in d:
            ev.description = d['description']
        if 'status' in d:
            ev.status = d['status']
        if 'sync_mode' in d:
            ev.sync_mode = d.get('sync_mode') or ev.sync_mode
        if 'sync_locked' in d:
            ev.sync_locked = _coerce_bool(d.get('sync_locked'), default=ev.sync_locked)
        if 'local_sync_status' in d:
            ev.local_sync_status = d.get('local_sync_status') or ev.local_sync_status
        if 'exported_to_local_at' in d:
            try:
                ev.exported_to_local_at = self._parse_event_datetime(d.get('exported_to_local_at'))
            except ValidationError as exc:
                return Response({'exported_to_local_at': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        if 'results_uploaded_at' in d:
            try:
                ev.results_uploaded_at = self._parse_event_datetime(d.get('results_uploaded_at'))
            except ValidationError as exc:
                return Response({'results_uploaded_at': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        if 'sync_completed_at' in d:
            try:
                ev.sync_completed_at = self._parse_event_datetime(d.get('sync_completed_at'))
            except ValidationError as exc:
                return Response({'sync_completed_at': exc.detail.get('start_date', ['Invalid date format.'])}, status=400)
        ev.save()
        return Response(self._serialize_event(ev, include_categories=True))

    @action(detail=True, methods=['post'], url_path='complete-local-sync')
    def complete_local_sync(self, request, pk=None):
        from landing.models import Event

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if ev.local_sync_status not in {'results_uploaded', 'completed'}:
            return Response(
                {'detail': 'Event results must be imported from local before sync can be completed.'},
                status=400,
            )

        ev.complete_local_sync()
        ev.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'sync_completed_at'])
        return Response(self._serialize_event(ev, include_categories=True), status=200)

    @action(detail=True, methods=['post'], url_path='mark-results-uploaded')
    def mark_results_uploaded(self, request, pk=None):
        from landing.models import Event

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not ev.sync_locked:
            return Response({'detail': 'Event must be locked for local operation.'}, status=400)

        ev.mark_results_uploaded()
        ev.save(update_fields=['local_sync_status', 'results_uploaded_at'])
        return Response(self._serialize_event(ev, include_categories=True), status=200)

    @action(detail=True, methods=['post'], url_path='mark-local-in-progress')
    def mark_local_in_progress(self, request, pk=None):
        from landing.models import Event

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        if not ev.sync_locked:
            return Response({'detail': 'Event must be locked for local operation.'}, status=400)
        if ev.local_sync_status not in {'exported', 'local_in_progress'}:
            return Response({'detail': 'Event must be exported for local operation before it can be marked as in progress.'}, status=400)

        ev.mark_local_in_progress()
        ev.save(update_fields=['local_sync_status'])
        return Response(self._serialize_event(ev, include_categories=True), status=200)

    @action(detail=True, methods=['post'], url_path='generate-standard-groups-categories')
    def generate_standard_groups_categories(self, request, pk=None):
        from landing.models import Event
        from ..competition_defaults import ensure_standard_competition_groups_and_categories

        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        result = ensure_standard_competition_groups_and_categories(ev)
        return Response({
            'detail': 'Standard groups and categories generated successfully.',
            'result': result,
            'competition': self._serialize_event(ev, include_categories=True),
        })

    def destroy(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        ev.delete()
        return Response(status=204)

    @action(detail=True, methods=['get'], permission_classes=[IsAdminOrReadOnly], url_path='stats')
    def stats(self, request, pk=None):
        from landing.models import Event
        try:
            ev = Event.objects.get(pk=pk, event_type='competition')
        except Event.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        categories = Category.objects.filter(event=ev)
        fields_active = CompetitionField.objects.filter(event=ev).count()

        referee_ids = set()
        for assignment in CategoryRefereeAssignment.objects.filter(category__in=categories):
            for ref in [assignment.referee_1, assignment.referee_2, assignment.referee_3, assignment.referee_4, assignment.referee_5]:
                if ref_id := getattr(ref, 'id', None):
                    referee_ids.add(ref_id)

        match_ids = Match.objects.filter(category__in=categories).values_list('id', flat=True)
        for assignment in MatchRefereeAssignment.objects.filter(match_id__in=match_ids):
            for ref in [assignment.referee_1, assignment.referee_2, assignment.referee_3, assignment.referee_4, assignment.referee_5]:
                if ref_id := getattr(ref, 'id', None):
                    referee_ids.add(ref_id)

        scores_submitted = (
            CategoryRefereeScore.objects.filter(athlete_score__category__in=categories).count()
            + MatchRefereeScore.objects.filter(match__category__in=categories).count()
        )

        pending_approval = CategoryAthleteScore.objects.filter(category__in=categories, status='pending').count()

        return Response({
            'fields_active': fields_active,
            'referees_assigned': len(referee_ids),
            'scores_submitted': scores_submitted,
            'pending_approval': pending_approval,
        })
    


class CategoryViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = CategorySerializer

    def get_queryset(self):
        team_member_queryset = TeamMember.objects.select_related('athlete__club')
        team_queryset = Team.objects.prefetch_related(
            Prefetch('members', queryset=team_member_queryset),
            'categories',
        )
        enrolled_team_queryset = CategoryTeam.objects.select_related('team').prefetch_related(
            Prefetch('team__members', queryset=team_member_queryset),
        )

        return Category.objects.select_related(
            'event',
            'group',
            'solocategory',
            'fightcategory',
            'teamcategory',
            'solocategory__first_place',
            'solocategory__second_place',
            'solocategory__third_place',
            'fightcategory__first_place',
            'fightcategory__second_place',
            'fightcategory__third_place',
            'teamcategory__first_place_team',
            'teamcategory__second_place_team',
            'teamcategory__third_place_team',
        ).prefetch_related(
            Prefetch(
                'enrolled_athletes',
                queryset=CategoryAthlete.objects.select_related('athlete__club', 'athlete__current_grade'),
            ),
            Prefetch('enrolled_teams', queryset=enrolled_team_queryset),
            Prefetch('teams', queryset=team_queryset),
        )

    def _create_category(self, data):
        """Create the right Category subclass based on category_type."""
        cat_type = data.pop('category_type', 'solo')
        model_map = {
            'solo': SoloCategory,
            'team': TeamCategory,
            'fight': FightCategory,
        }
        model_cls = model_map.get(cat_type, SoloCategory)
        return model_cls.objects.create(**data)

    def list(self, request):
        queryset = self.get_queryset()
        event_id = request.query_params.get('event')
        if event_id:
            try:
                event_id_int = int(str(event_id).split(':')[0])
            except (TypeError, ValueError):
                return Response({'detail': 'Invalid event id.'}, status=400)
            queryset = queryset.filter(event_id=event_id_int)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        d = request.data.copy()
        name = d.get('name', '').strip()
        if not name:
            return Response({'name': ['This field is required.']}, status=400)
        from landing.models import Event
        event = Event.objects.filter(pk=d.get('event')).first() if d.get('event') else None
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked
        create_data = {
            'name': name,
            'event_id': d.get('event'),
            'gender': d.get('gender', 'mixt'),
            'category_type': d.get('category_type', 'solo'),
        }
        group_id = d.get('group') or d.get('group_id')
        if group_id:
            create_data['group_id'] = group_id
        cat = self._create_category(create_data)
        serializer = self.serializer_class(cat)
        return Response(serializer.data, status=201)

    def retrieve(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        locked = _event_operational_lock_response(getattr(instance, 'event', None))
        if locked is not None:
            return locked
        # Only allow updating safe fields (name, gender, display_order)
        allowed = {'name', 'gender', 'display_order'}
        data = {k: v for k, v in request.data.items() if k in allowed}
        for field, value in data.items():
            setattr(instance, field, value)
        instance.save(update_fields=list(data.keys()))
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        try:
            cat = self.get_queryset().get(pk=pk)
        except Category.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        locked = _event_operational_lock_response(getattr(cat, 'event', None))
        if locked is not None:
            return locked
        cat.delete()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='bulk-add')
    def bulk_add(self, request):
        """Bulk add categories to an event.
        Accepts { event_id: int, categories: [{ name, category_type, gender, group_id? }] }
        Skips duplicates (same name + event + group).
        """
        event_id = request.data.get('event_id')
        items = request.data.get('categories', [])
        if not event_id or not items:
            return Response({'detail': 'event_id and categories are required.'}, status=400)
        from landing.models import Event
        try:
            event = Event.objects.get(pk=event_id)
        except Event.DoesNotExist:
            return Response({'detail': 'Event not found.'}, status=404)
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked

        # Build set of (name, group_id) pairs that already exist
        existing_pairs = set(
            Category.objects.filter(event_id=event_id)
            .values_list('name', 'group_id')
        )
        created = []
        for item in items:
            name = item.get('name', '').strip()
            if not name:
                continue
            group_id = item.get('group') or item.get('group_id') or None
            if group_id:
                group_id = int(group_id)
            if (name, group_id) in existing_pairs:
                continue
            create_data = {
                'name': name,
                'event_id': event_id,
                'gender': item.get('gender', 'mixt'),
                'category_type': item.get('category_type', 'solo'),
            }
            if group_id:
                create_data['group_id'] = group_id
            cat = self._create_category(create_data)
            created.append(cat)
            existing_pairs.add((name, group_id))

        serializer = self.serializer_class(created, many=True)
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder categories within a group.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each category based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        categories = list(Category.objects.select_related('event').filter(pk__in=order))
        if len(order) != len(set(order)) or len(categories) != len(order):
            return Response({'detail': 'All category ids must exist and be unique.'}, status=400)
        event_ids = {category.event_id for category in categories}
        if len(event_ids) != 1:
            return Response({'detail': 'All categories must belong to the same event.'}, status=400)
        locked = _event_operational_lock_response(categories[0].event)
        if locked is not None:
            return locked
        positions = {int(category_id): index for index, category_id in enumerate(order)}
        for category in categories:
            category.display_order = positions[category.id]
        with transaction.atomic():
            Category.objects.bulk_update(categories, ['display_order'])
        return Response({'status': 'ok'})


class DiplomaTemplateViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    serializer_class = DiplomaTemplateSerializer

    TEMPLATE_KIND_ORDER = ['first_place', 'second_place', 'third_place', 'participation']
    CATEGORY_SCOPE_ORDER = ['solo', 'team', 'fight', 'all']

    def get_queryset(self):
        return DiplomaTemplate.objects.select_related('event').all()

    def _normalize_payload(self, request):
        data = {}
        if hasattr(request.data, 'keys'):
            for key in request.data.keys():
                if hasattr(request.data, 'getlist'):
                    values = request.data.getlist(key)
                    data[key] = values if len(values) > 1 else values[0]
                else:
                    data[key] = request.data.get(key)
        else:
            data = dict(request.data)

        placements = data.get('placements')
        if isinstance(placements, list) and len(placements) == 1:
            placements = placements[0]
        if isinstance(placements, str):
            import json

            placements = placements.strip()
            data['placements'] = json.loads(placements) if placements else []
        elif placements in [None, '']:
            data['placements'] = []

        if 'is_active' in data:
            data['is_active'] = _coerce_bool(data.get('is_active'), default=True)
        return data

    def list(self, request):
        queryset = self.get_queryset()
        event_id = request.query_params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        serializer = self.serializer_class(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    def create(self, request):
        payload = self._normalize_payload(request)
        serializer = self.serializer_class(data=payload, context={'request': request})
        if serializer.is_valid():
            instance = serializer.save()
            return Response(self.serializer_class(instance, context={'request': request}).data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance, context={'request': request})
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        payload = self._normalize_payload(request)
        serializer = self.serializer_class(instance, data=payload, partial=True, context={'request': request})
        if serializer.is_valid():
            updated = serializer.save()
            return Response(self.serializer_class(updated, context={'request': request}).data)
        return Response(serializer.errors, status=400)

    def _get_duplicate_slot(self, instance):
        used_slots = set(
            self.get_queryset()
            .filter(event=instance.event)
            .exclude(pk=instance.pk)
            .values_list('template_kind', 'category_scope')
        )

        preferred_slots = [
            (instance.template_kind, scope)
            for scope in self.CATEGORY_SCOPE_ORDER
            if scope != instance.category_scope
        ] + [
            (kind, instance.category_scope)
            for kind in self.TEMPLATE_KIND_ORDER
            if kind != instance.template_kind
        ] + [
            (kind, scope)
            for kind in self.TEMPLATE_KIND_ORDER
            for scope in self.CATEGORY_SCOPE_ORDER
            if (kind, scope) != (instance.template_kind, instance.category_scope)
        ]

        for slot in preferred_slots:
            if slot not in used_slots:
                return slot
        return None

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        duplicate_slot = self._get_duplicate_slot(instance)
        if not duplicate_slot:
            return Response(
                {'detail': 'Nu mai există combinații disponibile pentru duplicarea diplomei în acest eveniment.'},
                status=400,
            )

        template_kind, category_scope = duplicate_slot
        file_bytes = instance.pdf_file.read() if instance.pdf_file else b''
        if instance.pdf_file:
            instance.pdf_file.close()

        original_name = Path(instance.pdf_file.name or 'template.pdf').name
        stem = Path(original_name).stem
        suffix = Path(original_name).suffix or '.pdf'

        duplicate = DiplomaTemplate(
            event=instance.event,
            title=f'{instance.title} (copie)',
            template_kind=template_kind,
            category_scope=category_scope,
            preview_orientation=instance.preview_orientation,
            placements=instance.placements,
            is_active=instance.is_active,
        )
        duplicate.pdf_file.save(f'{stem}-copy{suffix}', ContentFile(file_bytes), save=False)
        duplicate.save()

        serializer = self.serializer_class(duplicate, context={'request': request})
        return Response(serializer.data, status=201)

    def destroy(self, request, pk=None):
        try:
            instance = self.get_queryset().get(pk=pk)
        except DiplomaTemplate.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        instance.delete()
        return Response(status=204)


class GroupViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    queryset = Group.objects.all()
    serializer_class = GroupSerializer

    def list(self, request):
        queryset = self.queryset
        event_id = request.query_params.get('event')
        if event_id:
            queryset = queryset.filter(event_id=event_id)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def create(self, request):
        from landing.models import Event
        event = Event.objects.filter(pk=request.data.get('event')).first() if request.data.get('event') else None
        locked = _event_operational_lock_response(event)
        if locked is not None:
            return locked
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)

    def retrieve(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)

    def update(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(getattr(instance, 'event', None))
        if locked is not None:
            return locked
        serializer = self.serializer_class(instance, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def destroy(self, request, pk=None):
        instance = self.queryset.get(pk=pk)
        locked = _event_operational_lock_response(getattr(instance, 'event', None))
        if locked is not None:
            return locked
        cascade_categories = str(request.query_params.get('cascade_categories', '')).lower() in ('1', 'true', 'yes')
        with transaction.atomic():
            if cascade_categories:
                Category.objects.filter(group=instance).delete()
            instance.delete()
        return Response(status=204)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """Bulk reorder groups within an event.
        Accepts { order: [id1, id2, id3, ...] }
        Updates display_order for each group based on position in the list.
        """
        order = request.data.get('order', [])
        if not order:
            return Response({'detail': 'order list is required.'}, status=400)
        groups = list(Group.objects.select_related('event').filter(pk__in=order))
        if len(order) != len(set(order)) or len(groups) != len(order):
            return Response({'detail': 'All group ids must exist and be unique.'}, status=400)
        event_ids = {group.event_id for group in groups}
        if len(event_ids) != 1:
            return Response({'detail': 'All groups must belong to the same event.'}, status=400)
        locked = _event_operational_lock_response(groups[0].event)
        if locked is not None:
            return locked
        positions = {int(group_id): index for index, group_id in enumerate(order)}
        for group in groups:
            group.display_order = positions[group.id]
        with transaction.atomic():
            Group.objects.bulk_update(groups, ['display_order'])
        return Response({'status': 'ok'})
