from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.urls import reverse
from django.conf import settings
from django_ckeditor_5.fields import CKEditor5Field  # Updated import
from django.utils.translation import gettext_lazy as _
from django.utils.text import slugify
from django.utils.html import strip_tags

class SEOModel(models.Model):
    """Abstract model for SEO fields"""
    meta_title = models.CharField(
        max_length=60, 
        blank=True, 
        help_text="SEO title (60 chars max). If empty, uses the main title."
    )
    meta_description = models.CharField(
        max_length=160, 
        blank=True, 
        help_text="SEO description (160 chars max)"
    )
    meta_keywords = models.CharField(
        max_length=255, 
        blank=True, 
        help_text="SEO keywords, separated by commas"
    )
    canonical_url = models.URLField(
        blank=True, 
        help_text="Canonical URL to avoid duplicate content"
    )
    robots_index = models.BooleanField(
        default=True, 
        help_text="Allow search engines to index this page"
    )
    robots_follow = models.BooleanField(
        default=True, 
        help_text="Allow search engines to follow links on this page"
    )
    
    class Meta:
        abstract = True
    
    def get_meta_title(self):
        return self.meta_title or getattr(self, 'title', '')
    
    def get_robots_content(self):
        index = 'index' if self.robots_index else 'noindex'
        follow = 'follow' if self.robots_follow else 'nofollow'
        return f'{index}, {follow}'

class NewsPost(SEOModel):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=255, unique=True, help_text="URL-friendly version of the title")
    content = CKEditor5Field('Content', config_name='extends')  # Updated field
    excerpt = CKEditor5Field('Excerpt', config_name='default', blank=True)  # Updated field
    featured_image = models.ImageField(upload_to='news/', blank=True, null=True)
    featured_image_alt = models.CharField(
        max_length=100, 
        blank=True, 
        help_text="Alt text for featured image (SEO)"
    )
    published = models.BooleanField(default=False)
    featured = models.BooleanField(default=False, help_text="Show on homepage")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE,
        limit_choices_to={'role': 'admin'},
        help_text="Only admin users can be authors"
    )
    tags = models.CharField(
        max_length=255,
        blank=True,
        help_text="Tags separated by commas"
    )
    tagged_athletes = models.ManyToManyField(
        'api.Athlete',
        blank=True,
        related_name='tagged_news',
        help_text="Athletes mentioned in this post - surfaced in their coach's feed",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Post')
        verbose_name_plural = _('Posts')

    def __str__(self):
        return self.title

    def _unique_slug(self, base):
        base_slug = slugify(base) or 'post'
        candidate = base_slug
        qs = NewsPost.objects.exclude(pk=self.pk) if self.pk else NewsPost.objects.all()
        suffix = 1
        while qs.filter(slug=candidate).exists():
            suffix += 1
            candidate = f'{base_slug}-{suffix}'
        return candidate

    def save(self, *args, **kwargs):
        # Auto-fill "Setări SEO" (and the slug) from the post's own
        # content instead of leaving admins to type them by hand:
        # - slug tracks the title live while the post is still a draft,
        #   then freezes the moment it's published so a live post's URL
        #   never changes under someone editing the title later.
        # - meta_title keeps tracking the title too (indefinitely - it's
        #   just the <title> tag, not a URL, so there's no breakage risk),
        #   but only while it wasn't manually set to something else.
        # - meta_description/meta_keywords fill once from the excerpt/
        #   content/tags when left blank, and are never overwritten once
        #   set, since they're not title-driven.
        old = NewsPost.objects.filter(pk=self.pk).first() if self.pk else None

        # Compare against the INCOMING (self) value, not old's own stored
        # value - otherwise a manual edit made in this very save (e.g. the
        # admin retypes meta_title in the same request as a title change)
        # gets silently clobbered by the "still auto-tracking" check below.
        if not self.slug or (old and not old.published and self.slug == old._unique_slug(old.title)):
            self.slug = self._unique_slug(self.title)

        if not self.meta_title or (old and self.meta_title == old.title[:60]):
            self.meta_title = self.title[:60]

        if not self.meta_description:
            source = strip_tags(self.excerpt or self.content or '').strip()
            source = ' '.join(source.split())
            if source:
                self.meta_description = (source[:157] + '…') if len(source) > 160 else source[:160]

        if not self.meta_keywords and self.tags:
            self.meta_keywords = self.tags[:255]

        super().save(*args, **kwargs)

    @property
    def like_count(self):
        return self.reactions.filter(reaction_type='like').count()

    @property
    def dislike_count(self):
        return self.reactions.filter(reaction_type='dislike').count()


def default_event_types():
    # Matches the old `event_type` field's `default='competition'` - code
    # across the codebase (signals, sync, scoring) already treats an Event
    # with no type specified as a competition.
    return ['competition']


class Event(SEOModel):
    SYNC_MODE_CHOICES = [
        ('cloud', _('Cloud')),
        ('local_event', _('Eveniment local')),
    ]
    LOCAL_SYNC_STATUS_CHOICES = [
        ('idle', _('Neexportat')),
        ('exported', _('Exportat local')),
        ('local_in_progress', _('În desfășurare local')),
        ('results_uploaded', _('Rezultate încărcate')),
        ('completed', _('Sincronizare finalizată')),
    ]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=255, unique=True, help_text="URL-friendly version of the title")
    description = CKEditor5Field('Description', config_name='extends', blank=True)  # Updated field
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    coach_registration_deadline = models.DateTimeField(
        blank=True,
        null=True,
        help_text='Deadline until coaches can complete competition centralizer data. Defaults to the event start date when left empty.'
    )
    address = models.TextField(blank=True, help_text="Full address of the event")
    # Use City model (from api app) as a selector instead of free-text 'location'
    city = models.ForeignKey(
        'api.City',
        on_delete=models.SET_NULL,
        related_name='events',
        blank=True,
        null=True,
        help_text='Select a city for this event'
    )
    # Set only for an exam a club coach created themselves (see
    # CompetitionViewSet.create_exam) - null for everything the federation
    # organizes/publishes. Lets the public calendar show federation events
    # only while club coaches and their athletes still see the exam in the
    # dashboards' own exam pickers (those query a different, authenticated
    # endpoint that doesn't filter on this field).
    organizing_club = models.ForeignKey(
        'api.Club',
        on_delete=models.SET_NULL,
        related_name='organized_events',
        blank=True,
        null=True,
        help_text='Set only for a club-organized exam - excluded from the public calendar.'
    )
    featured_image = models.ImageField(upload_to='events/', blank=True, null=True)
    featured_image_alt = models.CharField(
        max_length=100, 
        blank=True, 
        help_text="Alt text for featured image (SEO)"
    )
    is_featured = models.BooleanField(default=False, help_text="Show on homepage")
    # Type(s) of event: competition, examination, training seminar, etc. An
    # event can be more than one of these at once (e.g. a training seminar
    # that also includes grade examinations), so this is a list rather than
    # a single scalar choice.
    EVENT_TYPE_CHOICES = [
        ('competition', 'Competition'),
        ('examination', 'Examination'),
        ('training_seminar', 'Training Seminar'),
    ]
    event_types = models.JSONField(default=default_event_types, blank=True, help_text='Type(s) of event')

    def has_event_type(self, event_type):
        return event_type in (self.event_types or [])

    @staticmethod
    def type_query_value(event_type):
        """Value to filter with via `event_types__icontains=...`.

        JSONField's `contains` lookup (list-containment) needs Postgres and
        raises NotSupportedError on SQLite, which is what actually backs
        local dev/tests here - so "does this event have this type" is
        matched instead as a substring of the JSON-encoded list, which
        works identically on every backend. The values in
        EVENT_TYPE_CHOICES don't overlap as substrings of one another, so
        this can't false-positive-match a different type.
        """
        return f'"{event_type}"'

    @property
    def event_type(self):
        """Backward-compatible single-value accessor: the first configured
        type, or '' if none is set. Prefer `event_types`/`has_event_type()`
        in new code - this stays around so older read-only call sites
        (admin list_display, offline sync payloads, etc.) keep working."""
        types = self.event_types or []
        return types[0] if types else ''

    @event_type.setter
    def event_type(self, value):
        self.event_types = [value] if value else []
    STATUS_CHOICES = [
        ('upcoming', 'Upcoming'),
        ('ongoing', 'Ongoing'),
        ('past', 'Past'),
    ]
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default='upcoming',
        help_text='Operational status of the event'
    )
    is_publicly_visible = models.BooleanField(
        default=True,
        help_text='Show this event on the public site. Uncheck to keep it admin-only.'
    )
    sync_mode = models.CharField(
        max_length=20,
        choices=SYNC_MODE_CHOICES,
        default='cloud',
        help_text='Indică dacă evenimentul este administrat în cloud sau în modul local de competiție.'
    )
    sync_locked = models.BooleanField(
        default=False,
        help_text='Blochează modificările operaționale în cloud după exportul către serverul local al competiției.'
    )
    exported_to_local_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='Momentul în care evenimentul a fost exportat pentru operare locală.'
    )
    results_uploaded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='Momentul în care rezultatele locale au fost încărcate în cloud.'
    )
    sync_completed_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='Momentul în care sincronizarea locală a fost finalizată și evenimentul a revenit în cloud.'
    )
    local_sync_status = models.CharField(
        max_length=24,
        choices=LOCAL_SYNC_STATUS_CHOICES,
        default='idle',
        help_text='Starea fluxului de sincronizare cloud → local → cloud pentru acest eveniment.'
    )
    # registration fields removed (deprecated)
    price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    tags = models.CharField(
        max_length=255, 
        blank=True, 
        help_text="Tags separated by commas"
    )
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        ordering = ['start_date']
        verbose_name = _('Event')
        verbose_name_plural = _('Events')
    
    def __str__(self):
        return f"{self.title} - {self.start_date.strftime('%Y-%m-%d')}"

    def clean(self):
        if self.status == 'ongoing':
            exists = Event.objects.filter(status='ongoing').exclude(pk=self.pk).exists()
            if exists:
                raise ValidationError('Only one event can be ongoing at a time.')
    
    @property
    def is_upcoming(self):
        """Event hasn't started yet"""
        return self.start_date > timezone.now()
    
    @property
    def is_ongoing(self):
        """Event is currently happening"""
        now = timezone.now()
        return self.start_date <= now <= self.end_date
    
    @property
    def is_past(self):
        """Event has ended"""
        return self.end_date < timezone.now()

    @property
    def effective_coach_registration_deadline(self):
        return self.coach_registration_deadline or self.start_date

    @property
    def operational_lock_active(self):
        return bool(self.sync_locked)

    def mark_exported_to_local(self, exported_at=None):
        self.sync_mode = 'local_event'
        self.sync_locked = True
        self.local_sync_status = 'exported'
        self.exported_to_local_at = exported_at or timezone.now()
        self.results_uploaded_at = None
        self.sync_completed_at = None

    def mark_results_uploaded(self, uploaded_at=None):
        self.local_sync_status = 'results_uploaded'
        self.results_uploaded_at = uploaded_at or timezone.now()

    def mark_local_in_progress(self):
        self.local_sync_status = 'local_in_progress'

    def complete_local_sync(self, completed_at=None):
        self.local_sync_status = 'completed'
        self.sync_mode = 'cloud'
        self.sync_locked = False
        self.sync_completed_at = completed_at or timezone.now()

    def clear_local_lock(self):
        self.sync_locked = False
        if self.local_sync_status == 'completed':
            self.sync_mode = 'cloud'

class AboutSection(models.Model):
    section_title = models.CharField(max_length=100)
    content = CKEditor5Field('Content', config_name='extends')  # Updated field
    image = models.ImageField(upload_to='about/', blank=True, null=True)
    image_alt = models.CharField(
        max_length=100, 
        blank=True, 
        help_text="Alt text for image (SEO)"
    )
    order = models.IntegerField(default=0, help_text="Order in which sections appear")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        ordering = ['order', 'section_title']
        verbose_name = _('About Section')
        verbose_name_plural = _('About Sections')
    
    def __str__(self):
        return self.section_title

class Video(models.Model):
    """A YouTube/Vimeo video featured on the public site."""
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=255, unique=True, help_text="URL-friendly version of the title")
    url = models.URLField(
        help_text="Full YouTube or Vimeo video URL (e.g. https://www.youtube.com/watch?v=... or https://vimeo.com/...)"
    )
    thumbnail = models.ImageField(upload_to='videos/', blank=True, null=True)
    description = CKEditor5Field('Description', config_name='default', blank=True)
    published = models.BooleanField(default=False)
    featured = models.BooleanField(default=False, help_text="Show on homepage")
    tagged_athletes = models.ManyToManyField(
        'api.Athlete',
        blank=True,
        related_name='tagged_videos',
        help_text="Athletes tagged in this video - shown on their public profile and the Media page",
    )
    tagged_clubs = models.ManyToManyField(
        'api.Club',
        blank=True,
        related_name='tagged_videos',
        help_text="Clubs tagged in this video - shown on the club's public page and the Media page",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Video')
        verbose_name_plural = _('Videos')

    def __str__(self):
        return self.title


class DocumentPage(models.Model):
    """A downloadable/linkable document for the public site (e.g. the
    competition regulation, or official federation documents). Backs the
    'Regulament' and 'Documente' public nav items - both share this single
    model, distinguished by `category`, to avoid two near-duplicate models."""
    CATEGORY_CHOICES = [
        ('regulament', _('Regulament')),
        ('documente', _('Documente')),
    ]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=255, unique=True, help_text="URL-friendly version of the title")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='documente')
    description = CKEditor5Field('Description', config_name='default', blank=True)
    file = models.FileField(
        upload_to='documents/',
        blank=True,
        null=True,
        help_text="PDF or other downloadable document",
    )
    external_url = models.URLField(
        blank=True,
        help_text="Use instead of/alongside 'file' if the document is hosted elsewhere",
    )
    published = models.BooleanField(default=False)
    order = models.IntegerField(default=0, help_text="Order in which documents appear within their category")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'order', '-created_at']
        verbose_name = _('Document')
        verbose_name_plural = _('Documents')

    def __str__(self):
        return self.title


class ContactMessage(models.Model):
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    subject = models.CharField(max_length=200)
    message = models.TextField()
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    created_at = models.DateTimeField(default=timezone.now)
    is_read = models.BooleanField(default=False)
    is_replied = models.BooleanField(default=False)
    admin_notes = models.TextField(blank=True, help_text="Internal notes for staff")
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = _('Contact Message')
        verbose_name_plural = _('Contact Messages')
    
    def __str__(self):
        return f"{self.name} - {self.subject}"

class ContactInfo(models.Model):
    organization_name = models.CharField(max_length=200)
    address = models.TextField()
    phone = models.CharField(max_length=20)
    email = models.EmailField()
    website = models.URLField(blank=True)
    social_media_facebook = models.URLField(blank=True)
    social_media_instagram = models.URLField(blank=True)
    social_media_twitter = models.URLField(blank=True)
    business_hours = CKEditor5Field('Business Hours', config_name='default', blank=True)  # Updated field
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = _('Contact Information')
        verbose_name_plural = _('Contact Information')
    
    def __str__(self):
        return self.organization_name

class NewsPostGallery(models.Model):
    """Gallery images for news posts"""
    news_post = models.ForeignKey(
        NewsPost, 
        related_name='gallery_images', 
        on_delete=models.CASCADE
    )
    image = models.ImageField(upload_to='news/gallery/')
    alt_text = models.CharField(
        max_length=100, 
        blank=True, 
        help_text="Alt text for the image (SEO)"
    )
    caption = models.CharField(
        max_length=200, 
        blank=True, 
        help_text="Optional caption for the image"
    )
    order = models.IntegerField(
        default=0, 
        help_text="Order in which images appear in gallery"
    )
    tagged_athletes = models.ManyToManyField(
        'api.Athlete',
        blank=True,
        related_name='tagged_photos',
        help_text="Athletes tagged in this photo - shown on their public profile 'Poze' tab",
    )
    tagged_clubs = models.ManyToManyField(
        'api.Club',
        blank=True,
        related_name='tagged_photos',
        help_text="Clubs tagged in this photo - shown on the club's public 'Poze' tab",
    )
    created_at = models.DateTimeField(default=timezone.now)
    
    class Meta:
        ordering = ['order', 'created_at']
        verbose_name = _('Gallery Image')
        verbose_name_plural = _('Gallery Images')
    
    def __str__(self):
        return f"{self.news_post.title} - Image {self.order}"

    @property
    def like_count(self):
        return self.reactions.filter(reaction_type='like').count()

    @property
    def dislike_count(self):
        return self.reactions.filter(reaction_type='dislike').count()


class GalleryReaction(models.Model):
    """Like/dislike on a NewsPostGallery photo, Facebook-style. One reaction
    per user per photo (switching type just updates the row)."""
    REACTION_CHOICES = [
        ('like', 'Like'),
        ('dislike', 'Dislike'),
    ]
    gallery_image = models.ForeignKey(NewsPostGallery, related_name='reactions', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    reaction_type = models.CharField(max_length=10, choices=REACTION_CHOICES)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('gallery_image', 'user')
        verbose_name = _('Photo Reaction')
        verbose_name_plural = _('Photo Reactions')

    def __str__(self):
        return f"{self.user} {self.reaction_type}d photo #{self.gallery_image_id}"


class GalleryComment(models.Model):
    """Comments on a NewsPostGallery photo - mirrors NewsComment (threaded,
    auto-approved for staff/admin, moderatable)."""
    gallery_image = models.ForeignKey(NewsPostGallery, related_name='comments', on_delete=models.CASCADE)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField(max_length=1000, help_text="Comment content (1000 chars max)")
    parent = models.ForeignKey(
        'self', null=True, blank=True, related_name='replies', on_delete=models.CASCADE,
        help_text="Parent comment for threaded replies",
    )
    is_approved = models.BooleanField(default=True, help_text="Whether the comment is approved for display")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        verbose_name = _('Photo Comment')
        verbose_name_plural = _('Photo Comments')

    def __str__(self):
        return f"Comment by {self.author.username} on photo #{self.gallery_image_id}"

    @property
    def is_reply(self):
        return self.parent is not None

    def get_replies(self):
        return self.replies.filter(is_approved=True)


class NewsComment(models.Model):
    """Comments on news posts"""
    news_post = models.ForeignKey(
        NewsPost, 
        related_name='comments', 
        on_delete=models.CASCADE
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE
    )
    content = models.TextField(
        max_length=1000,
        help_text="Comment content (1000 chars max)"
    )
    parent = models.ForeignKey(
        'self', 
        null=True, 
        blank=True, 
        related_name='replies', 
        on_delete=models.CASCADE,
        help_text="Parent comment for threaded replies"
    )
    is_approved = models.BooleanField(
        default=True,
        help_text="Whether the comment is approved for display"
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = _('Comment')
        verbose_name_plural = _('Comments')
    
    def __str__(self):
        return f"Comment by {self.author.username} on {self.news_post.title}"
    
    @property
    def is_reply(self):
        return self.parent is not None

    def get_replies(self):
        return self.replies.filter(is_approved=True)


class NewsReaction(models.Model):
    """Like/dislike on a NewsPost article, Facebook-style. One reaction per
    user per post (switching type just updates the row) - mirrors
    GalleryReaction."""
    REACTION_CHOICES = [
        ('like', 'Like'),
        ('dislike', 'Dislike'),
    ]
    news_post = models.ForeignKey(NewsPost, related_name='reactions', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    reaction_type = models.CharField(max_length=10, choices=REACTION_CHOICES)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('news_post', 'user')
        verbose_name = _('Article Reaction')
        verbose_name_plural = _('Article Reactions')

    def __str__(self):
        return f"{self.user} {self.reaction_type}d {self.news_post.title}"


# Proxy models to create a separate admin "Contact" section without moving
# the underlying models or changing database tables. These proxies will be
# registered under the `contact` app label so the admin shows a separate
# heading for contact-related models.
class ContactInfoProxy(ContactInfo):
    class Meta:
        proxy = True
        # Now that we have a dedicated contact app, show these proxies under
        # the 'contact' app label so they appear as their own top-level admin app.
        app_label = 'contact'
        verbose_name = _('Contact Information')
        verbose_name_plural = _('Contact Information')


class ContactMessageProxy(ContactMessage):
    class Meta:
        proxy = True
        app_label = 'contact'
        verbose_name = _('Contact Message')
        verbose_name_plural = _('Contact Messages')