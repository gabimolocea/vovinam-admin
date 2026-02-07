# Offline Competition & Sync Guide

## Overview

The FRVV Admin system is **designed for competitions with no internet**. Everything runs locally on a closed network, then syncs after the event.

## Architecture for Offline Mode

### Three-Tier System

```
┌─────────────────────────────────────────────────────┐
│         Competition Day (No Internet)               │
├──────────────────────────┬──────────────────────────┤
│  Desktop Admin Machine   │  Local Network (Wi-Fi)   │
│  - PyQt6 App             │  - Flask Web Server      │
│  - LANManager DB         │    - Port 8080           │
│  - Scoring Logic         │    - Referee UI          │
│  - Display Monitoring    │    - Display Monitors    │
│  - WebSocket Server      │    - Admin Dashboard     │
└──────────────────────────┴──────────────────────────┘
         ↓ (After event, network available)
┌──────────────────────────────────────────────────────┐
│    Django Backend (FRVV Main Server)                │
│    - Athlete records                                │
│    - Competition history                           │
│    - Category management                           │
│    - Score aggregation & approval                  │
└──────────────────────────────────────────────────────┘
```

## Pre-Competition: What You Must Do

### 1. **Download Reference Data** (Before Event)
```
In Desktop App → Sync Tab
1. Click "Sync All" to download:
   - Categories available for this event
   - Athletes in each category
   - Club/city information
   - Grades/belt levels
2. This creates local SQLite database with all needed data
3. **Network is NOT needed after this point**
```

**Why this works:**
- Flask server uses local database
- Categories, athletes, and structure all cached locally
- Referees select from pre-loaded dropdowns (no API calls during event)

### 2. **Test Your Setup** (Before Event)
```bash
# Terminal 1: Start Flask server (on your desktop machine)
cd /Users/gabimolocea/vovinam-admin/desktop
/Users/gabimolocea/vovinam-admin/backend/venv/bin/python scoring/simple_server.py

# Server runs on: http://0.0.0.0:8080
# Access from other devices: http://<YOUR_MACHINE_IP>:8080
```

**Test all three interfaces:**
1. **Mobile Referee**: `http://<IP>:8080/referee` → Try submitting a test score
2. **Display Monitor**: `http://<IP>:8080/display` → Verify live score display
3. **Admin Dashboard**: `http://<IP>:8080/admin` → Check tatami management

## During Competition: Offline Operation

### What Happens Automatically (No Network Needed)

1. **Referees Connect via Wi-Fi**
   - Phone/tablet browser → `http://<desktop-ip>:8080/referee`
   - Selects tatami → category → athletes
   - Submits scores directly to local Flask server

2. **Scores Stored Locally**
   - All data in LANManager SQLite database on desktop
   - Every score submission creates database record
   - No internet required at all

3. **Live Display Monitors**
   - Tablets/monitors → `http://<desktop-ip>:8080/display`
   - Real-time score updates via WebSocket
   - Shows aggregated scores (average of referee submissions)

4. **Admin Can Monitor**
   - Desktop admin dashboard → `http://localhost:8080/admin`
   - See all tatamis, active sessions
   - Monitor score submissions in real-time
   - No backend connectivity needed

### Key Points
- ✅ **Works without internet**
- ✅ **All scores safe in local database**
- ✅ **No data loss if connection interrupted**
- ✅ **Live displays work on same network**
- ❌ **Cannot upload to main server until network returns**

## Post-Competition: Sync with Main Server

### When Network Available Again

**Option 1: Sync from Desktop App** (Not Yet Implemented)
```
1. Close competition/event
2. Desktop App → Sync Tab
3. Click "Sync Scores" (will be implemented)
4. Selects which competition to sync
5. Uploads all local scores to Django backend
6. Shows success/conflict reports
```

**Option 2: Manual API Call** (For Testing)
```bash
# Get all local scores
curl http://localhost:8080/api/admin/sessions

# Upload to backend (after implementation)
curl -X POST http://your-backend:8000/api/sync/push-scores/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @local_scores.json
```

### Sync Strategy

```python
# Pseudo-code for sync logic
For each LOCAL score:
  IF score not yet marked synced:
    TRY:
      POST to backend /api/referee-scores/
      Mark as synced in local DB
    CATCH conflicts:
      Ask user: keep local or backend version?
      Log resolution
```

## Technical Details: How It Works

### Local Database (LANManager)

**Tables created on startup:**
```sql
-- Tatamis (scoring stations)
CREATE TABLE tatamis (
  id INTEGER PRIMARY KEY,
  name TEXT,
  station_number INTEGER,
  active_session_id INTEGER
);

-- Active scoring sessions
CREATE TABLE scoring_sessions (
  id INTEGER PRIMARY KEY,
  tatami_id INTEGER,
  category_name TEXT,
  athlete1_name TEXT,
  athlete2_name TEXT,
  status TEXT,  -- active, completed
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Individual referee scores
CREATE TABLE score_submissions (
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  referee_id TEXT,
  score_data JSON,  -- {technique, power, speed}
  submitted_at TIMESTAMP,
  synced INTEGER DEFAULT 0  -- 0=not synced, 1=synced
);
```

### Score Aggregation Logic

When display monitor requests current scores:
```python
scores = [s1, s2, s3, s4, s5]  # 5 referee submissions
scores.sort()
# Example: [6, 6, 7, 7, 8]
aggregated = average(scores[1:4])  # [6, 7, 7] = 6.67
display = f"Score: {aggregated}"
```

This happens **in-flight** - no remote processing needed.

## Offline Troubleshooting

### "I see 'No categories' in offline mode"
**Solution:**
1. Make sure Flask server is running
2. Open browser DevTools → Console
3. Check what tatami_id is being sent
4. Verify `scoring_sessions` table has data

### "Referee can't connect to Flask server"
**Solution:**
1. Check same Wi-Fi network: `ping <desktop-ip>`
2. Check port 8080: `lsof -i :8080` (should show Python)
3. Check firewall: May need to allow port 8080 on desktop
4. Try direct IP: `http://192.168.1.100:8080` (not localhost)

### "Scores submitted but don't appear on display"
**Solution:**
1. Check database: `sqlite3` → `.tables`
2. Check score_submissions table for entries
3. Verify WebSocket connection: DevTools → Network → WS
4. Fallback polling works every 2 seconds if WebSocket fails

## Post-Sync Verification

After syncing to main server:
```python
# Verify count matches
local_count = 45 scores submitted
backend_count = 45 scores received
# Should match!

# Check for conflicts
backend_rejected = 2 (duplicate referee, same athlete)
# These should be reviewed manually
```

## Files Involved

| File | Purpose |
|------|---------|
| `desktop/scoring/simple_server.py` | Flask web server (main offline engine) |
| `desktop/models/lan_manager.py` | Local database management |
| `desktop/ui/tatami_manager.py` | Tatami CRUD UI |
| `desktop/ui/scoring_sessions.py` | Score session UI |
| `desktop/templates/referee_scoring.html` | Mobile referee interface |
| `desktop/templates/display_monitor.html` | Display monitor interface |
| `desktop/sync/sync_manager.py` | Sync logic (needs push_scores method) |

## Implementation Checklist

- [x] Desktop PyQt6 app with offline database
- [x] Flask server for LAN-based scoring
- [x] Mobile referee interface
- [x] Display monitor interface
- [x] Admin dashboard
- [ ] **Push scores to Django backend** (NEXT TO IMPLEMENT)
- [ ] Conflict resolution during sync
- [ ] Sync status indicators
- [ ] Backup local database before sync

## Next Steps

1. **Implement `push_scores_to_backend()` in sync_manager.py**
   - Connect to Django API
   - Upload all synced=0 scores
   - Mark as synced=1
   - Report conflicts

2. **Add sync UI to Desktop App**
   - "Sync Scores" button in Sync tab
   - Progress indicator
   - Conflict resolution dialog
   - Success/failure report

3. **Test end-to-end**
   - Run offline competition
   - Generate 10-20 scores
   - Turn on network
   - Sync and verify

## For First Competition

1. **Day Before:**
   - Download all reference data
   - Test on multiple devices
   - Verify Flask server accessible
   - Test score submission end-to-end

2. **Day Of:**
   - Start Flask server on admin machine
   - Test each tatami/monitor setup
   - Create tatamis in admin dashboard
   - Start competition

3. **After Event:**
   - Backup local database file: `desktop/db/offline.db`
   - Connect to network
   - Run sync to upload scores
   - Verify in main Django admin

---

**Bottom Line:** You can run entire competitions offline. Everything works perfectly without internet. Just sync when network is available. 🎯
