# FRVV Admin Backend - Complete Analysis

## 📋 Project Overview

**FRVV Admin** is a comprehensive Django REST Framework application for managing a Romanian Vovinam Viet Vo Dao federation. The system handles athlete management, competitions, grading, training seminars, and administrative workflows.

---

## 🏗️ Architecture

### Technology Stack
- **Framework**: Django 5.2.1
- **API**: Django REST Framework 3.15.1
- **Authentication**: JWT (djangorestframework-simplejwt 5.5.1)
- **Database**: SQLite (dev) - ready for PostgreSQL/MySQL in production
- **Editor**: CKEditor 5 for rich text content
- **Filtering**: django-filter 24.3
- **Image Processing**: Pillow 11.3.0

### Django Apps Structure
```
backend/
├── api/           # Core application (athletes, competitions, scoring)
├── landing/       # Public-facing content (events, news, about)
├── contact/       # Contact information and messages
├── news/          # News module
└── crud/          # Project settings
```

---

## 📊 Database Schema

### Core Entities (32 Models)

#### 🔐 Authentication & User Management
1. **User** (Custom AbstractUser)
   - Roles: admin, athlete, supporter, user
   - Extended fields: phone, date_of_birth, city, profile_completed
   - USERNAME_FIELD: email (unique)

2. **UserProxy** - Admin organization proxy

#### 🏃 Athlete Management
3. **Athlete** (Core entity)
   - Personal info (name, DOB, address, contact)
   - Profile image & medical certificate uploads
   - Status workflow: pending → approved/rejected/revision_required
   - Roles: is_coach, is_referee flags
   - Links: user (1:1), club, city, current_grade, title, federation_role
   - Approval tracking: reviewed_by, approved_by, dates, admin_notes

4. **AthleteActivity** - Audit log for athlete actions
   - Actions: submitted, approved, rejected, revision_requested, updated, resubmitted
   - Tracks: athlete, performed_by, notes, timestamp

5. **GradeHistory** - Belt/grade progression
   - Links: athlete, grade, event, examiner_1, examiner_2
   - Certificate & result document uploads
   - Approval workflow (status, reviewed_by, admin_notes)

6. **Visa** - Medical & annual visas
   - Types: medical, annual
   - Health status: approved/denied
   - Document & image uploads
   - Approval workflow

7. **SupporterAthleteRelation** - Parent/guardian connections
   - Relationship types: parent, guardian, coach, other
   - Permissions: can_edit, can_register_competitions
   - Unique: (supporter, athlete)

#### 🏆 Competitions & Events
8. **Competition** (Legacy/Simple)
   - name, place, start_date, end_date

9. **Event** (Modern, from landing app)
   - SEO fields (meta_title, description, keywords)
   - Rich content (CKEditor description)
   - Types: competition, examination, training_seminar
   - Featured image, city, pricing
   - Proxy in api app for admin organization

10. **Category**
    - Types: solo, teams, fight
    - Gender: male, female, mixt
    - Links: competition, event, group
    - Placement tracking: 1st/2nd/3rd place (athlete or team)
    - M2M: athletes (through CategoryAthlete), teams (through CategoryTeam)

11. **Group**
    - Organizes categories within competitions
    - Links: competition

12. **Match** (Fight management)
    - Types: qualifications, semi-finals, finals
    - Corners: red_corner, blue_corner athletes
    - central_referee, winner
    - M2M: referees

13. **RefereeScore** - Individual referee scoring
    - red_corner_score, blue_corner_score
    - winner determination
    - Links: match, referee

14. **RefereePointEvent** - Real-time scoring events
    - timestamp, side (red/blue), points
    - event_type: score, penalty, deduction, other
    - JSONField metadata, external_id
    - processed flag

#### 🎯 Results & Scoring
15. **CategoryAthleteScore** (Main scoring entity)
    - score, type (solo/teams/fight), placement_claimed (1st/2nd/3rd)
    - team_name for team events
    - M2M: team_members
    - Certificate & result document uploads
    - Approval workflow (submitted_by_athlete, status, reviewed_by)
    - Unique: (category, athlete, referee)

16. **CategoryTeamScore**
    - Team-based scoring
    - Links: category, team, referee
    - Unique: (category, team, referee)

17. **CategoryScoreActivity** - Audit log for score changes
    - Actions: submitted, approved, rejected, revision_requested, updated, resubmitted, deleted
    - Links: score, performed_by

18. **AthleteMatch** - Individual match records
    - opponent_name, match_date, venue
    - result: win/loss/draw, round_ended
    - Media uploads: match_video, match_image, result_document
    - Approval workflow
    - Links: athlete, competition, reviewed_by

#### 🎓 Training & Seminars
19. **TrainingSeminar**
    - name, dates, place
    - M2M: athletes

20. **TrainingSeminarParticipation** - Participation records
    - Certificate & document uploads
    - Approval workflow (submitted_by_athlete, status, reviewed_by)
    - Links: athlete, seminar, event
    - Unique: (athlete, seminar)

21. **EventParticipation** (Proxy of TrainingSeminarParticipation)

#### 👥 Teams
22. **Team**
    - name
    - M2M: categories (through CategoryTeam)

23. **TeamMember** - Through model
    - Links: team, athlete
    - Unique: (team, athlete)

24. **CategoryTeam** - Through model
    - Links: category, team
    - Unique: (category, team)

25. **CategoryAthlete** - Through model with weight
    - weight field
    - Links: category, athlete
    - Unique: (category, athlete)

#### 🏢 Organizations
26. **Club**
    - name (unique), logo, address, mobile_number, website
    - Links: city
    - M2M: coaches (Athlete)

27. **City**
    - name (unique)
    - Referenced by: User, Athlete, Club, Event

28. **Grade** (Belt/rank system)
    - name, rank_order
    - grade_type: inferior, superior

29. **Title** - Federation titles
    - name (unique)

30. **FederationRole** - Official roles
    - name (unique)

#### 🔔 Notifications
31. **Notification**
    - 13 types (result_submitted, result_approved, competition_registered, etc.)
    - title, message, is_read, created_at, read_at
    - JSONField action_data
    - Links: recipient, related_result, related_competition

32. **NotificationSettings** (1:1 with User)
    - 16 boolean preferences (8 email + 8 in-app)
    - Granular control per notification type

#### 📰 Landing/Content (landing app)
33. **NewsPost** (SEO-enabled)
    - Rich content, excerpt, featured_image
    - published, featured flags
    - tags, slug
    - Links: author (admin users only)

34. **NewsPostGallery** - Image galleries for posts
    - Links: news_post
    - image, alt_text, caption, order

35. **NewsComment** - Threaded comments
    - content, parent (self-reference for replies)
    - is_approved moderation
    - Links: news_post, author

36. **AboutSection** - About page sections
    - Rich content, image, order
    - is_active flag

37. **ContactMessage** - Contact form submissions
    - Priority: low/medium/high/urgent
    - is_read, is_replied flags
    - admin_notes

38. **ContactInfo** - Organization contact details
    - Singleton pattern (only one active)
    - Social media links
    - business_hours (rich text)

39-40. **ContactInfoProxy**, **ContactMessageProxy** - Admin organization

---

## 🔄 Key Workflows

### Approval Workflow Pattern
**Used by 6 models**: Athlete, GradeHistory, Visa, TrainingSeminarParticipation, CategoryAthleteScore, AthleteMatch

**Common fields**:
```python
status = CharField(choices=['pending', 'approved', 'rejected', 'revision_required'])
submitted_by_athlete = BooleanField()
submitted_date = DateTimeField()
reviewed_date = DateTimeField()
reviewed_by = ForeignKey(User)
admin_notes = TextField()
```

**Flow**: 
1. Athlete submits → status='pending'
2. Admin reviews → status='approved'/'rejected'/'revision_required'
3. If revision → athlete resubmits → status='pending' again

### Scoring System
**Multi-level scoring**:
- **Match level**: RefereeScore, RefereePointEvent
- **Category level**: CategoryAthleteScore, CategoryTeamScore
- **Activity tracking**: CategoryScoreActivity (audit log)

**Features**:
- Multiple referees per match
- Real-time point events (timestamp-based)
- Team scoring with member tracking
- Placement claims (1st/2nd/3rd) requiring approval

### Event Management
**Two event systems**:
1. **Competition** (legacy) - Simple competition records
2. **Event** (modern) - Rich event management with types:
   - competition
   - examination (grade tests)
   - training_seminar

**Integration**: Many models link to both Competition and Event (via event field)

---

## 🔗 Key Relationships

### User → Athlete (1:1)
```
User (email-based auth)
  ↓ 1:1
Athlete (profile with approval workflow)
  ↓ 1:many
  ├── GradeHistory (belt progression)
  ├── Visa (medical/annual)
  ├── AthleteMatch (fight records)
  ├── CategoryAthleteScore (results)
  └── TrainingSeminarParticipation
```

### Competition Hierarchy
```
Competition/Event
  ↓ 1:many
Group (optional organization)
  ↓ 1:many
Category (solo/teams/fight)
  ↓ many:many
Athletes/Teams
  ↓
CategoryAthleteScore/CategoryTeamScore
  ↓
Match (for fights)
  ↓
RefereeScore + RefereePointEvent
```

### Notification System
```
User
  ↓ 1:1
NotificationSettings (preferences)
  ↓ triggers
Notification (inbox)
  └── links to related objects (result, competition)
```

---

## 🎯 Business Logic Highlights

### 1. User Roles & Permissions
- **admin**: Full access (superuser/staff)
- **athlete**: Can submit profile, results, matches (requires approval)
- **supporter**: Can manage linked athletes (parent/guardian)
- **user**: Basic authenticated user

### 2. Athlete Lifecycle
```
Registration → Profile Pending → Admin Review
                                    ↓
                            Approved / Rejected / Revision Required
                                    ↓
                            Active Athlete (can compete, submit results)
```

### 3. Grade Progression
- Linked to Events (examinations)
- Requires examiners (2 referee athletes)
- Certificate upload
- Admin approval required
- Historical tracking via GradeHistory

### 4. Visa Management
- Two types: medical (health check), annual (federation membership)
- Expiration tracking
- Document uploads
- Health status separate from approval status

### 5. Supporter System
- Parents/guardians can link to athletes
- Granular permissions (can_edit, can_register_competitions)
- Maintains athlete privacy while allowing family management

### 6. Notification Preferences
- 16 separate toggles (8 email + 8 in-app)
- Covers all key events:
  - Result submissions/approvals
  - Competition registrations/updates
  - Grade changes
  - Profile status changes
  - News posts
  - Event announcements

---

## 🛡️ Security Features

1. **JWT Authentication** (access + refresh tokens)
2. **Session Authentication** (fallback for admin)
3. **Email-based login** (no username required)
4. **Permission classes** via DRF
5. **Approval workflows** prevent unauthorized changes
6. **File upload validation** (images, PDFs, videos)
7. **Admin-only actions** (approval, rejection, role changes)
8. **Audit trails** (AthleteActivity, CategoryScoreActivity)

---

## 📁 File Storage

### Media Uploads:
- `media/profile_images/` - Athlete profile photos
- `media/news/` - News post featured images
- `media/news/gallery/` - News post galleries
- `media/events/` - Event featured images
- `media/about/` - About section images
- `media/seminar_certificates/` - Training certificates
- `media/seminar_documents/` - Training documents

### Document Types:
- Images: profile photos, certificates, match photos
- PDFs: medical certificates, result documents, visa documents
- Videos: match recordings

---

## 🔍 Admin Features

### Custom Admin Dashboard
- Chart visualizations (Chart.js)
- Top clubs by athlete count
- Visa status breakdown
- New athlete registrations (6-month trend)
- Clubs by city distribution
- Activity log preview

### Admin Customizations
- Compact athlete rows (photo + name merged)
- Avatar initials fallback (SVG generation)
- Coach/referee flags visible
- Compact grade display
- Language switcher (EN/RO)
- i18n support via gettext

### Hidden Models
- Landing app hidden from sidebar
- Competition hidden (Events replace it)
- Titles/FederationRole accessible but not indexed

---

## 🌐 REST API

### Endpoints (via DRF)
- Routers for all main models
- JWT authentication required
- Filtering, search, ordering enabled
- Pagination (20 items/page)
- CORS configured for local dev (ports 5173-5175)

### API Features
- Read-only for unauthenticated users
- Write access for authenticated users
- Admin-specific endpoints (approval actions)
- Nested serializers for related data

---

## 📈 Scalability Considerations

### Current State
- SQLite database (dev)
- Single-server architecture
- File-based media storage

### Production-Ready Features
- Migration-based schema (33+ migrations)
- Timezone-aware DateTimeFields
- Soft deletes via status fields
- Indexed fields (unique constraints, FKs)
- Optimized queries (select_related, prefetch_related in admin)

### Future Enhancements
- PostgreSQL/MySQL migration
- S3/CDN for media files
- Redis for caching
- Celery for background tasks (notifications, large exports)
- Elasticsearch for advanced search

---

## 🧪 Testing & Quality

### Files Present
- `test_notifications.py`
- `test_seminar_fix.py`
- `test_team_consolidation.py`
- `test_team_functionality.py`
- `test_auto_add_submitter.py`
- `test_api_responses.py`
- `test_admin_approval.py`
- `user_acceptance_test.py`
- `smoke_test.py`

### Testing Focus
- Notification system
- Team consolidation logic
- Admin approval workflows
- API response validation
- Seminar fixes

---

## 📝 Documentation Files

- `ATHLETE_WORKFLOW_PROPOSAL.md` - Athlete lifecycle documentation
- `CONSOLIDATION_SUMMARY.md` - Team consolidation details
- `THEME_SYSTEM.md` - Frontend theme integration
- `PULL_REQUEST.md` - PR template
- `USER_ACCEPTANCE_TEST_RESULTS.md` - UAT outcomes

---

## 🎨 Frontend Integration

### Static Tokens
- `frontend/src/styles/tokens.js` - Design tokens
- `frontend/src/styles/theme-overrides.js` - MUI overrides

### CORS Configuration
```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Vite default
    "http://localhost:5174",  # Vite alt
    "http://localhost:5175",  # Vite alt
]
```

### API Base URL
- Dev: `http://127.0.0.1:8000/api/`
- Admin: `http://127.0.0.1:8000/admin/`

---

## 🔧 Development Commands

```powershell
# Activate venv
cd backend
.\venv\Scripts\Activate.ps1

# Run server
python manage.py runserver

# Migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Tests
python manage.py test
pytest

# Check system
python manage.py check
```

---

## 📊 Statistics

- **Total Models**: 40 (including proxies)
- **Core Data Models**: 32
- **Approval Workflow Models**: 6
- **Through/Join Models**: 4
- **Proxy Models**: 6
- **Apps**: 4 (api, landing, contact, news)
- **Migrations**: 34 in api app
- **Lines of Code (models.py)**: 1,714

---

## 🏁 Summary

**FRVV Admin Backend** is a mature, well-structured Django application managing a martial arts federation. It features:

✅ **Comprehensive athlete management** with approval workflows  
✅ **Multi-level competition & scoring system**  
✅ **Grade progression tracking** with examiner validation  
✅ **Training seminar participation** records  
✅ **Team management** with flexible member assignments  
✅ **Notification system** with granular preferences  
✅ **Content management** (news, events, about pages) with SEO  
✅ **File uploads** for certificates, documents, media  
✅ **Audit trails** for critical actions  
✅ **Role-based access** (admin, athlete, supporter)  
✅ **REST API** with JWT authentication  
✅ **Admin dashboard** with charts and analytics  

The system is **production-ready** with proper migrations, timezone awareness, and scalable architecture patterns.
