from django.shortcuts import render
from datetime import datetime, timedelta
import unicodedata
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


@api_view(["GET"])
@permission_classes([AllowAny])
def system_info(request):
    """Tells frontends whether this backend is the local venue/LAN server.

    Used by competition-admin to conditionally show the local backup/restore
    panel — it must stay hidden when talking to the cloud deployment.
    """
    return Response({
        'is_local_event_server': getattr(settings, 'IS_LOCAL_EVENT_SERVER', False),
        'lan_host': getattr(settings, 'LAN_HOST', None),
        'backup_interval_minutes': getattr(settings, 'LOCAL_BACKUP_INTERVAL_MINUTES', None),
    })


@api_view(["GET"])
def health(request):
    """Simple health endpoint used by CI readiness checks."""
    # Check database connectivity
    db_status = "ok"
    db_error = None
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as e:
        db_status = "failed"
        db_error = str(e)

    payload = {"status": "ok", "database": db_status}
    if db_error:
        if getattr(settings, 'DEBUG', False):
            payload["database_error"] = db_error[:200]
        else:
            payload["database_error"] = "unavailable"
    return Response(payload)


@api_view(["GET"])
def get_csrf_token(request):
    """
    Returns a CSRF token for the frontend to use.
    This endpoint ensures the csrftoken cookie is set.
    """
    from django.middleware.csrf import get_token
    return Response({'csrfToken': get_token(request)})


def _strip_diacritics(value):
    """Lowercase + remove diacritics so 'Iasi' matches 'Iași' (SQLite's
    icontains is case-insensitive but not accent-insensitive)."""
    normalized = unicodedata.normalize('NFKD', value)
    return normalized.encode('ascii', 'ignore').decode('ascii').lower()


def _parse_city_name(name):
    """Split the GeoNames-imported 'Settlement, X County' name into its
    settlement and county parts (county is '' for names with no comma)."""
    if ',' in name:
        settlement, _, county = name.partition(',')
        return settlement.strip(), county.strip()
    return name.strip(), ''


def _is_county_seat(settlement, county):
    """True when the settlement's name IS its county's name (e.g. 'Iași'
    in 'Iași County') - our proxy for "this is the well-known city", not
    one of the thousands of villages that share the county."""
    if not county:
        return False
    county_base = county[:-len('County')].strip() if county.lower().endswith('county') else county
    return _strip_diacritics(settlement) == _strip_diacritics(county_base)


def _display_city_name(name):
    """Drop the redundant ', X County' suffix when the settlement is that
    county's seat (e.g. 'Iași, Iași County' -> 'Iași'), so the one city
    almost everyone means when they type its name doesn't read like a
    disambiguated duplicate next to its own villages."""
    settlement, county = _parse_city_name(name)
    return settlement if _is_county_seat(settlement, county) else name


class CityViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    queryset = City.objects.all()
    serializer_class = CitySerializer

    def list(self, request):
        queryset = City.objects.all()
        search = request.query_params.get('search')
        if search:
            # Only cap/filter when a search combobox asks for it - other
            # apps' plain <select> city pickers still rely on the full,
            # unfiltered list() response and must keep working unchanged.
            # Diacritic-insensitive: SQLite's icontains only strips case,
            # so "Iasi" (no diacritics) wouldn't match "Iași" without this.
            term = _strip_diacritics(search)
            scored = []
            for city in City.objects.only('id', 'name').iterator():
                settlement, county = _parse_city_name(city.name)
                norm_settlement = _strip_diacritics(settlement)
                if norm_settlement == term:
                    rank = 0
                elif norm_settlement.startswith(term):
                    rank = 1
                elif term in norm_settlement:
                    rank = 2
                elif term in _strip_diacritics(city.name):
                    rank = 3  # only matched in the ", X County" part
                else:
                    continue
                # Within the same match quality, the county seat (the
                # actual well-known city) outranks its own villages, and
                # shorter/plainer names outrank longer compound ones.
                county_seat_rank = 0 if _is_county_seat(settlement, county) else 1
                scored.append((rank, county_seat_rank, len(settlement), settlement, city))
            scored.sort(key=lambda item: item[:4])
            data = [{'id': city.id, 'name': _display_city_name(city.name)} for *_, city in scored[:20]]
            return Response(data)
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        """Return a single athlete by PK."""
        try:
            instance = self.queryset.get(pk=pk)
        except Athlete.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = self.serializer_class(instance)
        return Response(serializer.data)
    


@api_view(['GET'])
def api_root(request, format=None):
    """
    API Root - Lists all available endpoints
    """
    return Response({
        # Main API endpoints
        'city': reverse('city-list', request=request, format=format),
        'club': reverse('club-list', request=request, format=format),
        'competition': reverse('competition-list', request=request, format=format),
        'athlete': reverse('athlete-list', request=request, format=format),
        'title': reverse('title-list', request=request, format=format),
        'federation-role': reverse('federation-role-list', request=request, format=format),
        'grade': reverse('grade-list', request=request, format=format),
        'team': reverse('team-list', request=request, format=format),
        'match': reverse('match-list', request=request, format=format),
        'category': reverse('category-list', request=request, format=format),
        'grade-history': reverse('grade-history-list', request=request, format=format),
        'medical-visa': reverse('medical-visa-list', request=request, format=format),
        'training-seminar': reverse('training-seminar-list', request=request, format=format),
        'group': reverse('group-list', request=request, format=format),
        
        # Additional APIs
        '_other_apis': {
            'description': 'Other available API endpoints',
            'landing_api': {
                'url': request.build_absolute_uri('/landing/'),
                'description': 'Landing page content management API (news, events, about, contact)'
            },
            'admin': {
                'url': request.build_absolute_uri('/admin/'),
                'description': 'Django admin interface'
            }
        }
    })


# Authentication Views
from rest_framework import status
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated, AllowAny


@api_view(['GET'])
def sports_list(request):
    """Get list of available sports/disciplines for Vovinam Viet Vo Dao."""
    sports = [
        {'id': 1, 'name': 'Quyen (Forms)', 'code': 'quyen'},
        {'id': 2, 'name': 'Song Luyện (Combat Choreography)', 'code': 'song_luyen'},
        {'id': 3, 'name': 'Đối Kháng (Fighting)', 'code': 'doi_khang'},
        {'id': 4, 'name': 'Tự Vệ (Self Defense)', 'code': 'tu_ve'},
        {'id': 5, 'name': 'Biểu Diễn (Performance)', 'code': 'bieu_dien'},
    ]
    return Response(sports)


@api_view(['GET'])
def categories_list(request):
    """Get list of available categories."""
    try:
        categories = Category.objects.all()
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data)
    except Exception as e:
        # Return empty list if no categories exist
        return Response([])


@api_view(['GET'])
def clubs_list(request):
    """Get list of available clubs."""
    try:
        clubs = Club.objects.all()
        serializer = ClubSerializer(clubs, many=True)
        return Response(serializer.data)
    except Exception as e:
        # Return empty list if no clubs exist
        return Response([])
