# Tatami Scoring System - Visual Reference

## 📐 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       FRVV Admin System                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────┐      ┌──────────────────────────┐ │
│  │   Django Backend         │      │  Offline Desktop App     │ │
│  │   (Web Interface)        │      │  (PyQt6)                 │ │
│  │                          │      │                          │ │
│  │ - Athletes               │      │ ┌──────────────────────┐ │ │
│  │ - Events/Competitions    │      │ │ Tatami/Scoring Tab   │ │ │
│  │ - Categories             │      │ │ (NEW)                │ │ │
│  │ - Results Storage        │◄────►│ ├──────────────────────┤ │ │
│  │                          │ Sync │ │ Tatami Manager │      │ │ │
│  │ API Endpoints:           │      │ │ Sessions Panel │      │ │ │
│  │ /api/category-athlete    │      │ └──────────────────────┘ │ │
│  │ /api/match-referee-score │      │                          │ │
│  │                          │      │ ┌──────────────────────┐ │ │
│  └──────────────────────────┘      │ │ SQLite Database      │ │ │
│           ▲                         │ │ - tatamis            │ │ │
│           │                         │ │ - scoring_sessions   │ │ │
│           │                         │ │ - score_submissions  │ │ │
│           │                         │ └──────────────────────┘ │ │
│           │                         └──────────────────────────┘ │
│           │                                                       │
│           └──────────── REST API (HTTP) ───────────────────────┘
│
│
│  ┌────────────────────────────────────────────────────────────────┐
│  │           Local Area Network (Tournament Venue)                │
│  ├────────────────────────────────────────────────────────────────┤
│  │                                                                  │
│  │  ┌──────────────────┐      ┌──────────────────────────────┐   │
│  │  │ Tatami Server    │      │  Connected Devices           │   │
│  │  │ (WebSocket 8765) │      │                              │   │
│  │  │                  │◄────►│ ┌──────────────────────────┐ │   │
│  │  │ - Session Mgmt   │      │ │ Referee Device 1 (Tablet)│ │   │
│  │  │ - Score Broadcast│      │ │ - Tatami 1               │ │   │
│  │  │ - Aggregation    │      │ │ - Score input           │ │   │
│  │  └──────────────────┘      │ └──────────────────────────┘ │   │
│  │           ▲                 │                              │   │
│  │           │                 │ ┌──────────────────────────┐ │   │
│  │           │                 │ │ Referee Device 2 (Tablet)│ │   │
│  │           │                 │ │ - Tatami 2               │ │   │
│  │           │                 │ │ - Score input           │ │   │
│  │           └─────────────────┼─┤ └──────────────────────────┤   │
│  │                    (WebSocket)                              │   │
│  │                             │ ┌──────────────────────────┐ │   │
│  │                             │ │ Display Screen (Optional)│ │   │
│  │                             │ │ - Live scores            │ │   │
│  │                             │ │ - Leaderboard           │ │   │
│  │                             │ └──────────────────────────┘ │   │
│  │                             │                              │   │
│  └──────────────────────────────────────────────────────────────┘
│
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Diagram

```
┌──────────────────┐
│  Start Session   │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ Create Scoring Session                   │
│ - Tatami ID                              │
│ - Category (Solo/Team/Fight)             │
│ - Athlete Names                          │
│ - Status: ACTIVE                         │
└────────┬─────────────────────────────────┘
         │
         │ Broadcast: session_started
         │
    ┌────┴────────────────────────────────┐
    │                                      │
    ▼                                      ▼
┌──────────────────────┐          ┌──────────────────────┐
│ Display Clients      │          │ Referee Clients      │
│ (Scoreboards)        │          │ (Tablets/Phones)     │
│ - Show live updates  │          │ - See session info   │
│ - Track scores       │          │ - Input their score  │
└──────────────────────┘          └────────┬─────────────┘
                                           │
                                    Submit Score ×3
                                    (3 Referees)
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
            ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
            │ Ref 1 Score    │     │ Ref 2 Score    │     │ Ref 3 Score    │
            │ {tech: 8.0,    │     │ {tech: 8.5,    │     │ {tech: 9.0,    │
            │  power: 9.0}   │     │  power: 8.5}   │     │  power: 9.5}   │
            └────────┬───────┘     └────────┬───────┘     └────────┬───────┘
                     │                      │                      │
                     └──────────────────────┼──────────────────────┘
                                            │
                                    Aggregate Scores
                                            │
                                            ▼
                            ┌───────────────────────────┐
                            │ Final Score (Average)     │
                            │ {tech: 8.5, power: 9.0}   │
                            └───────────┬───────────────┘
                                        │
                           Broadcast to all clients
                                        │
    ┌───────────────────────────────────┼───────────────────────────────────┐
    │                                   │                                   │
    ▼                                   ▼                                   ▼
┌──────────────┐               ┌──────────────────┐               ┌──────────────┐
│ Display: 8.5 │               │ Admin Sees Final │               │ Referees Get │
│ Score Posted │               │ Score in Session │               │ Confirmation │
└──────────────┘               └──────────────────┘               └──────────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │  Admin Clicks "End    │
                            │  Session"             │
                            └───────────┬───────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │ Session Status:       │
                            │ COMPLETED             │
                            │ Saved to Database     │
                            └───────────┬───────────┘
                                        │
                                        ▼
                            ┌───────────────────────┐
                            │ Ready for Sync to     │
                            │ Django Backend        │
                            └───────────────────────┘
```

---

## 🎮 User Interface Layout

### Main App - Tatami/Scoring Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🏛️ Tatami/Scoring | 👥 Athletes | 🏆 Competitions | ...            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐│
│  │ Left: Tatami Manager         │  │ Right: Scoring Sessions      ││
│  ├──────────────────────────────┤  ├──────────────────────────────┤│
│  │ 🏛️ Tatami/Scoring Stations    │  │ 📊 Scoring Sessions          ││
│  │ ➕ Add ✏️ Edit 🗑️ Delete ✅  │  │ ▶️ Start ⏸️ Pause ⏹️ End    ││
│  │                              │  │                              ││
│  │ ┌────────────────────────┐  │  │ 🟢 Active: U-8 Solo - John  ││
│  │ │Station│ Name   │Type │Act│  │ ┌────────────────────────┐   ││
│  │ ├────────────────────────┤  │  │ │Category│Athlete1│Athlete2││
│  │ │1      │Tatami 1│Fight│✅│  │  │ ├────────────────────────┤   ││
│  │ │2      │Tatami 2│Demo │❌│  │  │ │U-8 Solo│John D │-      ││
│  │ │3      │Tatami 3│Fight│✅│  │  │ │U-10 Tm │Team A │Team B  ││
│  │ └────────────────────────┘  │  │ └────────────────────────┘   ││
│  │                              │  │ Score: [9.5] 📝 [Submit]     ││
│  └──────────────────────────────┘  └──────────────────────────────┘│
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Add Tatami Dialog

```
┌──────────────────────────────────────────┐
│ Tatami Configuration                     │
├──────────────────────────────────────────┤
│                                          │
│ Tatami Name:      [Tatami 1        ]    │
│                                          │
│ Station Number:   [1              ▼]   │
│                                          │
│ Type:             [Fight          ▼]   │
│                    - Fight              │
│                    - Demonstration      │
│                                          │
│              [OK]        [Cancel]       │
│                                          │
└──────────────────────────────────────────┘
```

### Start Session Dialog

```
┌──────────────────────────────────────────┐
│ Start Scoring Session                    │
├──────────────────────────────────────────┤
│                                          │
│ Category:        [U-8 Solo Male   ▼]   │
│                   - U-8 Solo Male       │
│                   - U-8 Solo Female     │
│                   - U-10 Team Mixed     │
│                                          │
│ Athlete 1:       [John Doe         ]   │
│                                          │
│ Athlete 2:       [Jane Smith       ]   │
│                   (Optional)             │
│                                          │
│              [OK]        [Cancel]       │
│                                          │
└──────────────────────────────────────────┘
```

---

## 🔌 Scoring Session Lifecycle

```
   ┌─────────────────────────────────────────────────────┐
   │          SCORING SESSION LIFECYCLE                  │
   └─────────────────────────────────────────────────────┘

   PENDING (Session Created)
   ↓ (Start Session button clicked)
   │
   │ ┌──────────────────────────┐
   │ │ Session Details:         │
   ├→│ - Tatami ID: 1           │
   │ │ - Category: U-8 Solo     │
   │ │ - Athlete: John Doe      │
   │ │ - Status: PENDING        │
   │ │ - Created: 2026-02-07... │
   │ └──────────────────────────┘
   │
   ACTIVE (Started, Accepting Scores)
   ↓ (Referees connect and see session)
   │
   │ ┌──────────────────────────────────────┐
   │ │ Ref 1 submits score: {tech: 8.0}     │
   ├→│ Ref 2 submits score: {tech: 8.5}     │
   │ │ Ref 3 submits score: {tech: 9.0}     │
   │ │ → Aggregated: {tech: 8.5}            │
   │ └──────────────────────────────────────┘
   │
   PAUSED (Optional - Suspended)
   ↓ (Pause button - for breaks)
   │
   │ ┌──────────────────────────┐
   │ │ Session Paused           │
   │ │ Can Resume or End        │
   │ └──────────────────────────┘
   │
   COMPLETED (Ended)
   ↓ (End Session button clicked)
   │
   ┌──────────────────────────────────────────────┐
   │ Final Session Data:                          │
   │ - Session ID: 42                             │
   │ - Tatami: Tatami 1                           │
   │ - Category: U-8 Solo Male                    │
   │ - Athlete: John Doe                          │
   │ - Submissions: 3 referees                    │
   │ - Final Score: {tech: 8.5, power: 9.0}      │
   │ - Started: 2026-02-07 10:30                  │
   │ - Completed: 2026-02-07 10:45                │
   │ - Status: READY FOR SYNC                     │
   └──────────────────────────────────────────────┘
   
   Ready to Sync to Django Backend!
```

---

## 📊 Score Aggregation Example

```
┌──────────────────────────────────────────────────────────┐
│           MULTI-REFEREE SCORING & AGGREGATION            │
└──────────────────────────────────────────────────────────┘

Session: U-8 Solo Male - John Doe
Tatami: Tatami 1
Status: ACTIVE

────────────────────────────────────────────────────────────

REFEREE 1 Submission:
├─ Technique:  8.0
├─ Power:      8.5
├─ Speed:      8.0
└─ Total:      24.5

────────────────────────────────────────────────────────────

REFEREE 2 Submission:
├─ Technique:  8.5
├─ Power:      9.0
├─ Speed:      8.5
└─ Total:      26.0

────────────────────────────────────────────────────────────

REFEREE 3 Submission:
├─ Technique:  9.0
├─ Power:      8.5
├─ Speed:      9.0
└─ Total:      26.5

────────────────────────────────────────────────────────────

AGGREGATED SCORE (Average):
├─ Technique:  (8.0 + 8.5 + 9.0) / 3 = 8.5 ✓
├─ Power:      (8.5 + 9.0 + 8.5) / 3 = 8.67 ✓
├─ Speed:      (8.0 + 8.5 + 9.0) / 3 = 8.5 ✓
└─ Final:      (24.5 + 26.0 + 26.5) / 3 = 25.67 ✓

────────────────────────────────────────────────────────────

Stored as: {"technique": 8.5, "power": 8.67, "speed": 8.5}
Synced to Django as CategoryAthleteScore
```

---

## 🌐 Network Communication

```
┌───────────────────────────────────────────────────────────┐
│     WebSocket Communication Flow (Port 8765)              │
└───────────────────────────────────────────────────────────┘

REFEREE CLIENT                SERVER              DISPLAYS
     │                         │                     │
     │─register_referee────────>                     │
     │  (referee_id: 5)        │                     │
     │                         │                     │
     │<──session_available─────│────broadcast───────>│
     │  (session: {...})       │                     │
     │                         │                     │
     │─submit_score───────────>│                     │
     │  (score_data: {...})    │                     │
     │                         │                     │
     │                         │─score_submitted────>│
     │                         │  (broadcast)        │
     │<────────────────────────│────broadcast───────>│
     │  (confirmation)         │                     │
     │                         │                     │
     │─submit_score───────────>│                     │
     │  (Ref 2)                │                     │
     │                         │─score_submitted────>│
     │<────────────────────────│────broadcast───────>│
     │                         │                     │
     │─submit_score───────────>│                     │
     │  (Ref 3)                │                     │
     │                         │─score_submitted────>│
     │<────────────────────────│────broadcast───────>│
     │                         │                     │
     │                         │◄──end_session───────│
     │                         │  (from admin)       │
     │                         │                     │
     │<────session_completed───│────broadcast───────>│
     │  (final aggregated      │  (final scores)    │
     │   scores)               │                     │
     │                         │                     │

Legend:
→ = Network message
├─ = Processing
└─ = Complete
```

---

## 🗂️ File Organization

```
desktop/
├── main.py .......................... Entry point
├── config.py ........................ Configuration
│
├── models/
│   ├── db.py ........................ Database (existing)
│   └── lan_manager.py ✨ ........... NEW: Tatami/Scoring management
│
├── ui/
│   ├── main_window.py .............. Main app (updated with new tab)
│   ├── tatami_manager.py ✨ ........ NEW: Tatami UI
│   ├── scoring_sessions.py ✨ ...... NEW: Session management
│   ├── referee_scoring.py .......... Existing scoring panel
│   ├── scoreboard_display.py ....... Display screen
│   └── ... (other tabs remain)
│
├── scoring/
│   ├── websocket_server.py ......... Original WebSocket server
│   └── tatami_server.py ✨ ......... NEW: Enhanced for tatamis
│
├── sync/
│   └── sync_manager.py ............. Sync to Django (ready to enhance)
│
└── requirements.txt ................ Dependencies

✨ = NEW component
```

---

## ✅ Status Indicators

In the UI and database, you'll see statuses like:

```
┌─────────────────────────────────────────┐
│        SESSION STATUS                   │
├─────────────────────────────────────────┤
│ 🟢 ACTIVE       = Currently scoring     │
│ 🟡 PAUSED       = Temporarily stopped   │
│ 🔴 COMPLETED    = Finished, synced      │
│ ⚪ PENDING      = Created but not yet   │
│                   started               │
│ ❌ CANCELLED    = Aborted, not synced   │
│ ✅ SYNCED       = Uploaded to Django    │
└─────────────────────────────────────────┘
```

---

## 🎯 Quick Reference

### Keyboard Shortcuts (Future)
```
Ctrl+N  = New Tatami
Ctrl+S  = Start Session
Ctrl+E  = End Session
Ctrl+Q  = Quit
F5      = Refresh sessions
F12     = Developer console
```

### Database Queries
```sql
-- Count active sessions
SELECT COUNT(*) FROM scoring_sessions WHERE status = 'active';

-- Get all submissions for a session
SELECT * FROM score_submissions WHERE session_id = 42;

-- Find tatami by name
SELECT * FROM tatamis WHERE name LIKE '%Tatami 1%';

-- Get completed sessions today
SELECT * FROM scoring_sessions 
WHERE status = 'completed' AND DATE(completed_at) = DATE('now');
```

---

## 🎓 Learning Path

```
Beginner
└─ Read TATAMI_QUICKSTART.md
   ├─ Create first tatami
   ├─ Start a session
   └─ Submit test score

Intermediate
└─ Read OFFLINE_APP_UPDATE.md
   ├─ Understand database schema
   ├─ Learn WebSocket protocol
   └─ Multi-tatami operations

Advanced
└─ Read TATAMI_INTEGRATION.md
   ├─ Review source code
   ├─ Implement sync to Django
   └─ Extend with custom features
```

---

This reference provides a complete visual guide to the tatami scoring system!
