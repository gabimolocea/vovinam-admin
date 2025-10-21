# Add these to your existing models.py

class AthleteProfile(models.Model):
    """
    Pending athlete profile that requires admin approval before becoming an Athlete.
    This separates the registration process from the approved athlete data.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    # Link to User account
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='athlete_profile')
    
    # Personal Data (same as Athlete model)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    address = models.TextField(blank=True, null=True)
    mobile_number = models.CharField(max_length=15, blank=True, null=True)
    
    # Sport-related data
    club = models.ForeignKey(Club, on_delete=models.SET_NULL, blank=True, null=True)
    city = models.ForeignKey(City, on_delete=models.SET_NULL, blank=True, null=True)
    previous_experience = models.TextField(blank=True, null=True, help_text="Previous martial arts experience")
    emergency_contact_name = models.CharField(max_length=100, blank=True, null=True)
    emergency_contact_phone = models.CharField(max_length=15, blank=True, null=True)
    
    # Approval workflow
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='reviewed_profiles')
    admin_notes = models.TextField(blank=True, null=True, help_text="Admin notes about approval/rejection")
    
    # Documents
    profile_image = models.ImageField(upload_to='pending_profiles/', blank=True, null=True)
    medical_certificate = models.FileField(upload_to='pending_medical/', blank=True, null=True)
    
    # Link to approved Athlete (once approved)
    approved_athlete = models.OneToOneField(Athlete, on_delete=models.SET_NULL, blank=True, null=True)
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-submitted_date']
        verbose_name = "Athlete Profile (Pending)"
        verbose_name_plural = "Athlete Profiles (Pending)"
    
    def __str__(self):
        return f"{self.first_name} {self.last_name} - {self.get_status_display()}"
    
    def approve(self, admin_user):
        """Convert pending profile to approved Athlete"""
        from django.utils import timezone
        
        # Create new Athlete from this profile
        athlete = Athlete.objects.create(
            user=self.user,
            first_name=self.first_name,
            last_name=self.last_name,
            date_of_birth=self.date_of_birth,
            address=self.address,
            mobile_number=self.mobile_number,
            club=self.club,
            city=self.city,
            profile_image=self.profile_image,
            approved_date=timezone.now(),
            approved_by=admin_user
        )
        
        # Update this profile
        self.status = 'approved'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.approved_athlete = athlete
        self.save()
        
        # Update user role
        self.user.role = 'athlete'
        self.user.save()
        
        return athlete
    
    def reject(self, admin_user, reason):
        """Reject the profile with reason"""
        from django.utils import timezone
        
        self.status = 'rejected'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = reason
        self.save()
    
    def request_revision(self, admin_user, notes):
        """Request user to revise their profile"""
        from django.utils import timezone
        
        self.status = 'revision_required'
        self.reviewed_date = timezone.now()
        self.reviewed_by = admin_user
        self.admin_notes = notes
        self.save()


# Update existing User model - add these fields
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
    
    # New fields
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    city = models.ForeignKey(City, on_delete=models.SET_NULL, blank=True, null=True)
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


# Update existing Athlete model - add these fields
class Athlete(models.Model):
    # Add these fields to existing Athlete model
    user = models.OneToOneField(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='athlete')
    approved_date = models.DateTimeField(blank=True, null=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='approved_athletes')
    
    # ... rest of existing Athlete fields remain the same ...
    
    @property
    def can_edit_profile(self):
        """Check if athlete can edit their own profile"""
        return self.user is not None
    
    @property
    def can_add_results(self):
        """Check if athlete can add competition results"""
        return self.user is not None and self.approved_date is not None


class SupporterAthleteRelation(models.Model):
    """
    Link supporters (parents) to athletes they can manage
    """
    RELATIONSHIP_CHOICES = [
        ('parent', 'Parent'),
        ('guardian', 'Legal Guardian'),
        ('coach', 'Coach'),
        ('other', 'Other'),
    ]
    
    supporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='managed_athletes', limit_choices_to={'role': 'supporter'})
    athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE, related_name='supporters')
    relationship = models.CharField(max_length=20, choices=RELATIONSHIP_CHOICES, default='parent')
    can_edit = models.BooleanField(default=True)  # Can supporter edit athlete's profile
    can_register_competitions = models.BooleanField(default=True)  # Can supporter register athlete for competitions
    
    created = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('supporter', 'athlete')
        verbose_name = "Supporter-Athlete Relationship"
        verbose_name_plural = "Supporter-Athlete Relationships"
    
    def __str__(self):
        return f"{self.supporter} -> {self.athlete} ({self.get_relationship_display()})"


class AthleteProfileActivity(models.Model):
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
    
    profile = models.ForeignKey(AthleteProfile, on_delete=models.CASCADE, related_name='activity_log')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(User, on_delete=models.CASCADE)
    notes = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Profile Activity"
        verbose_name_plural = "Profile Activities"
    
    def __str__(self):
        return f"{self.get_action_display()} - {self.profile} by {self.performed_by}"