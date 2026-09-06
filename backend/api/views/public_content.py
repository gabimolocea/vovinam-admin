"""
Public, unauthenticated content endpoints for the new public site
(apps/public-site), which replaces the WordPress vovinam.ro site.

These endpoints intentionally live in a separate namespace (`/api/public/`)
from the existing `/api/landing/` app (which is used by the admin-facing
content management tooling) so that:
  - they can be curated to only expose fields that are safe for a public,
    unauthenticated audience (e.g. author *name* only, never user id/email),
  - published/draft filtering is centralized and can never be bypassed by
    query params,
  - they never require authentication, matching the intent of the new
    public-site frontend.

All views here are explicit `viewsets.ViewSet` subclasses (per this repo's
convention - see other modules under `api/views/`), not `ModelViewSet`, and
all use `permission_classes = [AllowAny]`.

NOTE on rate limiting: this project does not currently define any DRF
throttling classes/settings (see `REST_FRAMEWORK` in `crud/settings.py`).
The public contact form (`POST /api/public/contact/`) is therefore NOT
throttled at this stage - adding a throttling dependency/pattern is left for
a later hardening pass, not part of this etapa.
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from api.models import Athlete, Club
from landing.models import (
    AboutSection, ContactMessage, DocumentPage, Event, NewsPost, NewsPostGallery, Video,
)


# ---------------------------------------------------------------------------
# Serializers (dedicated to the public surface - deliberately expose only
# fields that are safe for an anonymous, public audience)
# ---------------------------------------------------------------------------

class PublicNewsPostGallerySerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsPostGallery
        fields = ['id', 'image', 'alt_text', 'caption', 'order']


class PublicNewsPostListSerializer(serializers.ModelSerializer):
    """Lightweight serializer used for the news list endpoint."""
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = NewsPost
        fields = [
            'title', 'slug', 'excerpt', 'featured_image', 'featured_image_alt',
            'tags', 'featured', 'author_name', 'created_at',
        ]

    def get_author_name(self, obj):
        if not obj.author_id:
            return ''
        return obj.author.get_full_name() or obj.author.username


class PublicNewsPostDetailSerializer(PublicNewsPostListSerializer):
    """Full serializer used for the news detail endpoint - adds content + gallery."""
    gallery_images = PublicNewsPostGallerySerializer(many=True, read_only=True)

    class Meta(PublicNewsPostListSerializer.Meta):
        fields = PublicNewsPostListSerializer.Meta.fields + ['content', 'gallery_images']


class PublicVideoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Video
        fields = ['title', 'slug', 'url', 'thumbnail', 'description', 'featured', 'created_at']


class PublicAboutSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutSection
        fields = ['section_title', 'content', 'image', 'image_alt', 'order']


class PublicContactMessageSerializer(serializers.ModelSerializer):
    """Validates and creates a ContactMessage from the public contact form."""

    class Meta:
        model = ContactMessage
        fields = ['name', 'email', 'phone', 'subject', 'message']

    def validate_message(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Message cannot be empty.')
        return value


class PublicEventSerializer(serializers.ModelSerializer):
    """Only exposes fields that are safe for the public calendar - never the
    operational/LAN sync fields (`sync_mode`, `sync_locked`, etc.)."""
    city = serializers.CharField(source='city.name', read_only=True, default='')

    class Meta:
        model = Event
        fields = [
            'title', 'slug', 'event_type', 'start_date', 'end_date', 'address', 'city',
            'featured_image', 'status',
        ]


class PublicEventDetailSerializer(PublicEventSerializer):
    """Adds the full description for the event detail page."""

    class Meta(PublicEventSerializer.Meta):
        fields = PublicEventSerializer.Meta.fields + ['description']


class PublicClubSerializer(serializers.ModelSerializer):
    """Public federation directory entry - business/contact info only, no
    athlete/coach personal data (see PublicStaffSerializer for staff)."""
    city = serializers.CharField(source='city.name', read_only=True, default='')

    class Meta:
        model = Club
        fields = ['name', 'logo', 'city', 'address', 'mobile_number', 'website']


class PublicStaffSerializer(serializers.ModelSerializer):
    """Federation staff/leadership directory ('Staff' nav item) - built from
    Athlete records that have a federation_role assigned. Deliberately
    exposes only public-safe fields: name, role/title, club, photo. Never
    CNP, phone, medical certificate, address, etc."""
    full_name = serializers.SerializerMethodField()
    federation_role = serializers.CharField(source='federation_role.name', read_only=True, default='')
    title = serializers.CharField(source='title.name', read_only=True, default='')
    club = serializers.CharField(source='club.name', read_only=True, default='')

    class Meta:
        model = Athlete
        fields = ['full_name', 'federation_role', 'title', 'club', 'profile_image']

    def get_full_name(self, obj):
        return f'{obj.first_name} {obj.last_name}'.strip()


class PublicRefereeSerializer(serializers.ModelSerializer):
    """Referee directory ('Arbitri' nav item) - Athlete records flagged
    is_referee=True. Same public-safe field restriction as staff."""
    full_name = serializers.SerializerMethodField()
    title = serializers.CharField(source='title.name', read_only=True, default='')
    club = serializers.CharField(source='club.name', read_only=True, default='')

    class Meta:
        model = Athlete
        fields = ['full_name', 'title', 'club', 'profile_image']

    def get_full_name(self, obj):
        return f'{obj.first_name} {obj.last_name}'.strip()


class PublicDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentPage
        fields = ['title', 'slug', 'category', 'description', 'file', 'external_url', 'order', 'created_at']


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class PublicContentPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = 'page_size'
    max_page_size = 50


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------

class PublicNewsViewSet(viewsets.ViewSet):
    """
    GET /api/public/news/           - paginated list of published news posts
    GET /api/public/news/<slug>/    - detail of a single published news post
    """
    permission_classes = [AllowAny]
    pagination_class = PublicContentPagination

    def get_queryset(self):
        return NewsPost.objects.filter(published=True).select_related('author').prefetch_related('gallery_images')

    def list(self, request):
        queryset = self.get_queryset()

        featured = request.query_params.get('featured')
        if featured is not None and str(featured).lower() in ('1', 'true', 'yes'):
            queryset = queryset.filter(featured=True)

        tags = request.query_params.get('tags')
        if tags:
            queryset = queryset.filter(tags__icontains=tags)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PublicNewsPostListSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def retrieve(self, request, pk=None):
        # `pk` here is actually the news post slug (see api/urls.py routing).
        # 404 is returned identically whether the slug doesn't exist or the
        # post simply isn't published, so drafts can never be discovered by
        # guessing slugs.
        instance = get_object_or_404(self.get_queryset(), slug=pk)
        serializer = PublicNewsPostDetailSerializer(instance, context={'request': request})
        return Response(serializer.data)


class PublicVideoViewSet(viewsets.ViewSet):
    """GET /api/public/videos/ - paginated list of published videos."""
    permission_classes = [AllowAny]
    pagination_class = PublicContentPagination

    def get_queryset(self):
        return Video.objects.filter(published=True)

    def list(self, request):
        queryset = self.get_queryset()

        featured = request.query_params.get('featured')
        if featured is not None and str(featured).lower() in ('1', 'true', 'yes'):
            queryset = queryset.filter(featured=True)

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PublicVideoSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)


class PublicAboutViewSet(viewsets.ViewSet):
    """GET /api/public/about/ - all active About sections, in display order."""
    permission_classes = [AllowAny]

    def list(self, request):
        queryset = AboutSection.objects.filter(is_active=True).order_by('order', 'id')
        serializer = PublicAboutSectionSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class PublicContactViewSet(viewsets.ViewSet):
    """POST /api/public/contact/ - create a new contact message."""
    permission_classes = [AllowAny]

    def create(self, request):
        serializer = PublicContactMessageSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({'detail': 'Mesajul a fost trimis cu succes.'}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PublicEventViewSet(viewsets.ViewSet):
    """
    GET /api/public/events/          - all published events (past + upcoming), newest first
    GET /api/public/events/<slug>/   - detail of a single event (full description)
    GET /api/public/events/upcoming/ - upcoming competitions/events only
    """
    permission_classes = [AllowAny]
    pagination_class = PublicContentPagination

    def get_queryset(self):
        return Event.objects.select_related('city').order_by('-start_date')

    def list(self, request):
        queryset = self.get_queryset()
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request, view=self)
        serializer = PublicEventSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def retrieve(self, request, pk=None):
        # `pk` here is actually the event slug (see api/urls.py routing).
        instance = get_object_or_404(self.get_queryset(), slug=pk)
        serializer = PublicEventDetailSerializer(instance, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        queryset = Event.objects.filter(
            status='upcoming', start_date__gt=timezone.now()
        ).select_related('city').order_by('start_date')
        serializer = PublicEventSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class PublicClubViewSet(viewsets.ViewSet):
    """GET /api/public/clubs/ - federation club directory ('Cluburi' nav item)."""
    permission_classes = [AllowAny]

    def list(self, request):
        queryset = Club.objects.select_related('city').order_by('display_order', 'name')
        serializer = PublicClubSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class PublicStaffViewSet(viewsets.ViewSet):
    """GET /api/public/staff/ - federation staff/leadership directory
    ('Staff' nav item). Only approved athletes with a federation_role."""
    permission_classes = [AllowAny]

    def list(self, request):
        queryset = (
            Athlete.objects.filter(status='approved')
            .exclude(federation_role=None)
            .select_related('federation_role', 'title', 'club')
            .order_by('last_name', 'first_name')
        )
        serializer = PublicStaffSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class PublicRefereeViewSet(viewsets.ViewSet):
    """GET /api/public/referees/ - federation referee directory
    ('Arbitri' nav item). Only approved athletes flagged is_referee=True."""
    permission_classes = [AllowAny]

    def list(self, request):
        queryset = (
            Athlete.objects.filter(status='approved', is_referee=True)
            .select_related('title', 'club')
            .order_by('last_name', 'first_name')
        )
        serializer = PublicRefereeSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class PublicDocumentViewSet(viewsets.ViewSet):
    """GET /api/public/documents/?category=regulament|documente - published
    documents, backing both the 'Regulament' and 'Documente' nav items."""
    permission_classes = [AllowAny]

    def list(self, request):
        queryset = DocumentPage.objects.filter(published=True).order_by('order', '-created_at')
        category = request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        serializer = PublicDocumentSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)
