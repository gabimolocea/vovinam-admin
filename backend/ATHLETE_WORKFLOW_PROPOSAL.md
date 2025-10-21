# Athlete Registration & Approval Workflow

## Overview
This proposal extends the current system to support:
1. **Athlete Registration**: Users can register and create athlete profiles
2. **Supporter Registration**: Parents/supporters can register without athlete profiles
3. **Admin Approval System**: Athlete profiles require approval before activation
4. **Profile Management**: Approved athletes can manage their data

## Database Changes Required

### 1. Extend User Model
```python
class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('athlete', 'Athlete'),
        ('supporter', 'Supporter'),  # New role for parents/supporters
        ('user', 'User'),  # Generic user
    ]
    
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    # ... existing fields ...
    
    # New fields
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    city = models.ForeignKey('City', on_delete=models.SET_NULL, blank=True, null=True)
    profile_completed = models.BooleanField(default=False)
```

### 2. New AthleteProfile Model (Pending Approval)
```python
class AthleteProfile(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('revision_required', 'Revision Required'),
    ]
    
    # Link to User account
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='athlete_profile')
    
    # Same fields as Athlete model but for pending approval
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    address = models.TextField(blank=True, null=True)
    mobile_number = models.CharField(max_length=15, blank=True, null=True)
    club = models.ForeignKey('Club', on_delete=models.SET_NULL, blank=True, null=True)
    city = models.ForeignKey('City', on_delete=models.SET_NULL, blank=True, null=True)
    
    # Approval workflow
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    submitted_date = models.DateTimeField(auto_now_add=True)
    reviewed_date = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='reviewed_profiles')
    admin_notes = models.TextField(blank=True, null=True)
    
    # Documents/Images
    profile_image = models.ImageField(upload_to='pending_profiles/', blank=True, null=True)
    
    # Link to approved Athlete (once approved)
    approved_athlete = models.OneToOneField('Athlete', on_delete=models.SET_NULL, blank=True, null=True)
    
    def approve(self, admin_user):
        """Convert pending profile to approved Athlete"""
        pass
    
    def reject(self, admin_user, reason):
        """Reject the profile with reason"""
        pass
```

### 3. Extend Athlete Model
```python
class Athlete(models.Model):
    # Add link to User account (once approved)
    user = models.OneToOneField(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='athlete')
    
    # ... existing fields ...
    
    # Approval tracking
    approved_date = models.DateTimeField(blank=True, null=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='approved_athletes')
```

## New API Endpoints

### Registration Endpoints
- `POST /api/auth/register/athlete/` - Register as athlete (creates AthleteProfile)
- `POST /api/auth/register/supporter/` - Register as supporter only
- `GET /api/athlete-profiles/my-profile/` - Get current user's athlete profile
- `PUT /api/athlete-profiles/my-profile/` - Update pending athlete profile

### Admin Approval Endpoints
- `GET /api/admin/athlete-profiles/pending/` - List pending profiles
- `POST /api/admin/athlete-profiles/{id}/approve/` - Approve profile
- `POST /api/admin/athlete-profiles/{id}/reject/` - Reject profile
- `POST /api/admin/athlete-profiles/{id}/request-revision/` - Request changes

### Athlete Management (Post-Approval)
- `GET /api/athletes/my-athlete/` - Get approved athlete data
- `PUT /api/athletes/my-athlete/` - Update athlete data (limited fields)
- `POST /api/athletes/my-athlete/grades/` - Add grade history
- `POST /api/athletes/my-athlete/medical-visa/` - Upload medical visa
- `POST /api/athletes/my-athlete/results/` - Add competition results

## Frontend Components Needed

### 1. Registration Flow
- **AthleteRegistrationForm.jsx** - Multi-step registration for athletes
- **SupporterRegistrationForm.jsx** - Simple registration for supporters
- **ProfileStatusPage.jsx** - Show approval status and next steps

### 2. Admin Panel
- **PendingProfilesList.jsx** - List of profiles awaiting approval
- **ProfileReviewModal.jsx** - Review and approve/reject profiles
- **AthleteManagement.jsx** - Manage approved athletes

### 3. Athlete Dashboard
- **AthleteProfilePage.jsx** - View/edit approved athlete data
- **DocumentUpload.jsx** - Upload medical visas, certificates
- **ResultsManagement.jsx** - Add/view competition results
- **GradeHistory.jsx** - View grade progression

## Workflow Steps

### User Registration as Athlete
1. User visits registration page
2. Selects "I am an athlete" option
3. Fills personal details + athlete-specific data
4. Submits AthleteProfile (status: pending)
5. Receives confirmation email
6. Can login but with limited access until approved

### Admin Approval Process
1. Admin sees notification of pending profiles
2. Reviews athlete data and documents
3. Can approve, reject, or request revisions
4. If approved: creates Athlete record, links to User
5. If rejected: sends notification with reason
6. User receives email notification of decision

### Post-Approval Athlete Experience
1. User role changes to 'athlete'
2. Gets full access to athlete features
3. Can update profile (limited fields)
4. Can add grades, results, documents
5. Can register for competitions

### Supporter Registration
1. User selects "I am a supporter/parent"
2. Fills basic contact information
3. Gets immediate access as supporter
4. Can later create athlete profiles for their children

## Permissions & Security

### User Permissions
- **Supporters**: View public competitions, create athlete profiles for family
- **Athletes (pending)**: Limited access until approval
- **Athletes (approved)**: Full athlete features
- **Admins**: Full system access + approval workflows

### Data Protection
- Pending profiles stored separately from approved athletes
- Admin approval required for all athlete data
- Audit trail for all approvals/rejections
- Secure document upload with validation

## Benefits

1. **Quality Control**: Admin approval ensures data accuracy
2. **Role Clarity**: Clear distinction between athletes and supporters
3. **Family Support**: Supporters can manage multiple athlete profiles
4. **Audit Trail**: Complete history of approvals and changes
5. **Scalability**: System handles growth in athlete registrations
6. **Compliance**: Meets sports organization requirements