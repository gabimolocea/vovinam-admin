from django.db import models
from django.db.models import F
from django.core.exceptions import ValidationError
from django.contrib import admin
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from datetime import date, timedelta
import hashlib
import secrets
from urllib.parse import urlparse
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from django.utils.text import slugify
from .mixins import TimestampMixin, SyncMixin, SoftDeleteMixin, AuditMixin
from .managers import AthleteManager

# Create your models here.

class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('athlete', 'Athlete'),
        ('supporter', 'Supporter'),  # New role for parents/supporters
        ('user', 'User'),
    ]
    
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    
    # New fields for enhanced user management
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    # City removed - use athlete.city instead
    profile_completed = models.BooleanField(default=False)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']
    
    def save(self, *args, **kwargs):
        # Set admin role for superusers
        if self.is_superuser or self.is_staff:
            self.role = 'admin'
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.email})"
    
    @property
    def is_admin(self):
        return self.role == 'admin' or self.is_superuser or self.is_staff
    
    @property
    def is_athlete(self):
        return self.role == 'athlete'
    
    @property
    def is_referee(self):
        """User is referee if they're admin OR if they're an athlete with is_referee=True"""
        if self.is_admin:
            return True
        if self.is_athlete:
            try:
                return hasattr(self, 'athlete') and self.athlete and self.athlete.is_referee
            except:
                return False
        return False
    
    @property
    def is_supporter(self):
        return self.role == 'supporter'
    
    @property
    def has_pending_athlete_profile(self):
        """Check if user has a pending athlete profile"""
        try:
            return hasattr(self, 'athlete') and self.athlete and self.athlete.status == 'pending'
        except:
            return False
    
    @property
    def has_approved_athlete_profile(self):
        """Check if user has an approved athlete profile"""
        try:
            return hasattr(self, 'athlete') and self.athlete and self.athlete.status == 'approved'
        except:
            return False


class ApprovalWorkflowMixin:
    """Shared helper for status transitions used across approval-driven models."""

    class Meta:
        abstract = True

    def _transition_status(self, status, admin_user, notes='', *, set_notes=True, on_success=None):
        from django.utils import timezone

        self.status = status
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        if set_notes:
            self.admin_notes = notes
        self.save()

        if callable(on_success):
            on_success(self, status, admin_user, notes)

        return self

    def approve(self, admin_user, notes=''):
        return self._transition_status('approved', admin_user, notes)

    def reject(self, admin_user, notes=''):
        return self._transition_status('rejected', admin_user, notes)

    def request_revision(self, admin_user, notes=''):
        return self._transition_status('revision_required', admin_user, notes)


# Proxy model so the custom User appears under Django's 'auth' app section in admin
class UserProxy(User):
    class Meta:
        proxy = True
        app_label = 'auth'
        verbose_name = _('User')
        verbose_name_plural = _('Users')
    
    @property
    def has_pending_athlete_profile(self):
        return hasattr(self, 'athlete') and self.athlete is not None and self.athlete.status == 'pending'
    
    @property
    def has_approved_athlete_profile(self):
        return hasattr(self, 'athlete') and self.athlete is not None and self.athlete.status == 'approved'


# Proxy model to show the landing Event under the API section in Django admin
try:
    # Import here to avoid circular import issues during migrations
    from landing.models import Event as LandingEvent

    class _LegacyEventManager(models.Manager):
        event_type = None

        def get_queryset(self):
            qs = super().get_queryset()
            if self.event_type:
                qs = qs.filter(event_type=self.event_type)
            return qs

        def create(self, **kwargs):
            kwargs = kwargs.copy()
            if 'name' in kwargs and 'title' not in kwargs:
                kwargs['title'] = kwargs.pop('name')
            if 'place' in kwargs and 'address' not in kwargs:
                kwargs['address'] = kwargs.pop('place')

            title = kwargs.get('title') or 'event'
            kwargs.setdefault('slug', slugify(title) or f'event-{secrets.token_hex(4)}')

            if 'start_date' not in kwargs:
                kwargs['start_date'] = timezone.now()
            if 'end_date' not in kwargs:
                kwargs['end_date'] = kwargs['start_date'] + timedelta(days=1)

            kwargs.setdefault('event_type', self.event_type)
            return super().create(**kwargs)

    class Event(LandingEvent):
        class Meta:
            proxy = True
            app_label = 'api'
            verbose_name = _('Event')
            verbose_name_plural = _('Events')


    class Competition(Event):
        objects = _LegacyEventManager()
        objects.event_type = 'competition'

        class Meta:
            proxy = True
            app_label = 'api'
            verbose_name = _('Competition')
            verbose_name_plural = _('Competitions')

        @property
        def name(self):
            return self.title

        @name.setter
        def name(self, value):
            self.title = value


    class _TrainingSeminarAthletesRelation:
        def __init__(self, seminar):
            self.seminar = seminar

        def add(self, *athletes):
            for athlete in athletes:
                participation, created = TrainingSeminarParticipation.objects.get_or_create(
                    athlete=athlete,
                    event=self.seminar,
                    defaults={
                        'seminar': self.seminar,
                        'submitted_by_athlete': False,
                    },
                )
                update_fields = []
                if participation.seminar_id != self.seminar.id:
                    participation.seminar = self.seminar
                    update_fields.append('seminar')
                if created is False and participation.event_id != self.seminar.id:
                    participation.event = self.seminar
                    update_fields.append('event')
                if update_fields:
                    participation.save(update_fields=update_fields)

        def all(self):
            return Athlete.objects.filter(seminar_participations__event=self.seminar).distinct()


    class TrainingSeminar(Event):
        objects = _LegacyEventManager()
        objects.event_type = 'training_seminar'

        class Meta:
            proxy = True
            app_label = 'api'
            verbose_name = _('Training seminar')
            verbose_name_plural = _('Training seminars')

        @property
        def name(self):
            return self.title

        @name.setter
        def name(self, value):
            self.title = value

        @property
        def place(self):
            return self.address

        @place.setter
        def place(self, value):
            self.address = value

        @property
        def athletes(self):
            return _TrainingSeminarAthletesRelation(self)
except Exception:
    # During some migration or import-time operations the landing app
    # may not be fully importable; silently skip proxy creation in that case.
    pass


class DiplomaTemplate(models.Model):
    TEMPLATE_KIND_CHOICES = [
        ('first_place', 'Locul 1'),
        ('second_place', 'Locul 2'),
        ('third_place', 'Locul 3'),
        ('participation', 'Participare'),
    ]
    CATEGORY_SCOPE_CHOICES = [
        ('all', 'Toate categoriile'),
        ('solo', 'Solo'),
        ('team', 'Echipă'),
        ('fight', 'Luptă'),
    ]
    PREVIEW_ORIENTATION_CHOICES = [
        ('landscape', 'Landscape'),
        ('portrait', 'Portrait'),
    ]

    event = models.ForeignKey('landing.Event', on_delete=models.CASCADE, related_name='diploma_templates')
    title = models.CharField(max_length=120)
    template_kind = models.CharField(max_length=20, choices=TEMPLATE_KIND_CHOICES)
    category_scope = models.CharField(max_length=12, choices=CATEGORY_SCOPE_CHOICES, default='all')
    pdf_file = models.FileField(upload_to='diploma_templates/')
    preview_orientation = models.CharField(max_length=12, choices=PREVIEW_ORIENTATION_CHOICES, default='landscape')
    placements = models.JSONField(default=list, blank=True, help_text='Listă de câmpuri poziționate pe diploma PDF.')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['event_id', 'category_scope', 'template_kind', 'id']
        unique_together = ('event', 'template_kind', 'category_scope')

    def __str__(self):
        return f"{self.event.title} - {self.get_template_kind_display()} - {self.get_category_scope_display()}"

class City(models.Model):
    name = models.CharField(max_length=100, unique=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
    
class Club(models.Model):
    name = models.CharField(max_length=100, unique=True)
    logo = models.ImageField(upload_to='club_logos/', blank=True, null=True)  # Optional logo field
    city = models.ForeignKey(
        City, 
        on_delete=models.SET_NULL,  # Changed from CASCADE to SET_NULL for data safety
        related_name='clubs',
        blank=True,
        null=True
    )
    address = models.TextField(blank=True, null=True)
    mobile_number = models.CharField(max_length=15, blank=True, null=True)
    website = models.URLField(max_length=200, blank=True, null=True)
    coaches = models.ManyToManyField(
        'Athlete', 
        related_name='coached_clubs', 
        blank=True
    )  # Replace coach field with ManyToManyField to Athlete
    display_order = models.IntegerField(default=0, help_text='Order for display in centralizator')
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name

class Grade(models.Model):
    GRADE_TYPE_CHOICES = [
        ('inferior', 'Inferior Grade'),
        ('superior', 'Superior Grade'),
    ]

    name = models.CharField(max_length=100)
    rank_order = models.IntegerField(default=0)  # Rank order for grades (higher value = higher rank)
    grade_type = models.CharField(max_length=10, choices=GRADE_TYPE_CHOICES, default='inferior')  # Type of grade
    image = models.ImageField(upload_to='grades/', blank=True, null=True, help_text='Grade badge image (SVG or PNG)')
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} (Rank: {self.rank_order}, Type: {self.get_grade_type_display()})"


class Title(models.Model):
    name = models.CharField(max_length=100, unique=True)  # Title name

    def __str__(self):
        return self.name


class FederationRole(models.Model):
    name = models.CharField(max_length=100, unique=True)  # Federation role name

    def __str__(self):
        return self.name


class Athlete(TimestampMixin, SyncMixin, SoftDeleteMixin, AuditMixin, ApprovalWorkflowMixin, models.Model):
    """
    Unified Athlete model that handles both pending and approved athletes.
    Replaces the separate AthleteProfile system for simplified workflow.
    Enhanced with: timestamps, sync tracking, soft delete, and audit trail.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]

    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
    ]
    
    # Custom manager for optimized queries
    objects = AthleteManager()
    
    # Link to User account - required for new athletes
    user = models.OneToOneField(User, on_delete=models.SET_NULL, related_name='athlete', blank=True, null=True)
    
    # Personal Data
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    license_series = models.CharField(max_length=50, blank=True, null=True)
    cnp = models.CharField(max_length=13, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    team_place = models.CharField(max_length=50, blank=True, null=True)  # Place awarded to the athlete in a team competition
    address = models.TextField(blank=True, null=True)
    mobile_number = models.CharField(max_length=15, blank=True, null=True)
    
    # Emergency Contact Information (from AthleteProfile)
    emergency_contact_name = models.CharField(max_length=100, blank=True, null=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True, null=True)
    
    # Previous Experience (from AthleteProfile)
    previous_experience = models.TextField(blank=True, null=True, help_text="Previous martial arts experience")
    
    # Sport-related data
    club = models.ForeignKey(
        'Club',
        on_delete=models.SET_NULL,
        related_name='athletes',
        blank=True,
        null=True
    )
    city = models.ForeignKey(
        'City',
        on_delete=models.SET_NULL,
        related_name='athletes',
        blank=True,
        null=True
    )
    current_grade = models.ForeignKey(
        Grade,
        on_delete=models.SET_NULL,
        related_name='current_athletes',
        blank=True,
        null=True
    )  # Automatically set based on GradeHistory
    federation_role = models.ForeignKey(
        'FederationRole',
        on_delete=models.SET_NULL,
        related_name='athletes',
        blank=True,
        null=True
    )
    title = models.ForeignKey(
        'Title',
        on_delete=models.SET_NULL,
        related_name='athletes',
        blank=True,
        null=True
    )
    registered_date = models.DateField(blank=True, null=True)
    expiration_date = models.DateField(blank=True, null=True)
    is_coach = models.BooleanField(default=False)
    is_referee = models.BooleanField(default=False)
    
    # Documents
    profile_image = models.ImageField(
        upload_to='profile_images/', blank=True, null=True, default='profile_images/default.png'
    )  # Optional profile image with default
    medical_certificate = models.FileField(upload_to='medical_certificates/', blank=True, null=True)
    
    # Approval workflow (merged from AthleteProfile)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='reviewed_athletes')
    admin_notes = models.TextField(blank=True, null=True, help_text="Admin notes about approval/rejection")
    
    # Legacy approval tracking (keep for compatibility)
    approved_date = models.DateTimeField(blank=True, null=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='approved_athletes')

    class Meta:
        indexes = [
            # Existing indexes (keep these)
            models.Index(fields=['club', 'status']),
            models.Index(fields=['current_grade']),
            models.Index(fields=['is_coach']),
            models.Index(fields=['is_referee']),
            models.Index(fields=['status', 'submitted_date']),
            
            # ADD THESE NEW INDEXES:
            models.Index(fields=['user']),  # For reverse user lookup
            models.Index(fields=['city']),  # For city filtering
            models.Index(fields=['registered_date']),  # For date range queries
            models.Index(fields=['created_at']),  # For ordering by creation date
            
            # Compound indexes for common filter combinations
            models.Index(fields=['club', 'is_coach']),  # Club coaches
            models.Index(fields=['club', 'status', 'is_referee']),  # Club referees
            models.Index(fields=['status', 'approved_date']),  # Status filtering
        ]

    def update_current_grade(self):
        """
        Automatically set the current_grade to the grade with the highest rank_order from GradeHistory.
        """
        highest_grade = self.grade_history.order_by('-grade__rank_order').first()
        self.current_grade = highest_grade.grade if highest_grade else None
        self.save()
    
    @property
    def is_pending(self):
        """Check if athlete is pending approval"""
        return self.status == 'pending'
    
    @property
    def is_approved(self):
        """Check if athlete is approved"""
        return self.status == 'approved'
    
    @property
    def is_rejected(self):
        """Check if athlete is rejected"""
        return self.status == 'rejected'
    
    @property
    def needs_revision(self):
        """Check if athlete profile needs revision"""
        return self.status == 'revision_required'
    
    def approve(self, admin_user):
        """Approve the athlete profile"""
        self.approved_date = timezone.now()  # Legacy field
        self.approved_by = admin_user  # Legacy field
        self._transition_status('approved', admin_user, set_notes=False)
    
    def reject(self, admin_user, reason=None):
        """Reject the athlete profile"""
        self._transition_status('rejected', admin_user, reason, set_notes=bool(reason))
    
    def request_revision(self, admin_user, reason=None):
        """Request revision of the athlete profile"""
        self._transition_status('revision_required', admin_user, reason, set_notes=bool(reason))
    
    def resubmit(self):
        """Resubmit profile after revision"""
        from django.utils import timezone
        
        self.status = 'pending'
        self.submitted_date = timezone.now()
        self.reviewed_date = None
        self.reviewed_by = None
        self.save()

    def enrolled_competitions_and_categories(self):
        """
        Retrieve the competitions and categories where the athlete has been enrolled.
        """
        enrolled_categories = self.categories.all()  # Categories where the athlete is enrolled
        competitions = {category.competition for category in enrolled_categories}  # Extract competitions from categories

        return {
            "competitions": competitions,
            "categories": enrolled_categories,
        }
    
    def get_teams(self):
        """
        Retrieve the teams the athlete is part of.
        """
        return Team.objects.filter(members__athlete=self)
    
    @property
    def can_edit_profile(self):
        """Check if athlete can edit their own profile"""
        return self.user is not None
    
    @property
    def can_add_results(self):
        """Check if athlete can add competition results"""
        return self.user is not None and self.approved_date is not None
    
    def __str__(self):
        club_name = f", {self.club.name}" if self.club else ""
        return f"{self.first_name} {self.last_name}{club_name}"


class GradeHistory(ApprovalWorkflowMixin, models.Model):
    LEVEL_CHOICES = [
        ('good', 'Good'),
        ('bad', 'Bad'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]

    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='grade_history')
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE)
    obtained_date = models.DateField(default=date.today)  # Date when the grade was obtained
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='good')  # Dropdown for level
    # Link GradeHistory to an Event (optional). Use landing.Event model which is part of the landing app.
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grade_histories',
        help_text='Optional event associated with this grade exam'
    )
    # exam_place removed
    # New explicit examiners: allow selecting from all athletes
    examiner_1 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grades_as_examiner1'
    )
    examiner_2 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='grades_as_examiner2'
    )
    # President field removed; not used anymore
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    certificate_image = models.ImageField(upload_to='grade_certificates/', null=True, blank=True, help_text='Grade certificate photo')
    result_document = models.FileField(upload_to='grade_documents/', null=True, blank=True, help_text='Official grade document')
    notes = models.TextField(blank=True, null=True, help_text='Additional notes about the grading exam')
    
    # Approval workflow fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', help_text='Approval status (defaults to approved for admin submissions)')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_grades')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')

    class Meta:
        indexes = [
            models.Index(fields=['athlete', 'status']),
            models.Index(fields=['obtained_date']),
            models.Index(fields=['status', 'submitted_date']),
        ]

    def __str__(self):
        if self.submitted_by_athlete:
            return f"{self.grade.name} for {self.athlete.first_name} {self.athlete.last_name} (Self-submitted: {self.status})"
        return f"{self.grade.name} for {self.athlete.first_name} {self.athlete.last_name} on {self.obtained_date}"
    
    def save(self, *args, **kwargs):
        # If submitted by athlete/coach, keep it pending by default on create.
        if not self.pk:
            if self.submitted_by_athlete:
                self.status = 'pending'
            elif not self.status:
                self.status = 'approved'
        super().save(*args, **kwargs)

    def clean(self):
        """Validate that examiners (if provided) are marked as coaches."""
        errors = {}
        if self.examiner_1 is not None and not getattr(self.examiner_1, 'is_coach', False):
            errors['examiner_1'] = 'Examiner 1 must be an athlete with is_coach=True.'
        if self.examiner_2 is not None and not getattr(self.examiner_2, 'is_coach', False):
            errors['examiner_2'] = 'Examiner 2 must be an athlete with is_coach=True.'
        # Prevent duplicate grade submissions for same athlete+grade
        try:
            if getattr(self, 'athlete', None) and getattr(self, 'grade', None):
                qs = GradeHistory.objects.filter(athlete=self.athlete, grade=self.grade)
                if self.pk:
                    qs = qs.exclude(pk=self.pk)
                if qs.exists():
                    errors['grade'] = 'An entry for this athlete and grade already exists.'
        except Exception:
            # If GradeHistory isn't fully available yet (migration timings), skip duplicate check
            pass
        if errors:
            raise ValidationError(errors)

    def delete(self, *args, **kwargs):
        """Delete the grade history entry."""
        super().delete(*args, **kwargs)
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted grade"""
        self._transition_status('approved', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_grade_status(status, actor, message))

    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted grade"""
        self._transition_status('rejected', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_grade_status(status, actor, message))

    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted grade"""
        self._transition_status('revision_required', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_grade_status(status, actor, message))

    def _notify_grade_status(self, status, admin_user, notes):
        from .notification_utils import create_grade_status_notification
        create_grade_status_notification(self, status, admin_user, notes)


# Yearly Medical Visa



# Unified Visa model (new) - covers both medical and annual visas.
class Visa(models.Model):
    VISA_TYPE_CHOICES = [
        ('medical', 'Medical'),
        ('annual', 'Annual'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]

    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='visas')
    visa_type = models.CharField(max_length=10, choices=VISA_TYPE_CHOICES)
    issued_date = models.DateField(blank=True, null=True)

    # Fields that may be used for either type
    document = models.FileField(upload_to='visa_documents/', null=True, blank=True)
    image = models.ImageField(upload_to='visa_images/', null=True, blank=True)
    notes = models.TextField(blank=True, null=True)

    # Medical-specific status (optional)
    health_status = models.CharField(max_length=10, choices=[('approved','Approved'),('denied','Denied')], null=True, blank=True)
    # Annual-specific cached status
    visa_status = models.CharField(max_length=15, blank=True, null=True)

    # Approval workflow
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_visas')
    admin_notes = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = _('Visa')
        verbose_name_plural = _('Visas')
        unique_together = ['athlete', 'visa_type', 'issued_date']
        indexes = [
            models.Index(fields=['athlete', 'visa_type', 'issued_date']),
            models.Index(fields=['athlete', 'visa_type', '-issued_date']),
        ]

    def is_valid(self):
        """Return whether the visa is currently valid depending on type."""
        if not self.issued_date:
            return False
        if self.visa_type == 'medical':
            expiration = self.issued_date + timedelta(days=180)
        else:
            expiration = self.issued_date + timedelta(days=365)
        return date.today() <= expiration

    def save(self, *args, **kwargs):
        # Set default status based on submission origin
        if getattr(self, 'submitted_by_athlete', False) and not self.pk:
            self.status = 'pending'
        elif not getattr(self, 'submitted_by_athlete', False):
            self.status = 'approved'

        # Update visa_status depending on visa type
        if self.visa_type == 'annual':
            if self.issued_date:
                self.visa_status = 'Valid' if self.is_valid() else 'Expired'
            else:
                self.visa_status = 'Not available'
        elif self.visa_type == 'medical':
            # If health_status explicitly approved, mark as Valid regardless
            if self.health_status == 'approved':
                self.visa_status = 'Valid'
            elif self.issued_date:
                self.visa_status = 'Valid' if self.is_valid() else 'Expired'
            else:
                self.visa_status = 'Not available'

        super().save(*args, **kwargs)

    def __str__(self):
        status = 'Valid' if self.is_valid() else 'Expired'
        return f"{self.get_visa_type_display()} Visa for {self.athlete} - {status}"


# Training Seminars
class TrainingSeminarParticipation(ApprovalWorkflowMixin, models.Model):
    """
    Athlete participation in events (training seminars, competitions, etc.) with approval workflow.
    Migrated from TrainingSeminar to use Event model directly.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='seminar_participations')
    # Legacy seminar field - deprecated, use event instead
    seminar = models.ForeignKey('landing.Event', on_delete=models.SET_NULL, related_name='legacy_participations', null=True, blank=True)
    # Primary event field
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='seminar_participations',
        help_text='Event this athlete participated in'
    )
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    participation_certificate = models.ImageField(upload_to='seminar_certificates/', null=True, blank=True, help_text='Participation certificate photo')
    participation_document = models.FileField(upload_to='seminar_documents/', null=True, blank=True, help_text='Official participation document')
    notes = models.TextField(blank=True, null=True, help_text='Additional notes about participation')
    
    # Approval workflow fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', help_text='Approval status (defaults to approved for admin submissions)')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_seminar_participations')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')
    
    class Meta:
        unique_together = ('athlete', 'event')
        verbose_name = _('Event participation')
        verbose_name_plural = _('Event participations')
        indexes = [
            models.Index(fields=['athlete', 'status']),
            models.Index(fields=['status', 'submitted_date']),
        ]
    
    def __str__(self):
        # Use event if available, fallback to legacy seminar
        target_name = None
        if self.event:
            target_name = self.event.title
        elif self.seminar:
            target_name = self.seminar.title
        else:
            target_name = 'Unknown Event'

        if self.submitted_by_athlete:
            return f"{self.athlete.first_name} {self.athlete.last_name} - {target_name} (Self-submitted: {self.status})"
        return f"{self.athlete.first_name} {self.athlete.last_name} - {target_name}"
    
    def save(self, *args, **kwargs):
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
        super().save(*args, **kwargs)
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted seminar participation"""
        self._transition_status('approved', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_seminar_status(status, actor, message))

    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted seminar participation"""
        self._transition_status('rejected', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_seminar_status(status, actor, message))

    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted seminar participation"""
        self._transition_status('revision_required', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_seminar_status(status, actor, message))

    def _notify_seminar_status(self, status, admin_user, notes):
        from .notification_utils import create_seminar_status_notification
        create_seminar_status_notification(self, status, admin_user, notes)


# Proxy model to present TrainingSeminarParticipation as EventParticipation
# in the admin and API surface without changing the underlying table.
class EventParticipation(TrainingSeminarParticipation):
    class Meta:
        proxy = True
        verbose_name = 'Event participation'
        verbose_name_plural = 'Event participations'

class CategoryAthlete(models.Model):
    """
    Through model for the many-to-many relationship between Category and Athlete.
    """
    PLACE_CHOICES = [
        (1, '1st Place'),
        (2, '2nd Place'),
        (3, '3rd Place'),
    ]
    
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name="enrolled_athletes")
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE)
    weight = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)  # Weight in kilograms
    place = models.PositiveSmallIntegerField(choices=PLACE_CHOICES, null=True, blank=True, help_text='Award placement (auto-calculated from total score)')
    disqualified = models.BooleanField(default=False, help_text='Mark as disqualified')
    
    # Referee scores for solo categories
    ref1_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF1', help_text='Referee 1 score')
    ref2_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF2', help_text='Referee 2 score')
    ref3_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF3', help_text='Referee 3 score')
    ref4_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF4', help_text='Referee 4 score')
    ref5_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF5', help_text='Referee 5 score')
    
    @property
    def total_score(self):
        """Calculate total score excluding highest and lowest referee scores"""
        from decimal import Decimal
        scores = [s for s in [self.ref1_score, self.ref2_score, self.ref3_score, self.ref4_score, self.ref5_score] if s is not None]
        if len(scores) < 3:
            return None
        scores.sort()
        # Remove highest and lowest, sum the rest
        return sum(scores[1:-1])
    
    @property
    def scores_with_markup(self):
        """Return scores with highest/lowest marked for strikethrough"""
        scores = [
            (self.ref1_score, 'ref1'),
            (self.ref2_score, 'ref2'),
            (self.ref3_score, 'ref3'),
            (self.ref4_score, 'ref4'),
            (self.ref5_score, 'ref5')
        ]
        valid_scores = [(s, n) for s, n in scores if s is not None]
        if len(valid_scores) < 3:
            return scores
        
        sorted_scores = sorted(valid_scores, key=lambda x: x[0])
        lowest = sorted_scores[0][1]
        highest = sorted_scores[-1][1]
        
        return [(s, n, n == lowest or n == highest) for s, n in scores]

    class Meta:
        unique_together = ('category', 'athlete')  # Ensure an athlete cannot be added twice to the same category
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['athlete']),
            models.Index(fields=['category', 'disqualified']),
        ]

    def delete(self, *args, **kwargs):
        """
        Override the delete method to remove the result from the database.
        """
        # Perform any additional cleanup if needed
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.athlete.first_name} {self.athlete.last_name} in {self.category.name} (Weight: {self.weight} kg)"
    
           
class CategoryTeam(models.Model):
    """
    Through model for the many-to-many relationship between Category and Team.
    """
    PLACE_CHOICES = [
        (1, '1st Place'),
        (2, '2nd Place'),
        (3, '3rd Place'),
    ]
    
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='enrolled_teams')
    team = models.ForeignKey('Team', on_delete=models.CASCADE, related_name='enrolled_categories')  # Rename related_name
    place = models.PositiveSmallIntegerField(choices=PLACE_CHOICES, null=True, blank=True, help_text='Award placement (auto-calculated from total score)')
    disqualified = models.BooleanField(default=False, help_text='Mark as disqualified')
    
    # Referee scores for team categories
    ref1_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF1', help_text='Referee 1 score')
    ref2_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF2', help_text='Referee 2 score')
    ref3_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF3', help_text='Referee 3 score')
    ref4_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF4', help_text='Referee 4 score')
    ref5_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='REF5', help_text='Referee 5 score')
    
    @property
    def total_score(self):
        """Calculate total score excluding highest and lowest referee scores"""
        from decimal import Decimal
        scores = [s for s in [self.ref1_score, self.ref2_score, self.ref3_score, self.ref4_score, self.ref5_score] if s is not None]
        if len(scores) < 3:
            return None
        scores.sort()
        # Remove highest and lowest, sum the rest
        return sum(scores[1:-1])
    
    @property
    def scores_with_markup(self):
        """Return scores with highest/lowest marked for strikethrough"""
        scores = [
            (self.ref1_score, 'ref1'),
            (self.ref2_score, 'ref2'),
            (self.ref3_score, 'ref3'),
            (self.ref4_score, 'ref4'),
            (self.ref5_score, 'ref5')
        ]
        valid_scores = [(s, n) for s, n in scores if s is not None]
        if len(valid_scores) < 3:
            return scores
        
        sorted_scores = sorted(valid_scores, key=lambda x: x[0])
        lowest = sorted_scores[0][1]
        highest = sorted_scores[-1][1]
        
        return [(s, n, n == lowest or n == highest) for s, n in scores]

    class Meta:
        unique_together = ('category', 'team')  # Ensure a team cannot be added twice to the same category
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['team']),
        ]

    def __str__(self):
        category = self.category
        group = category.group if category else None
        event = category.event if category else None
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'No Competition'
        return (
            f"{self.team.name} - "
            f"{category.name} - {group_name} - {event_title}"
        )


def _format_team_member_names(athletes, limit=3):
    athletes = list(athletes or [])
    if not athletes:
        return ''

    visible = athletes[:limit]
    names = [f"{athlete.first_name} {athlete.last_name}".strip() for athlete in visible]
    names = [name for name in names if name]
    if not names:
        return ''

    if len(names) == 1:
        base = names[0]
    elif len(names) == 2:
        base = ' & '.join(names)
    else:
        base = ' & '.join(names)

    extra_count = max(0, len(athletes) - limit)
    if extra_count:
        base += f" (+{extra_count})"
    return base


def build_team_display_name(athletes, limit=3):
    athletes = [athlete for athlete in list(athletes or []) if athlete is not None]
    if not athletes:
        return None

    return _format_team_member_names(athletes, limit=limit)


def get_team_members_with_related(team):
    prefetched_members = getattr(team, '_prefetched_objects_cache', {}).get('members')
    if prefetched_members is not None:
        return [member for member in prefetched_members if getattr(member, 'athlete_id', None)]

    return list(team.members.select_related('athlete', 'athlete__club').all())


class Team(models.Model):
    """
    Represents a team of athletes.
    Team name is stored in database but auto-generated from members for consistency.
    """
    name = models.CharField(max_length=255, default='Team')  # Will be overridden by property
    categories = models.ManyToManyField(
        'Category',
        through='CategoryTeam',  # Use the existing through model
        related_name='team_categories',
        blank=True,
        limit_choices_to={'type': 'teams'},  # Only allow categories with type 'teams'
    )

    @property
    def name(self):
        """Auto-generate team display name from members."""
        members = get_team_members_with_related(self)
        if not members:
            return f"Team #{self.pk}"
        athlete_members = [member.athlete for member in members if member.athlete_id]
        return build_team_display_name(athlete_members) or f"Team #{self.pk}"

    def __str__(self):
        """Display team with member names for clarity"""
        return self.name


class TeamMember(models.Model):
    """
    Represents a member of a team.
    """
    team = models.ForeignKey('Team', on_delete=models.CASCADE, related_name='members')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='team_members')

    class Meta:
        unique_together = ('team', 'athlete')  # Ensure an athlete cannot be added twice to the same team

    def __str__(self):
        club_name = f", {self.athlete.club.name}" if self.athlete.club else ""
        return f"{self.athlete.first_name} {self.athlete.last_name}{club_name}"


class Category(models.Model):
    def __init__(self, *args, **kwargs):
        competition = kwargs.pop('competition', None)
        super().__init__(*args, **kwargs)
        if competition is not None and getattr(self, 'event_id', None) is None:
            self.event = competition

    @property
    def type(self):
        """Return the type of category as a string: 'solo', 'team', or 'fight' based on subclass."""
        if hasattr(self, 'solocategory'):
            return 'solo'
        if hasattr(self, 'teamcategory'):
            return 'team'
        if hasattr(self, 'fightcategory'):
            return 'fight'
        return 'unknown'
    """
    Base category model using multi-table inheritance.
    Specific category types (Solo, Team, Fight) extend this model.
    """
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('mixt', 'Mixt'),
    ]
    
    category_number = models.CharField(max_length=50, blank=True, null=True, help_text='Unique identifier for this category (e.g., C1, C2, SOLO-M-1)')
    name = models.CharField(max_length=100)
    event = models.ForeignKey('landing.Event', on_delete=models.CASCADE, related_name='categories', null=True, blank=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, default='mixt')
    
    # M2M relationships shared across all types - defined here but used by child classes
    athletes = models.ManyToManyField('Athlete', through='CategoryAthlete', related_name='categories', blank=True)
    teams = models.ManyToManyField('Team', through='CategoryTeam', related_name='category_teams', blank=True)
    
    group = models.ForeignKey(
        'Group',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='categories'
    )
    birth_year_start = models.IntegerField(
        null=True, blank=True,
        help_text="Optional sub-range start (oldest birth year). Used for fight categories within a group."
    )
    birth_year_end = models.IntegerField(
        null=True, blank=True,
        help_text="Optional sub-range end (newest birth year). Used for fight categories within a group."
    )
    display_order = models.IntegerField(default=0, help_text="Order within the group for display purposes")

    class Meta:
        indexes = [
            models.Index(fields=['event']),
        ]
        ordering = ['display_order', 'id']
        verbose_name_plural = 'Categories'

    def __str__(self):
        associated = getattr(self, 'event', None) or getattr(self, 'competition', None)
        assoc_name = None
        if associated is not None:
            assoc_name = getattr(associated, 'name', None) or getattr(associated, 'title', None)
        return f"{self.name} ({assoc_name or 'N/A'})"

    @property
    def event_or_competition(self):
        """Return linked Event or fallback to legacy Competition"""
        if getattr(self, 'event', None):
            return self.event
        return getattr(self, 'competition', None)

    @property
    def competition(self):
        return self.event

    @competition.setter
    def competition(self, value):
        self.event = value
    
    def _generate_category_number(self):
        """Auto-generate category number based on type and gender"""
        # Determine category type by checking class name
        class_name = self.__class__.__name__.lower()
        
        if 'solo' in class_name:
            prefix = 'S' if self.gender == 'male' else ('SF' if self.gender == 'female' else 'SM')
        elif 'team' in class_name:
            prefix = 'T' if self.gender == 'male' else ('TF' if self.gender == 'female' else 'TM')
        elif 'fight' in class_name:
            prefix = 'F' if self.gender == 'male' else ('FF' if self.gender == 'female' else 'FM')
        else:
            prefix = 'C'
        
        # Find the highest existing number with this prefix
        import re
        existing = Category.objects.filter(
            category_number__startswith=prefix
        ).exclude(id=self.id if self.id else None).values_list('category_number', flat=True)
        
        max_num = 0
        for num_str in existing:
            match = re.search(r'\d+$', num_str)
            if match:
                max_num = max(max_num, int(match.group()))
        
        return f"{prefix}{max_num + 1}"
    
    def save(self, *args, **kwargs):
        """Auto-generate category_number if not provided"""
        if not self.category_number:
            self.category_number = self._generate_category_number()
        super().save(*args, **kwargs)


class SoloCategory(Category):
    """
    Solo competition category - individual athletes compete.
    Athletes enrolled via CategoryAthlete M2M (inherited from Category).
    """
    # Individual awards
    first_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='solo_first_place_categories')
    second_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='solo_second_place_categories')
    third_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='solo_third_place_categories')

    class Meta:
        verbose_name = 'Solo Category'
        verbose_name_plural = 'Solo Categories'

    def clean(self):
        """Validate awards are enrolled athletes"""
        awarded = [self.first_place, self.second_place, self.third_place]
        awarded = list(filter(None, awarded))
        
        if len(set(awarded)) != len(awarded):
            raise ValidationError("The same athlete cannot be awarded multiple times.")
        
        for athlete in awarded:
            if athlete and not self.athletes.filter(pk=athlete.pk).exists():
                raise ValidationError(f"Athlete '{athlete}' must be enrolled to be awarded.")

    def calculate_athlete_scores(self):
        """Calculate total scores for each athlete"""
        athlete_scores = {}
        for score in self.athlete_scores.all():
            athlete_scores[score.athlete] = athlete_scores.get(score.athlete, 0) + score.score
        return athlete_scores


class TeamCategory(Category):
    """
    Team competition category - teams of athletes compete.
    Teams enrolled via CategoryTeam M2M (inherited from Category).
    """
    # Team awards
    first_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='first_place_team_categories')
    second_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='second_place_team_categories')
    third_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='third_place_team_categories')

    class Meta:
        verbose_name = 'Team Category'
        verbose_name_plural = 'Team Categories'

    def clean(self):
        """Validate awards are enrolled teams"""
        awarded = [self.first_place_team, self.second_place_team, self.third_place_team]
        awarded = list(filter(None, awarded))
        
        if len(set(awarded)) != len(awarded):
            raise ValidationError("The same team cannot be awarded multiple times.")
        
        for team in awarded:
            if team and not self.teams.filter(pk=team.pk).exists():
                raise ValidationError(f"Team '{team}' must be enrolled to be awarded.")


class FightCategory(Category):
    """
    Fight competition category - bracket-style matches between individual athletes.
    Athletes enrolled via CategoryAthlete M2M (inherited from Category).
    Matches created for bracket generation.
    """
    # Fight-specific awards
    first_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='fight_first_place_categories')
    second_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='fight_second_place_categories')
    third_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='fight_third_place_categories')

    class Meta:
        verbose_name = 'Fight Category'
        verbose_name_plural = 'Fight Categories'

    def clean(self):
        """Validate awards are enrolled athletes"""
        awarded = [self.first_place, self.second_place, self.third_place]
        awarded = list(filter(None, awarded))
        
        if len(set(awarded)) != len(awarded):
            raise ValidationError("The same athlete cannot be awarded multiple times.")
        
        for athlete in awarded:
            if athlete and not self.athletes.filter(pk=athlete.pk).exists():
                raise ValidationError(f"Athlete '{athlete}' must be enrolled to be awarded.")


class FightGroupEnrollment(models.Model):
    """
    Pre-registration pool for fight athletes per event group.
    Athletes can be weighted first, then assigned to fight categories later.
    """

    event = models.ForeignKey('Competition', on_delete=models.CASCADE, related_name='fight_group_enrollments')
    group = models.ForeignKey('Group', on_delete=models.CASCADE, related_name='fight_group_enrollments')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='fight_group_enrollments')
    registered_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('event', 'group', 'athlete')
        indexes = [
            models.Index(fields=['event', 'group'], name='api_fightgr_event_i_eb4365_idx'),
            models.Index(fields=['athlete'], name='api_fightgr_athlete_8e4255_idx'),
        ]
        verbose_name = 'Fight Group Enrollment'
        verbose_name_plural = 'Fight Group Enrollments'

    def __str__(self):
        return f"{self.athlete} @ {self.group} ({self.event})"


class FightAthleteWeight(models.Model):
    """
    Track weight-in data for athletes in fight categories.
    Registered weight: submitted ~1 week before competition
    Match day weight: measured on competition day
    Used to detect disqualifications due to excessive weight loss
    """
    PLACE_CHOICES = [
        (1, '1st Place'),
        (2, '2nd Place'),
        (3, '3rd Place'),
    ]
    
    category = models.ForeignKey('FightCategory', on_delete=models.CASCADE, related_name='athlete_weights')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='fight_weights')
    pre_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='Registered Weight (kg)', help_text='Weight submitted ~1 week before competition')
    current_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, verbose_name='Match Day Weight (kg)', help_text='Weight measured on competition day')
    weight_loss_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, editable=False, help_text='Calculated percentage weight loss')
    is_disqualified = models.BooleanField(default=False, help_text='Mark as disqualified if weight exceeds limits')
    disqualification_reason = models.CharField(max_length=255, blank=True, help_text='Reason for disqualification')
    place = models.PositiveSmallIntegerField(choices=PLACE_CHOICES, null=True, blank=True, help_text='Award placement')
    recorded_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('category', 'athlete')
        verbose_name = 'Fight Athlete Weight'
        verbose_name_plural = 'Fight Athlete Weights'

    def __str__(self):
        return f"{self.athlete} - {self.category.name}"

    def save(self, *args, **kwargs):
        """Calculate weight loss percentage before saving"""
        if self.pre_weight_kg and self.current_weight_kg:
            loss = self.pre_weight_kg - self.current_weight_kg
            self.weight_loss_percentage = (loss / self.pre_weight_kg) * 100
        super().save(*args, **kwargs)

    def get_weight_loss_display(self):
        """Display weight loss in kg and percentage"""
        if self.pre_weight_kg and self.current_weight_kg:
            loss_kg = self.pre_weight_kg - self.current_weight_kg
            return f"{loss_kg:.2f}kg ({self.weight_loss_percentage:.1f}%)" if self.weight_loss_percentage else f"{loss_kg:.2f}kg"
        return "Incomplete"


class Match(models.Model):
    MATCH_TYPE_CHOICES = [
        ('qualifications', 'Qualifications'),
        ('quarter-finals', 'Quarter-Finals'),
        ('semi-finals', 'Semi-Finals'),
        ('finals', 'Finals'),
        ('bronze', 'Bronze Match'),
    ]

    MATCH_STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    DISPLAY_MODE_CHOICES = [
        ('reveal_final', 'Reveal Final'),
        ('real_time', 'Real Time Scoring'),
    ]
    
    match_number = models.CharField(max_length=50, blank=True, null=True, help_text='Unique identifier for this match (e.g., M1, M2, F-C1-Q1)')
    status = models.CharField(max_length=20, choices=MATCH_STATUS_CHOICES, default='scheduled', help_text='Current status of the match')
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='matches')
    field = models.ForeignKey('CompetitionField', on_delete=models.SET_NULL, null=True, blank=True, related_name='matches')
    match_type = models.CharField(max_length=20, choices=MATCH_TYPE_CHOICES, default='qualifications')
    round_number = models.PositiveIntegerField(default=1, help_text='Round number within the bracket (1=first round, 2=second, etc.)')
    bracket_position = models.PositiveIntegerField(default=0, help_text='Position within the round (0-based, for visual layout)')
    next_match = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='previous_matches', help_text='Winner advances to this match')
    loser_next_match = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='previous_loser_matches', help_text='Loser advances to this match (consolation/bronze)')
    red_corner = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='red_corner_matches')
    blue_corner = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='blue_corner_matches')
    referees = models.ManyToManyField('Athlete', related_name='refereed_matches', limit_choices_to={'is_referee': True})
    central_referee = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='central_for_matches', limit_choices_to={'is_referee': True})
    # Winner is now computed from scoring system - no longer stored
    name = models.CharField(max_length=255, blank=True)  # Automatically generated match name
    display_mode = models.CharField(max_length=20, choices=DISPLAY_MODE_CHOICES, default='reveal_final')

    class Meta:
        verbose_name_plural = 'Matches'

    @property
    def winner(self):
        """Calculate winner from referee scores using scoring system"""
        # First try simplified scoring system if it exists
        winner = self.calculate_winner_simplified()
        if winner:
            return winner
        
        # Fall back to complex scoring system
        try:
            from .scoring import compute_match_results
            results = compute_match_results(
                self,
                events=getattr(self, '_prefetched_point_events', None),
            )
            return results.get('match_winner')
        except Exception:
            # Fallback to old calculation if scoring system unavailable
            return self._calculate_winner_legacy()

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        try:
            if self.field_id:
                MatchFieldAssignment.objects.update_or_create(
                    match=self,
                    defaults={'field_id': self.field_id}
                )
        except Exception:
            pass
    
    def calculate_winner_simplified(self):
        """
        Calculate winner using simplified 5-referee scoring system.
        Similar to solo/team category scoring: exclude highest and lowest scores, count middle 3.
        Returns the corner with more votes from the middle 3 referees.
        """
        try:
            # Prefer final referee decisions (`round is null`) when they exist.
            # Fall back to all simplified scores for backwards compatibility.
            prefetched_scores = getattr(self, '_prefetched_simplified_scores', None)
            if prefetched_scores is not None:
                scores = [score for score in prefetched_scores if score.round_id is None]
            else:
                scores = list(self.simplified_referee_scores.filter(round__isnull=True))
            if not scores:
                scores = prefetched_scores if prefetched_scores is not None else list(self.simplified_referee_scores.all())

            if not scores:
                return None

            # With 1-2 available referee decisions, use the simple majority of the
            # submitted choices. This matches the live admin flow, where a winner
            # can be revealed even before all referees have submitted.
            if len(scores) < 3:
                red_votes = 0
                blue_votes = 0
                for score in scores:
                    winner_choice = getattr(score, 'winner_choice', None)
                    if winner_choice == 'red':
                        red_votes += 1
                    elif winner_choice == 'blue':
                        blue_votes += 1

                if red_votes > blue_votes:
                    return self.red_corner
                elif blue_votes > red_votes:
                    return self.blue_corner
                return None
            
            # Calculate score difference for each referee (red - blue)
            score_diffs = []
            for score in scores:
                diff = score.red_corner_score - score.blue_corner_score
                score_diffs.append({
                    'diff': diff,
                    'winner': 'red' if diff > 0 else ('blue' if diff < 0 else None),
                    'score': score
                })
            
            # Sort by absolute difference to identify extreme scores
            sorted_diffs = sorted(score_diffs, key=lambda x: abs(x['diff']))
            
            # For 5 scores: remove lowest and highest difference (most extreme), keep middle 3
            # For 4 scores: remove only the highest
            # For 3 scores: use all 3
            if len(sorted_diffs) == 3:
                middle_scores = sorted_diffs
            elif len(sorted_diffs) == 4:
                middle_scores = sorted_diffs[:-1]
            else:
                middle_scores = sorted_diffs[1:-1]
            
            # Count votes from middle referees
            red_votes = sum(1 for s in middle_scores if s['winner'] == 'red')
            blue_votes = sum(1 for s in middle_scores if s['winner'] == 'blue')
            
            if red_votes > blue_votes:
                return self.red_corner
            elif blue_votes > red_votes:
                return self.blue_corner
            
            return None  # Tie
        except Exception:
            return None
    
    def _calculate_winner_legacy(self):
        """Legacy winner calculation based on referee votes"""
        prefetched_scores = getattr(self, '_prefetched_legacy_scores', None)
        if prefetched_scores is not None:
            red_votes = sum(score.winner == 'red' for score in prefetched_scores)
            blue_votes = sum(score.winner == 'blue' for score in prefetched_scores)
        else:
            red_votes = self.referee_scores.filter(winner='red').count()
            blue_votes = self.referee_scores.filter(winner='blue').count()
        if red_votes > blue_votes:
            return self.red_corner
        elif blue_votes > red_votes:
            return self.blue_corner
        return None

    def _generate_match_number(self):
        """Auto-generate match number based on category and match type"""
        type_prefix = {
            'qualifications': 'Q',
            'semi-finals': 'SF',
            'finals': 'F',
        }.get(self.match_type, 'M')
        
        # Count existing matches of this type in this category
        if self.category_id:
            count = Match.objects.filter(
                category_id=self.category_id,
                match_type=self.match_type
            ).count() + 1
            
            # Include category number if available
            if self.category and self.category.category_number:
                return f"{self.category.category_number}-{type_prefix}{count}"
            else:
                return f"M{count}"
        else:
            # Fallback to simple incrementing
            last = Match.objects.order_by('-id').first()
            return f"M{last.id + 1 if last else 1}"
    
    def save(self, *args, **kwargs):
        """Generate match name and number on save"""
        # Auto-generate match_number if not provided
        if not self.match_number:
            self.match_number = self._generate_match_number()
        
        # Generate match name
        try:
            red_name = self.red_corner.first_name if self.red_corner_id else ''
            blue_name = self.blue_corner.first_name if self.blue_corner_id else ''
            category_name = self.category.name if self.category_id else ''
            self.name = f"{red_name} vs {blue_name} ({self.match_type}) - {category_name}"
        except Exception:
            pass
        super().save(*args, **kwargs)

    def __str__(self):
        category = self.category
        group = category.group if category else None
        event = category.event if category else None
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'No Competition'
        return (
            f"{self.name} - "
            f"{category.name} - {group_name} - {event_title}"
        )


class RefereeScore(models.Model):
    match = models.ForeignKey('Match', on_delete=models.CASCADE, related_name='referee_scores')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True}, null=True, blank=True)
    red_corner_score = models.IntegerField(default=0)
    blue_corner_score = models.IntegerField(default=0)
    winner = models.CharField(max_length=10, choices=[('red', 'Red Corner'), ('blue', 'Blue Corner')], null=True, blank=True)

    def __str__(self):
        if self.referee:
            ref_name = f"{self.referee.first_name} {self.referee.last_name}"
        else:
            ref_name = "Unassigned"
        return f"Referee: {ref_name} - Match: {self.match}"


class RefereePointEvent(models.Model):
    """Append-only events created by referees (or admins) describing points/penalties.

    These are the raw inputs that the aggregation job consumes to produce
    per-referee `RefereeScore` rows and the final `Match` winner.
    """
    EVENT_TYPE_CHOICES = [
        ('score', 'Score'),
        ('penalty', 'Penalty'),
        ('deduction', 'Deduction'),
        ('other', 'Other'),
    ]
    VALIDATION_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('validated', 'Validated'),
        ('rejected', 'Rejected'),
    ]

    match = models.ForeignKey('Match', on_delete=models.CASCADE, related_name='point_events')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True})
    timestamp = models.DateTimeField(auto_now_add=True)
    side = models.CharField(max_length=10, choices=[('red', 'Red Corner'), ('blue', 'Blue Corner')])
    points = models.IntegerField(default=0)
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES, default='score')
    processed = models.BooleanField(default=False, db_index=True)
    external_id = models.CharField(max_length=200, blank=True, null=True)
    metadata = models.JSONField(
        blank=True,
        null=True,
        help_text=(
            "Optional JSON object for extra event data. Common keys: 'round' (int), "
            "'central' (bool), 'reason' (string), 'origin' (string). Example: "
            "{'round': 2, 'central': true, 'reason': 'excessive contact'}"
        )
    )
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)
    validation_status = models.CharField(max_length=20, choices=VALIDATION_STATUS_CHOICES, default='validated')
    validated_at = models.DateTimeField(null=True, blank=True)
    recording_session = models.ForeignKey(
        'FieldRecordingSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referee_point_events'
    )
    video_offset_ms = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f"Event {self.pk} - Match {self.match_id} - Referee {self.referee_id} - {self.side} ({self.points})"

    def clean(self):
        """Validate metadata using the shared validator so invalid shapes are rejected early."""
        super().clean()
        try:
            from .validators import validate_referee_point_event_metadata
            validate_referee_point_event_metadata(self.metadata)
        except Exception as e:
            # If it's already a Django ValidationError raise it, otherwise convert
            from django.core.exceptions import ValidationError as DjangoValidationError
            if isinstance(e, DjangoValidationError):
                raise
            raise DjangoValidationError(str(e))


class MatchRefereeAssignment(models.Model):
    """
    Assigns 5 referees (R1-R5) to a match for simplified scoring.
    Similar to CategoryRefereeAssignment but for fight matches.
    """
    match = models.OneToOneField(
        'Match',
        on_delete=models.CASCADE,
        related_name='referee_assignment',
        help_text='The match these referees are assigned to'
    )
    
    referee_1 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r1_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 1',
        help_text='Referee position 1 (R1)'
    )
    
    referee_2 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r2_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 2',
        help_text='Referee position 2 (R2)'
    )
    
    referee_3 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r3_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 3',
        help_text='Referee position 3 (R3)'
    )
    
    referee_4 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r4_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 4',
        help_text='Referee position 4 (R4)'
    )
    
    referee_5 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_r5_assignments',
        limit_choices_to={'is_referee': True},
        verbose_name='Referee 5',
        help_text='Referee position 5 (R5)'
    )
    
    def __str__(self):
        return f"Referee Assignment for {self.match}"
    
    def get_referees_list(self):
        """Returns list of 5 referees in order [R1, R2, R3, R4, R5]"""
        return [self.referee_1, self.referee_2, self.referee_3, self.referee_4, self.referee_5]
    
    def clean(self):
        """Validate referee assignments"""
        super().clean()
        # Note: duplicate referees are allowed (same referee can be assigned to multiple positions)


class MatchRefereeScore(models.Model):
    """
    Stores individual referee scores for fighters in matches.
    Each referee can score per-round (round is set) or submit a final
    winner decision (round is null). The winner is determined by which
    corner has more referee votes.
    """
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='simplified_referee_scores',
        help_text='The match being scored'
    )
    
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        limit_choices_to={'is_referee': True},
        related_name='given_match_scores',
        help_text='The referee providing this score'
    )
    
    round = models.ForeignKey(
        'MatchRound',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='referee_scores',
        help_text='The round being scored (null = final/overall decision)'
    )
    
    red_corner_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text='Score for red corner fighter'
    )
    
    blue_corner_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text='Score for blue corner fighter'
    )
    
    # Metadata
    submitted_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True, help_text='Optional notes from referee')
    
    class Meta:
        unique_together = ('match', 'referee', 'round')  # Each referee scores each round once
        indexes = [
            models.Index(fields=['match', 'referee']),
        ]
    
    def __str__(self):
        rnd = f" R{self.round.round_number}" if self.round else " Final"
        return f"{self.referee} - {self.match}{rnd}: Red {self.red_corner_score} vs Blue {self.blue_corner_score}"
    
    @property
    def winner_choice(self):
        """Determine which corner won according to this referee"""
        if self.red_corner_score > self.blue_corner_score:
            return 'red'
        elif self.blue_corner_score > self.red_corner_score:
            return 'blue'
        return None  # Tie


class CategoryRefereeAssignment(models.Model):
    """
    Assigns 5 referees to a category for scoring solo/team performances.
    All athletes/teams in the category are scored by the same 5 referees.
    """
    category = models.OneToOneField(
        'Category',
        on_delete=models.CASCADE,
        related_name='referee_assignment',
        help_text='The category these referees are assigned to'
    )
    
    referee_1 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_1_categories',
        help_text='Referee 1 (R1)'
    )
    
    referee_2 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_2_categories',
        help_text='Referee 2 (R2)'
    )
    
    referee_3 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_3_categories',
        help_text='Referee 3 (R3)'
    )
    
    referee_4 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_4_categories',
        help_text='Referee 4 (R4)'
    )
    
    referee_5 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'is_referee': True},
        related_name='referee_5_categories',
        help_text='Referee 5 (R5)'
    )
    
    class Meta:
        verbose_name = 'Category Referee Assignment'
        verbose_name_plural = 'Category Referee Assignments'
    
    def __str__(self):
        return f"Referees for {self.category.name}"
    
    def get_referees_list(self):
        """Return list of (position, referee) tuples"""
        return [
            (1, self.referee_1),
            (2, self.referee_2),
            (3, self.referee_3),
            (4, self.referee_4),
            (5, self.referee_5),
        ]
    
    def clean(self):
        """Validate referee assignments"""
        super().clean()
        # Check if category is a solo or team category (not Fight)
        from django.contrib.contenttypes.models import ContentType
        if self.category:
            category_type = ContentType.objects.get_for_model(self.category).model
            if category_type not in ['solocategory', 'teamcategory']:
                raise ValidationError(
                    f"Referee assignments are only for solo and team categories, not {category_type}"
                )
        
        # Note: duplicate referees are allowed (same referee can be assigned to multiple positions)


class CategoryRefereeScore(models.Model):
    """
    Stores individual referee scores for athletes/teams in solo and team categories.
    For solo/team categories, 5 referees score each athlete/team.
    Referees start with base score of 100 and submit deductions.
    Final score = 100 - sum_of_deductions.
    The final award score excludes the highest and lowest scores and averages the middle 3.
    """
    CATEGORY_TYPE_CHOICES = [
        ('solo', 'Solo'),
        ('teams', 'Teams'),
    ]
    
    # Link to the athlete's result submission
    athlete_score = models.ForeignKey(
        'CategoryAthleteScore',
        on_delete=models.CASCADE,
        related_name='referee_scores',
        help_text='The athlete/team result being scored'
    )
    
    # The referee providing the score
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        limit_choices_to={'is_referee': True},
        related_name='given_category_scores',
        help_text='The referee providing this score'
    )
    
    # Deduction structure (JSON field for flexibility)
    # Example: {"wrong_technique": 10, "wrong_position": 5, "not_looking_real": 0, "stamina": 3}
    deductions = models.JSONField(
        default=dict,
        blank=True,
        help_text='Deductions by category: wrong_technique, wrong_position, not_looking_real, stamina'
    )
    
    # Calculated total score (100 - sum_of_deductions)
    score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100,
        help_text='Final score: 100 minus all deductions'
    )
    
    # Metadata
    submitted_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True, help_text='Optional notes from referee')
    
    class Meta:
        unique_together = ('athlete_score', 'referee')  # Each referee scores each athlete/team once
        indexes = [
            models.Index(fields=['athlete_score', 'referee']),
            models.Index(fields=['submitted_date']),
        ]
        verbose_name = 'Category Referee Score'
        verbose_name_plural = 'Category Referee Scores'
    
    def __str__(self):
        athlete = self.athlete_score.athlete
        referee = self.referee
        team_name = self.athlete_score.team_name if self.athlete_score.type == 'teams' else None
        
        if team_name:
            return f"{referee.first_name} {referee.last_name} scored Team {team_name}: {self.score}"
        elif athlete:
            return f"{referee.first_name} {referee.last_name} scored {athlete.first_name} {athlete.last_name}: {self.score}"
        else:
            return f"{referee.first_name} {referee.last_name} scored (unknown): {self.score}"
    
    def clean(self):
        """Validate that this is for a solo or team category"""
        super().clean()
        if self.athlete_score and self.athlete_score.type not in ['solo', 'team', 'teams']:
            raise ValidationError(
                f"Referee scoring is only applicable to solo and team categories, not {self.athlete_score.type}"
            )


class CategoryRefereeScoreEvent(models.Model):
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('reveal', 'Reveal'),
    ]

    SOURCE_CHOICES = [
        ('referee_app', 'Referee App'),
        ('competition_admin', 'Competition Admin'),
        ('system', 'System'),
    ]

    athlete_score = models.ForeignKey(
        'CategoryAthleteScore',
        on_delete=models.CASCADE,
        related_name='score_events',
        help_text='The athlete/team score affected by this event'
    )
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        limit_choices_to={'is_referee': True},
        related_name='category_score_events',
        help_text='The referee that produced this event'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, default='update')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='competition_admin')
    score_value = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    previous_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True)
    recording_session = models.ForeignKey(
        'FieldRecordingSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='category_score_events'
    )
    video_offset_ms = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['timestamp', 'id']
        indexes = [
            models.Index(fields=['athlete_score', 'timestamp']),
            models.Index(fields=['referee', 'timestamp']),
        ]
        verbose_name = 'Category Referee Score Event'
        verbose_name_plural = 'Category Referee Score Events'

    def __str__(self):
        return f"Category score event #{self.pk} ({self.action})"


class CategoryAthleteScore(ApprovalWorkflowMixin, models.Model):
    """
    Stores athlete results for a category with approval workflow.
    Athletes can submit their own results (individual or team) which require admin approval and auto-populate Category awards.
    """
    CATEGORY_TYPE_CHOICES = [
        ('solo', 'Solo'),
        ('teams', 'Teams'),
        ('fight', 'Fight'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    PLACEMENT_CHOICES = [
        ('1st', '1st Place'),
        ('2nd', '2nd Place'), 
        ('3rd', '3rd Place'),
    ]
    
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='athlete_scores')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='category_scores', null=True, blank=True, help_text='Athlete being scored (null for team scores)')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True}, null=True, blank=True)
    score = models.IntegerField(default=0, blank=True, null=True, help_text='Numeric score given by referee/official (not relevant for athlete self-submissions with placement claims)')
    
    # Type and group (matching Category model structure)
    type = models.CharField(max_length=10, choices=CATEGORY_TYPE_CHOICES, default='solo', help_text='Type of result: solo, fight, or teams')
    group = models.ForeignKey(
        'Group',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='athlete_scores',
        help_text='Group assignment (similar to Category model)'
    )
    team_members = models.ManyToManyField('Athlete', blank=True, related_name='team_results', help_text='Team members (including submitter for team results)')
    team_name = models.CharField(max_length=200, blank=True, null=True, help_text='Optional team name')

    # Backwards-compatibility: some scripts/tests use `result_type` as the field name.
    # Provide a manager that annotates `result_type` and accept `result_type` in __init__.
    class _CompatManager(models.Manager):
        def get_queryset(self):
            # annotate a virtual `result_type` column equal to the `type` field so filters like
            # .filter(result_type='teams') work in legacy scripts/tests
            return super().get_queryset().annotate(result_type=F('type'))

    objects = _CompatManager()

    def __init__(self, *args, **kwargs):
        # map legacy kwarg `result_type` to the actual `type` field
        if 'result_type' in kwargs and 'type' not in kwargs:
            kwargs['type'] = kwargs.pop('result_type')
        super().__init__(*args, **kwargs)
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    placement_claimed = models.CharField(max_length=10, choices=PLACEMENT_CHOICES, blank=True, null=True, help_text='Award placement claimed by athlete')
    notes = models.TextField(blank=True, null=True, help_text='Additional notes about the performance')
    certificate_image = models.ImageField(upload_to='result_certificates/', null=True, blank=True, help_text='Certificate or award photo')
    result_document = models.FileField(upload_to='result_documents/', null=True, blank=True, help_text='Official result document')
    
    # Approval workflow fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', help_text='Approval status (defaults to approved for referee submissions)')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_scores')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')

    class Meta:
        unique_together = ('category', 'athlete', 'referee')  # Ensure unique scores per referee and athlete
        indexes = [
            models.Index(fields=['category', 'status']),
            models.Index(fields=['athlete', 'status']),
            models.Index(fields=['submitted_date']),
            models.Index(fields=['status', 'submitted_by_athlete']),
        ]

    def __str__(self):
        category = self.category
        group = category.group if category else None
        event = category.event if category else None
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'No Competition'
        
        if self.athlete:
            return (
                f"{self.athlete.first_name} {self.athlete.last_name} - "
                f"{category.name} - {group_name} - {event_title}"
            )
        elif self.type == 'teams' and self.team_name:
            return f"Team {self.team_name} - {category.name} - {group_name} - {event_title}"
        else:
            return f"{category.name} - {group_name} - {event_title}"
    
    @property
    def calculated_score(self):
        """
        Calculate final score for solo/team categories by:
        1. Collecting all 5 referee scores
        2. Removing the highest and lowest scores
        3. Summing the middle 3 scores
        
        Returns None if category type is not solo/teams or if less than 3 referee scores exist.
        """
        # Only applicable to solo and team categories
        if self.type not in ['solo', 'teams']:
            return None
        
        # Get all referee scores for this result
        referee_scores = list(self.referee_scores.values_list('score', flat=True))
        
        # Need at least 3 scores to calculate (ideally 5)
        if len(referee_scores) < 3:
            return None
        
        # Sort scores to easily identify highest and lowest
        sorted_scores = sorted(referee_scores)
        
        # Remove the lowest and highest
        # If we have exactly 3 scores, use all 3
        # If we have 4 scores, remove only the highest
        # If we have 5+ scores, remove both highest and lowest
        if len(sorted_scores) == 3:
            middle_scores = sorted_scores
        elif len(sorted_scores) == 4:
            middle_scores = sorted_scores[:-1]  # Remove only highest
        else:
            middle_scores = sorted_scores[1:-1]  # Remove both lowest and highest
        
        # Sum the middle scores
        return sum(middle_scores)
    
    @property
    def referee_score_count(self):
        """Return the number of referee scores submitted for this result"""
        return self.referee_scores.count()
    
    @property
    def has_all_referee_scores(self):
        """Check if all 5 referee scores have been submitted"""
        return self.type in ['solo', 'teams'] and self.referee_score_count == 5
    
    def get_referee_score(self, referee_position):
        """
        Get the score from a specific referee position (1-5).
        Returns the score value or None if not submitted.
        """
        if not self.category:
            return None
        
        try:
            assignment = self.category.referee_assignment
        except:
            return None
        
        # Get the referee for this position
        referee = getattr(assignment, f'referee_{referee_position}', None)
        if not referee:
            return None
        
        # Get the score from this referee
        try:
            score_obj = self.referee_scores.get(referee=referee)
            return score_obj.score
        except CategoryRefereeScore.DoesNotExist:
            return None
    
    def get_all_referee_scores(self):
        """
        Get all 5 referee scores in order (R1-R5).
        Returns dict with keys 'r1' through 'r5', values are scores or None.
        """
        return {
            'r1': self.get_referee_score(1),
            'r2': self.get_referee_score(2),
            'r3': self.get_referee_score(3),
            'r4': self.get_referee_score(4),
            'r5': self.get_referee_score(5),
        }
    
    def save(self, *args, **kwargs):
        """Override save to track status changes and ensure team submitter is included"""
        # Track if status is changing to approved
        status_changed_to_approved = False
        
        if self.pk:  # Existing record
            try:
                old_instance = CategoryAthleteScore.objects.get(pk=self.pk)
                status_changed_to_approved = (old_instance.status != 'approved' and self.status == 'approved')
            except CategoryAthleteScore.DoesNotExist:
                pass
        
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by referee/admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
            
        super().save(*args, **kwargs)
        
        # For team results, ensure the submitting athlete is included in team members
        if self.type == 'teams' and self.athlete and not self.team_members.filter(pk=self.athlete.pk).exists():
            self.team_members.add(self.athlete)
        
        # Auto-populate Category awards when status changes to approved (only for admin approvals, not team creation)
        if status_changed_to_approved and self.submitted_by_athlete and self.placement_claimed:
            # Only update category text fields, don't create teams during auto-save
            self._update_category_awards_text_only()
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted result and auto-populate Category awards"""
        self._transition_status('approved', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_result_status(status, actor, message))

        # Auto-populate Category awards if placement is claimed
        if self.submitted_by_athlete and self.placement_claimed:
            self._update_category_awards()

    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted result"""
        self._transition_status('rejected', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_result_status(status, actor, message))

    def request_revision(self, admin_user, notes=''):
        """Request revision on the athlete-submitted result"""
        self._transition_status('revision_required', admin_user, notes, on_success=lambda obj, status, actor, message: self._notify_result_status(status, actor, message))

    def _notify_result_status(self, status, admin_user, notes):
        from .notification_utils import create_result_status_notification
        create_result_status_notification(self, status, admin_user, notes)
    
    def _create_or_get_team_for_award(self):
        """
        Create or get Team object for award purposes.
        """
        if not hasattr(self, '_award_team'):
            # Try to find existing team with same members for this category
            team_members = list(self.team_members.all())
            existing_teams = Team.objects.filter(categories=self.category)
            
            for team in existing_teams:
                team_member_athletes = [tm.athlete for tm in team.members.all()]
                if set(team_member_athletes) == set(team_members):
                    self._award_team = team
                    break
            else:
                # Create new team for this award
                self._award_team = Team.objects.create(
                    name=f"Team {', '.join([f'{m.first_name} {m.last_name}' for m in team_members])}"
                )
                # Add the team to the category through the many-to-many
                self._award_team.categories.add(self.category)
                
                # Add team members through TeamMember model
                for athlete in team_members:
                    TeamMember.objects.create(team=self._award_team, athlete=athlete)
        
        return self._award_team
    
    def _update_category_awards_text_only(self):
        """Update only the category text fields without creating teams"""
        if not self.category or not self.placement_claimed:
            return
            
        category = self.category
        placement = self.placement_claimed.lower().replace(' place', '').strip()
        
        if self.type == 'teams' and self.team_members.exists():
            # Team result - create/get team and update ForeignKey fields
            team = self._create_or_get_team_for_award()
            
            if placement == '1st':
                category.first_place_team = team
            elif placement == '2nd':  
                category.second_place_team = team
            elif placement == '3rd':
                category.third_place_team = team
        else:
            # Individual result - update ForeignKey fields for all category types
            self._ensure_athlete_enrolled()
            
            if placement == '1st':
                category.first_place = self.athlete
            elif placement == '2nd':
                category.second_place = self.athlete
            elif placement == '3rd':
                category.third_place = self.athlete
                
        category.save()

    def _update_category_awards(self):
        """Update the Category model with the approved award placement and create teams"""
        if not self.category or not self.placement_claimed:
            return
            
        # First update the text fields
        self._update_category_awards_text_only()
        
        # Then create team objects for team results
        if self.type == 'teams' and self.team_members.exists():
            self._create_or_update_team()
    
    def auto_generate_team_name(self):
        """Auto-generate team name from team member names"""
        if self.type == 'teams' and self.team_members.exists():
            auto_generated_name = build_team_display_name(
                self.team_members.select_related('club').all()
            )

            # Update the team name and save
            self.team_name = auto_generated_name
            self.save(update_fields=['team_name'])
            return auto_generated_name
        return None

    def _create_or_update_team(self):
        """Create or update Team object when team result is approved"""
        if not self.team_members.exists():
            return

        auto_generated_name = build_team_display_name(
            self.team_members.select_related('club').all()
        )

        # Use auto-generated name (always override any manual name for consistency)
        team_name = auto_generated_name
        
        # Update the CategoryAthleteScore with the auto-generated team name
        if self.team_name != team_name:
            self.team_name = team_name
            self.save(update_fields=['team_name'])
        
        # Get or create the team
        team, created = Team.objects.get_or_create(name=team_name)
        
        # Add all team members to the team using the TeamMember through model
        for member in self.team_members.all():
            from .models import TeamMember
            TeamMember.objects.get_or_create(team=team, athlete=member)
            
        # AUTO-ENROLL the team in the category (this was missing!)
        from .models import CategoryTeam
        try:
            CategoryTeam.objects.get(category=self.category, team=team)
            print(f"Team {team.name} already enrolled in category {self.category.name}")
        except CategoryTeam.DoesNotExist:
            CategoryTeam.objects.create(category=self.category, team=team)
            print(f"Auto-enrolled team {team.name} in category {self.category.name}")
            
        team.save()
        return team
    
    def _ensure_athlete_enrolled(self):
        """Ensure the athlete is enrolled in the category before awarding placement"""
        try:
            # Check if athlete is already enrolled
            CategoryAthlete.objects.get(category=self.category, athlete=self.athlete)
        except CategoryAthlete.DoesNotExist:
            # Enroll the athlete in the category
            CategoryAthlete.objects.create(
                category=self.category,
                athlete=self.athlete
                # weight can be added later if needed
            )
    
    @classmethod
    def create_category_if_needed(cls, competition, name, category_type='solo', gender='mixt', group=None):
        """Create a category if it doesn't exist"""
        from .models import Category
        
        category, created = Category.objects.get_or_create(
            name=name,
            competition=competition,
            defaults={
                'type': category_type,
                'gender': gender,
                'group': group
            }
        )
        return category, created
    


class CategoryTeamScore(models.Model):
    """
    Stores referee scores for teams in a category.
    """
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='team_scores')
    team = models.ForeignKey('Team', on_delete=models.CASCADE, related_name='category_scores')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True})
    score = models.IntegerField(default=0)  # Score given by the referee

    class Meta:
        unique_together = ('category', 'team', 'referee')  # Ensure unique scores per referee and team

    def __str__(self):
        return f"{self.team.name} - {self.category.name} - Referee: {self.referee.first_name} {self.referee.last_name}"


# NOTE: CategoryTeamAthleteScore model consolidated into CategoryAthleteScore with type='teams'
# This model is deprecated and will be removed after migration
# 
# class CategoryTeamAthleteScore(models.Model):
#     """
#     DEPRECATED: Team functionality moved to CategoryAthleteScore with type='teams'
#     """
#     pass


class Group(models.Model):
    """
    Represents an age-based group within an event/competition.
    Groups organize categories by athlete birth year ranges.
    Example: Athletes born 2015-2018
    """
    name = models.CharField(max_length=100, help_text="Group name (e.g., 'U12 Beginners', 'Youth 2015-2018')")
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        related_name='groups',
        null=True,
        blank=True
    )
    birth_year_start = models.IntegerField(
        null=True,
        blank=True,
        help_text="Starting birth year for this age group (e.g., 2015)"
    )
    birth_year_end = models.IntegerField(
        null=True,
        blank=True,
        help_text="Ending birth year for this age group (e.g., 2018)"
    )
    birth_date_start = models.DateField(
        null=True,
        blank=True,
        help_text="Exact start date for age eligibility (inclusive). If set, takes priority over birth_year_start."
    )
    birth_date_end = models.DateField(
        null=True,
        blank=True,
        help_text="Exact end date for age eligibility (inclusive). If set, takes priority over birth_year_end."
    )
    allow_younger = models.BooleanField(
        default=False,
        help_text="Allow athletes younger than the minimum age (who want to compete in a higher age category)"
    )
    GRADE_TYPE_CHOICES = [
        ('all', 'All grades'),
        ('inferior', 'Inferior grades only'),
        ('superior', 'Superior grades only'),
    ]
    allowed_grade_type = models.CharField(
        max_length=10,
        choices=GRADE_TYPE_CHOICES,
        default='all',
        help_text="Restrict participation by grade type. 'inferior' = only inferior grades, 'superior' = only superior grades."
    )
    display_order = models.IntegerField(default=0, help_text="Order within the event for display purposes")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'name'],
                name='unique_group_per_event',
                condition=models.Q(event__isnull=False)
            ),
        ]
        ordering = ['event', 'display_order', 'id']

    def __str__(self):
        age_range = ""
        if self.birth_year_start and self.birth_year_end:
            age_range = f" [{self.birth_year_start}-{self.birth_year_end}]"
        elif self.birth_year_start:
            age_range = f" [{self.birth_year_start}+]"
        elif self.birth_year_end:
            age_range = f" [up to {self.birth_year_end}]"
        
        if self.event:
            return f"{self.name}{age_range} ({self.event.title})"
        return f"{self.name}{age_range} (No Event)"
    
    def clean(self):
        from django.core.exceptions import ValidationError
        if self.birth_year_start and self.birth_year_end:
            if self.birth_year_start > self.birth_year_end:
                raise ValidationError({
                    'birth_year_start': 'Start year must be before or equal to end year'
                })

 
# FrontendTheme model removed — dynamic theme management has been deleted.
# The database migration that originally created the model remains; a
# subsequent migration will drop the table when applied.

# AthleteActivity and CategoryScoreActivity models removed - activity tracking eliminated per business decision


class SupporterAthleteRelation(models.Model):
    """Relationship between supporters and athletes"""
    RELATIONSHIP_CHOICES = [
        ('parent', 'Parent'),
        ('guardian', 'Guardian'),
        ('coach', 'Coach'),
        ('other', 'Other'),
    ]
    
    supporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='supported_athletes')
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='supporters')
    relationship = models.CharField(max_length=20, choices=RELATIONSHIP_CHOICES, default='other')
    can_edit = models.BooleanField(default=False, help_text='Can edit athlete profile')
    can_register_competitions = models.BooleanField(default=False, help_text='Can register athlete for competitions')
    created = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['supporter', 'athlete']
    
    def __str__(self):
        return f"{self.supporter.get_full_name() or self.supporter.username} supports {self.athlete}"


class AthleteMatch(models.Model):
    """
    Model to track individual matches/fights with approval workflow for athlete submissions.
    Separate from the competition Match model which tracks organized tournament matches.
    """
    RESULT_CHOICES = [
        ('win', 'Win'),
        ('loss', 'Loss'),
        ('draw', 'Draw'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='athlete_matches')
    opponent_name = models.CharField(max_length=200, help_text='Name of the opponent')
    match_date = models.DateField(help_text='Date of the match')
    event = models.ForeignKey('landing.Event', on_delete=models.SET_NULL, related_name='athlete_matches', blank=True, null=True)
    venue = models.CharField(max_length=200, blank=True, null=True, help_text='Venue where the match took place')
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, help_text='Match result')
    round_ended = models.CharField(max_length=50, blank=True, null=True, help_text='Round when match ended (e.g., "Round 2", "Decision")')
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    match_video = models.FileField(upload_to='match_videos/', null=True, blank=True, help_text='Video of the match')
    match_image = models.ImageField(upload_to='match_images/', null=True, blank=True, help_text='Photo from the match')
    result_document = models.FileField(upload_to='match_documents/', null=True, blank=True, help_text='Official match result document')
    notes = models.TextField(blank=True, null=True, help_text='Additional notes about the match')
    
    # Approval workflow fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', help_text='Approval status (defaults to approved for admin submissions)')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_athlete_matches')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')
    
    class Meta:
        ordering = ['-match_date']
        verbose_name = _('Athlete Match')
        verbose_name_plural = _('Athlete Matches')
    
    def __str__(self):
        if self.submitted_by_athlete:
            return f"{self.athlete.first_name} {self.athlete.last_name} vs {self.opponent_name} ({self.match_date}) - Self-submitted: {self.status}"
        return f"{self.athlete.first_name} {self.athlete.last_name} vs {self.opponent_name} ({self.match_date}) - {self.result}"
    
    def save(self, *args, **kwargs):
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
        super().save(*args, **kwargs)
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted match"""
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted match"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted match"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()


# Notification System Models
class Notification(models.Model):
    """Model for storing notifications to users"""
    NOTIFICATION_TYPES = [
        ('result_submitted', 'Result Submitted'),
        ('result_approved', 'Result Approved'),
        ('result_rejected', 'Result Rejected'),
        ('result_revision_required', 'Result Revision Required'),
        ('grade_submitted', 'Grade Exam Submitted'),
        ('grade_approved', 'Grade Exam Approved'),
        ('grade_rejected', 'Grade Exam Rejected'),
        ('grade_revision_required', 'Grade Exam Revision Required'),
        ('seminar_submitted', 'Seminar Participation Submitted'),
        ('seminar_approved', 'Seminar Participation Approved'),
        ('seminar_rejected', 'Seminar Participation Rejected'),
        ('seminar_revision_required', 'Seminar Participation Revision Required'),
        ('competition_created', 'Competition Created'),
        ('competition_updated', 'Competition Updated'),
        ('system_announcement', 'System Announcement'),
    ]
    
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    notification_type = models.CharField(max_length=30, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Optional link to related objects
    related_result = models.ForeignKey('CategoryAthleteScore', on_delete=models.CASCADE, null=True, blank=True)
    
    # Optional action data (JSON field for flexible data storage)
    action_data = models.JSONField(null=True, blank=True, help_text="Additional data for notification actions")
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', '-created_at']),
            models.Index(fields=['recipient', 'is_read']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.recipient.get_full_name()}"
    
    def mark_as_read(self):
        """Mark notification as read"""
        from django.utils import timezone
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save()


class NotificationSettings(models.Model):
    """Model for user notification preferences"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='notification_settings')
    
    # Email notification preferences
    email_on_result_status_change = models.BooleanField(default=True)
    email_on_competition_updates = models.BooleanField(default=True)
    email_on_system_announcements = models.BooleanField(default=True)
    
    # In-app notification preferences
    notify_result_submitted = models.BooleanField(default=True)
    notify_result_approved = models.BooleanField(default=True)
    notify_result_rejected = models.BooleanField(default=True)
    notify_result_revision_required = models.BooleanField(default=True)
    notify_grade_submitted = models.BooleanField(default=True)
    notify_grade_approved = models.BooleanField(default=True)
    notify_grade_rejected = models.BooleanField(default=True)
    notify_grade_revision_required = models.BooleanField(default=True)
    notify_seminar_submitted = models.BooleanField(default=True)
    notify_seminar_approved = models.BooleanField(default=True)
    notify_seminar_rejected = models.BooleanField(default=True)
    notify_seminar_revision_required = models.BooleanField(default=True)
    notify_competition_created = models.BooleanField(default=True)
    notify_competition_updated = models.BooleanField(default=False)
    notify_system_announcements = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Notification Settings - {self.user.get_full_name()}"


# Signal to create notification settings for new users
@receiver(post_save, sender=User)
def create_notification_settings(sender, instance, created, **kwargs):
    """Create notification settings when a new user is created"""
    if created:
        NotificationSettings.objects.create(user=instance)


class FieldRecordingSession(models.Model):
    STATUS_CHOICES = [
        ('recording', 'Recording'),
        ('stopped', 'Stopped'),
        ('failed', 'Failed'),
    ]

    event = models.ForeignKey('landing.Event', on_delete=models.CASCADE, related_name='field_recording_sessions')
    field = models.ForeignKey('CompetitionField', on_delete=models.CASCADE, related_name='recording_sessions')
    title = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='recording')
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    obs_scene_name = models.CharField(max_length=255, blank=True)
    obs_source_name = models.CharField(max_length=255, blank=True)
    recording_file_name = models.CharField(max_length=255, blank=True)
    recording_file_path = models.CharField(max_length=500, blank=True)
    recording_url = models.URLField(blank=True, max_length=500)
    notes = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-started_at', '-id']
        indexes = [
            models.Index(fields=['event', 'field', 'status']),
            models.Index(fields=['started_at']),
        ]

    def __str__(self):
        label = self.title or f"{self.field} recording"
        return f"{label} ({self.started_at:%Y-%m-%d %H:%M})"


class MatchVideoRecording(models.Model):
    """
    Video recording for individual Fight category matches.
    Each match can have its own video recording.
    All fields optional to allow gradual video addition.
    """
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='video_recordings',
        help_text='The match this video records'
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        upload_to='match_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text='Uploaded video file (MP4, WebM, etc.)'
    )
    
    video_url = models.URLField(
        blank=True,
        null=True,
        max_length=500,
        help_text='External video URL (YouTube, Vimeo, streaming service)'
    )
    
    # Video metadata
    duration_seconds = models.IntegerField(
        blank=True,
        null=True,
        help_text='Total video duration in seconds'
    )
    
    recorded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='When the video was recorded'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When video was uploaded to system'
    )
    
    # Access control
    is_public = models.BooleanField(
        default=False,
        help_text='Whether video is publicly accessible'
    )
    
    class Meta:
        verbose_name = 'Match Video Recording'
        verbose_name_plural = 'Match Video Recordings'
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'No date'
        return f"{self.match.name} ({date})"
    
    def clean(self):
        """Validate that at least one video source is provided"""
        if not self.video_file and not self.video_url:
            raise ValidationError("Either video file or video URL must be provided")


class AthletePerformanceVideo(models.Model):
    """
    Video recording of an individual athlete's performance in a Solo category.
    Links to CategoryAthleteScore for individual athlete results.
    """
    athlete_score = models.OneToOneField(
        'CategoryAthleteScore',
        on_delete=models.CASCADE,
        related_name='performance_video',
        verbose_name='Solo category',
        help_text='The athlete score entry this video documents'
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        upload_to='athlete_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text='Uploaded video file (MP4, WebM, etc.)'
    )
    
    video_url = models.URLField(
        blank=True,
        null=True,
        max_length=500,
        help_text='External video URL (YouTube, Vimeo, streaming service)'
    )
    
    duration_seconds = models.IntegerField(
        blank=True,
        null=True,
        help_text='Total video duration in seconds'
    )
    
    recorded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='When the video was recorded'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When video was uploaded to system'
    )
    
    # Access control
    is_public = models.BooleanField(
        default=False,
        help_text='Whether video is publicly accessible'
    )
    
    class Meta:
        verbose_name = 'Solo Performance Video'
        verbose_name_plural = 'Solo Performance Videos'
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        athlete = self.athlete_score.athlete
        category = self.athlete_score.category
        group = category.group
        event = category.event
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'No date'
        group_name = group.name if group else 'No Group'
        event_title = event.title if event else 'No Competition'
        return (
            f"{athlete.first_name} {athlete.last_name} - "
            f"{category.name} / {group_name} / {event_title} ({date})"
        )
    
    def clean(self):
        """Validate that at least one video source is provided"""
        if not self.video_file and not self.video_url:
            raise ValidationError("Either video file or video URL must be provided")


class TeamPerformanceVideo(models.Model):
    """
    Video recording of a team's performance in a Team category.
    Links to CategoryTeam for team results.
    """
    category_team = models.OneToOneField(
        'CategoryTeam',
        on_delete=models.CASCADE,
        related_name='performance_video',
        help_text='The team enrollment this video documents'
    )
    
    # Video storage - either file upload OR external URL
    video_file = models.FileField(
        upload_to='team_videos/%Y/%m/%d/',
        blank=True,
        null=True,
        help_text='Uploaded video file (MP4, WebM, etc.)'
    )
    
    video_url = models.URLField(
        blank=True,
        null=True,
        max_length=500,
        help_text='External video URL (YouTube, Vimeo, streaming service)'
    )
    
    duration_seconds = models.IntegerField(
        blank=True,
        null=True,
        help_text='Total video duration in seconds'
    )
    
    recorded_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text='When the video was recorded'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        help_text='When video was uploaded to system'
    )
    
    # Access control
    is_public = models.BooleanField(
        default=False,
        help_text='Whether video is publicly accessible'
    )
    
    class Meta:
        verbose_name = 'Team Performance Video'
        verbose_name_plural = 'Team Performance Videos'
        ordering = ['-recorded_at', '-uploaded_at']
    
    def __str__(self):
        team = self.category_team.team
        date = self.recorded_at.strftime('%Y-%m-%d') if self.recorded_at else 'No date'
        return f"{team.name} ({date})"
    
    def clean(self):
        """Validate that at least one video source is provided"""
        if not self.video_file and not self.video_url:
            raise ValidationError("Either video file or video URL must be provided")


# ============================================================================
# PWA COMPETITION MANAGEMENT MODELS
# ============================================================================

class CompetitionField(models.Model):
    """
    Represents a scoring field/tatami at a competition.
    Multiple fields can run simultaneously during an event.
    Each field displays scores on a dedicated monitor.
    """
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        related_name='fields',
        help_text='The event this field belongs to'
    )
    
    name = models.CharField(
        max_length=100,
        help_text='Field name (e.g., "Field 1", "Tatami A", "Area B")'
    )
    
    field_number = models.IntegerField(
        help_text='Numeric identifier for the field'
    )
    
    is_active = models.BooleanField(
        default=True,
        help_text='Whether this field is currently being used'
    )

    start_time = models.TimeField(
        null=True,
        blank=True,
        help_text='Planned start time for this field (e.g., 09:00)'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('event', 'field_number')
        ordering = ['field_number']
        verbose_name = 'Competition Field'
        verbose_name_plural = 'Competition Fields'
    
    def __str__(self):
        return f"{self.name} (Event: {self.event.title})"


class FieldBreak(models.Model):
    """
    A break/pause in a competition field schedule (e.g., lunch break).
    Appears in the schedule timeline between categories/matches.
    """
    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.CASCADE,
        related_name='breaks',
        help_text='The field this break belongs to'
    )
    label = models.CharField(
        max_length=100,
        default='Pauză',
        help_text='Label for the break (e.g., "Pauză de masă")'
    )
    duration = models.IntegerField(
        default=60,
        help_text='Duration in minutes'
    )
    order = models.IntegerField(
        default=0,
        help_text='Order position in the field schedule (mixed with category/match assignments)'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Field Break'
        verbose_name_plural = 'Field Breaks'

    def __str__(self):
        return f"{self.label} ({self.duration}min) - {self.field.name}"


class CategoryFieldAssignment(models.Model):
    """
    Assigns a category to a specific field for competition day.
    Allows admin to track which categories are being held on which fields.
    """
    category = models.OneToOneField(
        'Category',
        on_delete=models.CASCADE,
        related_name='field_assignment',
        help_text='The category being assigned'
    )
    
    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.CASCADE,
        related_name='category_assignments',
        help_text='The field this category is assigned to'
    )
    
    STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='not_started',
        help_text='Current status of this category on this field'
    )

    scheduled_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the category is scheduled to start'
    )
    
    actual_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the category actually started'
    )
    
    actual_end_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the category actually ended'
    )
    
    order = models.IntegerField(
        default=0,
        help_text='Order in which categories are run on this field'
    )
    
    estimated_duration = models.IntegerField(
        default=15,
        help_text='Estimated duration in minutes'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['order']
        verbose_name = 'Category Field Assignment'
        verbose_name_plural = 'Category Field Assignments'
        indexes = [
            models.Index(fields=['field', 'status']),
        ]
    
    def __str__(self):
        return f"{self.category.name} → {self.field.name}"


class MatchFieldAssignment(models.Model):
    """
    Assigns a match to a specific field with status and scheduling info.
    """
    match = models.OneToOneField(
        'Match',
        on_delete=models.CASCADE,
        related_name='field_assignment',
        help_text='The match being assigned'
    )

    field = models.ForeignKey(
        'CompetitionField',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='match_assignments',
        help_text='The field this match is assigned to'
    )

    STATUS_CHOICES = [
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='not_started',
        help_text='Current status of this match on this field'
    )

    scheduled_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the match is scheduled to start'
    )

    actual_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the match actually started'
    )

    actual_end_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the match actually ended'
    )

    order = models.IntegerField(
        default=0,
        help_text='Order in which matches are run on this field'
    )

    estimated_duration = models.IntegerField(
        default=10,
        help_text='Estimated duration in minutes'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order']
        verbose_name = 'Match Field Assignment'
        verbose_name_plural = 'Match Field Assignments'
        indexes = [
            models.Index(fields=['field', 'status'], name='api_match_field_status_idx'),
        ]

    def __str__(self):
        return f"{self.match.name or self.match.pk} → {self.field.name if self.field else 'Unassigned'}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        try:
            if self.match_id and self.field_id and self.match.field_id != self.field_id:
                self.match.field_id = self.field_id
                self.match.save(update_fields=['field'])
        except Exception:
            pass


class DisplayMonitorSession(models.Model):
    """
    Tracks what is currently being displayed on each field's monitor.
    Admin can switch which category/match is shown on each monitor in real-time.
    """
    field = models.OneToOneField(
        'CompetitionField',
        on_delete=models.CASCADE,
        related_name='monitor_session',
        help_text='Which field this monitor serves'
    )
    
    current_category = models.ForeignKey(
        'Category',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monitor_sessions_category',
        help_text='The category currently displayed'
    )
    
    current_match = models.ForeignKey(
        'Match',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monitor_sessions_match',
        help_text='The match currently displayed (for fighting categories)'
    )
    
    current_athlete = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='monitor_sessions',
        help_text='The current athlete being displayed (for solo/teams)'
    )
    
    STATUS_CHOICES = [
        ('idle', 'Idle'),
        ('displaying', 'Displaying'),
        ('scores_revealed', 'Scores Revealed'),
        ('decisions_revealed', 'Decisions Revealed'),
        ('winner_revealed', 'Winner Revealed'),
    ]
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='idle',
        help_text='Current display status'
    )

    # Break timer sync fields (admin ↔ public display)
    break_end_time = models.DateTimeField(
        null=True, blank=True,
        help_text='Absolute UTC time when break should end'
    )
    break_paused = models.BooleanField(
        default=False,
        help_text='Whether the break timer is currently paused'
    )
    break_paused_remaining = models.IntegerField(
        default=0,
        help_text='Seconds remaining when break was paused'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Display Monitor Session'
        verbose_name_plural = 'Display Monitor Sessions'
    
    def __str__(self):
        if self.current_category:
            return f"Monitor {self.field.field_number}: {self.current_category.name}"
        return f"Monitor {self.field.field_number}: Idle"


class MatchRound(models.Model):
    """
    Represents a single round in a fighting match.
    Tracks round duration, scores submitted per round, and round status.
    """
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='rounds',
        help_text='The match this round belongs to'
    )
    
    round_number = models.IntegerField(
        help_text='Round number (1, 2, 3, etc.)'
    )
    
    duration_seconds = models.IntegerField(
        default=180,
        help_text='Duration of this round in seconds (default 3 minutes)'
    )
    
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('active', 'Active'),
        ('completed', 'Completed'),
    ]
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='scheduled',
        help_text='Current status of this round'
    )
    
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the round started'
    )
    
    ended_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the round ended'
    )
    
    paused_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When the round was paused (null = not paused)'
    )
    
    accumulated_pause_seconds = models.IntegerField(
        default=0,
        help_text='Total seconds spent paused in this round'
    )
    
    extra_seconds = models.IntegerField(
        default=0,
        help_text='Extra seconds added/removed by admin during this round'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('match', 'round_number')
        ordering = ['round_number']
        verbose_name = 'Match Round'
        verbose_name_plural = 'Match Rounds'
    
    def __str__(self):
        return f"{self.match.match_number or self.match.id} - Round {self.round_number}"
    
    @property
    def is_paused(self):
        return self.paused_at is not None
    
    @property
    def effective_duration(self):
        """Total round duration including time adjustments"""
        return self.duration_seconds + self.extra_seconds


class MatchEvent(models.Model):
    """
    Tracks real-time events during a fighting match:
    warnings, penalties (-2 points from central referee), pauses, time adjustments.
    """
    EVENT_TYPE_CHOICES = [
        ('warning_red', 'Warning Red Corner'),
        ('warning_blue', 'Warning Blue Corner'),
        ('penalty_red', 'Penalty Red Corner'),
        ('penalty_blue', 'Penalty Blue Corner'),
        ('bonus_red', 'Bonus Red Corner'),
        ('bonus_blue', 'Bonus Blue Corner'),
        ('infraction_red', 'Infraction Red Corner'),
        ('infraction_blue', 'Infraction Blue Corner'),
        ('disqualify_red', 'Disqualify Red Corner'),
        ('disqualify_blue', 'Disqualify Blue Corner'),
        ('pause', 'Pause'),
        ('resume', 'Resume'),
        ('time_add', 'Time Added'),
        ('time_remove', 'Time Removed'),
    ]
    
    CORNER_CHOICES = [
        ('red', 'Red Corner'),
        ('blue', 'Blue Corner'),
        ('none', 'No Corner'),
    ]
    
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        related_name='events',
        help_text='The match this event belongs to'
    )
    
    round = models.ForeignKey(
        'MatchRound',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='events',
        help_text='The round this event occurred in'
    )
    
    event_type = models.CharField(
        max_length=20,
        choices=EVENT_TYPE_CHOICES,
        help_text='Type of event'
    )
    
    corner = models.CharField(
        max_length=10,
        choices=CORNER_CHOICES,
        default='none',
        help_text='Which corner this event applies to'
    )
    
    value = models.IntegerField(
        default=0,
        help_text='Numeric value (e.g., seconds added/removed, penalty points)'
    )
    
    notes = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Optional notes about the event'
    )
    
    created_by = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_match_events',
        help_text='Who created this event (usually central referee or admin)'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
        verbose_name = 'Match Event'
        verbose_name_plural = 'Match Events'
    
    def __str__(self):
        return f"{self.match} - {self.get_event_type_display()} ({self.created_at})"


class QRCodeAssignment(models.Model):
    """
    Generates unique QR codes for quick referee access to their assigned categories/matches.
    When a referee scans the QR, they're automatically logged in to that specific category/match.
    """
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        limit_choices_to={'is_referee': True},
        related_name='qr_assignments',
        help_text='The referee this QR code is for'
    )
    
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='qr_assignments',
        help_text='The category this QR code grants access to (solo/teams only)'
    )
    
    match = models.ForeignKey(
        'Match',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='qr_assignments',
        help_text='The match this QR code grants access to (fighting only)'
    )
    
    code = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text='Unique QR code value'
    )
    
    is_active = models.BooleanField(
        default=True,
        help_text='Whether this QR code can be used'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Optional expiration date for this QR code'
    )
    
    class Meta:
        unique_together = ('referee', 'category', 'match')
        verbose_name = 'QR Code Assignment'
        verbose_name_plural = 'QR Code Assignments'
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['referee', 'category']),
            models.Index(fields=['referee', 'match']),
        ]
    
    def __str__(self):
        target = self.category.name if self.category else self.match.match_number
        return f"QR for {self.referee.first_name} → {target}"
    
    def clean(self):
        """Validate that either category or match is specified, but not both"""
        if not self.category and not self.match:
            raise ValidationError("QR code must be assigned to either a category or a match")
        if self.category and self.match:
            raise ValidationError("QR code cannot be assigned to both a category and a match")


class CompetitionReferee(models.Model):
    """
    Tracks which referees are participating in a competition.
    Acts as the roster from which referees can be assigned to categories/matches.
    """
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        related_name='competition_referees',
        help_text='The event this referee is participating in'
    )
    athlete = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        related_name='competition_referee_entries',
        limit_choices_to={'is_referee': True},
        help_text='The referee athlete'
    )
    notes = models.TextField(
        blank=True,
        default='',
        help_text='Additional notes'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('event', 'athlete')
        ordering = ['athlete__last_name']
        verbose_name = 'Competition Referee'
        verbose_name_plural = 'Competition Referees'

    def __str__(self):
        return f"{self.athlete.last_name} {self.athlete.first_name} - {self.event.title}"


class RefereePresence(models.Model):
    """Tracks which referees are actively connected to a category scoring page.
    The referee scoring panel pings this endpoint every poll cycle to indicate presence.
    """
    category = models.ForeignKey(
        'Category',
        on_delete=models.CASCADE,
        related_name='referee_presences',
        help_text='The category the referee is scoring'
    )
    referee = models.ForeignKey(
        'Athlete',
        on_delete=models.CASCADE,
        related_name='presence_records',
        help_text='The referee athlete'
    )
    last_ping = models.DateTimeField(
        help_text='Last time the referee pinged from the scoring page'
    )

    class Meta:
        unique_together = ('category', 'referee')
        verbose_name = 'Referee Presence'
        verbose_name_plural = 'Referee Presences'

    def __str__(self):
        return f"Referee {self.referee_id} on category {self.category_id}"


# DISABLED FEATURES (for future use):
# MatchVideoSegment - Timestamp segments within a match video for specific rounds/periods
# RefereePointEventTimestamp - Links a specific referee point event to a video timestamp
# These models are commented out because they are not needed yet.
# To re-enable: uncomment and create a migration.
#
# class MatchVideoSegment(models.Model):
#     """Timestamp segments within a match video for specific rounds/periods."""
#     video_recording = models.ForeignKey('MatchVideoRecording', on_delete=models.CASCADE, related_name='segments')
#     round_number = models.IntegerField(help_text='Round number (1, 2, 3, etc.)')
