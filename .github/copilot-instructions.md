## Quick orientation

This repo is a full-stack Django REST + React (Vite + MUI) application. The backend is in `backend/` (Django apps: `api`, `landing`, etc.). The frontend is in `frontend/` (Vite + React + MUI). Key entry points:

- Backend settings: `backend/crud/settings.py`
- Backend APIs: `backend/api/` (models, serializers, views, urls)
-- Frontend static styles: `frontend/src/styles/tokens.js` and `frontend/src/styles/theme-overrides.js`

Keep these files in mind when making cross-cutting or design changes (styles, tokens, auth, and API surface).

## Big-picture architecture & data flow (what matters for code changes)

- Backend exposes a REST API via DRF routers in `backend/api/urls.py`. Most resources are registered there (e.g. `/api/athletes/`, `/api/clubs/`, `/api/frontend-themes/`).
-- The dynamic theme API has been removed; the frontend uses static tokens in `frontend/src/styles/` instead.
- Authentication: JWT + session included. DRF auth classes are configured in `backend/crud/settings.py` (see `SIMPLE_JWT` and `REST_FRAMEWORK` configs). Custom user model: `AUTH_USER_MODEL = 'api.User'`.
- CORS for local dev is preconfigured to permit the common Vite ports (5173/5174/5175) in `settings.py`.

When you need to change visual tokens, edit the static token files in the frontend:
- Update `frontend/src/styles/tokens.js` and (optionally) `frontend/src/styles/theme-overrides.js`.
Note: The backend-backed `FrontendTheme` API is disabled; do not rely on `/api/frontend-themes/`.

## Developer workflows — commands & quick examples (Windows PowerShell)

Frontend (Vite dev server)

```powershell
cd frontend
npm ci
npm run dev    # opens on http://localhost:5173
```

Backend (Django)

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate.ps1   # PowerShell activation
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver   # runs on http://127.0.0.1:8000
```

Run both servers concurrently (optional): use a terminal per server or install `concurrently` in the root/frontend and start both. README includes an example.

Tests

- There are many test scripts in the repo root and `backend` that are runnable directly from the project root (they set up Django via `sys.path` hack). Example:

```powershell
python test_team_consolidation.py
```

- You can also run Django/pytest style tests if you have a suitable environment. Running `pytest` from the repo root is common in CI if pytest is installed.

## Project-specific conventions & patterns

- ViewSets are implemented using `rest_framework.viewsets.ViewSet` with explicit `list/retrieve/create/update/destroy` methods (not always `ModelViewSet`). Expect explicit request handling and manual serializer validation in each view method (see `backend/api/views.py`).
-- The dynamic theme system has been disabled and related admin/API components removed. Styling now comes from static files in the frontend.
- Many repo-level test scripts import and configure Django directly by appending `backend` to `sys.path` and calling `django.setup()` — tests assume the developer runs them from the repo root.

## Integration points and where to change behavior

- Styling tokens & overrides:
  - Frontend defaults and overrides live in `frontend/src/styles/tokens.js` and `frontend/src/styles/theme-overrides.js`.
  - The previous backend-backed theme API has been removed; the frontend relies on static tokens for now.

- Auth & permissions:
  - DRF permissions live in `backend/api/permissions.py` (common pattern: `IsAdminOrReadOnly`). Apply these consistently to new viewsets.
  - JWT config is in `backend/crud/settings.py` under `SIMPLE_JWT`.

## Helpful file map (start here when changing something)

- Backend settings: `backend/crud/settings.py`
- API entrypoints: `backend/api/urls.py`
- API code: `backend/api/views.py`, `backend/api/serializers.py`, `backend/api/models.py`
-- Frontend styling & tokens: `frontend/src/styles/tokens.js`, `frontend/src/styles/theme-overrides.js`
- Frontend entry: `frontend/src/main.jsx` (typical place where the theme is applied)

## Small implementation notes that matter

- The `FrontendTheme` model remains in the codebase but is no longer registered in admin or exposed via the API.
  Its `save()` and `tokens` helpers are present in the model for historical reasons but are not used at runtime.
# API router registrations happen in `backend/api/urls.py` — add new resources there so the frontend can auto-discover routes.

If anything here is unclear or you'd like more examples (e.g., a concrete PR-level checklist for theme changes, or exact test commands for CI), tell me which area to expand and I'll iterate. 
