from rest_framework import viewsets, status, filters
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, BasePermission
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from .models import NewsPost, Event, AboutSection, ContactMessage, ContactInfo, NewsPostGallery, NewsComment
from .serializers import (
    NewsPostSerializer, NewsPostListSerializer, NewsPostGallerySerializer,
    EventSerializer, EventListSerializer,
    AboutSectionSerializer, ContactMessageSerializer,
    ContactMessageCreateSerializer, ContactInfoSerializer,
    NewsCommentSerializer, NewsCommentCreateSerializer
)

class IsAdminOrReadOnly(BasePermission):
    """
    Custom permission to only allow admin users to create, edit, or delete news posts.
    Regular users and anonymous users can only read.
    """
    def has_permission(self, request, view):
        # Read permissions for any request (GET, HEAD, OPTIONS)
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True
        
        # Write permissions only for admin users
        return request.user.is_authenticated and (
            request.user.is_admin or 
            request.user.is_superuser or 
            request.user.is_staff
        )

class NewsPostViewSet(viewsets.ModelViewSet):
    queryset = NewsPost.objects.select_related('author').prefetch_related('gallery_images').all()
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['published', 'featured', 'author']
    search_fields = ['title', 'content', 'excerpt', 'tags', 'slug']
    ordering_fields = ['created_at', 'updated_at', 'title']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return NewsPostListSerializer
        return NewsPostSerializer

    def get_queryset(self):
        queryset = NewsPost.objects.select_related('author').prefetch_related('gallery_images').all()
        
        # Filter published posts for non-admin users
        if not (self.request.user.is_authenticated and self.request.user.is_admin):
            queryset = queryset.filter(published=True)
            
        return queryset

    def perform_create(self, serializer):
        """Automatically set the author to current user when creating a news post"""
        serializer.save(author=self.request.user)

    @action(detail=False, methods=['get'])
    def featured(self, request):
        """Get featured news posts"""
        featured_posts = self.get_queryset().filter(featured=True, published=True)
        serializer = NewsPostListSerializer(featured_posts, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent news posts"""
        recent_posts = self.get_queryset().filter(published=True)[:5]
        serializer = NewsPostListSerializer(recent_posts, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrReadOnly])
    def add_gallery_image(self, request, pk=None):
        """Add an image to the news post gallery"""
        news_post = self.get_object()
        serializer = NewsPostGallerySerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(news_post=news_post)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def gallery(self, request, pk=None):
        """Get all gallery images for a news post"""
        news_post = self.get_object()
        gallery_images = news_post.gallery_images.all()
        serializer = NewsPostGallerySerializer(gallery_images, many=True, context={'request': request})
        return Response(serializer.data)

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_featured', 'event_type']
    search_fields = ['title', 'description', 'city__name', 'tags']
    ordering_fields = ['start_date', 'created_at', 'title']
    ordering = ['start_date']

    def get_serializer_class(self):
        if self.action == 'list':
            return EventListSerializer
        return EventSerializer

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        """Get upcoming events"""
        upcoming_events = self.get_queryset().filter(start_date__gt=timezone.now())
        serializer = EventListSerializer(upcoming_events, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def past(self, request):
        """Get past events"""
        past_events = self.get_queryset().filter(start_date__lt=timezone.now())
        serializer = EventListSerializer(past_events, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def featured(self, request):
        """Get featured events"""
        featured_events = self.get_queryset().filter(is_featured=True)
        serializer = EventListSerializer(featured_events, many=True)
        return Response(serializer.data)

class AboutSectionViewSet(viewsets.ModelViewSet):
    queryset = AboutSection.objects.filter(is_active=True)
    serializer_class = AboutSectionSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    ordering = ['order', 'section_title']

class ContactMessageViewSet(viewsets.ModelViewSet):
    queryset = ContactMessage.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['priority', 'is_read', 'is_replied']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'create':
            return ContactMessageCreateSerializer
        return ContactMessageSerializer

    def perform_create(self, serializer):
        # Save the contact message (frontend form submission)
        serializer.save()

class ContactInfoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ContactInfo.objects.filter(is_active=True)
    serializer_class = ContactInfoSerializer

# Simple API views for common use cases
@api_view(['GET'])
def landing_page_data(request):
    """Get all data needed for landing page in one API call"""
    data = {
        'featured_news': NewsPostListSerializer(
            NewsPost.objects.filter(featured=True, published=True)[:3], 
            many=True
        ).data,
        'upcoming_events': EventListSerializer(
            Event.objects.filter(start_date__gt=timezone.now(), is_featured=True)[:3],
            many=True
        ).data,
        'about_sections': AboutSectionSerializer(
            AboutSection.objects.filter(is_active=True),
            many=True
        ).data,
        'contact_info': ContactInfoSerializer(
            ContactInfo.objects.filter(is_active=True).first()
        ).data if ContactInfo.objects.filter(is_active=True).exists() else None
    }
    return Response(data)

@api_view(['POST'])
def submit_contact_form(request):
    """Simple contact form submission endpoint"""
    serializer = ContactMessageCreateSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(
            {'message': 'Contact message sent successfully!'}, 
            status=status.HTTP_201_CREATED
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class NewsCommentViewSet(viewsets.ModelViewSet):
    """ViewSet for news comments - allows authenticated users to comment"""
    queryset = NewsComment.objects.all()
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['news_post', 'parent']
    ordering_fields = ['created_at']
    ordering = ['created_at']
    
    def get_queryset(self):
        # Only show approved comments for non-admin users
        queryset = NewsComment.objects.select_related('author', 'news_post', 'parent').prefetch_related('replies')
        
        if not (self.request.user.is_authenticated and (self.request.user.is_staff or self.request.user.is_admin)):
            queryset = queryset.filter(is_approved=True)
        
        return queryset
    
    def get_serializer_class(self):
        if self.action == 'create':
            return NewsCommentCreateSerializer
        return NewsCommentSerializer
    
    def perform_create(self, serializer):
        """Automatically approve comments from staff/admin users"""
        comment = serializer.save(author=self.request.user)
        
        # Auto-approve comments from staff/admin users
        if self.request.user.is_staff or self.request.user.is_admin:
            comment.is_approved = True
            comment.save()
    
    def perform_update(self, serializer):
        """Only allow users to edit their own comments"""
        comment = self.get_object()
        if comment.author != self.request.user and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only edit your own comments.")
        serializer.save()
    
    def perform_destroy(self, instance):
        """Only allow users to delete their own comments or admins to delete any"""
        if instance.author != self.request.user and not self.request.user.is_staff:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You can only delete your own comments.")
        instance.delete()