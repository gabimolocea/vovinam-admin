from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
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

class NewsPostAdmin(admin.ModelAdmin):
    list_display = ['title', 'published', 'featured', 'author_name', 'gallery_count', 'created_at', 'updated_at']
    list_filter = ['published', 'featured', 'created_at', 'author']
    search_fields = ['title', 'content', 'excerpt', 'tags']
    prepopulated_fields = {'slug': ('title',)}
    # Inline editing on the changelist was removed to avoid the global
    # "Save" button. Moderation and publication should be done via the
    # object change form or admin actions instead of list_editable.
    ordering = ['-created_at']
    inlines = [NewsPostGalleryInline]
    
    fieldsets = (
        (_('Informații de bază'), {
            'fields': ('title', 'slug', 'author', 'excerpt', 'tags')
        }),
        (_('Conținut'), {
            'fields': ('content', 'featured_image', 'featured_image_alt')
        }),
        (_('Setări publicare'), {
            'fields': ('published', 'featured')
        }),
        ('Setări SEO', {
            'fields': ('meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 'robots_index', 'robots_follow'),
            'classes': ('collapse',),
            'description': _('Setări pentru optimizarea în motoarele de căutare')
        }),
    )
    
    def author_name(self, obj):
        return obj.author.get_full_name() if obj.author else _('Fără autor')
    author_name.short_description = _('Autor')
    
    def gallery_count(self, obj):
        count = obj.gallery_images.count()
        if count > 0:
            return format_html('<span style="color: green;">{} imagini</span>', count)
        return format_html('<span style="color: gray;">Fără imagini</span>')
    gallery_count.short_description = _('Galerie')
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author').prefetch_related('gallery_images')
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "author":
            # Only show admin users as potential authors
            kwargs["queryset"] = db_field.related_model.objects.filter(role='admin')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

class EventAdmin(admin.ModelAdmin):
    list_display = ['title', 'start_date', 'city', 'event_type', 'event_status', 'sync_mode', 'sync_locked', 'local_sync_status', 'is_featured']
    list_filter = ['status', 'sync_mode', 'sync_locked', 'local_sync_status', 'is_featured', 'start_date']
    search_fields = ['title', 'description', 'city__name', 'tags']
    autocomplete_fields = ['city']
    prepopulated_fields = {'slug': ('title',)}
    readonly_fields = ['status', 'exported_to_local_at', 'results_uploaded_at', 'sync_completed_at']
    actions = ['lock_for_local_event', 'mark_local_in_progress', 'mark_local_results_uploaded', 'complete_local_sync', 'unlock_local_event']
    # Removed inline editing for `is_featured` to avoid the changelist-wide
    # "Save" button. Use the object change form or admin actions to toggle
    # featured status instead.
    ordering = ['start_date']
    
    fieldsets = (
        (_('Detalii eveniment'), {
            'fields': ('title', 'slug', 'description', 'featured_image', 'featured_image_alt', 'tags')
        }),
        (_('Dată și locație'), {
            'fields': ('start_date', 'end_date', 'coach_registration_deadline', 'city', 'address', 'price', 'event_type', 'status')
        }),
        (_('Setări afișare'), {
            'fields': ('is_featured',)
        }),
        (_('Sincronizare eveniment local'), {
            'fields': ('sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at', 'results_uploaded_at', 'sync_completed_at'),
            'description': _('Controlează blocarea datelor operaționale după exportul către serverul local al competiției.')
        }),
        (_('Setări SEO'), {
            'fields': ('meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 'robots_index', 'robots_follow'),
            'classes': ('collapse',),
            'description': _('Setări pentru optimizarea în motoarele de căutare')
        }),
    )
    
    def event_status(self, obj):
        if obj.is_past:
            return format_html('<span style="color: red;">Trecut</span>')
        if obj.is_ongoing:
            return format_html('<span style="color: #0d6efd;">În desfășurare</span>')
        if obj.is_upcoming:
            return format_html('<span style="color: green;">Următor</span>')
        return format_html('<span style="color: gray;">Necunoscut</span>')
    event_status.short_description = _('Status')

    def lock_for_local_event(self, request, queryset):
        updated = 0
        now = timezone.now()
        for event in queryset:
            event.mark_exported_to_local(exported_at=now)
            event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'exported_to_local_at'])
            updated += 1
        self.message_user(request, f'{updated} eveniment(e) au fost blocate pentru operare locală.')
    lock_for_local_event.short_description = _('Blochează pentru eveniment local')

    def unlock_local_event(self, request, queryset):
        updated = 0
        for event in queryset:
            event.clear_local_lock()
            event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status'])
            updated += 1
        self.message_user(request, f'{updated} eveniment(e) au fost deblocate pentru editare în cloud.')
    unlock_local_event.short_description = _('Deblochează editarea în cloud')

    def mark_local_results_uploaded(self, request, queryset):
        updated = 0
        for event in queryset:
            event.mark_results_uploaded()
            event.save(update_fields=['local_sync_status', 'results_uploaded_at'])
            updated += 1
        self.message_user(request, f'{updated} eveniment(e) au fost marcate cu rezultate încărcate din local.')
    mark_local_results_uploaded.short_description = _('Marchează rezultate încărcate')

    def mark_local_in_progress(self, request, queryset):
        updated = 0
        for event in queryset:
            event.mark_local_in_progress()
            event.save(update_fields=['local_sync_status'])
            updated += 1
        self.message_user(request, f'{updated} eveniment(e) au fost marcate ca în desfășurare locală.')
    mark_local_in_progress.short_description = _('Marchează în desfășurare locală')

    def complete_local_sync(self, request, queryset):
        updated = 0
        for event in queryset:
            event.complete_local_sync()
            event.save(update_fields=['sync_mode', 'sync_locked', 'local_sync_status', 'sync_completed_at'])
            updated += 1
        self.message_user(request, f'{updated} eveniment(e) au fost finalizate și deblocate pentru cloud.')
    complete_local_sync.short_description = _('Finalizează sincronizarea locală')

class AboutSectionAdmin(admin.ModelAdmin):
    list_display = ['section_title', 'order', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['section_title', 'content']
    list_editable = ['order', 'is_active']
    ordering = ['order']
    
    fieldsets = (
        (_('Informații secțiune'), {
            'fields': ('section_title', 'content', 'image', 'image_alt')
        }),
        (_('Setări afișare'), {
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
        (_('Detalii mesaj'), {
            'fields': ('name', 'email', 'phone', 'subject', 'message', 'created_at')
        }),
        (_('Status'), {
            'fields': ('priority', 'is_read', 'is_replied')
        }),
        (_('Notițe administrator'), {
            'fields': ('admin_notes',),
            'classes': ('collapse',)
        }),
    )

class ContactInfoAdmin(admin.ModelAdmin):
    list_display = ['organization_name', 'email', 'phone', 'is_active']
    list_editable = ['is_active']
    
    fieldsets = (
        (_('Detalii organizație'), {
            'fields': ('organization_name', 'address', 'phone', 'email', 'website')
        }),
        (_('Rețele sociale'), {
            'fields': ('social_media_facebook', 'social_media_instagram', 'social_media_twitter')
        }),
        (_('Informații suplimentare'), {
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

class NewsPostGalleryAdmin(admin.ModelAdmin):
    list_display = ['news_post', 'image_preview', 'alt_text', 'order', 'created_at']
    list_filter = ['news_post', 'created_at']
    search_fields = ['news_post__title', 'alt_text', 'caption']
    ordering = ['news_post', 'order']
    
    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" width="50" height="50" style="object-fit: cover; border-radius: 4px;" />', obj.image.url)
        return _('Fără imagine')
    image_preview.short_description = _('Previzualizare')


class NewsCommentAdmin(admin.ModelAdmin):
    list_display = ['content_preview', 'author', 'news_post', 'is_reply', 'is_approved', 'created_at']
    list_filter = ['is_approved', 'created_at', 'news_post']
    search_fields = ['content', 'author__username', 'news_post__title']
    ordering = ['-created_at']
    raw_id_fields = ['parent', 'news_post']
    # Use admin actions for moderation instead of inline editable fields on
    # the changelist (which require the Save button). Moderators can select
    # rows and run the actions below.
    actions = ['approve_comments', 'disapprove_comments']
    
    fieldsets = (
        ('Informații comentariu', {
            'fields': ('news_post', 'author', 'content', 'parent')
        }),
        ('Moderare', {
            'fields': ('is_approved',)
        }),
    )
    
    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = _('Conținut')
    
    def is_reply(self, obj):
        return obj.is_reply
    is_reply.boolean = True
    is_reply.short_description = _('Răspuns')
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author', 'news_post', 'parent')

    def approve_comments(self, request, queryset):
        """Mark selected comments as approved."""
        updated = queryset.update(is_approved=True)
        self.message_user(request, f"{updated} comentariu(e) aprobate.")
    approve_comments.short_description = _('Aprobă comentariile selectate')

    def disapprove_comments(self, request, queryset):
        """Mark selected comments as not approved."""
        updated = queryset.update(is_approved=False)
        self.message_user(request, f"{updated} comentariu(e) respinse.")
    disapprove_comments.short_description = _('Respinge comentariile selectate')