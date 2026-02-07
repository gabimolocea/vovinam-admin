# Phase 3 Quick Reference Guide

## What Was Built

### 🎬 Referee Scoring Interface
**Location**: `/frontend/src/pages/RefereeScoringPage.jsx`

Referees use this to submit match scores:
- Select assigned category
- Choose scoring type (Solo/Fighting)
- Enter deductions or round scores
- Offline support with automatic sync

**Components**:
- `SoloScoringForm.jsx` - For solo/team competitions (100 - deductions = score)
- `FightingScoringForm.jsx` - For fighting matches (5 rounds, red/blue corners)
- `QRScanner.jsx` - Quick access via QR code
- `ScoringHistory.jsx` - Recent submission sidebar

**How to Use**:
```javascript
// In components
import RefereeScoringPage from '../pages/RefereeScoringPage';
import { refereeAPI } from '../services/api';

// Load categories
const categories = await refereeAPI.getAssignedCategories();

// Submit score
await refereeAPI.submitScore({
  categoryId: 123,
  athleteScoreId: 456,
  finalScore: 85,
  deductions: {...}
});
```

---

### 📊 Display Monitor Interface
**Location**: `/frontend/src/pages/DisplayMonitorPage.jsx`

External screen display showing live scores:
- Real-time score updates via WebSocket
- Large text for visibility at distance
- Athlete/match info header
- Time and status footer

**Components**:
- `SoloScoreDisplay.jsx` - Shows 5 referee score boxes
- `FightingScoreDisplay.jsx` - Shows fighting match with rounds

**How to Use**:
```javascript
// Monitor a field's scores
import DisplayMonitorPage from '../pages/DisplayMonitorPage';

// Navigate to: /monitor/1 (where 1 is fieldId)
// Component automatically:
// - Loads field session
// - Connects to WebSocket
// - Updates scores in real-time
```

---

### ⚙️ Admin Dashboard
**Location**: `/frontend/src/pages/AdminDashboardPage.jsx`

Admin panel for event management:
- Create and manage events
- Create and assign fields
- Assign referees to categories
- Monitor live score submissions
- View event statistics

**Tabs**:
1. **Overview** - Event stats, live score feed
2. **Events** - Create/view competitions
3. **Fields** - Create/assign competition fields
4. **Referees** - Assign referees to fields

**Sub-Components**:
- `EventSetupPanel.jsx` - Event CRUD
- `FieldManagementPanel.jsx` - Field management
- `RefereeAssignmentPanel.jsx` - Referee assignments
- `LiveScoresTracker.jsx` - Real-time score feed

**How to Use**:
```javascript
// Admin-only access
import AdminDashboardPage from '../pages/AdminDashboardPage';

// Check admin role in component
if (!user.is_admin) {
  return <div>Access Denied</div>;
}

// Use API methods
import { competitionAPI, adminAPI } from '../services/api';

// Create event
await competitionAPI.createEvent({
  name: 'National Championship 2024',
  location: 'Bucharest',
  start_date: '2024-05-15',
  end_date: '2024-05-17'
});

// List events
const events = await competitionAPI.listEvents();

// Create field
await competitionAPI.createField({
  event_id: 1,
  name: 'Ring A',
  field_number: 1
});

// Assign referee
await competitionAPI.createAssignment({
  field_id: 1,
  referee_id: 123,
  category_id: 456
});

// Get live stats
const stats = await adminAPI.getEventStats(eventId);
// Returns: { fields_active, referees_assigned, scores_submitted, pending_approval }
```

---

## API Integration

### Required API Endpoints

**From Phase 2** (Already implemented):

```javascript
// Competition management
POST   /api/competitions/ - Create event
GET    /api/competitions/ - List events
GET    /api/competitions/{id}/ - Get event details

POST   /api/fields/ - Create field
GET    /api/fields/?event={id} - List fields
GET    /api/fields/{id}/ - Get field details

POST   /api/category-field-assignments/ - Create assignment
GET    /api/category-field-assignments/?event={id} - List assignments

POST   /api/match-rounds/ - Submit fighting score
GET    /api/match-rounds/?match={id} - Get match history

GET    /api/display-monitor-sessions/{field_id}/ - Load monitor session
```

### API Service Layer

All API calls use centralized service in `/frontend/src/services/api.js`:

```javascript
// Referee API
refereeAPI.getAssignedCategories()
refereeAPI.submitScore(data)
refereeAPI.getScoringHistory()

// Monitor API
monitorAPI.getFieldSession(fieldId)
monitorAPI.updateDisplaying(data)

// Competition API
competitionAPI.listEvents()
competitionAPI.createEvent(data)
competitionAPI.listFields(eventId)
competitionAPI.createField(data)
competitionAPI.listCategories(eventId)
competitionAPI.createAssignment(data)
competitionAPI.listAssignments(eventId)

// Admin API
adminAPI.listReferees()
adminAPI.getEventStats(eventId)
adminAPI.getFieldStats(fieldId)
```

---

## Context Providers

### AuthContext
```javascript
import { useAuth } from '../contexts/AuthContext';

const { user, isLoading, error, login, logout } = useAuth();

// Check role
if (user?.is_admin) { ... }
if (user?.is_referee) { ... }
```

### CompetitionContext
```javascript
import { useCompetition } from '../contexts/CompetitionContext';

const { currentEvent, setCurrentEvent, categories, fields } = useCompetition();
```

### WebSocketContext
```javascript
import { useWebSocket } from '../contexts/WebSocketContext';

const { isConnected, lastMessage, send } = useWebSocket();

// Send message
send({
  type: 'score_submitted',
  data: { ... }
});

// Receive message (automatic)
// lastMessage is updated when new messages arrive
```

### OfflineContext
```javascript
import { useOffline } from '../contexts/OfflineContext';

const { isOnline, pendingCount, saveScore, syncScores } = useOffline();

// Save offline
await saveScore({ ... });

// Check pending count
console.log(`${pendingCount} scores waiting to sync`);

// Sync when online
await syncScores();
```

---

## Styling

### CSS Files Created

1. **RefereeScoringPage.css** (600+ lines)
   - Referee interface styling
   - Form layouts
   - Animations

2. **DisplayMonitorPage.css** (1000+ lines)
   - Full-screen monitor display
   - Score box styling
   - Fighting match display

3. **AdminDashboard.css** (1200+ lines)
   - Dashboard layout
   - Tab navigation
   - Card components
   - Table styling
   - Forms

### Color Variables
```css
--primary: #007BFF (blue)
--secondary: #6C757D (gray)
--success: #28A745 (green)
--error-color: #DC3545 (red)
--warning-color: #FFC107 (yellow)
--info-color: #17A2B8 (cyan)
--text-primary: #212529
--text-secondary: #6C757D
--text-disabled: #ADB5BD
--border-color: #DEE2E6
--bg-primary: #F8F9FA
--bg-secondary: #E9ECEF
--surface: #FFFFFF
```

---

## Routing

Add these routes to your main router (`/frontend/src/App.jsx`):

```javascript
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RefereeScoringPage from './pages/RefereeScoringPage';
import DisplayMonitorPage from './pages/DisplayMonitorPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/referee" element={<RefereeScoringPage />} />
        <Route path="/monitor/:fieldId" element={<DisplayMonitorPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        {/* ... other routes */}
      </Routes>
    </Router>
  );
}
```

---

## Testing Phase 3 Components

### Test Referee Scoring
```bash
1. Navigate to http://localhost:5173/referee
2. Should see "Select Category" stage
3. Mock API returns categories
4. Click category → shows scoring form
5. Enter scores → see real-time calculation
6. Offline/Online toggle: Try submit offline, go online, verify sync
```

### Test Display Monitor
```bash
1. Navigate to http://localhost:5173/monitor/1
2. Should load field session
3. Open another tab with referee scoring
4. Submit a solo score → Monitor updates in real-time
5. Submit fighting score → Monitor shows different format
```

### Test Admin Dashboard
```bash
1. Navigate to http://localhost:5173/admin
2. Must be logged in as admin
3. Create event → Verify in Overview
4. Create field → See in Fields tab
5. Assign referee → Check Referees tab
6. Submit scores in referee tab → Watch stats update in Overview
```

---

## WebSocket Integration

### WebSocket Consumers (Backend)

```python
# /backend/api/consumers.py

class ScoringConsumer(AsyncWebsocketConsumer):
    """Real-time scoring for monitors"""
    # Handles: score_submitted, match_score_submitted, winner_selected

class AdminDashboardConsumer(AsyncWebsocketConsumer):
    """Admin statistics updates"""
    # Handles: stats_updated
```

### WebSocket Messages

**Score Submitted**:
```json
{
  "type": "score_submitted",
  "data": {
    "referee_id": 123,
    "category_id": 456,
    "score": 85,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

**Match Winner Selected**:
```json
{
  "type": "winner_selected",
  "data": {
    "match_id": 789,
    "winner_corner": "red",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

---

## Common Development Tasks

### Add New Category Type
1. Update backend: Add to `Category.category_type` choices
2. Update frontend: Add case in RefereeScoringPage
3. Update display: Add component in DisplayMonitorPage
4. Update styling: Add CSS rules

### Add New Form Field to Scoring
1. Update backend serializer
2. Add input to React form component
3. Handle in submission handler
4. Update validation

### Change Color Scheme
1. Edit CSS variables in theme file
2. All components auto-update (uses `var(--primary)` etc.)

### Add Validation to Admin Forms
1. Update React state validation
2. Add error state display
3. Show validation messages to user

---

## Debugging Tips

### Component Won't Load
```javascript
// Check:
1. Is route registered in main router?
2. Are imports correct?
3. Check browser console for errors
4. Is CSS file imported?
```

### API Call Fails
```javascript
// Check:
1. Is backend running? (python manage.py runserver)
2. Is endpoint registered in urls.py?
3. Check network tab in DevTools
4. Verify CORS configuration
5. Check JWT token if authenticated
```

### WebSocket Not Connecting
```javascript
// Check:
1. Is Django Channels running? (Daphne server)
2. Is consumer registered in routing.py?
3. Is channel layer configured?
4. Check browser console for WebSocket errors
5. Verify WebSocket URL is correct
```

### Offline Sync Not Working
```javascript
// Check:
1. Is IndexedDB storage working? (DevTools → Storage)
2. Is sync triggered on reconnect?
3. Are pending scores saved correctly?
4. Verify OfflineContext is wrapped around app
```

---

## Performance Optimization

### Frontend
- Components are code-split by route
- Images should be optimized
- Use React.memo() for expensive components
- Pagination for large lists (implemented in API)

### Backend
- Database queries are optimized with select_related/prefetch_related
- WebSocket messages are efficient (JSON only)
- Use pagination for list endpoints

### Network
- Gzip compression enabled
- Images served via CDN (in production)
- Service worker caches static files

---

## Deployment Checklist

Before deploying Phase 3:

- [ ] All React components tested locally
- [ ] API endpoints tested with frontend
- [ ] WebSocket connections working
- [ ] Offline storage tested
- [ ] Responsive design verified (mobile/tablet)
- [ ] Error handling in place
- [ ] Loading states shown
- [ ] No console errors
- [ ] Environment variables set
- [ ] CORS configured for production domain

---

## Additional Resources

- **Backend Models**: `/backend/api/models.py` (1700+ lines)
- **API Endpoints**: `/backend/api/urls.py`
- **WebSocket Setup**: `/backend/api/consumers.py`
- **Django Channels**: `/backend/crud/settings.py` and `/backend/crud/asgi.py`
- **Frontend Contexts**: `/frontend/src/contexts/`
- **API Service**: `/frontend/src/services/api.js`

---

## What's Next (Phase 4+)

- ✅ Phase 2: Backend API (DONE)
- ✅ Phase 3: Frontend UI (DONE)
- 🚀 Phase 4: Service Worker & PWA
- 🚀 Phase 5: Testing & QA
- 🚀 Phase 6: Deployment

---

**Questions?** Check the documentation files:
- `PHASE_3_COMPLETION_SUMMARY.md` - Detailed overview
- `SYSTEM_ARCHITECTURE.md` - Full technical architecture
- `CONSOLIDATION_SUMMARY.md` - Data model consolidation
