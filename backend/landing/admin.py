import json

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
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
    NewsReaction,
    GalleryReaction,
    GalleryComment,
    ContactInfoProxy,
    ContactMessageProxy,
    Video,
    DocumentPage,
)

class NewsPostGalleryInline(admin.TabularInline):
    model = NewsPostGallery
    extra = 1
    fields = ['image', 'alt_text', 'caption', 'order', 'tagged_athletes', 'tagged_clubs']
    filter_horizontal = ['tagged_athletes', 'tagged_clubs']
    ordering = ['order']

class NewsPostAdmin(admin.ModelAdmin):
    list_display = ['title', 'published', 'featured', 'author_name', 'gallery_count', 'created_at', 'updated_at']
    list_filter = ['published', 'featured', 'created_at', 'author']
    search_fields = ['title', 'content', 'excerpt', 'tags']
    prepopulated_fields = {'slug': ('title',)}
    filter_horizontal = ['tagged_athletes']
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
        (_('Etichete'), {
            'fields': ('tagged_athletes',),
            'description': _('Sportivii etichetați aici apar în feed-ul antrenorului lor.'),
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
        return format_html('<span style="color: gray;">{}</span>', _('Fără imagini'))
    gallery_count.short_description = _('Galerie')
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author').prefetch_related('gallery_images')
    
    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "author":
            # Only show admin users as potential authors
            kwargs["queryset"] = db_field.related_model.objects.filter(role='admin')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

class EventAdminForm(forms.ModelForm):
    # `event_types` is a JSONField (a list of values from
    # Event.EVENT_TYPE_CHOICES) so an event can be e.g. both a training
    # seminar and an examination at once - present it as checkboxes rather
    # than the raw-JSON textarea the default JSONField widget would show.
    event_types = forms.MultipleChoiceField(
        choices=Event.EVENT_TYPE_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        required=True,
        label=_('Tip eveniment'),
    )

    class Meta:
        model = Event
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields['event_types'].initial = self.instance.event_types


class EventAdmin(admin.ModelAdmin):
    form = EventAdminForm
    list_display = ['title', 'start_date', 'city', 'event_types_display', 'event_status', 'sync_mode', 'sync_locked', 'local_sync_status', 'is_featured', 'is_publicly_visible']
    list_filter = ['status', 'sync_mode', 'sync_locked', 'local_sync_status', 'is_featured', 'is_publicly_visible', 'start_date']
    search_fields = ['title', 'description', 'city__name', 'tags']
    autocomplete_fields = ['city']
    prepopulated_fields = {'slug': ('title',)}
    # sync_mode/sync_locked/local_sync_status are deliberately readonly here
    # (via the *_display wrappers below, for human-readable labels instead
    # of raw enum values) - they're a small state machine, and editing them
    # as three separate raw fields let an admin desync them from each other
    # by changing just one. The changelist actions below (Blochează /
    # Marchează / Finalizează / Deblochează) are the only supported way to
    # transition state, since each one updates every affected field together.
    readonly_fields = ['status', 'sync_mode_display', 'sync_locked_display', 'local_sync_status_display', 'exported_to_local_at', 'results_uploaded_at', 'sync_completed_at', 'import_results_action']
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
            'fields': ('start_date', 'end_date', 'coach_registration_deadline', 'city', 'address', 'price', 'event_types', 'status')
        }),
        (_('Setări afișare'), {
            'fields': ('is_featured', 'is_publicly_visible')
        }),
        (_('Sincronizare eveniment local'), {
            'fields': ('sync_mode_display', 'sync_locked_display', 'local_sync_status_display', 'exported_to_local_at', 'results_uploaded_at', 'sync_completed_at', 'import_results_action'),
            'description': _(
                'Stare doar-informativă - foloseşte acţiunile din lista de evenimente '
                '(Blochează / Marchează / Finalizează / Deblochează) pentru a schimba starea.'
            )
        }),
        (_('Setări SEO'), {
            'fields': ('meta_title', 'meta_description', 'meta_keywords', 'canonical_url', 'robots_index', 'robots_follow'),
            'classes': ('collapse',),
            'description': _('Setări pentru optimizarea în motoarele de căutare')
        }),
    )
    
    def event_types_display(self, obj):
        labels = dict(Event.EVENT_TYPE_CHOICES)
        return ', '.join(labels.get(t, t) for t in (obj.event_types or [])) or '—'
    event_types_display.short_description = _('Tip eveniment')

    def sync_mode_display(self, obj):
        return obj.get_sync_mode_display()
    sync_mode_display.short_description = _('Mod sincronizare')

    def sync_locked_display(self, obj):
        return 'Da' if obj.sync_locked else 'Nu'
    sync_locked_display.short_description = _('Blocat pentru operare locală')

    def local_sync_status_display(self, obj):
        return obj.get_local_sync_status_display()
    local_sync_status_display.short_description = _('Stare sincronizare')

    def event_status(self, obj):
        if obj.is_past:
            return format_html('<span style="color: red;">{}</span>', _('Trecut'))
        if obj.is_ongoing:
            return format_html('<span style="color: #0d6efd;">{}</span>', _('În desfășurare'))
        if obj.is_upcoming:
            return format_html('<span style="color: green;">{}</span>', _('Următor'))
        return format_html('<span style="color: gray;">{}</span>', _('Necunoscut'))
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

    def import_results_action(self, obj):
        """Link to the upload-results-JSON view, next to this event's sync
        fields - lets an admin push a local venue's results JSON into
        cloud straight from Django admin, without needing the separate
        React Sync Center page."""
        if not obj or not obj.pk:
            return '—'
        url = reverse('admin:landing_event_import_results', args=[obj.pk])
        return format_html('<a href="{}" class="button">Încarcă rezultate din local (JSON)</a>', url)
    import_results_action.short_description = _('Import rezultate')

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<int:object_id>/import-results/', self.admin_site.admin_view(self.import_results_view), name='landing_event_import_results'),
        ]
        return custom_urls + urls

    def import_results_view(self, request, object_id):
        """Mirrors POST /api/offline/event-results/import/ (see
        api.sync.import_event_results) - same function, same validation,
        just reachable directly from this event's admin page instead of
        the React Sync Center.

        Event is normally administered through an `api.Event` proxy (see
        api/admin/_common.py's CustomEventAdmin, which subclasses this
        EventAdmin so it inherits this whole view) purely so it groups
        under "Api" in the sidebar - self.model reflects whichever of the
        two is actually registered, so the "change"/"changelist" URL names
        (which Django derives from the model's own app_label) are built
        from it instead of hardcoded, or they 404 under the proxy.
        """
        from api.sync.import_event_results import import_event_results

        event = get_object_or_404(self.model, pk=object_id)
        opts = self.model._meta
        change_url = reverse(f'admin:{opts.app_label}_{opts.model_name}_change', args=[object_id])
        changelist_url = reverse(f'admin:{opts.app_label}_{opts.model_name}_changelist')

        if request.method == 'POST':
            results_file = request.FILES.get('results_file')
            if not results_file:
                messages.error(request, 'Selectează fișierul JSON de rezultate.')
                return redirect(request.path)

            try:
                payload = json.loads(results_file.read().decode('utf-8'))
            except (ValueError, UnicodeDecodeError) as exc:
                messages.error(request, f'Fișierul nu este un JSON valid: {exc}')
                return redirect(request.path)

            try:
                result = import_event_results(payload)
            except ValidationError as exc:
                messages.error(request, f'Importul rezultatelor a eșuat: {exc.message_dict if hasattr(exc, "message_dict") else exc}')
                return redirect(request.path)
            except Exception as exc:
                messages.error(request, f'Importul rezultatelor a eșuat: {exc}')
                return redirect(request.path)

            imported = result.get('imported', {})
            messages.success(request, 'Rezultatele au fost importate cu succes în cloud.')
            summary = ' · '.join(f'{k}: {v}' for k, v in imported.items() if v)
            messages.info(request, summary or 'Nimic nou de sincronizat în acest fișier.')
            return redirect(change_url)

        return render(request, 'admin/landing/event_import_results.html', {
            'title': f'Importă rezultate din local — {event.title}',
            'event': event,
            'change_url': change_url,
            'changelist_url': changelist_url,
        })

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

class VideoAdmin(admin.ModelAdmin):
    list_display = ['title', 'published', 'featured', 'thumbnail_preview', 'created_at', 'updated_at']
    list_filter = ['published', 'featured', 'created_at']
    search_fields = ['title', 'description', 'url']
    prepopulated_fields = {'slug': ('title',)}
    ordering = ['-created_at']
    filter_horizontal = ['tagged_athletes', 'tagged_clubs']

    fieldsets = (
        (_('Informații video'), {
            'fields': ('title', 'slug', 'url', 'thumbnail', 'description')
        }),
        (_('Setări publicare'), {
            'fields': ('published', 'featured')
        }),
        (_('Etichete'), {
            'fields': ('tagged_athletes', 'tagged_clubs')
        }),
    )

    def thumbnail_preview(self, obj):
        if obj.thumbnail:
            return format_html('<img src="{}" width="50" height="50" style="object-fit: cover; border-radius: 4px;" />', obj.thumbnail.url)
        return _('Fără miniatură')
    thumbnail_preview.short_description = _('Previzualizare')


admin.site.register(Video, VideoAdmin)


class DocumentPageAdmin(admin.ModelAdmin):
    list_display = ['title', 'category', 'published', 'order', 'created_at', 'updated_at']
    list_filter = ['category', 'published', 'created_at']
    search_fields = ['title', 'description']
    prepopulated_fields = {'slug': ('title',)}
    ordering = ['category', 'order', '-created_at']

    fieldsets = (
        (_('Informații document'), {
            'fields': ('title', 'slug', 'category', 'description')
        }),
        (_('Fișier'), {
            'fields': ('file', 'external_url')
        }),
        (_('Setări publicare'), {
            'fields': ('published', 'order')
        }),
    )


admin.site.register(DocumentPage, DocumentPageAdmin)


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
    filter_horizontal = ['tagged_athletes', 'tagged_clubs']
    fields = ['news_post', 'image', 'alt_text', 'caption', 'order', 'tagged_athletes', 'tagged_clubs']

    def image_preview(self, obj):
        if obj.image:
            return format_html('<img src="{}" width="50" height="50" style="object-fit: cover; border-radius: 4px;" />', obj.image.url)
        return _('Fără imagine')
    image_preview.short_description = _('Previzualizare')


class GalleryReactionAdmin(admin.ModelAdmin):
    list_display = ['gallery_image', 'user', 'reaction_type', 'created_at']
    list_filter = ['reaction_type', 'created_at']
    search_fields = ['user__username', 'gallery_image__news_post__title']
    raw_id_fields = ['gallery_image', 'user']


class NewsReactionAdmin(admin.ModelAdmin):
    list_display = ['news_post', 'user', 'reaction_type', 'created_at']
    list_filter = ['reaction_type', 'created_at']
    search_fields = ['user__username', 'news_post__title']
    raw_id_fields = ['news_post', 'user']


class GalleryCommentAdmin(admin.ModelAdmin):
    list_display = ['content_preview', 'author', 'gallery_image', 'is_approved', 'created_at']
    list_filter = ['is_approved', 'created_at']
    search_fields = ['content', 'author__username']
    raw_id_fields = ['parent', 'gallery_image']
    actions = ['approve_comments', 'disapprove_comments']

    def content_preview(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_preview.short_description = _('Comentariu')

    def approve_comments(self, request, queryset):
        queryset.update(is_approved=True)
    approve_comments.short_description = _('Aprobă comentariile selectate')

    def disapprove_comments(self, request, queryset):
        queryset.update(is_approved=False)
    disapprove_comments.short_description = _('Respinge comentariile selectate')


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


# NewsPost/gallery/comment admins were previously defined but never registered
# (News content only existed via the WordPress import script). Registering
# them here makes news creation/editing - and photo tagging - reachable from
# /admin/, mirroring how Video/DocumentPage are registered directly above.
admin.site.register(NewsPost, NewsPostAdmin)
admin.site.register(NewsPostGallery, NewsPostGalleryAdmin)
admin.site.register(NewsComment, NewsCommentAdmin)
admin.site.register(GalleryReaction, GalleryReactionAdmin)
admin.site.register(GalleryComment, GalleryCommentAdmin)
admin.site.register(NewsReaction, NewsReactionAdmin)