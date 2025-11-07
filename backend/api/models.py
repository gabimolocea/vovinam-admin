from django.db import models
from django.db.models import F
from django.core.exceptions import ValidationError
from django.contrib import admin
from django.contrib.auth.models import AbstractUser
from datetime import date, timedelta
from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError

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
    city = models.ForeignKey('City', on_delete=models.SET_NULL, blank=True, null=True)
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
    def is_supporter(self):
        return self.role == 'supporter'


# Proxy model so the custom User appears under Django's 'auth' app section in admin
class UserProxy(User):
    class Meta:
        proxy = True
        app_label = 'auth'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    @property
    def has_pending_athlete_profile(self):
        return hasattr(self, 'athlete_profile') and self.athlete_profile.status == 'pending'
    
    @property
    def has_approved_athlete_profile(self):
        return hasattr(self, 'athlete') and self.athlete is not None


# Proxy model to show the landing Event under the API section in Django admin
try:
    # Import here to avoid circular import issues during migrations
    from landing.models import Event as LandingEvent

    class Event(LandingEvent):
        class Meta:
            proxy = True
            app_label = 'api'
            verbose_name = 'Event'
            verbose_name_plural = 'Events'
except Exception:
    # During some migration or import-time operations the landing app
    # may not be fully importable; silently skip proxy creation in that case.
    pass

class City(models.Model):
    name = models.CharField(max_length=100, unique=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
    
class Competition(models.Model):
    name = models.CharField(max_length=100)
    place = models.CharField(max_length=100, blank=True, null=True)  # Place of the competition
    
    start_date = models.DateField(blank=True, null=True)  # Start date of the competition
    end_date = models.DateField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.start_date} - {self.end_date})"


class Club(models.Model):
    name = models.CharField(max_length=100, unique=True)
    logo = models.ImageField(upload_to='club_logos/', blank=True, null=True)  # Optional logo field
    city = models.ForeignKey(
        City, 
        on_delete=models.CASCADE, 
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
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

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


class Athlete(models.Model):
    """
    Unified Athlete model that handles both pending and approved athletes.
    Replaces the separate AthleteProfile system for simplified workflow.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    # Link to User account
    user = models.OneToOneField(User, on_delete=models.SET_NULL, related_name='athlete', blank=True, null=True)
    
    # Personal Data
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
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
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.approved_date = timezone.now()  # Legacy field
        self.approved_by = admin_user  # Legacy field
        self.save()
        
        # Log the activity
        AthleteActivity.objects.create(
            athlete=self,
            action='approved',
            performed_by=admin_user,
            notes=f"Profile approved by {admin_user.get_full_name() or admin_user.username}"
        )
    
    def reject(self, admin_user, reason=None):
        """Reject the athlete profile"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        if reason:
            self.admin_notes = reason
        self.save()
        
        # Log the activity
        AthleteActivity.objects.create(
            athlete=self,
            action='rejected',
            performed_by=admin_user,
            notes=reason or f"Profile rejected by {admin_user.get_full_name() or admin_user.username}"
        )
    
    def request_revision(self, admin_user, reason=None):
        """Request revision of the athlete profile"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        if reason:
            self.admin_notes = reason
        self.save()
        
        # Log the activity
        AthleteActivity.objects.create(
            athlete=self,
            action='revision_requested',
            performed_by=admin_user,
            notes=reason or f"Revision requested by {admin_user.get_full_name() or admin_user.username}"
        )
    
    def resubmit(self):
        """Resubmit profile after revision"""
        from django.utils import timezone
        
        self.status = 'pending'
        self.submitted_date = timezone.now()
        self.reviewed_date = None
        self.reviewed_by = None
        self.save()
        
        # Log the activity
        AthleteActivity.objects.create(
            athlete=self,
            action='resubmitted',
            performed_by=self.user,
            notes=f"Profile resubmitted by {self.user.get_full_name() or self.user.username}"
        )

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
        return f"{self.first_name} {self.last_name}"


class AthleteActivity(models.Model):
    """
    Track all activities on athlete profiles (approvals, rejections, edits)
    """
    ACTION_CHOICES = [
        ('submitted', 'Profile Submitted'),
        ('approved', 'Profile Approved'),
        ('rejected', 'Profile Rejected'),
        ('revision_requested', 'Revision Requested'),
        ('updated', 'Profile Updated'),
        ('resubmitted', 'Profile Resubmitted'),
    ]
    
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='activity_log')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(User, on_delete=models.CASCADE)
    notes = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Athlete Activity"
        verbose_name_plural = "Athlete Activities"
    
    def __str__(self):
        return f"{self.get_action_display()} - {self.athlete} by {self.performed_by}"


class GradeHistory(models.Model):
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
    obtained_date = models.DateField(auto_now_add=True)  # Date when the grade was obtained
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

    def __str__(self):
        if self.submitted_by_athlete:
            return f"{self.grade.name} for {self.athlete.first_name} {self.athlete.last_name} (Self-submitted: {self.status})"
        return f"{self.grade.name} for {self.athlete.first_name} {self.athlete.last_name} on {self.obtained_date}"
    
    def save(self, *args, **kwargs):
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
        super().save(*args, **kwargs)

        # Ensure the seminar M2M stays in sync: add athlete to seminar.athletes when a participation exists
        try:
            if self.seminar and self.athlete:
                # Use add() which is safe if already present
                self.seminar.athletes.add(self.athlete)
        except Exception:
            # Don't let auxiliary M2M sync failures block the main save
            pass

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
        """When a participation is removed, remove the athlete from the seminar M2M
        only if there are no other participation records linking them to the seminar.
        """
        seminar = self.seminar
        athlete = self.athlete
        super().delete(*args, **kwargs)
        try:
            if seminar and athlete:
                exists = TrainingSeminarParticipation.objects.filter(athlete=athlete, seminar=seminar).exists()
                if not exists:
                    seminar.athletes.remove(athlete)
        except Exception:
            # Ignore M2M cleanup errors
            pass
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted grade"""
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Create notification for grade approval
        from .notification_utils import create_grade_status_notification
        create_grade_status_notification(self, 'approved', admin_user, notes)
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted grade"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Create notification for grade rejection
        from .notification_utils import create_grade_status_notification
        create_grade_status_notification(self, 'rejected', admin_user, notes)
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted grade"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Create notification for grade revision request
        from .notification_utils import create_grade_status_notification
        create_grade_status_notification(self, 'revision_required', admin_user, notes)


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
        verbose_name = 'Visa'
        verbose_name_plural = 'Visas'

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

        # Update visa_status for annual visas
        if self.visa_type == 'annual':
            if self.issued_date:
                self.visa_status = 'available' if self.is_valid() else 'expired'
            else:
                self.visa_status = 'not_available'

        super().save(*args, **kwargs)

    def __str__(self):
        status = 'Valid' if self.is_valid() else 'Expired'
        return f"{self.get_visa_type_display()} Visa for {self.athlete} - {status}"


# Training Seminars
class TrainingSeminar(models.Model):
    name = models.CharField(max_length=100)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    place = models.CharField(max_length=100)
    athletes = models.ManyToManyField(Athlete, related_name='training_seminars', blank=True)

    def __str__(self):
        return f"{self.name} ({self.start_date} - {self.end_date}) at {self.place}"


class TrainingSeminarParticipation(models.Model):
    """
    Through model to track athlete participation in training seminars with approval workflow.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='seminar_participations')
    seminar = models.ForeignKey(TrainingSeminar, on_delete=models.CASCADE, related_name='participations')
    
    # Athlete self-submission fields
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
    # New nullable FK to Landing.Event for staged migration to Events
    event = models.ForeignKey(
        'landing.Event',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='seminar_participations',
        help_text='Linked Event after migration (nullable, added for staged migration)'
    )
    
    class Meta:
        unique_together = ('athlete', 'seminar')
        verbose_name = 'Event participation'
        verbose_name_plural = 'Event participations'
    
    def __str__(self):
        # Prefer to describe the participation by the linked Event if present;
        # fall back to the legacy TrainingSeminar name if `event` is not set.
        target_name = None
        try:
            if getattr(self, 'event', None):
                # landing.Event uses `title` for the human-readable name
                target_name = getattr(self.event, 'title', None)
        except Exception:
            target_name = None
        if not target_name:
            try:
                target_name = getattr(self.seminar, 'name', None)
            except Exception:
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
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Create notification for seminar participation approval
        from .notification_utils import create_seminar_status_notification
        create_seminar_status_notification(self, 'approved', admin_user, notes)
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted seminar participation"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Create notification for seminar participation rejection
        from .notification_utils import create_seminar_status_notification
        create_seminar_status_notification(self, 'rejected', admin_user, notes)
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted seminar participation"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Create notification for seminar participation revision request
        from .notification_utils import create_seminar_status_notification
        create_seminar_status_notification(self, 'revision_required', admin_user, notes)


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
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name="enrolled_athletes")
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE)
    weight = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)  # Weight in kilograms

    class Meta:
        unique_together = ('category', 'athlete')  # Ensure an athlete cannot be added twice to the same category

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
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='enrolled_teams')
    team = models.ForeignKey('Team', on_delete=models.CASCADE, related_name='enrolled_categories')  # Rename related_name

    class Meta:
        unique_together = ('category', 'team')  # Ensure a team cannot be added twice to the same category

    def __str__(self):
        return f"{self.team.name} in {self.category.name}"


class Team(models.Model):
    """
    Represents a team of athletes.
    """
    name = models.CharField(max_length=255, blank=True)  # Auto-generated name
    categories = models.ManyToManyField(
        'Category',
        through='CategoryTeam',  # Use the existing through model
        related_name='team_categories',
        blank=True,
        limit_choices_to={'type': 'teams'},  # Only allow categories with type 'teams'
    )


    def __str__(self):
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
        return f"{self.athlete.first_name} {self.athlete.last_name} in {self.team.name}"


class Category(models.Model):
    """
    Represents a competition category.
    """
    CATEGORY_TYPE_CHOICES = [
        ('solo', 'Solo'),
        ('teams', 'Teams'),
        ('fight', 'Fight'),
    ]

    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('mixt', 'Mixt'),
    ]

    name = models.CharField(max_length=100)
    competition = models.ForeignKey('Competition', on_delete=models.CASCADE, related_name='categories')
    # New: link category to landing.Event (migrate data from Competition -> Event)
    event = models.ForeignKey('landing.Event', on_delete=models.SET_NULL, related_name='categories', null=True, blank=True)
    type = models.CharField(max_length=20, choices=CATEGORY_TYPE_CHOICES, default='solo')
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, default='mixt')
    athletes = models.ManyToManyField('Athlete', through='CategoryAthlete', related_name='categories', blank=True)
    teams = models.ManyToManyField('Team', through='CategoryTeam', related_name='category_teams', blank=True)

    first_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='first_place_categories')
    second_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='second_place_categories')
    third_place = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='third_place_categories')

    first_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='first_place_team_categories')
    second_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='second_place_team_categories')
    third_place_team = models.ForeignKey('Team', on_delete=models.SET_NULL, null=True, blank=True, related_name='third_place_team_categories')

    group = models.ForeignKey(
        'Group',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='categories'
    )  # Each category can be assigned to one group


    def clean(self):
        """
        Validate that the awarded individual or team is enrolled in the category and not awarded multiple times.
        """
        if self.type == 'teams':
            # Validate teams
            awarded_teams = [self.first_place_team, self.second_place_team, self.third_place_team]
            # Ensure no duplicate awards for teams
            awarded_teams = list(filter(None, awarded_teams))  # Convert filter result to a list
            if len(set(awarded_teams)) != len(awarded_teams):
                raise ValidationError("The same team cannot be awarded multiple times within the same category.")

            # Ensure teams are enrolled before being awarded
            for team in awarded_teams:
                if team and not self.teams.filter(pk=team.pk).exists():
                    raise ValidationError(f"Team '{team}' must be enrolled in the category to be awarded.")
        elif self.type in ['solo', 'fight']:
            # Validate individuals
            awarded_athletes = [self.first_place, self.second_place, self.third_place]
            # Ensure no duplicate awards for athletes
            awarded_athletes = list(filter(None, awarded_athletes))  # Convert filter result to a list
            if len(set(awarded_athletes)) != len(awarded_athletes):
                raise ValidationError("The same athlete cannot be awarded multiple times within the same category.")

            # Ensure athletes are enrolled before being awarded
            for athlete in awarded_athletes:
                if athlete and not CategoryAthlete.objects.filter(category=self, athlete=athlete).exists():
                    raise ValidationError(f"Athlete '{athlete}' must be enrolled in the category to be awarded.")


    def calculate_athlete_scores(self):
        """
        Calculate total scores for each athlete in the category.
        """
        athlete_scores = {}
        for score in self.athlete_scores.all():
            athlete_scores[score.athlete] = athlete_scores.get(score.athlete, 0) + score.score
        return athlete_scores

    
    

    def save(self, *args, **kwargs):
        # Check if the type has changed
        if self.pk:  # Ensure this is not a new instance
            old_instance = Category.objects.get(pk=self.pk)
            if old_instance.type != self.type:
                # If the type has changed, clear athletes and teams
                self.athletes.clear()
                self.teams.clear()

        # Save the instance
        super().save(*args, **kwargs)


    def __str__(self):
        # Prefer an associated Event (new model) if present; fall back to legacy Competition
        associated = getattr(self, 'event', None) or getattr(self, 'competition', None)
        assoc_name = None
        if associated is not None:
            assoc_name = getattr(associated, 'name', None) or getattr(associated, 'title', None)
        return f"{self.name} ({assoc_name or 'N/A'})"

    @property
    def event_or_competition(self):
        """
        Compatibility helper: return the linked Event if present, otherwise the legacy Competition.
        Callers should use this to avoid repeatedly checking both fields while we migrate data.
        """
        return self.event if getattr(self, 'event', None) else self.competition


class Match(models.Model):
    MATCH_TYPE_CHOICES = [
        ('qualifications', 'Qualifications'),
        ('semi-finals', 'Semi-Finals'),
        ('finals', 'Finals'),
    ]

    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='matches')
    match_type = models.CharField(max_length=20, choices=MATCH_TYPE_CHOICES, default='qualifications')
    red_corner = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='red_corner_matches')
    blue_corner = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='blue_corner_matches')
    referees = models.ManyToManyField('Athlete', related_name='refereed_matches', limit_choices_to={'is_referee': True})
    winner = models.ForeignKey('Athlete', on_delete=models.SET_NULL, null=True, blank=True, related_name='won_matches')
    name = models.CharField(max_length=255, blank=True)  # Automatically generated match name

    def calculate_winner(self):
        """
        Determine the winner based on referee votes.
        """
        red_votes = self.referee_scores.filter(winner='red').count()
        blue_votes = self.referee_scores.filter(winner='blue').count()
        if red_votes > blue_votes:
            return self.red_corner
        elif blue_votes > red_votes:
            return self.blue_corner
        return None  # No winner if votes are tied

    def save(self, *args, **kwargs):
        """
        Override save to calculate the winner based on referee scores or allow manual winner selection.
        """
        # Save the instance first to ensure it has a primary key
        if not self.pk:
            super().save(*args, **kwargs)
            self.refresh_from_db()  # Reload the instance to ensure it has a primary key

        # Generate the match name
        self.name = f"{self.red_corner.first_name} vs {self.blue_corner.first_name} ({self.match_type}) - {self.category.name}"

        # Calculate the winner based on referee scores if they exist
        if self.pk and self.referee_scores.exists():
            self.winner = self.calculate_winner()
        else:
            # Allow manual winner selection if no referee scores exist
            if not self.winner:
                self.winner = None  # Clear the winner if not manually set

        # Save again to update the winner field and name
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class RefereeScore(models.Model):
    match = models.ForeignKey('Match', on_delete=models.CASCADE, related_name='referee_scores')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True})
    red_corner_score = models.IntegerField(default=0)
    blue_corner_score = models.IntegerField(default=0)
    winner = models.CharField(max_length=10, choices=[('red', 'Red Corner'), ('blue', 'Blue Corner')], null=True, blank=True)

    def __str__(self):
        return f"Referee: {self.referee.first_name} {self.referee.last_name} - Match: {self.match}"


class CategoryAthleteScore(models.Model):
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
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='category_scores')
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

    def __str__(self):
        if self.submitted_by_athlete:
            placement_info = f"claims {self.placement_claimed}" if self.placement_claimed else "no placement claimed"
            return f"{self.athlete.first_name} {self.athlete.last_name} - {self.category.name} (Athlete {placement_info})"
        else:
            referee_name = f"{self.referee.first_name} {self.referee.last_name}" if self.referee else "N/A"
            return f"{self.athlete.first_name} {self.athlete.last_name} - {self.category.name} (Referee: {referee_name}, Score: {self.score})"
    
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
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Auto-populate Category awards if placement is claimed
        if self.submitted_by_athlete and self.placement_claimed:
            self._update_category_awards()
        
        # Log the approval
        CategoryScoreActivity.objects.create(
            score=self,
            action='approved',
            performed_by=admin_user,
            notes=f'Result approved and category awards updated. {notes}' if notes else 'Result approved and category awards updated.'
        )
        
        # Create notification for result approval
        from .notification_utils import create_result_status_notification
        create_result_status_notification(self, 'approved', admin_user, notes)
    
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
            member_names = [f"{m.first_name} {m.last_name}" for m in self.team_members.all()[:3]]
            auto_generated_name = f"{', '.join(member_names)}"
            if self.team_members.count() > 3:
                auto_generated_name += f" (+{self.team_members.count() - 3} more)"
            
            # Update the team name and save
            self.team_name = auto_generated_name
            self.save(update_fields=['team_name'])
            return auto_generated_name
        return None

    def _create_or_update_team(self):
        """Create or update Team object when team result is approved"""
        if not self.team_members.exists():
            return
            
        # Always auto-generate team name from team member names
        member_names = [f"{m.first_name} {m.last_name}" for m in self.team_members.all()[:3]]
        auto_generated_name = f"{', '.join(member_names)}"
        if self.team_members.count() > 3:
            auto_generated_name += f" (+{self.team_members.count() - 3} more)"
        
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
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted result"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Log the rejection
        CategoryScoreActivity.objects.create(
            score=self,
            action='rejected',
            performed_by=admin_user,
            notes=f'Result rejected. {notes}' if notes else 'Result rejected.'
        )
        
        # Create notification for result rejection
        from .notification_utils import create_result_status_notification
        create_result_status_notification(self, 'rejected', admin_user, notes)
    
    def request_revision(self, admin_user, notes=''):
        """Request revision on the athlete-submitted result"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Log the revision request
        CategoryScoreActivity.objects.create(
            score=self,
            action='revision_requested',
            performed_by=admin_user,
            notes=f'Revision requested. {notes}' if notes else 'Revision requested.'
        )
        
        # Create notification for revision request
        from .notification_utils import create_result_status_notification
        create_result_status_notification(self, 'revision_required', admin_user, notes)


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


class CategoryScoreActivity(models.Model):
    """
    Activity log for category athlete score approvals and changes.
    """
    ACTION_CHOICES = [
        ('submitted', 'Result Submitted'),
        ('approved', 'Result Approved'),
        ('rejected', 'Result Rejected'),
        ('revision_requested', 'Revision Requested'),
        ('updated', 'Result Updated'),
        ('resubmitted', 'Result Resubmitted'),
        ('deleted', 'Result Deleted'),
    ]
    
    score = models.ForeignKey('CategoryAthleteScore', on_delete=models.CASCADE, related_name='activity_log')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(User, on_delete=models.CASCADE)
    notes = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Score Activity"
        verbose_name_plural = "Score Activities"
    
    def __str__(self):
        return f"{self.get_action_display()} - {self.score} by {self.performed_by}"




class Group(models.Model):
    """
    Represents a group within a competition.
    """
    name = models.CharField(max_length=100, unique=True)  # Name of the group
    competition = models.ForeignKey(
        'Competition',
        on_delete=models.CASCADE,
        related_name='groups'
    )  # Link each group to a specific competition

    def __str__(self):
        return f"{self.name} ({self.competition.name})"

 
# FrontendTheme model removed — dynamic theme management has been deleted.
# The database migration that originally created the model remains; a
# subsequent migration will drop the table when applied.

# AthleteProfile and AthleteProfileActivity models removed - functionality consolidated into Athlete and AthleteActivity models


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
    competition = models.ForeignKey(Competition, on_delete=models.CASCADE, related_name='athlete_matches', blank=True, null=True)
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
        verbose_name = 'Athlete Match'
        verbose_name_plural = 'Athlete Matches'
    
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
    related_competition = models.ForeignKey('Competition', on_delete=models.CASCADE, null=True, blank=True)
    
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
