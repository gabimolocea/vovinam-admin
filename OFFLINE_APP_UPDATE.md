## FRVV Offline Desktop App - Updated for Tatami/LAN Scoring

### Overview

The offline desktop app now supports **LAN-based scoring for tatami stations**. This allows multiple referees to connect via a local network and score competitions in real-time on their respective tatami (competition areas).

### Architecture

#### Django Alignment

The offline app mirrors the Django backend structure:

- **Competitions** ↔ Event model
- **Categories** ↔ Category, SoloCategory, TeamCategory, FightCategory models  
- **Athletes** ↔ Athlete model
- **Matches** ↔ AthleteMatch, TeamMatch models
- **Tatamis** (NEW) ↔ Physical scoring stations
- **Scoring Sessions** (NEW) ↔ Live scoring on each tatami

#### New Components

**1. Tatami Manager (`models/lan_manager.py`)**
- Manages tatami/scoring station configuration
- Tracks active scoring sessions per tatami
- Stores referee score submissions
- Database schema:
  - `tatamis` - Station definitions (name, type, number)
  - `scoring_sessions` - Active/completed scoring sessions
  - `score_submissions` - Individual referee scores

**2. UI Components**

a) **Tatami Manager Widget** (`ui/tatami_manager.py`)
```
- List all tatamis (Fight / Demonstration types)
- Add new tatami stations
- Edit/Delete configurations
- Toggle active/inactive status
```

b) **Scoring Session Widget** (`ui/scoring_sessions.py`)
```
- Create scoring sessions for categories
- Support Solo, Team, and Fight categories
- Track athletes and scoring
- Submit referee scores
- End sessions with final results
```

**3. WebSocket Server** (`scoring/websocket_server.py`)
- Already implemented - handles real-time communication
- Referee clients connect with their ID
- Display clients show live scores
- Broadcasts scoring updates across network

### Workflow

#### Setup Phase

1. **Create Tatami Stations**
   - Admin goes to "Tatami/Scoring" tab
   - Clicks "Add Tatami"
   - Configures: Name (e.g., "Tatami 1"), Station #, Type (Fight/Demonstration)
   - Creates multiple stations for tournament

2. **Sync Categories from Django**
   - Categories are synced from backend during `python manage.py sync`
   - Includes Solo, Team, and Fight categories
   - Available in scoring session creation

#### Scoring Phase

3. **Start Scoring Session**
   - Select a tatami
   - Click "Start New Session"
   - Select category (type auto-detected)
   - Enter athletes' names
   - Session begins, referees can connect

4. **Referee Connection (LAN)**
   - Referee opens scoring app on their device
   - Enters their referee ID
   - Connects to tatami server (ip:port)
   - Receives active sessions list
   - Selects their assigned category to score

5. **Score Submission**
   - Referee enters points/evaluation
   - Clicks "Submit Score"
   - Score saved in `score_submissions` table
   - All referees can see aggregated scoring

6. **End Session**
   - After all referees submit
   - Admin clicks "End Session"
   - Session marked complete
   - Sync back to Django backend

### Database Schema

**Tatamis Table**
```sql
id, name, station_number, type ('fight'/'demonstration'), 
is_active, ip_address, port, created_at, updated_at
```

**Scoring Sessions Table**
```sql
id, tatami_id, category_id, category_name, category_type ('solo'/'team'/'fight'),
athlete1_id, athlete1_name, athlete2_id, athlete2_name, match_id,
status ('active'/'paused'/'completed'), started_at, completed_at,
score_data (JSON), notes, created_at, updated_at
```

**Score Submissions Table**
```sql
id, session_id, referee_id, referee_name, score_data (JSON),
submitted_at
```

### API Endpoints (WebSocket)

**Client → Server Messages**

```json
{
  "type": "register",
  "client_type": "referee",  // or "display"
  "referee_id": 1
}

{
  "type": "start_session",
  "data": {...category/athlete data...}
}

{
  "type": "submit_score",
  "data": {
    "session_id": 1,
    "referee_id": 1,
    "score_data": {...}
  }
}

{
  "type": "finalize_score",
  "data": {"session_id": 1}
}

{
  "type": "end_session"
}
```

**Server → Client Messages**

```json
{
  "type": "session_available",
  "session": {...}
}

{
  "type": "session_started",
  "session": {...}
}

{
  "type": "score_received",
  "data": {...}
}
```

### Configuration

Set in `desktop/config.py`:
```python
# LAN Server
LAN_HOST = '0.0.0.0'
LAN_PORT = 8765
REFEREE_APP_PORT = 8766

# Station types
STATION_TYPES = ['fight', 'demonstration']
```

### Sync to Django

After offline scoring:

```python
# In sync_manager.py - new method
def sync_tatami_scores_to_django(self):
    """Upload completed scoring sessions to Django backend"""
    # Get all completed sessions
    # Match to backend Event/Category
    # Create CategoryAthleteScore or MatchRefereeScore entries
    # POST to /api/category-athlete-scores/ or /api/match-referee-scores/
```

### Future Enhancements

1. **Referee App** - Separate mobile/tablet app for referees
2. **Scoreboard Display** - Large display showing live scores
3. **Bracket Integration** - Auto-populate from bracket matches
4. **Score Averaging** - Automatic score calculation from multiple referees
5. **Network QR Code** - Generate QR for referees to join easily
6. **Offline Sync Queue** - Queue scores for sync when offline

### Running the App

```bash
cd desktop
python -m pip install -r requirements.txt
python main.py

# Or with scoring server
python start_scoring.py
```

### Files Modified/Added

- ✅ `models/lan_manager.py` - NEW LAN management
- ✅ `ui/tatami_manager.py` - NEW Tatami UI
- ✅ `ui/scoring_sessions.py` - NEW Session management UI
- ✅ `ui/main_window.py` - UPDATED with tatami tab
- 📝 `scoring/websocket_server.py` - EXISTS, integrates with tatamis
- 📝 `sync/sync_manager.py` - TODO: Add sync methods

### Testing

```bash
# Test tatami creation
cd desktop
python -c "
from models.db import Database
from models.lan_manager import LANManager

db = Database()
lan = LANManager(db.connection)

# Create tatamis
t1 = lan.create_tatami('Tatami 1', 1, 'fight')
t2 = lan.create_tatami('Tatami 2', 2, 'demonstration')

# Create scoring session
s1 = lan.create_session(t1, 1, 'U-8 Solo Male', 'solo', 101, 'John Doe')

print('Tatamis:', lan.get_all_tatamis())
print('Sessions:', lan.get_active_sessions(t1))
"
```

### Troubleshooting

**WebSocket Connection Issues**
- Check firewall allows port 8765
- Verify all devices on same network
- Check `config.py` for correct IP/port

**Session Not Appearing**
- Ensure tatami is active
- Check category sync from Django
- Verify session creation didn't fail

**Scores Not Syncing**
- Check network connectivity
- Verify backend API is running
- Check sync logs for errors
