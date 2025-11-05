from rest_framework import serializers
from .models import NewsPost, Event, AboutSection, ContactMessage, ContactInfo, NewsPostGallery, NewsComment

class NewsPostGallerySerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsPostGallery
        fields = ['id', 'image', 'alt_text', 'caption', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']

class AuthorSerializer(serializers.ModelSerializer):
    """Serializer for author information in news posts"""
    class Meta:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        model = User
        fields = ['id', 'first_name', 'last_name', 'email']

class NewsPostSerializer(serializers.ModelSerializer):
    gallery_images = NewsPostGallerySerializer(many=True, read_only=True)
    author_details = AuthorSerializer(source='author', read_only=True)
    author_name = serializers.CharField(source='author.get_full_name', read_only=True)
    
    class Meta:
        model = NewsPost
        fields = [
            'id', 'title', 'slug', 'content', 'excerpt', 'featured_image', 
            'featured_image_alt', 'published', 'featured', 'author', 'author_details',
            'author_name', 'gallery_images', 'tags', 'created_at', 'updated_at', 
            'meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 
            'robots_index', 'robots_follow'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'author_details', 'author_name']
    
    def create(self, validated_data):
        # Automatically set the author to the current user (must be admin)
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)

class NewsPostListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views"""
    author_name = serializers.CharField(source='author.get_full_name', read_only=True)
    gallery_count = serializers.IntegerField(source='gallery_images.count', read_only=True)
    comment_count = serializers.IntegerField(source='comments.count', read_only=True)
    
    class Meta:
        model = NewsPost
        fields = [
            'id', 'title', 'slug', 'excerpt', 'featured_image', 
            'featured_image_alt', 'published', 'featured', 'author_name', 
            'gallery_count', 'comment_count', 'tags', 'created_at'
        ]

class EventSerializer(serializers.ModelSerializer):
    is_upcoming = serializers.ReadOnlyField()
    is_past = serializers.ReadOnlyField()
    city_name = serializers.CharField(source='city.name', read_only=True)
    event_type = serializers.CharField(read_only=False)
    
    class Meta:
        model = Event
        fields = [
            'id', 'title', 'slug', 'description', 'start_date', 'end_date',
            'city', 'city_name', 'event_type', 'address', 'featured_image', 'featured_image_alt',
            'is_featured', 'price', 'tags', 'created_at', 'is_upcoming',
            'is_past', 'meta_title', 'meta_description', 'meta_keywords',
            'canonical_url', 'robots_index', 'robots_follow'
        ]
        read_only_fields = ['id', 'created_at', 'is_upcoming', 'is_past']

class EventListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views"""
    is_upcoming = serializers.ReadOnlyField()
    is_past = serializers.ReadOnlyField()
    city_name = serializers.CharField(source='city.name', read_only=True)
    
    class Meta:
        model = Event
        fields = [
            'id', 'title', 'slug', 'start_date', 'end_date',
            'featured_image', 'featured_image_alt', 'is_featured',
            'city', 'city_name', 'event_type', 'price', 'tags', 'is_upcoming', 'is_past'
        ]

class AboutSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AboutSection
        fields = [
            'id', 'section_title', 'content', 'image', 'image_alt',
            'order', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = [
            'id', 'name', 'email', 'phone', 'subject', 'message',
            'priority', 'created_at', 'is_read', 'is_replied'
        ]
        read_only_fields = ['id', 'created_at', 'is_read', 'is_replied']

class ContactMessageCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating contact messages from frontend"""
    class Meta:
        model = ContactMessage
        fields = ['name', 'email', 'phone', 'subject', 'message']

class ContactInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactInfo
        fields = [
            'id', 'organization_name', 'address', 'phone', 'email', 'website',
            'social_media_facebook', 'social_media_instagram', 'social_media_twitter',
            'business_hours', 'is_active'
        ]


class NewsCommentSerializer(serializers.ModelSerializer):
    """Serializer for news comments"""
    author_name = serializers.CharField(source='author.get_full_name', read_only=True)
    author_username = serializers.CharField(source='author.username', read_only=True)
    replies = serializers.SerializerMethodField()
    is_reply = serializers.BooleanField(read_only=True)
    can_edit = serializers.SerializerMethodField()
    
    class Meta:
        model = NewsComment
        fields = [
            'id', 'news_post', 'author', 'author_name', 'author_username', 
            'content', 'parent', 'is_approved', 'is_reply', 'can_edit',
            'created_at', 'updated_at', 'replies'
        ]
        read_only_fields = ['id', 'author', 'is_approved', 'created_at', 'updated_at']
    
    def get_replies(self, obj):
        if obj.replies.exists():
            return NewsCommentSerializer(
                obj.get_replies(), 
                many=True, 
                context=self.context
            ).data
        return []
    
    def get_can_edit(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return request.user == obj.author or request.user.is_staff
    
    def create(self, validated_data):
        # Automatically set the author to the current user
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)
    
    def validate_parent(self, value):
        """Ensure parent comment belongs to the same news post"""
        if value and hasattr(self, 'initial_data'):
            news_post_id = self.initial_data.get('news_post')
            if value.news_post.id != int(news_post_id):
                raise serializers.ValidationError(
                    "Parent comment must belong to the same news post."
                )
        return value


class NewsCommentCreateSerializer(serializers.ModelSerializer):
    """Simplified serializer for creating comments"""
    class Meta:
        model = NewsComment
        fields = ['news_post', 'content', 'parent']
    
    def create(self, validated_data):
        validated_data['author'] = self.context['request'].user
        return super().create(validated_data)