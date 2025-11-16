# FRVV Admin - AI Coding Instructions

Full-stack Django REST + React (Vite + MUI) sports management system for Romanian Vovinam federation. Backend in `backend/` (Django apps: `api`, `landing`, `contact`, `news`). Frontend in `frontend/` (Vite + React + MUI).

## Critical Architecture Patterns

### Backend: ViewSet Implementation Pattern
**All ViewSets use explicit `viewsets.ViewSet` (not `ModelViewSet`)** with manual method implementation:

```python
class AthleteViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminOrReadOnly]
    
    def list(self, request):
        # Manual queryset, serializer, Response
    
    def create(self, request):
        # Explicit serializer validation, save, Response
```

**Why**: Fine-grained control over request handling, validation, and permissions per action. When adding endpoints, follow this pattern in `backend/api/views.py`.

### Custom User Model & Role System
- `AUTH_USER_MODEL = 'api.User'` (custom AbstractUser)
- Roles: `admin`, `athlete`, `supporter`, `user`
- User model has `.is_admin`, `.is_athlete`, `.is_supporter` properties
- **Critical**: Use custom permissions from `backend/api/permissions.py`:
  - `IsAdminOrReadOnly` - most common (read for authenticated, write for admins)
  - `IsOwnerOrAdmin` - for user-owned resources
  - `IsAdmin` - admin-only actions

### Approval Workflow Pattern
Many models (`Athlete`, `GradeHistory`, `TrainingSeminarParticipation`, `CategoryAthleteScore`) use status-based approval:

```python
STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
    ('revision_required', 'Revision Required'),
]
```

Models have built-in methods: `.approve(user, notes)`, `.reject(user, notes)`, `.request_revision(user, notes)`. Use these instead of direct status updates to ensure proper workflow tracking and notifications.

### Signal-Driven Side Effects
Critical business logic in `backend/api/signals.py`:
- Athlete approval creates notification
- GradeHistory approval updates Athlete.current_grade
- Team result approval creates Team objects and updates category awards
- Coach changes update club coach lists

**When modifying models with workflows, check signals.py for cascading effects.**

### Notification System
Centralized in `backend/api/notification_utils.py`. Use `create_notification()` for all user notifications:

```python
from api.notification_utils import create_notification

create_notification(
    recipient=user,
    notification_type='result_approved',
    title='Result Approved',
    message='Your competition result was approved',
    related_result=score_obj,  # optional FK
    related_competition=comp_obj  # optional FK
)
```

System respects user's `NotificationSettings` preferences automatically.

## Development Commands (Windows PowerShell)

### Quick Start
```powershell
# Backend setup
cd backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver  # http://127.0.0.1:8000

# Frontend setup (new terminal)
cd frontend
npm ci  # use lockfile for reproducible builds
npm run dev  # http://localhost:5173
```

### Running Tests
**Most tests run from repo root** (not `backend/`) using Django path hack:

```powershell
# From repo root
python test_team_consolidation.py
python test_admin_approval.py
python test_api_responses.py
```

These scripts contain:
```python
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
django.setup()
```

Standard Django tests work from `backend/`:
```powershell
cd backend
python manage.py test api.tests
```

### Automated Dev Server
Use provided PowerShell script:
```powershell
.\scripts\start-dev.ps1  # Sets up and starts both servers
```

## API & Frontend Integration

### API Base Configuration
Frontend uses environment variable with fallback:
```javascript
// frontend/src/utils/env.js
const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
```

**Axios instance** (`frontend/src/components/Axios.jsx`):
- `baseURL: http://127.0.0.1:8000/api`
- `withCredentials: true` (session + JWT support)
- All API calls in `frontend/src/services/api.js`

### Router Registration Pattern
All API endpoints registered in `backend/api/urls.py`:

```python
router = DefaultRouter()
router.register(r'athletes', AthleteViewSet, basename='athlete')
router.register(r'clubs', ClubViewSet, basename='club')
# ... etc

urlpatterns = [
    # Function-based views first (specific paths)
    path('auth/register/', RegisterView.as_view()),
    path('athletes/<int:pk>/', views.athlete_detail),  # stable public endpoint
    
    # Router includes last (catch-all patterns)
    path('', include(router.urls)),
]
```

**Order matters**: specific paths before router includes.

### Context Providers
React app wrapped in providers (`frontend/src/main.jsx`):
```jsx
<AuthProvider>
  <NotificationProvider>
    <AppLayout>
      <App />
```

- `AuthContext` - user state, login/logout, role checks
- `NotificationContext` - real-time notification polling

## Key File Map

| Purpose | Location |
|---------|----------|
| Settings & config | `backend/crud/settings.py` |
| API registration | `backend/api/urls.py` |
| All viewsets | `backend/api/views.py` (1904 lines) |
| All models | `backend/api/models.py` (1714 lines) |
| All serializers | `backend/api/serializers.py` (1089 lines) |
| Business logic signals | `backend/api/signals.py` |
| Custom permissions | `backend/api/permissions.py` |
| Notification helpers | `backend/api/notification_utils.py` |
| Frontend API service | `frontend/src/services/api.js` |
| Axios config | `frontend/src/components/Axios.jsx` |
| Main contexts | `frontend/src/contexts/` |

## Important Implementation Details

### CORS Configuration
`backend/crud/settings.py` preconfigured for local dev:
```python
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
]
CORS_ALLOW_CREDENTIALS = True
```

### Dual Authentication
Both JWT and session auth enabled:
```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
}
```

Frontend sends both session cookies (`withCredentials: true`) and JWT tokens.

### Model Consolidation History
`Athlete` model was consolidated from dual-model architecture (`Athlete` + `AthleteProfile`). The unified model uses status-based workflow. See `CONSOLIDATION_SUMMARY.md` for details. **Never recreate AthleteProfile model.**

### Deprecated Features
- `FrontendTheme` model exists but is **not exposed via API or admin** (disabled dynamic theme system)
- Frontend uses static tokens in `frontend/src/styles/tokens.js` (currently minimal stub)
- Old `/api/athlete-profiles/` path has compatibility shim redirecting to `/api/athletes/`

## Common Tasks

### Adding New API Endpoint
1. Create model in `backend/api/models.py`
2. Create serializer in `backend/api/serializers.py`
3. Create ViewSet in `backend/api/views.py` (use explicit ViewSet pattern)
4. Register in `backend/api/urls.py` router
5. Add frontend service methods in `frontend/src/services/api.js`
6. Run migrations: `python manage.py makemigrations && python manage.py migrate`

### Adding Approval Workflow
1. Add status field with standard choices to model
2. Add workflow fields: `submitted_date`, `reviewed_date`, `reviewed_by`, `admin_notes`
3. Add workflow methods: `.approve()`, `.reject()`, `.request_revision()`
4. Create signal in `signals.py` for post-approval side effects
5. Add notifications in workflow methods using `create_notification()`
6. Update admin with approval actions

### Frontend API Integration
Use centralized API service:
```javascript
import { athleteAPI } from '../services/api';

const athletes = await athleteAPI.list();
const athlete = await athleteAPI.get(id);
await athleteAPI.create(data);
```

Never hardcode API URLs - use the service layer.

## Deployment

### Backend Deployment to DigitalOcean
See `DEPLOY_BACKEND.md` for comprehensive guide. Two options:

**App Platform (Recommended - $12/month)**:
- Easiest setup, managed PostgreSQL
- Auto-scaling, zero-downtime deploys
- Source directory: `backend`
- Uses `Dockerfile` and `Procfile`

**Docker Droplet ($6-13/month)**:
- More control, manual setup
- Requires Nginx, Docker Compose
- Better for custom configurations

**Critical files for deployment**:
- `backend/Dockerfile` - Container image
- `backend/Procfile` - App Platform commands
- `backend/crud/settings_production.py` - Production settings
- `backend/requirements.txt` - Python dependencies

**Environment variables needed**:
```env
DEBUG=False
DJANGO_SECRET_KEY=<generate-strong-key>
DJANGO_SETTINGS_MODULE=crud.settings_production
ALLOWED_HOSTS=.ondigitalocean.app,yourdomain.com
CORS_ALLOWED_ORIGINS=https://frontend-url
DATABASE_URL=<auto-injected-by-DO>
```

See `DEPLOYMENT_CHECKLIST.md` for pre-deployment verification steps. 
