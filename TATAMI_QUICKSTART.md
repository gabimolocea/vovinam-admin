# Quick Start - Tatami Scoring System

## 🎯 TL;DR

The offline app now supports **LAN-based scoring for tatami stations**. Referees can score Solo, Team, and Fight categories across multiple tatamis simultaneously.

---

## ⚡ 30-Second Setup

### 1. Install
```bash
cd desktop
pip install -r requirements.txt
```

### 2. Run
```bash
python main.py
```

### 3. Create Tatamis
- Go to **Tatami/Scoring** tab
- Click **"➕ Add Tatami"**
- Name: `Tatami 1`, Station: `1`, Type: `Fight`
- Repeat for additional tatamis

### 4. Start Scoring
- Select tatami on left
- Click **"▶️ Start New Session"**
- Select category (synced from Django)
- Enter athlete names
- Referees see it on their devices

### 5. Submit Scores
- Referees enter their scores
- Scores show in real-time on displays
- Click **"⏹️ End Session"** when done

---

## 📊 What Each Component Does

| Component | Purpose |
|-----------|---------|
| **Tatami Manager** (Left) | CRUD tatami stations |
| **Scoring Sessions** (Right) | Manage active scoring for selected tatami |
| **LANManager** (Backend) | Database layer for tatamis & sessions |
| **Tatami Server** (WebSocket) | LAN communication between devices |

---

## 🎮 UI Guide

### Tatami Manager (Left Panel)
```
┌─ 🏛️ Tatami/Scoring Stations ────────┐
│ ➕ Add  ✏️ Edit  🗑️ Delete  ✅ Toggle │
├─────────────────────────────────────┤
│ Station # │ Name      │ Type  │ Active│
│ 1         │ Tatami 1  │ Fight │ ✅    │
│ 2         │ Tatami 2  │ Demo  │ ❌    │
└─────────────────────────────────────┘
```

### Scoring Sessions (Right Panel)
```
┌─ 📊 Scoring Sessions ──────────────┐
│ ▶️ Start  ⏸️ Pause  ⏹️ End  | Active: │
├─────────────────────────────────────┤
│ Category │ Athlete 1 │ Athlete 2│Status│
│ U-8 Solo │ John Doe │ -       │ 🟢   │
│ U-10 Team│ Team A   │ Team B  │ 🔴   │
├─────────────────────────────────────┤
│ Score: [9.5] 📝 Submit │
└─────────────────────────────────────┘
```

---

## 🔌 Referee Connection

### How Referees Join
1. Open **Referee Scoring App** on their device
2. Enter their **Referee ID** (e.g., 5)
3. Select **Tatami** (e.g., Tatami 1)
4. Click **Connect**
5. App shows available sessions
6. Select category and enter scores

### What They See
```
┌─ Referee 5 - Tatami 1 ───────────────┐
│ Active Session: U-8 Solo Male         │
│ Athlete: John Doe                     │
│                                       │
│ Technique:    [8.0] ⬇️ ⬆️             │
│ Power:        [9.0] ⬇️ ⬆️             │
│ Speed:        [8.5] ⬇️ ⬆️             │
│                                       │
│ Total: 25.5                           │
│ 📝 [Submit Score]                     │
└───────────────────────────────────────┘
```

---

## 📁 File Structure

```
desktop/
├── main.py                      # App entry point
├── models/
│   ├── db.py                   # Database layer (existing)
│   └── lan_manager.py          # ✨ NEW: Tatami/scoring management
├── ui/
│   ├── main_window.py          # ✨ UPDATED: Added tatami tab
│   ├── tatami_manager.py       # ✨ NEW: Tatami UI
│   ├── scoring_sessions.py     # ✨ NEW: Session management UI
│   └── ... (other tabs)
├── scoring/
│   ├── websocket_server.py     # Original server (still works)
│   └── tatami_server.py        # ✨ NEW: Enhanced with tatami support
└── requirements.txt
```

---

## 🗄️ Database Changes

**New Tables** (automatically created):
- `tatamis` - Scoring stations
- `scoring_sessions` - Active/completed scoring
- `score_submissions` - Individual referee scores

**Existing Tables** remain unchanged.

---

## 🔄 Sync to Django

After tournament scoring is complete:

```python
# Coming in next update
sync_manager.sync_tatami_scores_to_django()
```

This uploads all scored sessions to the Django backend as:
- `CategoryAthleteScore` (for solo/team)
- `MatchRefereeScore` (for matches)

---

## 🚨 Common Issues

### WebSocket Connection Failed
- Check firewall allows port 8765
- Verify all devices on same network
- Check IP address in console output

### Categories Not Showing
- Sync from Django first (in main app)
- Check database has `categories` table

### Scores Not Saving
- Check database permissions
- Verify session is in `active` status
- Check console for errors

---

## 🧠 Concepts

### Tatami
= Physical scoring station (e.g., "Tatami 1", "Tatami 2")
- Has a **type**: Fight or Demonstration
- Can have **multiple active sessions** at same time

### Scoring Session
= Single category being scored on one tatami
- Tied to one **category** (e.g., "U-8 Solo Male")
- Has one or more **athletes**
- Multiple **referees** can score it
- Produces **one score** (aggregated)

### Score Submission
= One referee's score for one session
- Stores individual referee's judgment
- Multiple submissions per session allowed
- Aggregated into final score

### Workflow
```
Tatami created
    ↓
Session started (category + athletes selected)
    ↓
Referees connect and see session
    ↓
Referees submit scores (multiple allowed)
    ↓
Admin ends session (final score calculated)
    ↓
Session synced to Django backend
```

---

## 📋 Checklist Before Tournament

- [ ] Desktop app installed and tested
- [ ] Multiple tatamis created
- [ ] Categories synced from Django
- [ ] Network configured (WiFi available)
- [ ] Server IP/port known
- [ ] Referee app ready (on tablets/devices)
- [ ] Displays set up (optional)
- [ ] Backup power available
- [ ] Sync to Django tested

---

## 💡 Tips

1. **Test before tournament**: Start a practice session and submit test scores
2. **Name referees consistently**: Makes syncing easier
3. **Use distinct tatami names**: "Tatami 1 - Ring A" is clearer than "T1"
4. **Monitor displays**: Shows live feedback to audience
5. **Have backup device**: In case of technical issues
6. **Document referee IDs**: Helps with offline syncing later

---

## 🎓 For Admins

### Setup Phase
```
1. Create tatamis (one per physical ring/area)
2. Sync categories from Django
3. Configure server IP for LAN
4. Test with mock scoring session
5. Brief referees on process
```

### During Tournament
```
1. Monitor all active sessions
2. End sessions when scoring complete
3. Track which sessions are synced
4. Handle any technical issues
5. Keep backup of database
```

### After Tournament
```
1. Sync all completed sessions to Django
2. Verify scores in backend
3. Backup offline database
4. Archive tournament data
5. Generate reports
```

---

## 🎯 Next Steps

1. **Run the app**: `python main.py`
2. **Go to Tatami/Scoring tab**
3. **Create test tatami**: "Tatami 1"
4. **Start test session**: Select any category, enter names
5. **Check console**: See WebSocket server starting
6. **Submit test score**: Verify it saves to database
7. **Ready for tournament!**

---

## 📞 Troubleshooting Commands

```bash
# Check if WebSocket server is running
netstat -an | grep 8765

# Test connection to server
curl ws://127.0.0.1:8765

# View database contents
sqlite3 athletes.db "SELECT COUNT(*) FROM tatamis; SELECT COUNT(*) FROM scoring_sessions;"

# Sync test
python -c "from sync.sync_manager import SyncManager; SyncManager().sync_tatami_scores_to_django()"
```

---

## 🎉 You're Ready!

The offline app now supports professional tatami scoring with:
- ✅ Multiple concurrent tatamis
- ✅ Real-time referee scoring
- ✅ LAN-based communication
- ✅ Score aggregation
- ✅ Backend sync

**Go score some tournaments!** 🥋
