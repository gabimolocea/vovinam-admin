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
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from ..permissions import can_edit_object, IsClubCoachOrAdmin
from rest_framework.response import Response

from api.models import Athlete, Club, medal_counts_for_club, trophy_counts_for_club
from landing.models import (
    AboutSection, DocumentPage, Event, GalleryComment, GalleryReaction, NewsComment, NewsPost, NewsPostGallery,
    NewsReaction, Video,
)


# ---------------------------------------------------------------------------
# Serializers (dedicated to the public surface - deliberately expose only
# fields that are safe for an anonymous, public audience)
# ---------------------------------------------------------------------------

def _club_summary(club, request):
    """Shared {name, logo} shape for a club reference on public person cards,
    so the frontend can render the crest without a second lookup."""
    if not club:
        return None
    return {
        'name': club.name,
        'logo': request.build_absolute_uri(club.logo.url) if request and club.logo else None,
    }


class PublicNewsPostGallerySerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsPostGallery
        fields = ['id', 'image', 'alt_text', 'caption', 'order']


class PublicNewsPostListSerializer(serializers.ModelSerializer):
    """Lightweight serializer used for the news list endpoint."""
    author_name = serializers.SerializerMethodField()
    like_count = serializers.IntegerField(read_only=True)
    dislike_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = NewsPost
        fields = [
            'title', 'slug', 'excerpt', 'featured_image', 'featured_image_alt',
            'tags', 'featured', 'author_name', 'created_at',
            'like_count', 'dislike_count', 'comment_count',
        ]

    def get_author_name(self, obj):
        if not obj.author_id:
            return ''
        return obj.author.get_full_name() or obj.author.username

    def get_comment_count(self, obj):
        return obj.comments.filter(is_approved=True).count()


class PublicNewsPostDetailSerializer(PublicNewsPostListSerializer):
    """Full serializer used for the news detail endpoint - adds content,
    gallery, and (like the gallery photo serializer) the current user's own
    reaction, so the article page can render the like/dislike buttons in
    the right state without a second request."""
    gallery_images = PublicNewsPostGallerySerializer(many=True, read_only=True)
    my_reaction = serializers.SerializerMethodField()

    class Meta(PublicNewsPostListSerializer.Meta):
        fields = PublicNewsPostListSerializer.Meta.fields + ['content', 'gallery_images', 'my_reaction']

    def get_my_reaction(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return None
        reaction = next((r for r in obj.reactions.all() if r.user_id == user.id), None)
        return reaction.reaction_type if reaction else None


class PublicNewsCommentSerializer(serializers.ModelSerializer):
    """Comment on a news article - Facebook-style thread, one level of
    replies (mirrors PublicGalleryCommentSerializer)."""
    author_name = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = NewsComment
        fields = ['id', 'author_name', 'content', 'parent', 'created_at', 'replies']

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username

    def get_replies(self, obj):
        if obj.is_reply:
            return []
        return PublicNewsCommentSerializer(obj.get_replies(), many=True, context=self.context).data


class PublicVideoSerializer(serializers.ModelSerializer):
    tagged_athletes = serializers.SerializerMethodField()
    tagged_clubs = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            'title', 'slug', 'url', 'thumbnail', 'description', 'featured', 'created_at',
            'tagged_athletes', 'tagged_clubs',
        ]

    def get_tagged_athletes(self, obj):
        return [
            {'id': a.id, 'name': f'{a.first_name} {a.last_name}'.strip()}
            for a in obj.tagged_athletes.all()
        ]

    def get_tagged_clubs(self, obj):
        return [{'id': c.id, 'name': c.name, 'slug': c.slug} for c in obj.tagged_clubs.all()]


class PublicAboutSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutSection
        fields = ['section_title', 'content', 'image', 'image_alt', 'order']


class PublicEventSerializer(serializers.ModelSerializer):
    """Only exposes fields that are safe for the public calendar - never the
    operational/LAN sync fields (`sync_mode`, `sync_locked`, etc.)."""
    city = serializers.CharField(source='city.name', read_only=True, default='')

    class Meta:
        model = Event
        fields = [
            'title', 'slug', 'event_type', 'event_types', 'start_date', 'end_date', 'address', 'city',
            'featured_image', 'status',
        ]


class PublicEventDetailSerializer(PublicEventSerializer):
    """Adds the full description for the event detail page."""

    class Meta(PublicEventSerializer.Meta):
        fields = PublicEventSerializer.Meta.fields + ['description']


class PublicClubSerializer(serializers.ModelSerializer):
    """Public federation directory entry - business/contact info only, plus
    the coach's public name (no other athlete/coach personal data - see
    PublicStaffSerializer for staff)."""
    city = serializers.CharField(source='city.name', read_only=True, default='')
    coaches = serializers.SerializerMethodField()

    class Meta:
        model = Club
        fields = ['id', 'slug', 'name', 'logo', 'city', 'address', 'mobile_number', 'website', 'coaches']

    def get_coaches(self, obj):
        return [f'{coach.first_name} {coach.last_name}'.strip() for coach in obj.coaches.all()]


class PublicClubDetailSerializer(PublicClubSerializer):
    """Adds the description/social links and aggregated medal counts used by
    the club detail page. Athletes are fetched separately from
    `/api/athletes/?club=<id>` (paginated), not embedded here."""
    medals = serializers.SerializerMethodField()
    trophies = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    coach_profiles = serializers.SerializerMethodField()

    class Meta(PublicClubSerializer.Meta):
        fields = PublicClubSerializer.Meta.fields + [
            'description', 'facebook_url', 'instagram_url', 'tiktok_url', 'medals', 'trophies', 'can_edit', 'coach_profiles',
        ]

    def get_medals(self, obj):
        try:
            return medal_counts_for_club(obj)
        except Exception:
            return {'gold': 0, 'silver': 0, 'bronze': 0}

    def get_trophies(self, obj):
        try:
            return trophy_counts_for_club(obj)
        except Exception:
            return {'gold': 0, 'silver': 0, 'bronze': 0}

    def get_can_edit(self, obj):
        return can_edit_object(self.context.get('request'), obj, IsClubCoachOrAdmin)

    def get_coach_profiles(self, obj):
        """Richer coach cards for the club detail page (id + photo + grade),
        linking each coach through to their athlete profile."""
        request = self.context.get('request')
        coaches = obj.coaches.select_related('current_grade', 'title')
        return [
            {
                'id': coach.id,
                'full_name': f'{coach.first_name} {coach.last_name}'.strip(),
                'profile_image': (
                    request.build_absolute_uri(coach.profile_image.url)
                    if request and coach.profile_image else None
                ),
                'grade': coach.current_grade.name if coach.current_grade else '',
                'title': coach.title.name if coach.title else '',
            }
            for coach in coaches
        ]


class PublicStaffSerializer(serializers.ModelSerializer):
    """Federation staff/leadership directory ('Staff' nav item) - built from
    Athlete records that have a federation_role assigned. Deliberately
    exposes only public-safe fields: name, role/title, club, photo. Never
    CNP, phone, medical certificate, address, etc."""
    full_name = serializers.SerializerMethodField()
    federation_role = serializers.CharField(source='federation_role.name', read_only=True, default='')
    title = serializers.CharField(source='title.name', read_only=True, default='')
    grade = serializers.CharField(source='current_grade.name', read_only=True, default='')
    club = serializers.SerializerMethodField()

    class Meta:
        model = Athlete
        fields = ['id', 'full_name', 'federation_role', 'title', 'grade', 'club', 'profile_image']

    def get_full_name(self, obj):
        return f'{obj.first_name} {obj.last_name}'.strip()

    def get_club(self, obj):
        return _club_summary(obj.club, self.context.get('request'))


class PublicRefereeSerializer(serializers.ModelSerializer):
    """Referee directory ('Arbitri' nav item) - Athlete records flagged
    is_referee=True. Same public-safe field restriction as staff."""
    full_name = serializers.SerializerMethodField()
    title = serializers.CharField(source='title.name', read_only=True, default='')
    grade = serializers.CharField(source='current_grade.name', read_only=True, default='')
    club = serializers.SerializerMethodField()
    referee_category = serializers.CharField(source='get_referee_category_display', read_only=True, default='')

    class Meta:
        model = Athlete
        fields = ['id', 'full_name', 'title', 'grade', 'club', 'profile_image', 'referee_category']

    def get_full_name(self, obj):
        return f'{obj.first_name} {obj.last_name}'.strip()

    def get_club(self, obj):
        return _club_summary(obj.club, self.context.get('request'))

class PublicDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentPage
        fields = ['title', 'slug', 'category', 'description', 'file', 'external_url', 'order', 'created_at']


class PublicGalleryCommentSerializer(serializers.ModelSerializer):
    """Comment on a tagged gallery photo - Facebook-style thread, one level
    of replies (mirrors NewsComment/PublicNewsCommentSerializer conventions)."""
    author_name = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = GalleryComment
        fields = ['id', 'author_name', 'content', 'parent', 'created_at', 'replies']

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username

    def get_replies(self, obj):
        if obj.is_reply:
            return []
        return PublicGalleryCommentSerializer(obj.get_replies(), many=True, context=self.context).data


class PublicGalleryTagSerializer(serializers.Serializer):
    """Minimal tag reference - links a photo tag through to the athlete's
    or club's public profile."""
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField(required=False)


class PublicGalleryPhotoSerializer(serializers.ModelSerializer):
    """Tagged gallery photo, Facebook-style: shows who's tagged plus
    aggregate like/dislike counts, the current user's own reaction, and a
    comment count. Full comment thread is fetched separately (paginated) via
    the `comments` action so the feed/tab list stays light."""
    tagged_athletes = serializers.SerializerMethodField()
    tagged_clubs = serializers.SerializerMethodField()
    like_count = serializers.IntegerField(read_only=True)
    dislike_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.SerializerMethodField()
    my_reaction = serializers.SerializerMethodField()
    news_post_title = serializers.CharField(source='news_post.title', read_only=True)
    news_post_slug = serializers.CharField(source='news_post.slug', read_only=True)

    class Meta:
        model = NewsPostGallery
        fields = [
            'id', 'image', 'alt_text', 'caption', 'created_at',
            'news_post_title', 'news_post_slug',
            'tagged_athletes', 'tagged_clubs',
            'like_count', 'dislike_count', 'comment_count', 'my_reaction',
        ]

    def get_tagged_athletes(self, obj):
        return [
            {'id': a.id, 'name': f'{a.first_name} {a.last_name}'.strip()}
            for a in obj.tagged_athletes.all()
        ]

    def get_tagged_clubs(self, obj):
        return [{'id': c.id, 'name': c.name, 'slug': c.slug} for c in obj.tagged_clubs.all()]

    def get_comment_count(self, obj):
        return obj.comments.filter(is_approved=True).count()

    def get_my_reaction(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return None
        reaction = next((r for r in obj.reactions.all() if r.user_id == user.id), None)
        return reaction.reaction_type if reaction else None


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
    GET  /api/public/news/           - paginated list of published news posts
    GET  /api/public/news/<slug>/    - detail of a single published news post
    POST /api/public/news/<slug>/react/    {type: like|dislike}
         - toggle the current user's reaction (IsAuthenticated). Posting the
           same type again removes it (un-react); a different type switches
           it. Mirrors PublicGalleryViewSet.react.
    GET  /api/public/news/<slug>/comments/ - approved comments, threaded (AllowAny).
    POST /api/public/news/<slug>/comments/ {content, parent?}
         - add a comment (IsAuthenticated).
    """
    pagination_class = PublicContentPagination

    def get_permissions(self):
        # `add_comment` is a plain helper, not a routed action - a POST to
        # the `comments` action needs its own check since that action also
        # serves GET (public reads), which `self.action == 'comments'`
        # alone can't distinguish. (This same fix applies to both the news
        # and gallery viewsets, which shared the original, buggy check.)
        if self.action == 'react' or (self.action == 'comments' and self.request.method == 'POST'):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_queryset(self):
        return (
            NewsPost.objects.filter(published=True)
            .select_related('author')
            .prefetch_related('gallery_images', 'reactions')
        )

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

    @action(detail=True, methods=['post'])
    def react(self, request, pk=None):
        post = get_object_or_404(self.get_queryset(), slug=pk)
        reaction_type = request.data.get('type')
        if reaction_type not in ('like', 'dislike'):
            return Response({'detail': "type trebuie să fie 'like' sau 'dislike'."}, status=status.HTTP_400_BAD_REQUEST)

        existing = NewsReaction.objects.filter(news_post=post, user=request.user).first()
        if existing and existing.reaction_type == reaction_type:
            existing.delete()
            my_reaction = None
        elif existing:
            existing.reaction_type = reaction_type
            existing.save(update_fields=['reaction_type'])
            my_reaction = reaction_type
        else:
            NewsReaction.objects.create(news_post=post, user=request.user, reaction_type=reaction_type)
            my_reaction = reaction_type

        return Response({
            'my_reaction': my_reaction,
            'like_count': post.reactions.filter(reaction_type='like').count(),
            'dislike_count': post.reactions.filter(reaction_type='dislike').count(),
        })

    @action(detail=True, methods=['get', 'post'], url_path='comments')
    def comments(self, request, pk=None):
        post = get_object_or_404(self.get_queryset(), slug=pk)
        if request.method == 'GET':
            top_level = post.comments.filter(is_approved=True, parent=None).select_related('author')
            serializer = PublicNewsCommentSerializer(top_level, many=True, context={'request': request})
            return Response(serializer.data)

        return self.add_comment(request, post)

    def add_comment(self, request, post):
        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({'detail': 'Comentariul nu poate fi gol.'}, status=status.HTTP_400_BAD_REQUEST)
        parent_id = request.data.get('parent')
        parent = None
        if parent_id:
            parent = get_object_or_404(NewsComment, pk=parent_id, news_post=post)
        comment = NewsComment.objects.create(
            news_post=post, author=request.user, content=content[:1000], parent=parent,
        )
        serializer = PublicNewsCommentSerializer(comment, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PublicVideoViewSet(viewsets.ViewSet):
    """GET /api/public/videos/ - paginated list of published videos.
    Optional filters: ?featured=true, ?athlete=<id>, ?club=<slug> (the Media
    page's video tab uses athlete/club to filter by tag; neither is
    required - omitting both returns every published video, newest first)."""
    permission_classes = [AllowAny]
    pagination_class = PublicContentPagination

    def get_queryset(self):
        return Video.objects.filter(published=True).prefetch_related('tagged_athletes', 'tagged_clubs')

    def list(self, request):
        queryset = self.get_queryset()

        featured = request.query_params.get('featured')
        if featured is not None and str(featured).lower() in ('1', 'true', 'yes'):
            queryset = queryset.filter(featured=True)

        athlete_id = request.query_params.get('athlete')
        club_slug = request.query_params.get('club')
        if athlete_id:
            queryset = queryset.filter(tagged_athletes__id=athlete_id)
        elif club_slug:
            queryset = queryset.filter(tagged_clubs__slug=club_slug)

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


class PublicEventViewSet(viewsets.ViewSet):
    """
    GET /api/public/events/          - all published events (past + upcoming), newest first
    GET /api/public/events/<slug>/   - detail of a single event (full description)
    GET /api/public/events/upcoming/ - upcoming competitions/events only
    """
    permission_classes = [AllowAny]
    pagination_class = PublicContentPagination

    def get_queryset(self):
        # Exams a club coach created themselves (organizing_club set) are
        # for that club's own athletes, not a federation-wide announcement -
        # keep them out of the public calendar. is_publicly_visible is the
        # admin's own explicit toggle for the same purpose.
        return Event.objects.filter(
            organizing_club__isnull=True, is_publicly_visible=True
        ).select_related('city').order_by('-start_date')

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
            status='upcoming', start_date__gt=timezone.now(),
            organizing_club__isnull=True, is_publicly_visible=True
        ).select_related('city').order_by('start_date')
        serializer = PublicEventSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)


class PublicClubViewSet(viewsets.ViewSet):
    """
    GET /api/public/clubs/       - federation club directory ('Cluburi' nav item)
    GET /api/public/clubs/<slug>/ - club detail page (info + medal totals;
                                    athletes are fetched separately via
                                    /api/athletes/?club=<id>)
    """
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Club.objects.select_related('city').prefetch_related('coaches')

    def list(self, request):
        queryset = self.get_queryset().order_by('display_order', 'name')
        serializer = PublicClubSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        # `pk` here is actually the club slug (see api/urls.py routing).
        instance = get_object_or_404(self.get_queryset(), slug=pk)
        serializer = PublicClubDetailSerializer(instance, context={'request': request})
        return Response(serializer.data)


# Explicit display order for the federation staff/referee directories,
# matching the curated ordering on the live vovinam.ro site (which isn't
# alphabetical and isn't derivable from any other field - e.g. Răzvan
# Niculescu leads the council list but trails the masters list). Keyed by
# (first_name, last_name); anyone not listed sorts after everyone who is.
_COUNCIL_ORDER = [
    ('Florin', 'Macovei'),
    ('Angel', 'Mititelu'),
    ('Răzvan', 'Rusov'),
    ('Răzvan', 'Niculescu'),
    ('Lăcrămioara', 'Ciobotaru'),
]
_MASTERS_ORDER = [
    ('Florin', 'Macovei'),
    ('Angel', 'Mititelu'),
    ('Vasile', 'Ichim'),
    ('Geluța', 'Ciobotaru'),
    ('Lăcrămioara', 'Ciobotaru'),
    ('Adrian', 'Teleman'),
    ('Sinodor', 'Socea'),
    ('Răzvan', 'Niculescu'),
]
def _leadership_priority(federation_role):
    """The federation's top 3 leadership positions outrank grade entirely
    (e.g. the head of the refereeing commission may hold a lower belt rank
    than the referees they lead) - everyone else, including other
    federation_role holders like "Membru", sorts by grade as normal."""
    if not federation_role:
        return None
    name = federation_role.name.strip().lower()
    if name.startswith('președinte'):
        return 0
    if name.startswith('vicepreședinte'):
        return 1
    if 'șef comisie' in name:
        return 2
    return None


def _by_grade_then_name(queryset):
    """Sort athletes by leadership position (see _leadership_priority),
    then grade rank (highest first, ungraded last), then by name - used
    for the referee directory instead of a curated name list, so a newly
    flagged referee shows up automatically without anyone having to add
    them to a hardcoded order."""
    def sort_key(athlete):
        leadership = _leadership_priority(athlete.federation_role)
        rank = athlete.current_grade.rank_order if athlete.current_grade else None
        return (
            leadership if leadership is not None else 99,
            -rank if rank is not None else float('inf'),
            athlete.last_name,
            athlete.first_name,
        )
    return sorted(queryset, key=sort_key)


def _in_curated_order(queryset, order_pairs):
    """Sort a queryset of Athletes by a curated (first_name, last_name)
    order list, matching vovinam.ro. Anyone not in the list keeps their
    relative last/first-name order and sorts after everyone listed."""
    rank = {pair: i for i, pair in enumerate(order_pairs)}
    people = list(queryset)
    people.sort(key=lambda a: (rank.get((a.first_name, a.last_name), len(order_pairs)), a.last_name, a.first_name))
    return people


class PublicStaffViewSet(viewsets.ViewSet):
    """GET /api/public/staff/ - federation staff/leadership directory
    ('Staff' nav item). Mirrors the two sections on the live vovinam.ro
    staff page: the current council (athletes with a federation_role) and
    the Ministry-of-Sport-awarded 'Maestru' title holders (athletes with a
    title, whether or not they also sit on the council)."""
    permission_classes = [AllowAny]

    def list(self, request):
        base = Athlete.objects.filter(status='approved').select_related('federation_role', 'title', 'club')
        council = _in_curated_order(base.exclude(federation_role=None), _COUNCIL_ORDER)
        masters = _in_curated_order(base.exclude(title=None), _MASTERS_ORDER)
        return Response({
            'council': PublicStaffSerializer(council, many=True, context={'request': request}).data,
            'masters': PublicStaffSerializer(masters, many=True, context={'request': request}).data,
        })


class PublicRefereeViewSet(viewsets.ViewSet):
    """GET /api/public/referees/ - federation referee directory
    ('Arbitri' nav item). Groups approved athletes flagged is_referee=True
    into 'international' and 'national' (by `referee_level`), sorted by
    grade rank - any athlete an admin marks as a referee (and classifies
    as international/national in Django admin) appears here automatically,
    no manual list to maintain."""
    permission_classes = [AllowAny]

    def list(self, request):
        base = Athlete.objects.filter(status='approved', is_referee=True).select_related('title', 'club', 'current_grade', 'federation_role')
        international = _by_grade_then_name(base.filter(referee_level='international'))
        national = _by_grade_then_name(base.filter(referee_level='national'))
        return Response({
            'international': PublicRefereeSerializer(international, many=True, context={'request': request}).data,
            'national': PublicRefereeSerializer(national, many=True, context={'request': request}).data,
        })


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


class PublicGalleryViewSet(viewsets.ViewSet):
    """Tagged photo gallery, Facebook-style: powers the 'Poze' tab on club
    and athlete public profiles, plus the full-screen lightbox (like/dislike
    + threaded comments).

    GET  /api/public/gallery/[?athlete=<id>|club=<slug>] - paginated list of
         photos, newest first, optionally filtered to those tagged with a
         given athlete/club (used by the athlete/club 'Poze' tab and the
         sitewide Media page's photo tab) (AllowAny).
    GET  /api/public/gallery/<id>/                       - single photo, for
         opening the lightbox directly (AllowAny).
    POST /api/public/gallery/<id>/react/    {type: like|dislike}
         - toggle the current user's reaction (IsAuthenticated). Posting the
           same type again removes it (un-react); a different type switches it.
    GET  /api/public/gallery/<id>/comments/ - approved comments, threaded (AllowAny).
    POST /api/public/gallery/<id>/comments/ {content, parent?}
         - add a comment (IsAuthenticated).
    """
    pagination_class = PublicContentPagination

    def get_permissions(self):
        # `add_comment` is a plain helper, not a routed action - a POST to
        # the `comments` action needs its own check since that action also
        # serves GET (public reads), which `self.action == 'comments'`
        # alone can't distinguish. (This same fix applies to both the news
        # and gallery viewsets, which shared the original, buggy check.)
        if self.action == 'react' or (self.action == 'comments' and self.request.method == 'POST'):
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_queryset(self):
        return (
            NewsPostGallery.objects.select_related('news_post')
            .prefetch_related('tagged_athletes', 'tagged_clubs', 'reactions')
            .order_by('-created_at')
        )

    def list(self, request):
        queryset = self.get_queryset()
        athlete_id = request.query_params.get('athlete')
        club_slug = request.query_params.get('club')
        if athlete_id:
            queryset = queryset.filter(tagged_athletes__id=athlete_id)
        elif club_slug:
            queryset = queryset.filter(tagged_clubs__slug=club_slug)
        # else: no filter - the Media page's photo tab lists every tagged
        # photo, newest first.

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(queryset, request)
        serializer = PublicGalleryPhotoSerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

    def retrieve(self, request, pk=None):
        photo = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = PublicGalleryPhotoSerializer(photo, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def react(self, request, pk=None):
        photo = get_object_or_404(NewsPostGallery, pk=pk)
        reaction_type = request.data.get('type')
        if reaction_type not in ('like', 'dislike'):
            return Response({'detail': "type trebuie să fie 'like' sau 'dislike'."}, status=status.HTTP_400_BAD_REQUEST)

        existing = GalleryReaction.objects.filter(gallery_image=photo, user=request.user).first()
        if existing and existing.reaction_type == reaction_type:
            existing.delete()
            my_reaction = None
        elif existing:
            existing.reaction_type = reaction_type
            existing.save(update_fields=['reaction_type'])
            my_reaction = reaction_type
        else:
            GalleryReaction.objects.create(gallery_image=photo, user=request.user, reaction_type=reaction_type)
            my_reaction = reaction_type

        return Response({
            'my_reaction': my_reaction,
            'like_count': photo.reactions.filter(reaction_type='like').count(),
            'dislike_count': photo.reactions.filter(reaction_type='dislike').count(),
        })

    @action(detail=True, methods=['get', 'post'], url_path='comments')
    def comments(self, request, pk=None):
        photo = get_object_or_404(NewsPostGallery, pk=pk)
        if request.method == 'GET':
            top_level = photo.comments.filter(is_approved=True, parent=None).select_related('author')
            serializer = PublicGalleryCommentSerializer(top_level, many=True, context={'request': request})
            return Response(serializer.data)

        return self.add_comment(request, photo)

    def add_comment(self, request, photo):
        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({'detail': 'Comentariul nu poate fi gol.'}, status=status.HTTP_400_BAD_REQUEST)
        parent_id = request.data.get('parent')
        parent = None
        if parent_id:
            parent = get_object_or_404(GalleryComment, pk=parent_id, gallery_image=photo)
        comment = GalleryComment.objects.create(
            gallery_image=photo, author=request.user, content=content[:1000], parent=parent,
        )
        serializer = PublicGalleryCommentSerializer(comment, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
