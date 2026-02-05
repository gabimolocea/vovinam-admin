# FRVV System Architecture Restructure Plan

## Goal
Transform monolithic app into 4 specialized applications:
1. **Federation Management App** - Global admin & management
2. **Competition Management App** - Organize competitions
3. **Club Enrollment Portal** - Clubs enroll athletes
4. **Live Match Scoring System** - LAN referee scoring with displays

---

## Current Architecture Analysis

### What We Have
```
vovinam-admin/
├── backend/          # Django REST API (single backend for everything)
│   ├── api/          # All models, views, serializers
│   ├── crud/         # Settings
│   └── ...
├── frontend/         # React web app (monolithic - does everything)
│   └── src/
│       ├── components/  # Athletes, Clubs, Competitions, News, etc.
│       └── ...
└── desktop/          # Offline athlete sync + LAN scoring system
    ├── scoring/      # ✅ WebSocket server for live scoring (COMPLETE!)
    ├── ui/           # ✅ Referee panels & scoreboard (COMPLETE!)
    └── sync/         # Athlete data sync to backend
```

### What We Need
```
frvv-system/
├── backend-api/                    # Shared Django REST API (centralized)
│   └── ...                         # Keep existing backend as-is
│
├── federation-admin-app/           # App 1: Federation Management
│   └── frontend/                   # React app (admin-focused UI)
│       └── Features: Athletes, Clubs, Grades, Visas, Users
│
├── competition-manager-app/        # App 2: Competition Management  
│   └── frontend/                   # React app (organizer-focused)
│       └── Features: Create comps, categories, brackets, results
│
├── club-enrollment-portal/         # App 3: Club Enrollment
│   └── frontend/                   # Lightweight React app (club view)
│       └── Features: View comps, enroll athletes, track status
│
└── live-scoring-desktop/           # App 4: LAN Scoring (ALREADY EXISTS!)
    └── Desktop app with:
        - WebSocket server (already built!)
        - 5 referee panels (already built!)
        - Scoreboard display (already built!)
        - Offline scoring + sync
```

---

## Implementation Strategy

## Offline Competition Management (Requirement)

You want the **Competition Management App** to work offline, import athlete data from the federation app, and export results back. This is achievable on the web by using the same React + MUI stack with **PWA + local database + sync**.

### Offline Architecture (Web)

**Recommended approach:**
- **PWA** (Service Worker + caching) for offline access
- **Local database** using **IndexedDB** (via Dexie.js)
- **Sync engine** (background sync when online)

**Data flow:**
```
Federation App (online) → Backend API → Competition App (sync download)
Competition App (offline use) → Local IndexedDB
Competition App (sync upload) → Backend API → Federation App
```

### What to Store Offline
- Athletes list (basic profile + club + grade)
- Clubs list
- Competitions + categories
- Brackets / matches
- Results (local until sync)

### Sync Actions Needed
1. **Import Athletes (download)**
   - Pull athlete data from backend and store in IndexedDB
2. **Work Offline**
   - Manage competition setup, brackets, and scores locally
3. **Export Results (upload)**
   - Push results back to backend when online

### Suggested Web Stack (keeps your current stack)
- React + MUI (same as federation app)
- Vite
- Dexie.js (IndexedDB wrapper)
- Workbox (service worker + offline caching)

### Backend API Additions (if missing)
```
GET  /api/offline/athletes/         # Download athlete snapshot
GET  /api/offline/clubs/            # Download club snapshot
POST /api/offline/results/          # Upload results batch
GET  /api/offline/competition-pack/ # Download competition data bundle
```

### Conflict Handling (Minimum viable)
- Use **server timestamp priority** for athlete data (read-only offline)
- For results, **append-only uploads** (server validates duplicates)
- If conflict detected, return a warning in sync response for manual review

### Phase 1: Backend Preparation (1-2 days)
**Goal:** Ensure backend API supports all 4 apps

#### Tasks:
1. **API Audit & Organization**
   - Review existing endpoints in `backend/api/urls.py`
   - Ensure CORS settings allow multiple frontends
   - Document API for each app's needs

2. **Add Missing Endpoints (if any)**
   - Club enrollment endpoints (may need refinement)
   - Competition creation workflow endpoints
   - Results submission and approval endpoints

3. **Environment Configuration**
   ```python
   # settings_production.py additions
   CORS_ALLOWED_ORIGINS = [
       'https://admin.frvv.ro',           # Federation admin app
       'https://competitions.frvv.ro',    # Competition manager app
       'https://enroll.frvv.ro',          # Club enrollment portal
   ]
   ```

4. **API Documentation**
   - Document endpoints for each app
   - Create API usage guides
   - Set up Swagger/OpenAPI docs (optional but recommended)

---

### Phase 2: Extract Federation Admin App (2-3 days)
**Goal:** Create focused admin app from existing frontend

#### Directory Structure:
```
federation-admin-app/
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── components/
    │   ├── Athletes/          # Athlete management
    │   ├── Clubs/             # Club management
    │   ├── Grades/            # Grade approvals
    │   ├── Visas/             # Visa management
    │   ├── Users/             # User management
    │   └── Dashboard/         # Admin dashboard
    ├── pages/
    ├── services/
    │   └── api.js             # API calls to backend
    └── contexts/
        └── AuthContext.jsx
```

#### Tasks:
1. **Copy Existing Components**
   - Take from `/frontend/src/components/`:
     - `AthletesConverted.jsx`
     - `ClubsConverted.jsx`
     - `DashboardConverted.jsx`
     - `CreateAthleteConverted.jsx`
     - `EditAthleteConverted.jsx`
     - Admin approval components
     - User management components

2. **Remove Unnecessary Features**
   - Remove competition enrollment UI (moves to portal)
   - Remove live scoring features (stays in desktop)
   - Keep only admin/management features

3. **Simplify Navigation**
   ```jsx
   // Admin-focused navigation
   const adminNav = [
     { title: 'Dashboard', path: '/dashboard' },
     { title: 'Athletes', path: '/athletes' },
     { title: 'Clubs', path: '/clubs' },
     { title: 'Approvals', path: '/approvals' },
     { title: 'Users', path: '/users' },
   ]
   ```

4. **Configure API Connection**
   ```javascript
   // .env.production
   VITE_API_BASE_URL=https://api.frvv.ro/api
   ```

---

### Phase 3: Create Competition Management App (3-4 days)
**Goal:** Build dedicated app for competition organizers

#### Directory Structure:
```
competition-manager-app/
├── package.json
└── src/
    ├── components/
    │   ├── CompetitionList/
    │   ├── CompetitionCreate/
    │   ├── CategoryManager/
    │   ├── BracketBuilder/
    │   ├── ResultsView/
    │   └── ReportGenerator/
    └── pages/
        ├── Competitions.jsx
        ├── CreateCompetition.jsx
        ├── CompetitionDetail.jsx
        └── Results.jsx
```

#### Tasks:
1. **Copy Competition Components**
   - From existing frontend:
     - `CompetitionsConverted.jsx`
     - `CompetitionDetailsConverted.jsx`
     - `CategoryDetails.jsx`
     - Bracket visualization components

2. **Add Competition Creation Workflow**
   ```jsx
   // New: CreateCompetition.jsx
   - Step 1: Basic info (name, date, location)
   - Step 2: Categories setup
   - Step 3: Groups configuration
   - Step 4: Bracket generation
   - Step 5: Publish competition
   ```

3. **Results Management Interface**
   - View submitted results from desktop app
   - Approve/reject results
   - Generate reports and rankings
   - Export data (PDF, Excel)

4. **Reuse Backend Endpoints**
   ```javascript
   // Use existing API
   import { competitionAPI, categoryAPI, matchAPI } from './services/api'
   
   // These endpoints already exist in your backend!
   await competitionAPI.create(data)
   await categoryAPI.create(categoryData)
   await matchAPI.list({ competition: id })

5. **Add Offline Mode**
   - PWA setup with Workbox
   - IndexedDB (Dexie) for offline data
   - Sync UI: "Download Athletes", "Upload Results"
   - Sync status indicator (online/offline)
   ```

---

### Phase 4: Create Club Enrollment Portal (2-3 days)
**Goal:** Simple portal for clubs to enroll athletes

#### Directory Structure:
```
club-enrollment-portal/
├── package.json
└── src/
    ├── components/
    │   ├── CompetitionList/      # Browse competitions
    │   ├── EnrollmentForm/       # Enroll athletes
    │   ├── MyEnrollments/        # Track enrollments
    │   └── AthleteSelector/      # Select club's athletes
    └── pages/
        ├── Home.jsx              # Available competitions
        ├── Enroll.jsx            # Enrollment form
        └── MyEnrollments.jsx     # Status tracking
```

#### Tasks:
1. **Create Lightweight UI**
   - Focus on simplicity (clubs are end-users, not admins)
   - Mobile-friendly design
   - Clear enrollment process

2. **Enrollment Workflow**
   ```jsx
   // EnrollmentForm.jsx
   1. Select competition
   2. View categories
   3. Select athletes from club
   4. Confirm enrollment
   5. Track approval status
   ```

3. **Backend Integration**
   - Use existing enrollment endpoints
   - May need to add:
     ```python
     # backend/api/views.py
     class EnrollmentViewSet(viewsets.ViewSet):
         def create(self, request):
             # Enroll athlete to category
         
         def my_enrollments(self, request):
             # Get enrollments for current club
     ```

4. **Minimal Features**
   - View competitions
   - Enroll athletes
   - View enrollment status
   - Pay fees (future)
   - No admin features
   - No athlete management

---

### Phase 5: Refine Live Scoring Desktop App (1-2 days)
**Goal:** Polish existing desktop scoring system

#### What You Already Have ✅
```
desktop/
├── scoring/
│   ├── websocket_server.py    # ✅ WebSocket server
│   └── match_manager.py       # ✅ Match logic
├── ui/
│   ├── referee_scoring.py     # ✅ Referee panel
│   ├── scoreboard_display.py  # ✅ External display
│   └── server_control.py      # ✅ Server controls
└── main_launcher.py            # ✅ Mode selector
```

#### Tasks (Minor Refinements):
1. **Branding & Polish**
   - Update app name/logo
   - Improve scoreboard visuals
   - Add competition info display

2. **Sync Improvements**
   - Better offline handling
   - Batch result uploads
   - Conflict resolution UI

3. **Packaging**
   ```bash
   # Create installers
   pyinstaller --name "FRVV-Scoring" main_launcher.py
   
   # Package for:
   - Windows (competition venues)
   - macOS (optional)
   ```

4. **Documentation**
   - Setup guide for competition venues
   - Referee training manual
   - Troubleshooting guide

---

## Deployment Architecture

### Production Setup
```
┌─────────────────────────────────────────────┐
│         DigitalOcean / Cloud Provider       │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Django REST API                    │   │
│  │  api.frvv.ro                        │   │
│  │  (Shared backend for all apps)      │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Static Hosting (CDN)               │   │
│  ├─────────────────────────────────────┤   │
│  │  admin.frvv.ro    → Federation App  │   │
│  │  comp.frvv.ro     → Competition App │   │
│  │  enroll.frvv.ro   → Enrollment App  │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│      Competition Venue (Local LAN)          │
├─────────────────────────────────────────────┤
│  Desktop App Installations:                 │
│  • Server PC (runs WebSocket server)        │
│  • 5 Referee tablets (referee clients)      │
│  • Scoreboard PC (external monitor)         │
│                                             │
│  Syncs results to cloud when online →       │
└─────────────────────────────────────────────┘
```

### Hosting Costs Estimate:
- **Backend API:** $12-25/month (DigitalOcean App Platform)
- **Static Hosting:** $0-5/month (Vercel/Netlify free tier)
- **Database:** Included in App Platform
- **Total:** ~$15-30/month

---

## File Organization

### Recommended Repository Structure
```
frvv-monorepo/
├── README.md
├── ARCHITECTURE.md
│
├── backend/                        # Shared API (existing)
│   ├── api/
│   ├── crud/
│   └── requirements.txt
│
├── apps/
│   ├── federation-admin/           # App 1
│   │   ├── package.json
│   │   └── src/
│   │
│   ├── competition-manager/        # App 2
│   │   ├── package.json
│   │   └── src/
│   │
│   └── club-enrollment/            # App 3
│       ├── package.json
│       └── src/
│
├── desktop/                        # App 4 (existing)
│   ├── scoring/
│   ├── ui/
│   └── main_launcher.py
│
└── docs/
    ├── API_DOCUMENTATION.md
    ├── DEPLOYMENT_GUIDE.md
    └── USER_MANUALS/
```

---

## API Endpoints Mapping

### Federation Admin App Needs:
```
GET    /api/athletes/          # List athletes
POST   /api/athletes/          # Create athlete
GET    /api/clubs/             # List clubs
POST   /api/clubs/             # Create club
GET    /api/grades/            # List grades
POST   /api/admin-approvals/   # Approve submissions
GET    /api/users/             # User management
```

### Competition Manager App Needs:
```
GET    /api/competitions/           # List competitions
POST   /api/competitions/           # Create competition
GET    /api/categories/             # List categories
POST   /api/categories/             # Create category
GET    /api/matches/                # List matches
POST   /api/bracket-matches/        # Generate brackets
GET    /api/category-athlete-score/ # View results
```

### Club Enrollment Portal Needs:
```
GET    /api/competitions/                  # View competitions
GET    /api/categories/?competition=X      # View categories
POST   /api/enrollments/                   # Enroll athlete
GET    /api/enrollments/my-club/           # My enrollments
GET    /api/athletes/?club=MY_CLUB         # My athletes
```

### Live Scoring Desktop App Needs:
```
GET    /api/categories/              # Load competition data
GET    /api/bracket-matches/         # Load bracket structure
POST   /api/category-athlete-score/  # Submit scores
POST   /api/team-scores/             # Submit team scores
```

**Good News:** Most endpoints already exist in your backend! Minor additions may be needed for enrollment workflow.

---

## Migration Path (Step-by-Step)

### Week 1: Backend Preparation
- [ ] Audit existing API endpoints
- [ ] Add missing endpoints for enrollment
- [ ] Set up CORS for multiple domains
- [ ] Create API documentation
- [ ] Test backend with Postman/curl

### Week 2: Federation Admin App
- [ ] Create new React project
- [ ] Copy athlete/club components
- [ ] Set up routing and navigation
- [ ] Connect to backend API
- [ ] Deploy to admin.frvv.ro

### Week 3: Competition Manager App
- [ ] Create new React project
- [ ] Copy competition components
- [ ] Build competition creation workflow
- [ ] Add results management UI
- [ ] Deploy to comp.frvv.ro

### Week 4: Club Enrollment Portal
- [ ] Create lightweight React project
- [ ] Build enrollment forms
- [ ] Add enrollment tracking
- [ ] Mobile-responsive design
- [ ] Deploy to enroll.frvv.ro

### Week 5: Desktop App Polish
- [ ] Update branding
- [ ] Improve sync logic
- [ ] Create installers
- [ ] Write documentation
- [ ] Test at mock competition

### Week 6: Testing & Launch
- [ ] End-to-end testing
- [ ] User acceptance testing
- [ ] Documentation review
- [ ] Deployment
- [ ] Training for users

---

## Key Decisions to Make

### 1. **Monorepo vs Separate Repos?**
**Recommendation:** Monorepo for easier maintenance
- Single backend, multiple frontends
- Shared components/utilities
- Easier deployment coordination

### 2. **Shared Component Library?**
**Recommendation:** Yes, create `@frvv/shared-components`
- Reuse UI components across apps
- Consistent branding
- Faster development

### 3. **Authentication Strategy?**
**Recommendation:** Shared auth via backend
- JWT tokens work across all apps
- Single user database
- Role-based access control

### 4. **Database Strategy?**
**Recommendation:** Single PostgreSQL database
- One source of truth
- Backend handles all data access
- Apps are stateless frontends

---

## Next Steps

1. **Review this plan** and adjust based on priorities
2. **Start with Phase 1** (backend preparation)
3. **Choose deployment targets** (domains, hosting)
4. **Set up Git branches** for each app
5. **Begin incremental development**

---

## Questions to Consider

1. Do you want all apps in one repository (monorepo) or separate repos?
2. What domain names will you use for each app?
3. Do you have specific branding/design requirements?
4. What's your timeline for launch?
5. Do you need help with any specific phase?

---

**Your desktop scoring system is already 80% complete!** The main work is splitting the web frontend into focused apps. The backend can remain largely unchanged - it already has most endpoints needed.
