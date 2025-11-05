from django.contrib import admin
from django.utils.html import format_html
from .models import (
    NewsPost,
    Event,
    AboutSection,
    ContactMessage,
    ContactInfo,
    NewsPostGallery,
    NewsComment,
    ContactInfoProxy,
    ContactMessageProxy,
)

class NewsPostGalleryInline(admin.TabularInline):
    model = NewsPostGallery
    extra = 1
    fields = ['image', 'alt_text', 'caption', 'order']
    ordering = ['order']

@admin.register(NewsPost)
class NewsPostAdmin(admin.ModelAdmin):
    list_display = ['title', 'published', 'featured', 'author_name', 'gallery_count', 'created_at', 'updated_at']
    list_filter = ['published', 'featured', 'created_at', 'author']
    search_fields = ['title', 'content', 'excerpt', 'tags']
    prepopulated_fields = {'slug': ('title',)}
    list_editable = ['published', 'featured']
    ordering = ['-created_at']
    inlines = [NewsPostGalleryInline]
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('title', 'slug', 'author', 'excerpt', 'tags')
        }),
        ('Content', {
            'fields': ('content', 'featured_image', 'featured_image_alt')
        }),
        ('Publication Settings', {
            'fields': ('published', 'featured')
        }),
        ('SEO Settings', {
            'fields': ('meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 'robots_index', 'robots_follow'),
            'classes': ('collapse',),
            'description': 'Search Engine Optimization settings'
        }),
    )
    
    def author_name(self, obj):
        return obj.author.get_full_name() if obj.author else 'No Author'
    author_name.short_description = 'Author'
    
    def gallery_count(self, obj):
        count = obj.gallery_images.count()
        if count > 0:
            return format_html('<span style="color: green;">{} images</span>', count)
        return format_html('<span style="color: gray;">No images</span>')
    gallery_count.short_description = 'Gallery'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author').prefetch_related('gallery_images')
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "author":
            # Only show admin users as potential authors
            kwargs["queryset"] = db_field.related_model.objects.filter(role='admin')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

class EventAdmin(admin.ModelAdmin):
    list_display = ['title', 'start_date', 'city', 'event_type', 'is_featured', 'event_status']
    list_filter = ['is_featured', 'start_date']
    search_fields = ['title', 'description', 'city__name', 'tags']
    autocomplete_fields = ('city',)
    prepopulated_fields = {'slug': ('title',)}
    list_editable = ['is_featured']
    ordering = ['start_date']
    
    fieldsets = (
        ('Event Details', {
            'fields': ('title', 'slug', 'description', 'featured_image', 'featured_image_alt', 'tags')
        }),
        ('Date & Location', {
            'fields': ('start_date', 'end_date', 'city', 'address', 'price', 'event_type')
        }),
        ('Display Settings', {
            'fields': ('is_featured',)
        }),
        ('SEO Settings', {
            'fields': ('meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 'robots_index', 'robots_follow'),
            'classes': ('collapse',),
            'description': 'Search Engine Optimization settings'
        }),
    )
    
    def event_status(self, obj):
        if obj.is_upcoming:
            return format_html('<span style="color: green;">Upcoming</span>')
        else:
            return format_html('<span style="color: red;">Past</span>')
    event_status.short_description = 'Status'

class AboutSectionAdmin(admin.ModelAdmin):
    list_display = ['section_title', 'order', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['section_title', 'content']
    list_editable = ['order', 'is_active']
    ordering = ['order']
    
    fieldsets = (
        ('Section Information', {
            'fields': ('section_title', 'content', 'image', 'image_alt')
        }),
        ('Display Settings', {
            'fields': ('order', 'is_active')
        }),
    )

# Keep the existing ContactMessage and ContactInfo admin classes...
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'subject', 'priority', 'is_read', 'is_replied', 'created_at']
    list_filter = ['priority', 'is_read', 'is_replied', 'created_at']
    search_fields = ['name', 'email', 'subject', 'message']
    list_editable = ['is_read', 'is_replied', 'priority']
    ordering = ['-created_at']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Message Details', {
            'fields': ('name', 'email', 'phone', 'subject', 'message', 'created_at')
        }),
        ('Status', {
            'fields': ('priority', 'is_read', 'is_replied')
        }),
        ('Admin Notes', {
            'fields': ('admin_notes',),
            'classes': ('collapse',)
        }),
    )

class ContactInfoAdmin(admin.ModelAdmin):
    list_display = ['organization_name', 'email', 'phone', 'is_active']
    list_editable = ['is_active']
    
    fieldsets = (
        ('Organization Details', {
            'fields': ('organization_name', 'address', 'phone', 'email', 'website')
        }),
        ('Social Media', {
            'fields': ('social_media_facebook', 'social_media_instagram', 'social_media_twitter')
        }),
        ('Additional Info', {
            'fields': ('business_hours', 'is_active')
        }),
    )
    
    def has_add_permission(self, request):
        return not ContactInfo.objects.exists()
    
    def has_delete_permission(self, request, obj=None):
        return False


# Register the contact proxies under a separate "contact" app section so they
# appear grouped as their own section in the admin index.
try:
    admin.site.register(ContactInfoProxy, ContactInfoAdmin)
except Exception:
    pass

try:
    admin.site.register(ContactMessageProxy, ContactMessageAdmin)
except Exception:
    pass

@admin.register(NewsPostGallery)
class NewsPostGalleryAdmin(admin.ModelAdmin):
    list_display = ['news_post', 'image_preview', 'alt_text', 'order', 'created_at']
    list_filter = ['news_post', 'created_at']
    search_fields = ['news_post__title', 'alt_text', 'caption']
    ordering = ['news_post', 'order']
    
    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" width="50" height="50" style="object-fit: cover; border-radius: 4px;" />', obj.image.url)
        return 'No image'
    image_preview.short_description = 'Preview'


@admin.register(NewsComment)
class NewsCommentAdmin(admin.ModelAdmin):
    list_display = ['content_preview', 'author', 'news_post', 'is_reply', 'is_approved', 'created_at']
    list_filter = ['is_approved', 'created_at', 'news_post']
    search_fields = ['content', 'author__username', 'news_post__title']
    list_editable = ['is_approved']
    ordering = ['-created_at']
    raw_id_fields = ['parent', 'news_post']
    
    fieldsets = (
        ('Comment Information', {
            'fields': ('news_post', 'author', 'content', 'parent')
        }),
        ('Moderation', {
            'fields': ('is_approved',)
        }),
    )
    
    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = 'Content'
    
    def is_reply(self, obj):
        return obj.is_reply
    is_reply.boolean = True
    is_reply.short_description = 'Reply'
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author', 'news_post', 'parent')