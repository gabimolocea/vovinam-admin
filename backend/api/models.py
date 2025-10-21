from django.db import models
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
    
    @property
    def has_pending_athlete_profile(self):
        return hasattr(self, 'athlete_profile') and self.athlete_profile.status == 'pending'
    
    @property
    def has_approved_athlete_profile(self):
        return hasattr(self, 'athlete') and self.athlete is not None

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
    exam_date = models.DateField(blank=True, null=True)  # Date of the exam
    exam_place = models.CharField(max_length=100, blank=True, null=True)  # Place of the exam
    technical_director = models.CharField(max_length=100, blank=True, null=True)  # Technical director of the exam
    president = models.CharField(max_length=100, blank=True, null=True)  # President of the exam
    
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
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted grade"""
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted grade"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted grade"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()


# Yearly Medical Visa
class MedicalVisa(models.Model):
    HEALTH_STATUS_CHOICES = [
        ('approved', 'Approved'),
        ('denied', 'Denied'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]

    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='medical_visas')
    issued_date = models.DateField(blank=True, null=True)  # Renamed from 'date' to 'issued_date'
    health_status = models.CharField(max_length=10, choices=HEALTH_STATUS_CHOICES, default='denied')  # Dropdown for health status
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    medical_document = models.FileField(upload_to='medical_documents/', null=True, blank=True, help_text='Medical examination document')
    medical_image = models.ImageField(upload_to='medical_images/', null=True, blank=True, help_text='Medical certificate photo')
    notes = models.TextField(blank=True, null=True, help_text='Additional notes about the medical examination')
    
    # Approval workflow fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', help_text='Approval status (defaults to approved for admin submissions)')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_medical_visas')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')
    
    @property
    def is_valid(self):
        """
        Determine if the medical visa is valid (within 6 months of the issued date).
        """
        if self.issued_date is None:  # Handle case where issued_date is None
            return False
        expiration_date = self.issued_date + timedelta(days=180)  # 6 months validity
        return date.today() <= expiration_date

    def __str__(self):
        status = "Available" if self.is_valid else "Expired"
        health_status = dict(self.HEALTH_STATUS_CHOICES).get(self.health_status, "Unknown")
        if self.submitted_by_athlete:
            return f"Medical Visa for {self.athlete.first_name} {self.athlete.last_name} (Self-submitted: {self.status}) - {status} ({health_status})"
        return f"Medical Visa for {self.athlete.first_name} {self.athlete.last_name} - {status} ({health_status})"
    
    def save(self, *args, **kwargs):
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
        super().save(*args, **kwargs)
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted medical visa"""
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted medical visa"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted medical visa"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()


# Annual Visa
class AnnualVisa(models.Model):
    VISA_STATUS_CHOICES = [
        ('available', 'Available'),
        ('expired', 'Expired'),
        ('not_available', 'Not Available'),  # Default status
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]

    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='annual_visas')
    issued_date = models.DateField(blank=True, null=True)  # Date when the visa was issued
    visa_status = models.CharField(max_length=15, choices=VISA_STATUS_CHOICES, default='not_available')  # Default status
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    visa_document = models.FileField(upload_to='visa_documents/', null=True, blank=True, help_text='Annual visa document')
    visa_image = models.ImageField(upload_to='visa_images/', null=True, blank=True, help_text='Annual visa certificate photo')
    notes = models.TextField(blank=True, null=True, help_text='Additional notes about the annual visa')
    
    # Approval workflow fields
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='approved', help_text='Approval status (defaults to approved for admin submissions)')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_annual_visas')
    admin_notes = models.TextField(blank=True, null=True, help_text='Admin notes about approval/rejection')

    @property
    def is_valid(self):
        """
        Determine if the annual visa is valid (within 12 months of the issued date).
        """
        if self.issued_date is None:  # Handle case where issued_date is None
            return False
        expiration_date = self.issued_date + timedelta(days=365)  # 12 months validity
        return date.today() <= expiration_date

    def update_visa_status(self):
        """
        Automatically update the visa status based on the issued date.
        """
        if self.issued_date:
            self.visa_status = 'available' if self.is_valid else 'expired'
        else:
            self.visa_status = 'not_available'

    def save(self, *args, **kwargs):
        """
        Override save to automatically update the visa status before saving.
        """
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
            
        self.update_visa_status()
        super().save(*args, **kwargs)

    def __str__(self):
        if self.submitted_by_athlete:
            return f"Annual Visa for {self.athlete.first_name} {self.athlete.last_name} (Self-submitted: {self.status}) - {self.visa_status.capitalize()}"
        return f"Annual Visa for {self.athlete.first_name} {self.athlete.last_name} - {self.visa_status.capitalize()}"
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted annual visa"""
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted annual visa"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted annual visa"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()


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
    
    class Meta:
        unique_together = ('athlete', 'seminar')
    
    def __str__(self):
        if self.submitted_by_athlete:
            return f"{self.athlete.first_name} {self.athlete.last_name} - {self.seminar.name} (Self-submitted: {self.status})"
        return f"{self.athlete.first_name} {self.athlete.last_name} - {self.seminar.name}"
    
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
    
    def reject(self, admin_user, notes=''):
        """Reject the athlete-submitted seminar participation"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
    
    def request_revision(self, admin_user, notes=''):
        """Request revision of the athlete-submitted seminar participation"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()

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
        return f"{self.name} ({self.competition.name})"


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
    Stores referee scores for athletes in a category with approval workflow.
    Athletes can submit their own results which require admin approval.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    category = models.ForeignKey('Category', on_delete=models.CASCADE, related_name='athlete_scores')
    athlete = models.ForeignKey('Athlete', on_delete=models.CASCADE, related_name='category_scores')
    referee = models.ForeignKey('Athlete', on_delete=models.CASCADE, limit_choices_to={'is_referee': True}, null=True, blank=True)
    score = models.IntegerField(default=0)  # Score given by the referee
    
    # Athlete self-submission fields
    submitted_by_athlete = models.BooleanField(default=False, help_text='True if submitted by the athlete themselves')
    placement_claimed = models.CharField(max_length=50, blank=True, null=True, help_text='Placement claimed by athlete (e.g., "1st Place", "2nd Place")')
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
            return f"{self.athlete.first_name} {self.athlete.last_name} - {self.category.name} (Self-submitted: {self.placement_claimed})"
        return f"{self.athlete.first_name} {self.athlete.last_name} - {self.category.name} - Referee: {self.referee.first_name if self.referee else 'N/A'} {self.referee.last_name if self.referee else ''}"
    
    def save(self, *args, **kwargs):
        # If submitted by athlete, set status to pending
        if self.submitted_by_athlete and not self.pk:
            self.status = 'pending'
        # If submitted by referee/admin, set status to approved
        elif not self.submitted_by_athlete:
            self.status = 'approved'
        super().save(*args, **kwargs)
    
    def approve(self, admin_user, notes=''):
        """Approve the athlete-submitted result"""
        from django.utils import timezone
        
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()
        
        # Log the approval
        CategoryScoreActivity.objects.create(
            score=self,
            action='approved',
            performed_by=admin_user,
            notes=f'Result approved. {notes}' if notes else 'Result approved.'
        )
    
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



class FrontendTheme(models.Model):
    """
    Frontend theme configuration for managing design tokens from Django admin.
    Stores comprehensive theme settings including colors, typography, spacing, and component styles.
    """
    name = models.CharField(max_length=100, default='default', unique=True, help_text="Theme name (e.g., 'default', 'dark', 'light')")
    is_active = models.BooleanField(default=False, help_text="Set as the active theme for the frontend")
    
    # Color Settings
    primary_color = models.CharField(max_length=7, default='#0d47a1', help_text="Primary brand color (hex)")
    primary_light = models.CharField(max_length=7, default='#5e7ce2', help_text="Light variant of primary color")
    primary_dark = models.CharField(max_length=7, default='#002171', help_text="Dark variant of primary color")
    secondary_color = models.CharField(max_length=7, default='#f50057', help_text="Secondary accent color")
    background_default = models.CharField(max_length=7, default='#f5f5f5', help_text="Default background color")
    background_paper = models.CharField(max_length=7, default='#ffffff', help_text="Paper/card background color")
    text_primary = models.CharField(max_length=7, default='#212121', help_text="Primary text color")
    text_secondary = models.CharField(max_length=7, default='#757575', help_text="Secondary text color")
    
    # Typography Settings
    font_family = models.CharField(max_length=200, default='BeVietnam, Roboto, Helvetica, Arial, sans-serif', help_text="Font family stack")
    font_size_base = models.IntegerField(default=14, help_text="Base font size in pixels")
    font_weight_normal = models.IntegerField(default=400, help_text="Normal font weight")
    font_weight_medium = models.IntegerField(default=500, help_text="Medium font weight")
    font_weight_bold = models.IntegerField(default=700, help_text="Bold font weight")
    
    # Layout Settings
    border_radius = models.IntegerField(default=8, help_text="Default border radius in pixels")
    spacing_unit = models.IntegerField(default=8, help_text="Base spacing unit in pixels")
    
    # Component Settings
    button_border_radius = models.IntegerField(default=8, help_text="Button border radius")
    card_elevation = models.IntegerField(default=2, help_text="Card shadow elevation")
    table_row_hover = models.CharField(max_length=7, default='#f5f5f5', help_text="Table row hover color")
    
    # Advanced JSON settings for complex customizations
    custom_tokens = models.JSONField(default=dict, blank=True, help_text="Advanced custom theme tokens (JSON format)")
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', 'name']
        verbose_name = "Frontend Theme"
        verbose_name_plural = "Frontend Themes"

    def __str__(self):
        active_indicator = " (Active)" if self.is_active else ""
        return f"{self.name}{active_indicator}"
    
    def save(self, *args, **kwargs):
        # Ensure only one theme is active at a time
        if self.is_active:
            FrontendTheme.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)
    
    @property
    def tokens(self):
        """Generate theme tokens dictionary for frontend consumption"""
        return {
            'colors': {
                'primary': self.primary_color,
                'primaryLight': self.primary_light,
                'primaryDark': self.primary_dark,
                'secondary': self.secondary_color,
                'neutral': {
                    100: self.background_default,
                    0: self.background_paper,
                },
                'text': {
                    'primary': self.text_primary,
                    'secondary': self.text_secondary,
                }
            },
            'typography': {
                'fontFamily': self.font_family,
                'fontSize': {
                    'base': self.font_size_base,
                },
                'fontWeight': {
                    'normal': self.font_weight_normal,
                    'medium': self.font_weight_medium,
                    'bold': self.font_weight_bold,
                }
            },
            'layout': {
                'borderRadius': self.border_radius,
                'spacing': self.spacing_unit,
            },
            'components': {
                'button': {
                    'borderRadius': self.button_border_radius,
                },
                'card': {
                    'elevation': self.card_elevation,
                },
                'table': {
                    'rowHover': self.table_row_hover,
                }
            },
            'custom': self.custom_tokens,
        }
    
    @classmethod
    def get_active_theme(cls):
        """Get the currently active theme"""
        return cls.objects.filter(is_active=True).first()
    
    @classmethod
    def get_active_tokens(cls):
        """Get tokens from the active theme"""
        active_theme = cls.get_active_theme()
        if active_theme:
            return active_theme.tokens
        return {}

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
