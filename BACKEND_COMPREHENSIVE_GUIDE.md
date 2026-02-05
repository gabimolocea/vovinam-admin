# Django Backend - Comprehensive Technical Guide

**Last Updated:** February 4, 2026  
**Django Version:** 5.2.1  
**Database:** SQLite (development), PostgreSQL (production)  
**Backend Location:** `/Users/gabimolocea/vovinam-admin/backend/`

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Core Design](#architecture--core-design)
3. [Database Models](#database-models)
4. [Authentication & Permissions](#authentication--permissions)
5. [API Endpoints](#api-endpoints)
6. [ViewSets & Controllers](#viewsets--controllers)
7. [Signals & Business Logic](#signals--business-logic)
8. [Running the Backend](#running-the-backend)
9. [Development Workflow](#development-workflow)

---

## Project Overview

This is a **full-stack Django REST Framework API** for managing the Romanian Vovinam Federation's sports system. It's designed to support:

- **Athlete Management** - Registration, approval workflows, profiles
- **Competition Management** - Events, categories, brackets, scoring
- **Result Tracking** - Solo performances, fights, team competitions
- **Grade Progression** - Martial arts belt advancement tracking
- **User Roles** - Admin, Athlete, Supporter, Coach, Referee

### Tech Stack
```
Backend: Django 5.2.1
API Framework: Django REST Framework
Authentication: JWT + Session Authentication
Database ORM: Django ORM
Database: SQLite (dev) / PostgreSQL (production)
Image Storage: Django FileField (local) / DigitalOcean Spaces (production)
Task Queue: Celery (optional, for async tasks)
```

### Project Structure
```
backend/
├── crud/                    # Project settings & configuration
│   └── settings.py         # All Django settings, INSTALLED_APPS, middleware
├── api/                     # Main API app with all models/views
│   ├── models.py           # 2208 lines - All data models
│   ├── views.py            # 2199 lines - All ViewSets and API logic
│   ├── serializers.py      # 1293 lines - DRF serializers
│   ├── permissions.py      # Custom permission classes
│   ├── urls.py             # API routing
│   ├── signals.py          # Django signals for side effects
│   ├── notification_utils.py # Centralized notification system
│   ├── scoring.py          # Complex scoring calculations
│   ├── validators.py       # Data validation
│   ├── managers.py         # Custom QuerySet managers
│   ├── mixins.py           # Reusable model mixins
│   └── admin.py            # Django admin customization
├── landing/                 # Public landing page & events
├── news/                    # News/blog functionality
├── contact/                 # Contact form handling
├── manage.py               # Django management script
├── requirements.txt        # Python dependencies
├── Dockerfile              # Container configuration
└── entrypoint.sh          # Docker startup script
```

---

## Architecture & Core Design

### 1. Custom User Model

**Model:** `api.models.User` (extends `AbstractUser`)

The system uses a custom user model instead of Django's default:

```python
class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('athlete', 'Athlete'),
        ('supporter', 'Supporter'),
        ('user', 'User'),
    ]
    
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    email = models.EmailField(unique=True)  # USERNAME_FIELD is 'email'
    phone_number = models.CharField(...)
    date_of_birth = models.DateField(...)
```

**Key Properties:**
- `.is_admin` - Boolean check for admin role
- `.is_athlete` - Check if user is an athlete
- `.is_supporter` - Check if user is a parent/supporter
- `.has_approved_athlete_profile` - Check athlete approval status

### 2. Unified Athlete Model

**Single Model for All Athletes** (not separate pending/approved models)

```python
class Athlete(TimestampMixin, SyncMixin, SoftDeleteMixin, AuditMixin, models.Model):
    # Links
    user = models.OneToOneField(User, related_name='athlete')
    club = models.ForeignKey(Club, related_name='athletes')
    
    # Personal Data
    first_name, last_name, date_of_birth, address
    mobile_number, email (via user)
    
    # Emergency Contact
    emergency_contact_name, emergency_contact_phone
    
    # Sport Data
    current_grade = ForeignKey(Grade)  # Auto-updated from GradeHistory
    federation_role = ForeignKey(FederationRole)
    title = ForeignKey(Title)
    is_coach, is_referee = Boolean flags
    
    # Status Workflow
    STATUS_CHOICES = ['pending', 'approved', 'rejected', 'revision_required']
    status = CharField(default='pending')
    submitted_date, reviewed_date, reviewed_by, admin_notes
    
    # Documents
    profile_image = ImageField
    medical_certificate = FileField
```

**Workflow Methods:**
- `.approve(admin_user)` - Mark athlete as approved
- `.reject(admin_user, reason)` - Reject with reason
- `.request_revision(admin_user, reason)` - Ask for changes
- `.resubmit()` - Resubmit after revision
- `.update_current_grade()` - Auto-sync from GradeHistory

### 3. Model Mixins (Reusable Traits)

Located in `api/mixins.py`:

**`TimestampMixin`**
- `created_at` - Auto-set creation timestamp
- `updated_at` - Auto-update on every save
- Useful for audit trails and sorting

**`SyncMixin`**
- `synced` - Boolean flag for offline-first architectures
- `server_id` - Reference for uploaded records
- Used by mobile/desktop apps to track sync status

**`SoftDeleteMixin`**
- `is_deleted` - Boolean soft-delete flag
- Records never permanently removed, just marked
- Useful for data recovery and audit requirements

**`AuditMixin`**
- `created_by` - ForeignKey to User who created
- `modified_by` - ForeignKey to User who last edited
- Full audit trail of changes

### 4. Permission System

**File:** `api/permissions.py`

```python
class IsAdminOrReadOnly:
    """Most common permission - anyone can read, only admins write"""
    
class IsAdmin:
    """Admin-only actions"""
    
class IsOwnerOrAdmin:
    """Users can edit their own objects"""
    
class IsClubCoachOrAdmin:
    """Club coaches manage their club & athletes"""
    
class IsAthleteOwnerCoachOrAdmin:
    """Athlete data accessible to athlete, coach, or admin"""
```

These are applied to ViewSets via:
```python
class AthleteViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]  # Applied to all actions
    
    @action(detail=False, permission_classes=[IsAdmin])
    def approve_pending(self, request):
        # Only admins can access
```

---

## Database Models

### Core Models Map

| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **User** | Authentication & authorization | email, role, is_active |
| **Athlete** | Sports participant | first_name, last_name, status, current_grade |
| **Club** | Training organization | name, city, coaches (M2M) |
| **City** | Geographic location | name |
| **Grade** | Martial arts belt level | name, rank_order, grade_type |
| **Title** | Achievement title | name |
| **FederationRole** | Official role | name |
| **Category** | Competition grouping | name, event, type (solo/teams/fight) |
| **Athlete** (M2M through) | Category enrollment | category_id, athlete_id, weight |
| **Team** | Team of athletes | auto-generated name from members |
| **TeamMember** | Athlete in team | team_id, athlete_id |
| **Match** | Fight bracket match | red_corner, blue_corner, category |
| **Event** (landing app) | Competition/seminar | title, date, description |
| **CategoryAthleteScore** | Result/placement | athlete, category, score, placement |
| **GradeHistory** | Grade progression | athlete, grade, obtained_date, status |
| **TrainingSeminarParticipation** | Event participation | athlete, event, status |

### Key Relationships

**Athlete ↔ User (1:1)**
- Every athlete must have a User account
- User email is username for login
- User.role determines permission level

**Athlete ↔ Club (N:1)**
- Multiple athletes per club
- Club has list of coaches (M2M to Athlete with is_coach=True)
- Updates to is_coach trigger club.coaches updates via signals

**Athlete ↔ Category (M:M via CategoryAthlete)**
- Through table stores enrollment + weight
- Same athlete can be in multiple categories
- Used for solo, fight, and team competitions

**Category ↔ Match (1:N)**
- Category can have multiple Match records
- Matches generated for 'fight' type categories
- Each Match has red_corner and blue_corner (both Athletes)

**Category ↔ Team (M:M via CategoryTeam)**
- Teams enrolled in team-type categories
- Team auto-generated name from first 3 members
- Team.members points to TeamMember junction

---

## Authentication & Permissions

### Dual Authentication System

**JWT (JSON Web Tokens)**
```python
# Endpoint: POST /api/auth/login/
Request body:
{
  "email": "athlete@example.com",
  "password": "secure_password"
}

Response:
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",  # Access token (short-lived)
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."  # Refresh token (long-lived)
}

# Frontend stores in localStorage and adds to requests:
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

**Session Authentication**
- Traditional Django sessions for web browsers
- Cookies auto-managed by browser
- Fallback when JWT not available

**Configured in `crud/settings.py`:**
```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
}
```

### Permission Hierarchy

```
Unauthenticated User
├─ Can view: Athlete list, Categories, Events (READ_ONLY)
└─ Cannot modify anything

Authenticated User (role='user')
├─ Can view: Own athlete profile, own results
└─ Can modify: Own athlete profile fields

Athlete (role='athlete', status='approved')
├─ Can view: Own data + competition info
├─ Can submit: Results, grades, seminar participation
└─ Cannot: Approve others, modify categories

Club Coach (is_coach=True)
├─ Can view: Club athletes, club results
├─ Can manage: Club athletes (limited fields)
└─ Can approve: Athlete submissions from their club

Admin (role='admin', is_superuser=True)
├─ Can view: Everything
├─ Can modify: Everything
├─ Can approve/reject: All submissions
└─ Can access: Django admin panel
```

---

## API Endpoints

### Authentication Endpoints

```
POST   /api/auth/register/           Create new user account
POST   /api/auth/login/              Get JWT tokens
POST   /api/auth/logout/             Clear session
POST   /api/auth/refresh/            Refresh access token
POST   /api/auth/session-logout/     Django session logout
GET    /api/auth/session/            Check current session status
```

### Resource Endpoints (RESTful)

All follow pattern: `GET list`, `POST create`, `GET detail`, `PUT/PATCH update`, `DELETE destroy`

```
GET    /api/athletes/                 List all athletes
GET    /api/athletes/{id}/            Get athlete detail
POST   /api/athletes/                 Create athlete (admin only)
PATCH  /api/athletes/{id}/            Update athlete

GET    /api/categories/               List all categories
GET    /api/categories/{id}/          Get category detail
POST   /api/categories/               Create category (admin)

GET    /api/matches/                  List matches
POST   /api/matches/                  Create match

GET    /api/category-athlete-score/   List results
POST   /api/category-athlete-score/   Submit result

GET    /api/clubs/                    List clubs
POST   /api/clubs/                    Create club (admin)

GET    /api/grades/                   List grades
GET    /api/cities/                   List cities
```

### Special Action Endpoints

```
POST   /api/athletes/{id}/approve/    Admin approves pending athlete
POST   /api/athletes/{id}/reject/     Admin rejects athlete
POST   /api/athletes/{id}/request_revision/  Admin requests changes

POST   /api/category-athlete-score/{id}/approve/  Approve result
POST   /api/category-athlete-score/{id}/reject/   Reject result

POST   /api/grades/{id}/award/        Award grade to athlete (admin)
```

### Offline Sync Endpoints

For offline-first mobile/desktop apps:

```
GET    /api/offline/athletes/         Download snapshot of all athletes
GET    /api/offline/clubs/            Download snapshot of all clubs
GET    /api/offline/competition-pack/ Download full competition data
POST   /api/offline/results/          Upload offline-entered results
```

---

## ViewSets & Controllers

### ViewSet Pattern

All viewsets follow explicit `viewsets.ViewSet` pattern (not `ModelViewSet`):

```python
class AthleteViewSet(viewsets.ViewSet):
    """
    API endpoints for managing athletes:
    - List all athletes
    - Create new athlete (admin)
    - View athlete detail
    - Update athlete
    - Approve/reject athlete profiles
    """
    
    permission_classes = [IsAdminOrReadOnly]  # Default permission
    
    def list(self, request):
        """GET /api/athletes/ - List all approved athletes"""
        athletes = Athlete.objects.filter(status='approved')
        serializer = AthleteSerializer(athletes, many=True)
        return Response(serializer.data)
    
    def create(self, request):
        """POST /api/athletes/ - Create new athlete (admin only)"""
        if not request.user.is_admin:
            return Response(status=403)
        serializer = AthleteSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    
    def retrieve(self, request, pk=None):
        """GET /api/athletes/{id}/ - Get athlete detail"""
        athlete = get_object_or_404(Athlete, pk=pk)
        serializer = AthleteSerializer(athlete)
        return Response(serializer.data)
    
    def update(self, request, pk=None):
        """PUT /api/athletes/{id}/ - Full update"""
        athlete = get_object_or_404(Athlete, pk=pk)
        # Permission checks here
        serializer = AthleteSerializer(athlete, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
    
    def partial_update(self, request, pk=None):
        """PATCH /api/athletes/{id}/ - Partial update"""
        athlete = get_object_or_404(Athlete, pk=pk)
        serializer = AthleteSerializer(athlete, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        """POST /api/athletes/{id}/approve/ - Approve pending athlete"""
        athlete = get_object_or_404(Athlete, pk=pk)
        athlete.approve(request.user)
        serializer = AthleteSerializer(athlete)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        """POST /api/athletes/{id}/reject/ - Reject athlete"""
        athlete = get_object_or_404(Athlete, pk=pk)
        reason = request.data.get('reason', '')
        athlete.reject(request.user, reason)
        serializer = AthleteSerializer(athlete)
        return Response(serializer.data)
```

**Why explicit ViewSet over ModelViewSet?**
- Fine-grained control over each action
- Easy to add custom logic without fighting the framework
- Clear what each endpoint does
- Easier to implement complex permission checking

### Major ViewSets

| ViewSet | Location | Key Actions |
|---------|----------|-----------|
| **AthleteViewSet** | views.py:300 | list, create, retrieve, update, delete, approve, reject, request_revision |
| **CategoryViewSet** | views.py:600 | list, create, retrieve, update (with type-clearing logic) |
| **CategoryAthleteViewSet** | views.py:700 | list, create, delete (enroll/unenroll athletes) |
| **CategoryAthleteScoreViewSet** | views.py:800 | list, create, update (submit results), approve, reject |
| **MatchViewSet** | views.py:900 | list, create, retrieve (fight bracket management) |
| **ClubViewSet** | views.py:400 | list, create, update, delete |
| **GradeHistoryViewSet** | views.py:1000 | list, create, approve (grade submissions) |
| **OfflineSyncViewSet** | views.py:1100 | athletes, clubs, competition_pack, results (offline endpoints) |

---

## Signals & Business Logic

**File:** `api/signals.py`

Signals implement "side effects" - automatic actions that happen when models are saved/deleted.

### 1. Coach Assignment Signal

When `is_coach` changes on Athlete, automatically update Club.coaches M2M:

```python
@receiver(post_save, sender=Athlete)
def update_club_coaches(sender, instance, **kwargs):
    """Auto-sync: is_coach=True → add to club.coaches"""
    if instance.is_coach and instance.club:
        instance.club.coaches.add(instance)
    else:
        instance.club.coaches.remove(instance)
```

**Effect:** When admin makes an athlete a coach, they're automatically added to their club's coaches list.

### 2. Current Grade Auto-Sync

When GradeHistory is created, auto-update Athlete.current_grade:

```python
@receiver(post_save, sender=GradeHistory)
def update_current_grade(sender, instance, **kwargs):
    """Auto-sync: highest rank_order grade → current_grade"""
    athlete = instance.athlete
    highest = athlete.grade_history.order_by('-grade__rank_order').first()
    athlete.current_grade = highest.grade if highest else None
    athlete.save()
```

**Effect:** When a grade is submitted, athlete's current belt automatically updates.

### 3. Team Name Auto-Generation

When team members change, regenerate team display name:

```python
@receiver(m2m_changed, sender=CategoryAthleteScore.team_members.through)
def auto_generate_team_name(sender, instance, action, **kwargs):
    """Auto-generate: Team name from first 3 member names"""
    if action in ['post_add', 'post_remove'] and instance.type == 'teams':
        members = instance.team_members.all()[:3]
        names = [f"{m.first_name} {m.last_name}" for m in members]
        instance.team_name = ", ".join(names)
        instance.save()
```

**Effect:** Team result names always show current team members.

### 4. Approval Notifications

When a result is approved/rejected, send notifications:

```python
# In CategoryAthleteScore.approve():
from .notification_utils import create_notification

create_notification(
    recipient=instance.athlete.user,
    notification_type='result_approved',
    title='Result Approved',
    message=f'Your {instance.category.name} result was approved',
    related_result=instance,
    related_competition=instance.category.event
)
```

**Effect:** Athletes get notified when their submissions are reviewed.

---

## Running the Backend

### Quick Start

```bash
# 1. Activate Python virtual environment
cd /Users/gabimolocea/vovinam-admin/backend
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\Activate.ps1  # On Windows PowerShell

# 2. Install dependencies (first time only)
pip install -r requirements.txt

# 3. Run migrations
python manage.py migrate

# 4. Create superuser (first time only)
python manage.py createsuperuser
# Email: admin@example.com
# Password: ••••••••

# 5. Start development server
python manage.py runserver
# Runs on http://127.0.0.1:8000/
```

### Access Points

| URL | Purpose | Auth Required |
|-----|---------|---|
| `http://127.0.0.1:8000/` | API root | No |
| `http://127.0.0.1:8000/api/` | API endpoints | Per endpoint |
| `http://127.0.0.1:8000/admin/` | Django admin | Yes (staff) |
| `http://127.0.0.1:8000/api/health/` | Health check | No |

### Database Management

```bash
# Create migrations after model changes
python manage.py makemigrations

# Apply migrations to database
python manage.py migrate

# Reset entire database (lose all data!)
python manage.py migrate --zero api
rm db.sqlite3
python manage.py migrate

# Dump data to JSON backup
python manage.py dumpdata api > backup.json

# Load from backup
python manage.py loaddata backup.json
```

### Common Issues

**"ModuleNotFoundError: No module named 'rest_framework'"**
```bash
pip install -r requirements.txt
```

**"Athlete matching query does not exist"**
- Check if athlete ID exists: `GET /api/athletes/999/` (if 404, doesn't exist)
- Check status filter in view

**"You don't have permission to perform this action"**
- Check your user role: `GET /api/auth/session/` to see current user
- User must be authenticated and have proper role

---

## Development Workflow

### Adding a New Model

1. **Define model** in `api/models.py`
   ```python
   class Award(models.Model):
       athlete = models.ForeignKey(Athlete, on_delete=models.CASCADE)
       title = models.CharField(max_length=100)
       awarded_date = models.DateField()
   ```

2. **Create serializer** in `api/serializers.py`
   ```python
   class AwardSerializer(serializers.ModelSerializer):
       class Meta:
           model = Award
           fields = '__all__'
   ```

3. **Create ViewSet** in `api/views.py`
   ```python
   class AwardViewSet(viewsets.ViewSet):
       permission_classes = [IsAdminOrReadOnly]
       
       def list(self, request):
           awards = Award.objects.all()
           serializer = AwardSerializer(awards, many=True)
           return Response(serializer.data)
       # ... other methods
   ```

4. **Register route** in `api/urls.py`
   ```python
   router.register('awards', AwardViewSet, basename='award')
   ```

5. **Create migration** and apply
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

### Adding a New API Endpoint

Use `@action` decorator for custom endpoints:

```python
class AthleteViewSet(viewsets.ViewSet):
    
    @action(detail=False, methods=['get'])  # GET /api/athletes/pending/
    def pending(self, request):
        """Get all pending athletes (admin only)"""
        if not request.user.is_admin:
            return Response(status=403)
        athletes = Athlete.objects.filter(status='pending')
        serializer = AthleteSerializer(athletes, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])  # POST /api/athletes/{id}/approve/
    def approve(self, request, pk=None):
        """Approve a pending athlete"""
        athlete = self.get_object()
        athlete.approve(request.user)
        return Response({'status': 'athlete approved'})
```

### Adding a Signal

1. Define in `api/signals.py`
2. Import signal in `api/apps.py` ready() method:
   ```python
   class ApiConfig(AppConfig):
       default_auto_field = 'django.db.models.BigAutoField'
       name = 'api'
       
       def ready(self):
           import api.signals  # Registers all @receiver decorators
   ```

### Testing

Run tests from repo root (uses path hack):

```bash
cd /Users/gabimolocea/vovinam-admin
python test_api_responses.py

# Or run Django tests from backend/
cd backend
python manage.py test api.tests
```

---

## Key Configuration Files

### `crud/settings.py`

- **DEBUG = True** (change to False for production)
- **DATABASES** - Configure database connection
- **INSTALLED_APPS** - Registers all Django apps
- **REST_FRAMEWORK** - DRF authentication, pagination, filtering
- **CORS_ALLOWED_ORIGINS** - Frontend URLs allowed
- **ALLOWED_HOSTS** - Domain names server responds to

### `api/apps.py`

- App configuration
- Registers signals in `ready()` method

### `api/admin.py`

- Django admin customization
- Defines which models appear in `/admin/`
- Custom filters and actions for admin interface

### `manage.py`

Django management script. Run:
```bash
python manage.py help               # See all commands
python manage.py runserver          # Start dev server
python manage.py migrate            # Apply database migrations
python manage.py shell              # Interactive Python shell with Django context
python manage.py dbshell            # Database shell (sqlite3 CLI)
```

---

## Summary

The Django backend is a comprehensive REST API built on:

1. **Custom User & Athlete Models** - Unified approval workflow
2. **Fine-Grained Permissions** - Admin, coach, athlete levels
3. **Competition System** - Categories, enrollments, matches, scoring
4. **Result Tracking** - Solo, fight, team results with referee scoring
5. **Approval Workflows** - Pending→approved→active progression
6. **Signal-Driven Logic** - Automatic updates across related models
7. **Offline-First Support** - Download→modify→upload pattern

Key design principle: **Explicit over implicit** - ViewSets use manual method implementations rather than auto-generated ModelViewSet logic, giving full control over business logic and permissions.

