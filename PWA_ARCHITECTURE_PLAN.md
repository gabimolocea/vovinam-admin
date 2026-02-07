# PWA Scoring System - Architecture & Model Analysis

## Current Django Models Status

### ✅ What Exists (No Duplication Needed)

**Core Competition Structure:**
- ✅ `Event` (landing.models) - Top-level competition container
- ✅ `Category` (api.models) - Base category with inheritance (SoloCategory, TeamCategory, FightCategory)
- ✅ `Match` (api.models) - Individual fights/matches within categories
- ✅ `Athlete` (api.models) - Individual athletes/referees

**Scoring & Assignments:**
- ✅ `CategoryRefereeAssignment` - 5 referees assigned to solo/team categories (referee_1 through referee_5)
- ✅ `CategoryRefereeScore` - Individual referee scores for solo/team athletes
- ✅ `MatchRefereeScore` - Individual referee scores for fighting matches (red_corner_score, blue_corner_score)
- ✅ `CategoryAthleteScore` - Athlete results with approval workflow
- ✅ `MatchRefereeAssignment` (likely exists) - Referees assigned to fights

### ❌ What's Missing (Need to Add)

**1. Competition Fields Structure**
- No `Field` model exists
- Need: `CompetitionField` with:
  - name (e.g., "Field 1", "Field 2", "Field 3")
  - competition/event FK
  - is_active (boolean)
  - display_monitor_session (to track what's shown on that field's monitor)

**2. Category-to-Field Assignment**
- Categories must be assigned to specific fields
- Need: `CategoryFieldAssignment` with:
  - category FK
  - field FK
  - order/sequence
  - scheduled_start_time

**3. QR Code Model**
- Need: `QRCodeAssignment` with:
  - referee FK
  - category FK or match FK
  - unique_code (generated)
  - created_at
  - expires_at (optional)

**4. Scoring Round Tracking (for Fighting)**
- Matches need round management
- Need: `MatchRound` with:
  - match FK
  - round_number (1, 2, 3, etc.)
  - duration_seconds
  - status (scheduled, active, completed)
  - started_at
  - ended_at

**5. Display Monitor Session**
- Need: `DisplayMonitorSession` with:
  - field FK
  - current_category FK or match FK
  - status (idle, displaying)
  - created_at
  - updated_at

---

## Scoring Mechanics

### Solo/Team Categories (Demonstration Format)

**Per Athlete/Team:**
1. All 5 assigned referees submit scores independently
2. Each referee sees: athlete name, category, task description
3. Referee submits with deductions:
   - Wrong Technique
   - Wrong Position
   - Not Looking Real
   - Stamina Issues
4. System calculates: `Total = 100 - sum_of_deductions`
5. When all 5 submit:
   - All scores revealed at once
   - Highest and lowest excluded (strikethrough CSS)
   - Total calculated from middle 3 scores

**Display Monitor Shows:**
```
Competition Name
Category: Solo Male 1
Athlete: John Doe

[Loading...] Ref 1
[Loading...] Ref 2
Score: 87  ← Ref 3
Score: 88  ← Ref 4
Score: 85  ← Ref 5

Middle 3 Average: 86.67
```

### Fighting/Matches (Round by Round)

**Per Round:**
1. Round timer starts (e.g., 3 minutes)
2. Each referee watches red vs blue corner
3. At end of round, each referee gives +1, +2 points for techniques
4. Ref also notes adjustments from central referee (±1, ±2)

**After Final Round:**
1. Each referee selects winner: RED or BLUE
2. Winner = most selected corner (need 3/5 minimum)
3. If tied: Use point totals from scoring

**Display Monitor Shows:**
```
Competition Name
Category: Fighting Male 1

RED CORNER                BLUE CORNER
John Doe                  Jane Smith
Club: RoMA                Club: FRVV

[Round 1] [Round 2] [Round 3]

Time Remaining: 2:45

Red Votes: 2/5           Blue Votes: 2/5
Red Points: 12           Blue Points: 10
Red Total: 14            Blue Total: 12

[Waiting for final round...]
```

---

## PWA Architecture

### Frontend Structure

```
/frontend
  /src
    /components
      /referee
        RefereeLogin.jsx
        CategorySelector.jsx
        SoloScoringForm.jsx      ← Deductions form
        FightingScoringForm.jsx  ← Points + winner selection
        QRScanner.jsx           ← Optional camera QR scanner
      /monitor
        DisplayMonitor.jsx       ← Field 1/2/3 display
        ScoreReveal.jsx
        FightingRound.jsx
      /admin
        AdminDashboard.jsx
        CompetitionSetup.jsx
        FieldManagement.jsx
        CategoryFieldAssignment.jsx
        RefereeAssignmentUI.jsx
        QRCodeGenerator.jsx
      /shared
        AuthContext.jsx
        CompetitionContext.jsx
        WebSocketContext.jsx     ← Real-time updates
        OfflineSync.jsx          ← Service worker management
    /services
      api.js                     ← REST API calls
      websocket.js               ← WebSocket connection
      qrcode.js                  ← QR code generation/scanning
      storage.js                 ← IndexedDB for offline
    /styles
      index.css
      monitor.css               ← Large display styles
      mobile.css                ← Mobile referee styles
```

### WebSocket Events (Django Channels)

**Referee → Server:**
```json
{
  "type": "score.submit",
  "referee_id": 123,
  "category_id": 456,
  "athlete_id": 789,
  "score": 87,
  "deductions": {"wrong_technique": 10, "stamina": 3}
}

{
  "type": "winner.submit",
  "referee_id": 123,
  "match_id": 456,
  "winner_corner": "red"
}
```

**Server → Monitor:**
```json
{
  "type": "scores.updated",
  "athlete_id": 789,
  "scores": [87, 88, 85, null, null],
  "revealed": true,
  "total": 86.67
}

{
  "type": "round.started",
  "match_id": 456,
  "round_number": 1,
  "duration": 180
}

{
  "type": "round.ended",
  "match_id": 456,
  "round_number": 1,
  "winner_votes": {"red": 2, "blue": 2, "draw": 1}
}
```

---

## Implementation Sequence

### Phase 1: Backend Models & API (Week 1)
1. Create missing models: Field, CategoryFieldAssignment, QRCodeAssignment, MatchRound, DisplayMonitorSession
2. Update CategoryRefereeScore to support deduction structure
3. Create DRF serializers for all models
4. Create ViewSets with proper permissions
5. Set up Django Channels with WebSocket consumers

### Phase 2: Frontend Setup (Week 1-2)
1. Remove old frontend
2. Create Vite + React + TypeScript project
3. Install PWA dependencies (workbox, IndexedDB wrappers)
4. Set up context providers (Auth, Competition, WebSocket)
5. Implement basic routing

### Phase 3: Referee Interface (Week 2-3)
1. RefereeLogin with email
2. CategorySelector dropdown + QR scanner
3. SoloScoringForm with deduction inputs → Total calculation
4. FightingScoringForm with round-by-round points
5. Offline support (IndexedDB storage)
6. Auto-reveal logic

### Phase 4: Display Monitor (Week 3-4)
1. DisplayMonitor component (receives WebSocket updates)
2. Score reveal animation (strikethrough high/low)
3. Fighting round display with timer
4. Field selection UI (admin can switch categories)
5. Monitor auto-refresh every 2 seconds (fallback)

### Phase 5: Admin Dashboard (Week 4)
1. Competition setup form
2. Field management (create 1-3 fields)
3. Category → Field assignment
4. Referee assignments UI
5. QR code generation
6. Results review/approval

### Phase 6: Polish & Testing (Week 5)
1. Service worker for offline scoring
2. Background sync when online
3. Error handling & retry logic
4. End-to-end testing
5. Performance optimization

---

## Database Schema Additions

### CompetitionField
```sql
CREATE TABLE api_competitionfield (
  id INTEGER PRIMARY KEY,
  event_id INTEGER FK,
  name VARCHAR(100),
  field_number INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP
);
```

### CategoryFieldAssignment
```sql
CREATE TABLE api_categoryfieldassignment (
  id INTEGER PRIMARY KEY,
  category_id INTEGER FK UNIQUE,
  field_id INTEGER FK,
  scheduled_start_time TIMESTAMP,
  order INTEGER,
  status VARCHAR(20)  -- not_started, in_progress, completed
);
```

### QRCodeAssignment
```sql
CREATE TABLE api_qrcodeassignment (
  id INTEGER PRIMARY KEY,
  referee_id INTEGER FK,
  category_id INTEGER FK,
  match_id INTEGER FK,
  code VARCHAR(255) UNIQUE,
  created_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

### MatchRound
```sql
CREATE TABLE api_matchround (
  id INTEGER PRIMARY KEY,
  match_id INTEGER FK,
  round_number INTEGER,
  duration_seconds INTEGER,
  status VARCHAR(20),  -- scheduled, active, completed
  started_at TIMESTAMP,
  ended_at TIMESTAMP
);
```

### DisplayMonitorSession
```sql
CREATE TABLE api_displaymonitorsession (
  id INTEGER PRIMARY KEY,
  field_id INTEGER FK,
  current_category_id INTEGER FK,
  current_match_id INTEGER FK,
  status VARCHAR(20),
  updated_at TIMESTAMP
);
```

---

## API Endpoints Required

**Referee Scoring:**
- `GET /api/referees/me/` - Current referee info
- `GET /api/referees/{id}/assigned-categories/` - List of assigned categories
- `GET /api/referees/{id}/assigned-matches/` - List of assigned matches
- `POST /api/referee-scores/` - Submit score for athlete
- `POST /api/match-referee-scores/` - Submit score for fight
- `POST /api/match-winner-selection/` - Select winner after match

**Display Monitor:**
- `GET /api/fields/{id}/` - Field info
- `GET /api/fields/{id}/current-category/` - What's displayed
- `GET /api/categories/{id}/scores/` - All referee scores for category
- `GET /api/matches/{id}/current-round/` - Round info
- `GET /api/matches/{id}/scores/` - All referee scores for match
- `POST /api/display-monitor-sessions/` - Create/update monitor session

**Admin:**
- `POST /api/competition-fields/` - Create field
- `PUT /api/category-field-assignments/{id}/` - Update field assignment
- `POST /api/qr-code-assignments/` - Generate QR codes
- `GET /api/events/{id}/results/` - Competition results
- `POST /api/events/{id}/finalize/` - Close competition

**QR Code:**
- `GET /api/qr/{code}/` - Resolve QR code to category/match

---

## Next Steps

1. ✅ Model analysis complete
2. ⏳ Create missing Django models & migrations
3. ⏳ Set up Django Channels
4. ⏳ Build React PWA from scratch
5. ⏳ Implement WebSocket communication
6. ⏳ Test offline-first offline capabilities

---

**Estimated Timeline: 5 weeks for complete implementation**
**Working System by: ~6 weeks if starting immediately**

Ready to proceed with model creation? Confirm and I'll start building!
