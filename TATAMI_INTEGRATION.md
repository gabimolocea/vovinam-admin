# FRVV Offline App - Tatami Scoring System Integration

## Summary

The offline desktop app has been **completely redesigned and aligned with Django** to support **LAN-based scoring for tatami stations**. Referees can now connect to a local network and score Solo, Team, and Fight categories in real-time.

---

## ✨ What's New

### 1. **Tatami Management** (`models/lan_manager.py`)
- Create multiple scoring stations (Tatami 1, Tatami 2, etc.)
- Distinguish between **Fight** and **Demonstration** tatami types
- Configure station numbers and activation status
- Database-backed persistence

### 2. **Scoring Sessions** (`ui/scoring_sessions.py`)
- Start scoring for Solo, Team, or Fight categories
- Track athlete names and match information
- Support multiple referees scoring the same session
- Real-time score submission and aggregation

### 3. **WebSocket-Based LAN Scoring** (`scoring/tatami_server.py`)
- Referees register with their ID and tatami assignment
- Display clients show live scoring updates
- Broadcast aggregated scores across network
- Support for multiple concurrent tatamis

### 4. **UI Integration** (`ui/main_window.py`)
- New **Tatami/Scoring** tab in main app
- Left panel: Tatami manager (CRUD operations)
- Right panel: Scoring sessions for selected tatami
- Dashboard shows all active sessions

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   OFFLINE DESKTOP APP                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────┐         ┌──────────────────────┐   │
│  │  Tatami Manager  │         │ Scoring Sessions     │   │
│  │  (CRUD)          │────────▶│ (Start/End/Submit)   │   │
│  └──────────────────┘         └──────────────────────┘   │
│         │                              │                  │
│         └──────────┬───────────────────┘                  │
│                    │                                       │
│         ┌──────────▼──────────┐                           │
│         │   LANManager        │                           │
│         │  (DB Layer)         │                           │
│         └─────────┬───────────┘                           │
│                   │                                        │
│    ┌──────────────┼───────────────┐                       │
│    ▼              ▼               ▼                        │
│  tatamis   scoring_sessions  score_submissions            │
│  (Table)   (Table)           (Table)                      │
│                                                            │
└─────────────────────────────────────────────────────────┘
          │
          │ WebSocket (Port 8765)
          │
┌─────────┴──────────────────────────────────────────────┐
│            LAN - Local Network                          │
├────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐        ┌────────────┐     ┌──────────┐ │
│  │  Referee   │        │  Referee   │     │ Scoreboard│ │
│  │ App #1     │        │ App #2     │     │ Display  │ │
│  │ (Tatami 1) │        │ (Tatami 2) │     │          │ │
│  └────────────┘        └────────────┘     └──────────┘ │
│                                                          │
└────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Tatamis Table
```sql
CREATE TABLE tatamis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,          -- "Tatami 1", "Tatami 2"
    station_number INTEGER UNIQUE,      -- 1, 2, 3...
    type TEXT NOT NULL,                 -- 'fight' or 'demonstration'
    is_active INTEGER DEFAULT 1,        -- 1=active, 0=inactive
    ip_address TEXT,
    port INTEGER DEFAULT 8765,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

### Scoring Sessions Table
```sql
CREATE TABLE scoring_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tatami_id INTEGER NOT NULL,         -- FK to tatamis
    category_id INTEGER,                -- From Django backend
    category_name TEXT,                 -- "U-8 Solo Male"
    category_type TEXT,                 -- 'solo', 'team', 'fight'
    athlete1_id INTEGER,
    athlete1_name TEXT,                 -- Primary competitor
    athlete2_id INTEGER,
    athlete2_name TEXT,                 -- For team/fight
    match_id INTEGER,                   -- Optional: linked match
    status TEXT DEFAULT 'active',       -- 'active', 'paused', 'completed'
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    score_data TEXT,                    -- JSON: aggregated scores
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tatami_id) REFERENCES tatamis(id)
)
```

### Score Submissions Table
```sql
CREATE TABLE score_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,        -- FK to scoring_sessions
    referee_id INTEGER,                 -- Which referee
    referee_name TEXT,
    score_data TEXT NOT NULL,           -- JSON: individual scores
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES scoring_sessions(id)
)
```

---

## 🔌 WebSocket API

### Register as Referee
**Client → Server**
```json
{
  "type": "register_referee",
  "referee_id": 5,
  "tatami_id": 1
}
```

### Start Scoring Session
**Client → Server**
```json
{
  "type": "start_session",
  "data": {
    "tatami_id": 1,
    "category_id": 15,
    "category_name": "U-8 Solo Male",
    "category_type": "solo",
    "athlete1_id": 101,
    "athlete1_name": "John Doe",
    "athlete2_id": 102,
    "athlete2_name": "Jane Smith"
  }
}
```

### Submit Score
**Referee → Server**
```json
{
  "type": "submit_score",
  "data": {
    "session_id": 42,
    "referee_id": 5,
    "referee_name": "Referee Smith",
    "score_data": {
      "technique": 9.5,
      "power": 8.0,
      "speed": 9.0,
      "total": 26.5
    }
  }
}
```

### Get Available Sessions
**Referee → Server**
```json
{
  "type": "get_sessions",
  "tatami_id": 1
}
```

### End Session
**Admin → Server**
```json
{
  "type": "end_session",
  "session_id": 42
}
```

### Session Available (Broadcast)
**Server → Referee**
```json
{
  "type": "session_available",
  "session": {
    "id": 42,
    "tatami_id": 1,
    "category_name": "U-8 Solo Male",
    "category_type": "solo",
    "athlete1_name": "John Doe",
    "athlete2_name": "Jane Smith",
    "status": "active",
    "started_at": "2026-02-07T10:30:00"
  }
}
```

### Score Submitted (Broadcast to Displays)
**Server → Display**
```json
{
  "type": "score_submitted",
  "session_id": 42,
  "referee_id": 5,
  "referee_name": "Referee Smith",
  "submission_count": 2
}
```

---

## 🚀 Usage Workflow

### Step 1: Setup Tatamis
1. Open offline app → **Tatami/Scoring** tab
2. Click **"➕ Add Tatami"**
3. Enter:
   - Name: `Tatami 1`
   - Station #: `1`
   - Type: `Fight` (or `Demonstration`)
4. Repeat for additional tatamis

### Step 2: Start Scoring
1. Select tatami from left panel
2. Click **"▶️ Start New Session"**
3. Select category from synced categories
4. Enter athlete names
5. Click OK → Session starts

### Step 3: Referee Connection
1. On referee's device, open referee scoring app
2. Enter Referee ID
3. Select Tatami
4. App connects via WebSocket
5. Shows available sessions

### Step 4: Score Submission
1. Referee sees session on their screen
2. Enters scores for each criterion
3. Clicks **"📝 Submit Score"**
4. Score saved and broadcast to displays

### Step 5: End Session
1. All referees submitted
2. Admin clicks **"⏹️ End Session"**
3. Session marked complete
4. Scores aggregated and synced to Django

---

## 💾 Syncing with Django Backend

### When Offline Scoring is Complete:

**`sync/sync_manager.py`** needs new method:
```python
def sync_tatami_scores_to_django(self):
    """Upload completed scoring sessions to backend"""
    
    # 1. Get all completed sessions from scoring_sessions table
    # 2. Match category_id to Django Category
    # 3. For each session:
    #    - Get submissions from score_submissions
    #    - Calculate final score
    #    - POST to /api/category-athlete-scores/ (for solo/team)
    #    - OR POST to /api/match-referee-scores/ (for matches)
    # 4. Mark as synced
    # 5. Log sync results
```

### Example Sync Code
```python
def sync_tatami_scores_to_django(self):
    cursor = self.db.cursor()
    
    # Get completed sessions not yet synced
    cursor.execute('''
        SELECT ss.id, ss.category_id, ss.athlete1_id, 
               ss.score_data, ss.completed_at
        FROM scoring_sessions ss
        WHERE ss.status = 'completed' AND ss.is_synced = 0
    ''')
    
    for session in cursor.fetchall():
        # Parse aggregated score
        score_data = json.loads(session['score_data'])
        
        # POST to Django backend
        response = self.api_client.post(
            '/api/category-athlete-scores/',
            {
                'category_id': session['category_id'],
                'athlete_id': session['athlete1_id'],
                'score': score_data.get('total', 0),
                'status': 'pending'
            }
        )
        
        if response.status_code == 201:
            # Mark as synced
            cursor.execute(
                'UPDATE scoring_sessions SET is_synced = 1 WHERE id = ?',
                (session['id'],)
            )
            self.db.connection.commit()
```

---

## 📱 Referee App (Future)

For mobile/tablet referee interface:
- Separate PyQt app or web app
- Connects to tatami WebSocket server
- Simple score entry interface
- Real-time feedback
- Offline queue if network drops

---

## 🔧 Configuration

Edit `desktop/config.py`:
```python
# Tatami/Scoring Settings
TATAMI_SERVER_HOST = '0.0.0.0'
TATAMI_SERVER_PORT = 8765
TATAMI_TYPES = ['fight', 'demonstration']
MAX_TATAMIS = 10

# Scoring settings
REFEREE_TIMEOUT = 300  # seconds
SESSION_AUTO_END = True
SCORE_AGGREGATION = 'average'  # 'average', 'median', 'unanimous'
```

---

## 📦 New Files Created

| File | Purpose |
|------|---------|
| `models/lan_manager.py` | Core LAN scoring management |
| `ui/tatami_manager.py` | Tatami CRUD UI |
| `ui/scoring_sessions.py` | Session management UI |
| `scoring/tatami_server.py` | Enhanced WebSocket server |
| `OFFLINE_APP_UPDATE.md` | User documentation |
| `TATAMI_INTEGRATION.md` | This file |

---

## 🧪 Testing

### Test Tatami Creation
```bash
cd desktop
python -c "
from models.db import Database
from models.lan_manager import LANManager

db = Database()
lan = LANManager(db.connection)

# Create tatamis
t1 = lan.create_tatami('Tatami 1', 1, 'fight')
t2 = lan.create_tatami('Tatami 2', 2, 'demonstration')

print('✅ Tatamis created:')
for t in lan.get_all_tatamis():
    print(f'  - {t.name} (Station {t.station_number}, {t.type.value})')
"
```

### Test Scoring Session
```bash
python -c "
from models.db import Database
from models.lan_manager import LANManager

db = Database()
lan = LANManager(db.connection)

# Get first tatami
tatamis = lan.get_all_tatamis()
if tatamis:
    t = tatamis[0]
    
    # Create session
    s = lan.create_session(
        t.id,
        1,
        'U-8 Solo Male',
        'solo',
        101,
        'John Doe'
    )
    
    print(f'✅ Session {s} created on {t.name}')
    
    # Submit scores from 3 referees
    for ref_id in [1, 2, 3]:
        lan.submit_referee_score(
            s,
            ref_id,
            f'Referee {ref_id}',
            '{\"technique\": 8.0, \"power\": 9.0}'
        )
    
    # Get submissions
    subs = lan.get_session_submissions(s)
    print(f'✅ {len(subs)} referee submissions received')
"
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| WebSocket connection fails | Check firewall allows port 8765, verify network connectivity |
| Categories not showing | Run sync with Django backend first |
| Scores not appearing | Check network, verify session is active |
| SQLite locked errors | Ensure only one instance of app running |
| IP address wrong | Check server output for actual LAN IP |

---

## 🎯 Next Steps

1. **Test tatami creation** in UI
2. **Test scoring session** creation and submission
3. **Configure sync** to Django backend
4. **Build referee app** (mobile/web optional)
5. **Deploy** to tournament venue

---

## 📞 Support

For issues or questions:
1. Check `OFFLINE_APP_UPDATE.md` for user guide
2. Review WebSocket messages in console logs
3. Verify database schema with `PRAGMA table_info`
4. Check Django backend `/api/` endpoints
