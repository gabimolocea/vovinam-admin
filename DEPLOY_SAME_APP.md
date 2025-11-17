# Serving Frontend from Same DigitalOcean App (Django + React)

## Benefits
- ✅ **Single app** = Lower cost ($12/month vs $17-24/month)
- ✅ **No CORS issues** = Same origin for API and frontend
- ✅ **Simpler deployment** = One app to manage
- ✅ **Shared domain** = Both on same URL

## How It Works
Django serves the React build files as static assets and handles all `/api/*` requests.

---

## Setup Instructions

### 1. Update Dockerfile to Build Frontend

Create a **multi-stage Dockerfile** that builds React and serves with Django:

**File: `backend/Dockerfile`**

```dockerfile
# Stage 1: Build React frontend
FROM node:18-slim AS frontend-builder

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Django backend
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Copy Django project
COPY backend/ .

# Copy built frontend from stage 1
COPY --from=frontend-builder /frontend/dist /app/frontend_build

# Create media directories
RUN mkdir -p media/profile_images media/seminar_certificates media/seminar_documents media/news

# Collect static files
RUN python manage.py collectstatic --noinput

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120", "crud.wsgi:application"]
```

### 2. Update Django Settings for Frontend

**File: `backend/crud/settings_production.py`**

Add this at the end:

```python
import os

# Frontend build directory
FRONTEND_BUILD_DIR = os.path.join(BASE_DIR, 'frontend_build')

# Add frontend build directory to static files
STATICFILES_DIRS = [
    FRONTEND_BUILD_DIR,
]

# Whitelist for react-router (SPA routing)
# This is handled in urls.py with a catch-all route
```

### 3. Update Django URLs to Serve React

**File: `backend/crud/urls.py`**

```python
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from api.views import health
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('i18n/', include('django.conf.urls.i18n')),
    path('api/', include('api.urls')),  # API endpoints
    path('health/', health),
    path('api/landing/', include('landing.urls')),
    path("ckeditor5/", include('django_ckeditor_5.urls')),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]

# Serve media files in production (handled by whitenoise for static)
if not settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Catch-all route for React (must be last)
# Serve index.html for all non-API routes (React Router)
urlpatterns += [
    re_path(r'^(?!api/|admin/|media/|static/|health/).*$', 
            TemplateView.as_view(template_name='index.html'), 
            name='frontend'),
]
```

### 4. Create Template Directory for index.html

Django needs to find `index.html` as a template. Update settings:

**File: `backend/crud/settings_production.py`**

Update TEMPLATES section:

```python
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            os.path.join(BASE_DIR, 'frontend_build'),  # Add this line
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]
```

### 5. Update Frontend Environment for Same Origin

**File: `frontend/.env.production`**

```dotenv
# Same origin - use relative paths
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=
```

### 6. Update DigitalOcean App Platform Settings

**In DigitalOcean Dashboard → Your App:**

1. **Build Command:** Already using Dockerfile (no change needed)
2. **Source Directory:** Keep as `backend` (Dockerfile copies frontend)
3. **HTTP Port:** 8000 (already configured)

**Environment Variables** (update if needed):
```
DEBUG=False
DJANGO_SECRET_KEY=*5plts5llrdxtr30v*)2g$q&5!!ntjiygez&a5_)ah6*%qiu=3
DJANGO_SETTINGS_MODULE=crud.settings_production
ALLOWED_HOSTS=.ondigitalocean.app,vovinam-admin.ro
CORS_ALLOWED_ORIGINS=https://vovinam-admin-o9nwf.ondigitalocean.app
DATABASE_URL=(auto-injected by DigitalOcean)
```

### 7. Deploy

Commit and push:

```bash
git add backend/Dockerfile backend/crud/settings_production.py backend/crud/urls.py frontend/.env.production
git commit -m "Configure Django to serve React frontend from same app"
git push origin main
```

DigitalOcean will automatically rebuild and deploy.

---

## How URLs Work After Deployment

With this setup on `https://vovinam-admin-o9nwf.ondigitalocean.app`:

| URL Pattern | Served By | Example |
|-------------|-----------|---------|
| `/api/*` | Django REST API | `/api/athletes/` |
| `/admin/` | Django Admin | `/admin/login/` |
| `/media/*` | Django Media Files | `/media/profile_images/photo.jpg` |
| `/static/*` | Django Static Files | `/static/admin/css/base.css` |
| Everything else | React App | `/`, `/athletes`, `/login` |

---

## Advantages

✅ **Single domain** - No CORS configuration needed
✅ **Lower cost** - $12/month instead of $17-24/month
✅ **Simpler auth** - Cookies work seamlessly (same origin)
✅ **Easier SSL** - One certificate for everything
✅ **Single deployment** - Push once, both update

## Potential Issues

⚠️ **Build time** - Slightly longer builds (adds 2-3 minutes for npm build)
⚠️ **Cache** - React changes require full rebuild
⚠️ **Resource limits** - Single container handles both frontend and backend

---

## Alternative: Keep Separate but Same Domain

If you want to keep them separate but use same domain:

### Setup Subdomain Routing
- Frontend: `https://app.vovinam-admin.ro`
- Backend: `https://api.vovinam-admin.ro`

Both point to different DigitalOcean apps, but share the base domain.

---

## Verification After Deployment

1. Visit `https://vovinam-admin-o9nwf.ondigitalocean.app`
   - Should show React frontend ✅
2. Visit `https://vovinam-admin-o9nwf.ondigitalocean.app/api/`
   - Should show API root with endpoints ✅
3. Visit `https://vovinam-admin-o9nwf.ondigitalocean.app/admin/`
   - Should show Django admin ✅
4. Try login on frontend
   - Should work without CORS errors ✅

---

## Rollback Plan

If issues occur, revert by:

```bash
git revert HEAD
git push origin main
```

Frontend will be removed, backend continues working.

---

**Recommendation:** Use this approach! It's simpler, cheaper, and eliminates CORS complexity.
