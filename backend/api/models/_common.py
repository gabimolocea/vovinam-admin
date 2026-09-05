from django.db import models, transaction
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
from ..mixins import TimestampMixin, SyncMixin, SoftDeleteMixin, AuditMixin
from ..managers import AthleteManager

# Create your models here.

from .teams import Team
class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('athlete', 'Sportiv'),
        ('supporter', 'Susținător'),  # New role for parents/supporters
        ('user', 'Utilizator'),
    ]
    
    role = models.CharField(_('Rol'), max_length=10, choices=ROLE_CHOICES, default='user')
    first_name = models.CharField(_('Prenume'), max_length=150)
    last_name = models.CharField(_('Nume'), max_length=150)
    email = models.EmailField(_('Email'), unique=True)
    
    # New fields for enhanced user management
    phone_number = models.CharField(_('Telefon'), max_length=15, blank=True, null=True)
    date_of_birth = models.DateField(_('Data nașterii'), blank=True, null=True)
    # City removed - use athlete.city instead
    profile_completed = models.BooleanField(_('Profil completat'), default=False)
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']

    class Meta:
        verbose_name = _('Utilizator')
        verbose_name_plural = _('Utilizatori')
    
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


# Shared choices for the standard 4-state approval workflow (pending / approved /
# rejected / revision_required), used by every model that mixes in
# ApprovalWorkflowMixin. Defined once so the labels/values can't drift between
# models (previously copy-pasted verbatim into 6+ model bodies).
APPROVAL_STATUS_CHOICES = [
    ('pending', 'În așteptarea aprobării'),
    ('approved', 'Aprobat'),
    ('rejected', 'Respins'),
    ('revision_required', 'Necesită revizie'),
]


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
        verbose_name = _('Utilizator')
        verbose_name_plural = _('Utilizatori')
    
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
            verbose_name = _('Eveniment')
            verbose_name_plural = _('Evenimente')


    class Competition(Event):
        objects = _LegacyEventManager()
        objects.event_type = 'competition'

        class Meta:
            proxy = True
            app_label = 'api'
            verbose_name = _('Competiție')
            verbose_name_plural = _('Competiții')

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
            verbose_name = _('Seminar de pregătire')
            verbose_name_plural = _('Seminare de pregătire')

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


class Grade(models.Model):
    GRADE_TYPE_CHOICES = [
        ('inferior', 'Grad inferior'),
        ('superior', 'Grad superior'),
    ]

    name = models.CharField(_('Nume'), max_length=100)
    rank_order = models.IntegerField(_('Ordine rang'), default=0)  # Rank order for grades (higher value = higher rank)
    grade_type = models.CharField(_('Tip grad'), max_length=10, choices=GRADE_TYPE_CHOICES, default='inferior')  # Type of grade
    image = models.ImageField(
        _('Imagine'),
        upload_to='grades/',
        blank=True,
        null=True,
        help_text=_('Imaginea emblemei gradului (SVG sau PNG).')
    )
    created = models.DateTimeField(_('Data creării'), auto_now_add=True)
    modified = models.DateTimeField(_('Data actualizării'), auto_now=True)

    class Meta:
        verbose_name = _('Grad')
        verbose_name_plural = _('Grade')

    def __str__(self):
        return f"{self.name} (Rank: {self.rank_order}, Type: {self.get_grade_type_display()})"


class Athlete(TimestampMixin, SyncMixin, SoftDeleteMixin, AuditMixin, ApprovalWorkflowMixin, models.Model):
    """
    Unified Athlete model that handles both pending and approved athletes.
    Replaces the separate AthleteProfile system for simplified workflow.
    Enhanced with: timestamps, sync tracking, soft delete, and audit trail.
    """
    STATUS_CHOICES = APPROVAL_STATUS_CHOICES

    GENDER_CHOICES = [
        ('male', 'Masculin'),
        ('female', 'Feminin'),
    ]
    
    # Custom manager for optimized queries
    objects = AthleteManager()
    
    # Link to User account - required for new athletes
    user = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        verbose_name=_('Utilizator'),
        related_name='athlete',
        blank=True,
        null=True
    )
    
    # Personal Data
    first_name = models.CharField(_('Prenume'), max_length=100)
    last_name = models.CharField(_('Nume'), max_length=100)
    gender = models.CharField(_('Gen'), max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    license_series = models.CharField(_('Serie legitimație'), max_length=50, blank=True, null=True)
    cnp = models.CharField(_('CNP'), max_length=13, blank=True, null=True)
    date_of_birth = models.DateField(_('Data nașterii'), blank=True, null=True)
    team_place = models.CharField(_('Loc obținut cu echipa'), max_length=50, blank=True, null=True)  # Place awarded to the athlete in a team competition
    address = models.TextField(_('Adresă'), blank=True, null=True)
    mobile_number = models.CharField(_('Telefon mobil'), max_length=15, blank=True, null=True)
    
    # Emergency Contact Information (from AthleteProfile)
    emergency_contact_name = models.CharField(_('Nume contact de urgență'), max_length=100, blank=True, null=True)
    emergency_contact_phone = models.CharField(_('Telefon contact de urgență'), max_length=15, blank=True, null=True)
    
    # Previous Experience (from AthleteProfile)
    previous_experience = models.TextField(
        _('Experiență anterioară'),
        blank=True,
        null=True,
        help_text=_('Experiența anterioară în arte marțiale.')
    )
    
    # Sport-related data
    club = models.ForeignKey(
        'Club',
        on_delete=models.SET_NULL,
        verbose_name=_('Club'),
        related_name='athletes',
        blank=True,
        null=True
    )
    city = models.ForeignKey(
        'City',
        on_delete=models.SET_NULL,
        verbose_name=_('Oraș'),
        related_name='athletes',
        blank=True,
        null=True
    )
    current_grade = models.ForeignKey(
        Grade,
        on_delete=models.SET_NULL,
        verbose_name=_('Grad curent'),
        related_name='current_athletes',
        blank=True,
        null=True
    )  # Automatically set based on GradeHistory
    federation_role = models.ForeignKey(
        'FederationRole',
        on_delete=models.SET_NULL,
        verbose_name=_('Rol în federație'),
        related_name='athletes',
        blank=True,
        null=True
    )
    title = models.ForeignKey(
        'Title',
        on_delete=models.SET_NULL,
        verbose_name=_('Titlu'),
        related_name='athletes',
        blank=True,
        null=True
    )
    registered_date = models.DateField(_('Data înregistrării'), blank=True, null=True)
    expiration_date = models.DateField(_('Data expirării'), blank=True, null=True)
    is_coach = models.BooleanField(_('Antrenor'), default=False)
    is_referee = models.BooleanField(_('Arbitru'), default=False)
    
    # Documents
    profile_image = models.ImageField(
        _('Imagine profil'),
        upload_to='profile_images/', blank=True, null=True, default='profile_images/default.png'
    )  # Optional profile image with default
    medical_certificate = models.FileField(_('Certificat medical'), upload_to='medical_certificates/', blank=True, null=True)
    
    # Approval workflow (merged from AthleteProfile)
    status = models.CharField(_('Stare'), max_length=20, choices=STATUS_CHOICES, default='pending')
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    reviewed_date = models.DateTimeField(_('Data revizuirii'), blank=True, null=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, verbose_name=_('Revizuit de'), blank=True, null=True, related_name='reviewed_athletes')
    admin_notes = models.TextField(_('Note administrator'), blank=True, null=True, help_text=_('Note ale administratorului despre aprobare sau respingere.'))
    
    # Legacy approval tracking (keep for compatibility)
    approved_date = models.DateTimeField(_('Data aprobării'), blank=True, null=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, verbose_name=_('Aprobat de'), blank=True, null=True, related_name='approved_athletes')

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
        verbose_name = _('Sportiv')
        verbose_name_plural = _('Sportivi')

    def update_current_grade(self):
        """
        Automatically set the current_grade to the highest-ranked grade among
        this athlete's *approved* GradeHistory entries. Pending/rejected/
        revision-required entries are ignored so they can never overwrite an
        athlete's grade before being reviewed.
        """
        highest_grade = self.grade_history.filter(status='approved').order_by('-grade__rank_order').first()
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
        # Clear legacy approval metadata so `can_add_results`/downstream checks
        # don't keep treating a previously-approved-then-rejected athlete as approved.
        self.approved_date = None
        self.approved_by = None
        self._transition_status('rejected', admin_user, reason, set_notes=bool(reason))
    
    def request_revision(self, admin_user, reason=None):
        """Request revision of the athlete profile"""
        self.approved_date = None
        self.approved_by = None
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

    def visa_warnings(self):
        """Non-blocking check: returns Romanian warning strings for any
        expired/missing visa (medical or annual). Enrollment is not blocked
        on this — it's surfaced to the enrolling user/admin as a warning."""
        warnings = []
        visas = {v.visa_type: v for v in self.visas.all()}
        for visa_type, label in Visa.VISA_TYPE_CHOICES:
            visa = visas.get(visa_type)
            if not visa or visa.visa_status != 'Valid':
                status_label = visa.visa_status if visa else 'Lipsă'
                warnings.append(f'Viza {label.lower()} este {status_label.lower()}.')
        return warnings

    def __str__(self):
        club_name = f", {self.club.name}" if self.club else ""
        return f"{self.first_name} {self.last_name}{club_name}"


class GradeHistory(ApprovalWorkflowMixin, models.Model):
    LEVEL_CHOICES = [
        ('good', 'Bine'),
        ('bad', 'Slab'),
    ]
    
    STATUS_CHOICES = APPROVAL_STATUS_CHOICES

    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, verbose_name=_('Sportiv'), related_name='grade_history')
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, verbose_name=_('Grad'))
    obtained_date = models.DateField(_('Data obținerii'), default=date.today)  # Date when the grade was obtained
    level = models.CharField(_('Nivel'), max_length=10, choices=LEVEL_CHOICES, default='good')  # Dropdown for level
    # Link GradeHistory to an Event (optional). Use landing.Event model which is part of the landing app.
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.SET_NULL,
        verbose_name=_('Eveniment'),
        null=True,
        blank=True,
        related_name='grade_histories',
        help_text=_('Evenimentul opțional asociat acestui examen de grad.')
    )
    # exam_place removed
    # New explicit examiners: allow selecting from all athletes
    examiner_1 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        verbose_name=_('Examinator 1'),
        null=True,
        blank=True,
        related_name='grades_as_examiner1'
    )
    examiner_2 = models.ForeignKey(
        'Athlete',
        on_delete=models.SET_NULL,
        verbose_name=_('Examinator 2'),
        null=True,
        blank=True,
        related_name='grades_as_examiner2'
    )
    # President field removed; not used anymore
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(_('Trimis de sportiv'), default=False, help_text=_('Bifat dacă a fost trimis chiar de sportiv.'))
    certificate_image = models.ImageField(_('Imagine certificat'), upload_to='grade_certificates/', null=True, blank=True, help_text=_('Fotografie a certificatului de grad.'))
    result_document = models.FileField(_('Document rezultat'), upload_to='grade_documents/', null=True, blank=True, help_text=_('Documentul oficial al examenului de grad.'))
    notes = models.TextField(_('Note'), blank=True, null=True, help_text=_('Note suplimentare despre examenul de grad.'))
    
    # Approval workflow fields
    status = models.CharField(_('Stare'), max_length=20, choices=STATUS_CHOICES, default='approved', help_text=_('Starea aprobării (implicit aprobat pentru înregistrările adăugate de administrator).'))
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    reviewed_date = models.DateTimeField(_('Data revizuirii'), null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, verbose_name=_('Revizuit de'), null=True, blank=True, related_name='reviewed_grades')
    admin_notes = models.TextField(_('Note administrator'), blank=True, null=True, help_text=_('Note ale administratorului despre aprobare sau respingere.'))

    class Meta:
        indexes = [
            models.Index(fields=['athlete', 'status']),
            models.Index(fields=['obtained_date']),
            models.Index(fields=['status', 'submitted_date']),
        ]
        verbose_name = _('Istoric grad')
        verbose_name_plural = _('Istoric grade')

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
        from ..notification_utils import create_grade_status_notification
        create_grade_status_notification(self, status, admin_user, notes)


# Yearly Medical Visa



# Unified Visa model (new) - covers both medical and annual visas.
class Visa(ApprovalWorkflowMixin, models.Model):
    VISA_TYPE_CHOICES = [
        ('medical', 'Medicală'),
        ('annual', 'Anuală'),
    ]

    STATUS_CHOICES = APPROVAL_STATUS_CHOICES

    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, verbose_name=_('Sportiv'), related_name='visas')
    visa_type = models.CharField(_('Tip viză'), max_length=10, choices=VISA_TYPE_CHOICES)
    issued_date = models.DateField(_('Data emiterii'), blank=True, null=True)

    # Fields that may be used for either type
    document = models.FileField(_('Document'), upload_to='visa_documents/', null=True, blank=True)
    image = models.ImageField(_('Imagine'), upload_to='visa_images/', null=True, blank=True)
    notes = models.TextField(_('Note'), blank=True, null=True)

    # Medical-specific status (optional)
    health_status = models.CharField(
        _('Stare medicală'),
        max_length=10,
        choices=[('approved', 'Aprobat'), ('denied', 'Respins')],
        null=True,
        blank=True
    )

    # Approval workflow
    status = models.CharField(_('Stare'), max_length=20, choices=STATUS_CHOICES, default='approved')
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    reviewed_date = models.DateTimeField(_('Data revizuirii'), null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, verbose_name=_('Revizuit de'), null=True, blank=True, related_name='reviewed_visas')
    admin_notes = models.TextField(_('Note administrator'), blank=True, null=True)

    class Meta:
        verbose_name = _('Viză')
        verbose_name_plural = _('Vize')
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
        # Use the federation's local date (not naive date.today()) so validity
        # doesn't flip early/late around midnight due to server timezone.
        return timezone.localdate() <= expiration

    @property
    def visa_status(self):
        """Computed fresh on every access (never stored/stale).

        Previously this was a plain CharField set once in save(), so a visa
        issued today could still display "Valid" in the admin/API months
        after it had actually expired, because nothing ever re-saved the row.
        """
        if self.visa_type == 'medical' and self.health_status == 'approved':
            return 'Valid'
        if not self.issued_date:
            return 'Not available'
        return 'Valid' if self.is_valid() else 'Expired'

    def save(self, *args, **kwargs):
        # NOTE: this used to also force status back to 'approved' on every
        # save() whenever `submitted_by_athlete` wasn't set — but Visa has no
        # such field/param, so that branch was always true and silently
        # reset any pending/rejected/revision_required status back to
        # 'approved' on the very next save (e.g. from an approve()/reject()
        # call). The field's `default='approved'` already covers the normal
        # admin-created case, so no override is needed here anymore.
        super().save(*args, **kwargs)

    def __str__(self):
        status = 'Valid' if self.is_valid() else 'Expired'
        return f"{self.get_visa_type_display()} pentru {self.athlete} - {status}"


# Training Seminars
class TrainingSeminarParticipation(ApprovalWorkflowMixin, models.Model):
    """
    Athlete participation in events (training seminars, competitions, etc.) with approval workflow.
    Migrated from TrainingSeminar to use Event model directly.
    """
    STATUS_CHOICES = APPROVAL_STATUS_CHOICES
    
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, verbose_name=_('Sportiv'), related_name='seminar_participations')
    # Legacy seminar field - deprecated, use event instead
    seminar = models.ForeignKey('landing.Event', on_delete=models.SET_NULL, verbose_name=_('Seminar'), related_name='legacy_participations', null=True, blank=True)
    # Primary event field
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.CASCADE,
        verbose_name=_('Eveniment'),
        null=True,
        blank=True,
        related_name='seminar_participations',
        help_text=_('Evenimentul la care a participat acest sportiv.')
    )
    submitted_by_athlete = models.BooleanField(_('Trimis de sportiv'), default=False, help_text=_('Bifat dacă a fost trimis chiar de sportiv.'))
    participation_certificate = models.ImageField(_('Certificat de participare'), upload_to='seminar_certificates/', null=True, blank=True, help_text=_('Fotografie a certificatului de participare.'))
    participation_document = models.FileField(_('Document de participare'), upload_to='seminar_documents/', null=True, blank=True, help_text=_('Documentul oficial de participare.'))
    notes = models.TextField(_('Note'), blank=True, null=True, help_text=_('Note suplimentare despre participare.'))
    
    # Approval workflow fields
    status = models.CharField(_('Stare'), max_length=20, choices=STATUS_CHOICES, default='approved', help_text=_('Starea aprobării (implicit aprobat pentru înregistrările adăugate de administrator).'))
    submitted_date = models.DateTimeField(_('Data trimiterii'), auto_now_add=True)
    reviewed_date = models.DateTimeField(_('Data revizuirii'), null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, verbose_name=_('Revizuit de'), null=True, blank=True, related_name='reviewed_seminar_participations')
    admin_notes = models.TextField(_('Note administrator'), blank=True, null=True, help_text=_('Note ale administratorului despre aprobare sau respingere.'))
    
    class Meta:
        unique_together = ('athlete', 'event')
        verbose_name = _('Participare la eveniment')
        verbose_name_plural = _('Participări la evenimente')
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
            target_name = 'Eveniment necunoscut'

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
        from ..notification_utils import create_seminar_status_notification
        create_seminar_status_notification(self, status, admin_user, notes)


# Proxy model to present TrainingSeminarParticipation as EventParticipation
# in the admin and API surface without changing the underlying table.
class EventParticipation(TrainingSeminarParticipation):
    class Meta:
        proxy = True
        verbose_name = _('Participare la eveniment')
        verbose_name_plural = _('Participări la evenimente')
