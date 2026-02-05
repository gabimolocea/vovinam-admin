# FRVV Vovinam LAN Scoring System

Real-time referee scoring system for Vovinam competitions with offline support and Django backend sync.

## Features

✅ **LAN-based Real-time Scoring**
- 5 referee clients scoring simultaneously
- 1 scoreboard display on external monitor
- WebSocket-based communication
- Works offline (no internet required)

✅ **Score Types Support**
- Solo performances
- Match competitions (1v1)
- Team events

✅ **Offline-First Architecture**
- All scores stored in local SQLite database
- Sync to Django backend when ready
- No data loss even without internet

✅ **Professional Scoreboard Display**
- Full-screen scoreboard for external monitor
- Real-time score updates from all referees
- Individual referee scores + total score
- Visual winner highlighting

## System Architecture

```
┌─────────────────┐
│  Server Mode    │  ← Runs WebSocket server on main computer
│  (Main Computer)│     IP: 192.168.1.100:8765
└────────┬────────┘
         │
         ├───────────────────────────────────┐
         │                                   │
┌────────▼────────┐                 ┌───────▼────────┐
│ Referee Clients │                 │   Scoreboard   │
│   (5 devices)   │                 │     Display    │
│                 │                 │ (External Mon) │
│ • Referee 1     │                 │                │
│ • Referee 2     │                 │ Shows:         │
│ • Referee 3     │                 │ • Referee scores│
│ • Referee 4     │                 │ • Totals       │
│ • Referee 5     │                 │ • Winner       │
└─────────────────┘                 └────────────────┘
         │                                   │
         └───────────────┬───────────────────┘
                         │
                ┌────────▼────────┐
                │ Local SQLite DB │
                │ (Offline Store) │
                └────────┬────────┘
                         │
                         │ Sync when ready
                         ▼
                ┌─────────────────┐
                │  Django Backend │
                │  (Cloud/Server) │
                └─────────────────┘
```

## Quick Start

### 1. Launch the Scoring System

```bash
cd desktop
python main_launcher.py
```

You'll see a launcher with 4 modes:

### 2. Start Server Mode (Main Computer)

1. Click **"🖥️ SERVER MODE"**
2. Note the displayed IP address (e.g., `192.168.1.100:8765`)
3. Keep this window open during the event

### 3. Connect Referee Devices

On each of the 5 referee tablets/computers:

1. Launch the app: `python main_launcher.py`
2. Select **"👨‍⚖️ REFEREE MODE"**
3. Set:
   - Referee ID: 1-5
   - Referee Name: Their name
4. Click **"Launch Referee Panel"**
5. Enter server IP: `192.168.1.100`
6. Click **"Connect"**

### 4. Setup Scoreboard Display

On the computer connected to external monitor:

1. Launch: `python main_launcher.py`
2. Select **"📺 SCOREBOARD DISPLAY"**
3. Enter server IP: `192.168.1.100`
4. Click **"Launch Scoreboard"**
5. Press F11 for fullscreen

## Using the System

### Starting a Match

From the **Server Mode** computer:

1. You can integrate this with the admin interface, or
2. Use the WebSocket API to start a session programmatically

Example session start message:
```json
{
  "type": "start_session",
  "data": {
    "category_type": "match",
    "category_name": "Men's Individual Combat",
    "athlete1_id": 123,
    "athlete1_name": "John Doe",
    "athlete2_id": 456,
    "athlete2_name": "Jane Smith"
  }
}
```

### Referees Submit Scores

Each referee:
1. Uses the score spinboxes (0.0 - 10.0)
2. Or quick buttons (5.0, 6.0, 7.0, 8.0, 9.0, 10.0)
3. Clicks **"📤 Submit Score"**

Scores appear **instantly** on the scoreboard!

### Scoreboard Display

Shows in real-time:
- Category and athlete names
- Individual scores from each referee
- Total scores (sum of all referees)
- Winner highlighted in gold

### Finalizing Scores

After all referees submit:
- Scores are marked as final in database
- System ready for next match

### Syncing to Django Backend

After the event or when internet is available:

```python
from scoring.sync_manager import ScoringSyncManager
from models.db import Database

db = Database()
sync_manager = ScoringSyncManager(db, "https://your-backend.com/api")
sync_manager.set_auth_token("your-jwt-token")

# Sync all unsynced sessions
result = sync_manager.sync_scoring_sessions()
print(f"Synced: {len(result['success'])}")
print(f"Failed: {len(result['failed'])}")
```

Or use the **Admin Mode** sync interface.

## Network Setup

### Option 1: Dedicated Router (Recommended)

1. Use a portable WiFi router
2. Set router IP: `192.168.1.1`
3. Connect all devices to this WiFi
4. Server will be at `192.168.1.X` (DHCP assigned)

### Option 2: Existing Network

1. Connect all devices to venue WiFi
2. Find server computer's IP:
   ```bash
   # On server computer
   ipconfig  # Windows
   ifconfig  # Mac/Linux
   ```
3. Use this IP for referee and scoreboard connections

### Option 3: Direct Ethernet

1. Connect devices via Ethernet switch
2. Assign static IPs:
   - Server: `192.168.1.100`
   - Referee 1: `192.168.1.101`
   - Referee 2: `192.168.1.102`
   - Etc.

## Troubleshooting

### Referees Can't Connect

**Check:**
- Server mode is running
- All devices on same network
- Firewall allows port 8765
- Correct IP address entered

**Test connection:**
```bash
ping 192.168.1.100  # Replace with server IP
```

### Scoreboard Not Updating

**Check:**
- WebSocket connection status (bottom of screen)
- Green = connected
- Red = disconnected

**Reconnect:**
- Close and relaunch scoreboard
- Or wait 5 seconds for auto-reconnect

### Scores Not Syncing to Django

**Check:**
- Backend API is accessible
- Valid authentication token
- Network/internet connection

**View sync status:**
```python
sync_manager.get_sync_status()
# Returns: {'unsynced': 5, 'synced': 10, 'active': 1, 'total': 16}
```

## Database Tables

### live_scoring_sessions
Stores each scoring session (match/solo/team)
- session_id, match_id, category info
- athlete names
- status (active/completed/cancelled)
- sync status

### live_referee_scores
Individual referee scores per session
- referee_id, referee_name
- athlete1_score, athlete2_score
- score_data (JSON with breakdown)
- is_final flag

## API Integration

### WebSocket Messages

**Client → Server:**
```json
// Register client
{"type": "register", "client_type": "referee", "referee_id": 1}

// Submit score
{
  "type": "submit_score",
  "data": {
    "session_id": "session_20260204_143022",
    "referee_id": 1,
    "referee_name": "John Referee",
    "athlete1_score": 8.5,
    "athlete2_score": 7.0
  }
}
```

**Server → Clients:**
```json
// Session started
{"type": "session_started", "session": {...}}

// Score update
{
  "type": "score_update",
  "referee_scores": {...},
  "totals": {"athlete1_total": 42.5, "athlete2_total": 35.0}
}
```

## Customization

### Change Score Range

Edit `ui/referee_scoring.py`:
```python
self.athlete1_score.setMaximum(10)  # Change to desired max
```

### Add Custom Scoring Criteria

Extend the score_data JSON in database to include:
- Technical score
- Artistic score
- Deductions
- Penalties

### Modify Scoreboard Theme

Edit `ui/scoreboard_display.py` colors:
```python
# Current colors
RED = "#F44336"
BLUE = "#2196F3"
GOLD = "#FFD700"
```

## Requirements

- Python 3.10+
- PyQt6
- websockets
- SQLite (included)
- Network (LAN, no internet required)

## Support

For issues or questions:
1. Check logs in server terminal
2. Review database: `desktop/data/frvv_offline.db`
3. Contact: admin@frvv.ro

## License

© 2026 Romanian Vovinam Federation. All rights reserved.
