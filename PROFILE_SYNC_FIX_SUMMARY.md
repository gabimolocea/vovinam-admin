# Grade History and Visas Sync Implementation

## Problem
Grade history and visas were not syncing from the web app to the offline desktop application.

## Root Cause
1. Database schema didn't match the backend Django models
2. Sync methods were using incorrect field names
3. Sync was not integrated into the main download workflow
4. Data loading methods were not implemented in the athlete detail dialog

## Solution Implemented

### 1. Database Schema Updated

Updated all three tables to match the backend Django models exactly:

#### `grade_history` Table
**Key Changes:**
- `date_earned` → `obtained_date` (matches backend GradeHistory.obtained_date)
- Added `level` field ('good'/'bad')
- Added `examiner_1_id`, `examiner_1_name`, `examiner_2_id`, `examiner_2_name`
- Added `submitted_by_athlete`, `certificate_image`, `result_document`, `notes`
- Changed default status from 'pending' to 'approved' (matches backend behavior)
- `event_title` → `event_name` (matches serializer field)

**Updated Schema:**
```sql
CREATE TABLE grade_history (
    id INTEGER PRIMARY KEY,
    server_id INTEGER UNIQUE,
    athlete_id INTEGER NOT NULL,
    athlete_name TEXT,
    grade_id INTEGER NOT NULL,
    grade_name TEXT,
    obtained_date TEXT,              -- Changed from date_earned
    level TEXT DEFAULT 'good',       -- NEW
    event_id INTEGER,
    event_name TEXT,                 -- Changed from event_title
    examiner_1_id INTEGER,           -- NEW
    examiner_1_name TEXT,            -- NEW
    examiner_2_id INTEGER,           -- NEW
    examiner_2_name TEXT,            -- NEW
    submitted_by_athlete INTEGER DEFAULT 0,  -- NEW
    certificate_image TEXT,          -- NEW
    result_document TEXT,            -- NEW
    notes TEXT,                      -- NEW
    status TEXT DEFAULT 'approved',  -- Changed default
    submitted_date TEXT,
    reviewed_date TEXT,
    reviewed_by_id INTEGER,
    admin_notes TEXT,
    last_synced_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

#### `visas` Table
**Key Changes:**
- Removed `expiration_date` (calculated dynamically from `issued_date` + days)
- Added `notes` field
- Changed default status from 'pending' to 'approved'

**Updated Schema:**
```sql
CREATE TABLE visas (
    id INTEGER PRIMARY KEY,
    server_id INTEGER UNIQUE,
    athlete_id INTEGER NOT NULL,
    athlete_name TEXT,
    visa_type TEXT NOT NULL,
    issued_date TEXT NOT NULL,
    health_status TEXT,
    visa_status TEXT,
    is_valid INTEGER DEFAULT 0,
    status TEXT DEFAULT 'approved',  -- Changed default
    submitted_date TEXT,
    reviewed_date TEXT,
    reviewed_by_id INTEGER,
    admin_notes TEXT,
    document TEXT,
    image TEXT,
    notes TEXT,                      -- NEW
    last_synced_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

### 2. Sync Methods Fixed

**File:** `desktop/sync/sync_manager.py`

#### `pull_grade_history()` Changes:
```python
# OLD - Incorrect field names
'date_earned': record.get('date_earned', ''),
'event_id': record.get('event_id'),
'event_title': record.get('event_title', ''),

# NEW - Correct field names matching backend
'obtained_date': record.get('obtained_date', ''),
'level': record.get('level', 'good'),
'event_id': record.get('event'),
'event_name': record.get('event_name', ''),
'examiner_1_id': record.get('examiner_1'),
'examiner_1_name': record.get('examiner_1_name', ''),
'examiner_2_id': record.get('examiner_2'),
'examiner_2_name': record.get('examiner_2_name', ''),
'submitted_by_athlete': 1 if record.get('submitted_by_athlete') else 0,
'status': record.get('status', 'approved'),
```

**Key Fixes:**
- Added error handling with traceback for debugging
- Skip records where athlete doesn't exist locally
- Use correct backend field names from GradeHistorySerializer

#### `pull_visas()` Changes:
```python
# OLD - Used non-existent athlete_name from API
'athlete_name': record.get('athlete_name', ''),

# NEW - Get athlete name from local database
local_athlete_id = self._get_local_athlete_id(record.get('athlete'))
if not local_athlete_id:
    continue
athlete = self.db.get_athlete_by_id(local_athlete_id)
athlete_name = f"{athlete.get('first_name', '')} {athlete.get('last_name', '')}"
```

**Key Fixes:**
- Remove `expiration_date` field (not in API response)
- Get athlete name from local database instead of API
- Use `visa_type` from endpoint since API doesn't return it
- Default status to 'approved' instead of 'pending'

### 3. Integration into Main Sync Workflow

**File:** `desktop/ui/main_window.py`

Added to `pull_data()` method:

```python
# Grade History
success, msg, count = self.sync_manager.pull_grade_history()
if success:
    total_count += count
    messages.append(f"Grade History: {count}")

# Visas
success, msg, count = self.sync_manager.pull_visas()
if success:
    total_count += count
    messages.append(f"Visas: {count}")

# Athlete Results
success, msg, count = self.sync_manager.pull_athlete_results()
if success:
    total_count += count
    messages.append(f"Results: {count}")
```

Now when users click **Sync → Download from Server**, all profile data is automatically synced.

### 4. Data Loading in Athlete Detail Dialog

**File:** `desktop/ui/athlete_detail_dialog.py`

#### Added Auto-Load on Dialog Open:
```python
if self.athlete_data:
    self.load_data()
    # Load athlete profile data (grade history, visas, results)
    if self.athlete_id:
        self.load_grade_history()
        self.load_visas()
        self.load_results()
```

#### Implemented Three Loading Methods:

**`load_grade_history()`**
- Displays: Grade | Date Earned | Event | Status
- Color codes: Green (approved), Red (rejected), Yellow (pending)
- Formats dates nicely (YYYY-MM-DD)

**`load_visas()`**
- Displays: Type | Issued Date | Expiration | Status | Valid
- Calculates expiration based on visa type:
  - Medical: issued_date + 180 days
  - Annual: issued_date + 365 days
- Color codes: Green (valid/approved), Red (invalid/rejected)
- Shows ✓ Yes / ✗ No for validity

**`load_results()`**
- Displays: Event | Category | Type | Score | Rank | Status
- Color codes podium positions:
  - #1: Gold (yellow)
  - #2: Silver (gray)
  - #3: Bronze (red)
- Displays rank as "#1", "#2", etc.

## Files Modified

| File | Changes |
|------|---------|
| `desktop/models/db.py` | Updated table schemas, no code changes needed in methods |
| `desktop/sync/sync_manager.py` | Fixed field mappings in `pull_grade_history()` and `pull_visas()` |
| `desktop/ui/main_window.py` | Added 3 sync calls to `pull_data()` method |
| `desktop/ui/athlete_detail_dialog.py` | Added 3 loading methods + auto-load call |

## Migration Script

Created `migrate_profile_tables.py` to:
1. Drop old tables with incorrect schema
2. Create new tables with correct schema matching backend
3. Verify tables were created successfully

**Run once:**
```bash
python migrate_profile_tables.py
```

## Testing

Created `test_profile_sync.py` to verify end-to-end sync:

```bash
python test_profile_sync.py
```

**Test Flow:**
1. Login with credentials
2. Sync athletes and grades (dependencies)
3. Sync grade history from `/api/grade-histories/`
4. Sync visas from `/api/medical-visas/` and `/api/annual-visas/`
5. Sync results from `/api/category-athlete-score/`
6. Display sample records and counts

## Usage

### 1. Sync Data from Web App

```bash
# Run desktop app
python desktop/main.py

# In the app:
1. File → Login (enter credentials)
2. Sync → Download from Server
```

This will sync:
- ✓ Athletes
- ✓ Competitions
- ✓ Categories
- ✓ Matches
- ✓ **Grade History** (NEW!)
- ✓ **Visas** (NEW!)
- ✓ **Athlete Results** (NEW!)

### 2. View Athlete Profile

1. Go to **Athletes** tab
2. **Double-click** any athlete
3. See 6 tabs:
   - 👤 Basic Info
   - 🏢 Club Info
   - 🚨 Emergency Contact
   - **🥋 Grade History** ← Shows belt promotions
   - **📋 Visas** ← Shows medical/annual visas
   - **🏆 Results** ← Shows competition results

All data is automatically loaded from local database.

## API Endpoints Used

| Data Type | Endpoint | Method |
|-----------|----------|--------|
| Grade History | `/api/grade-histories/` | GET |
| Medical Visas | `/api/medical-visas/` | GET |
| Annual Visas | `/api/annual-visas/` | GET |
| Results | `/api/category-athlete-score/` | GET |

All endpoints support filtering by athlete: `?athlete={server_id}`

## Backend Model Alignment

| Offline Table | Backend Model | Serializer |
|---------------|---------------|------------|
| `grade_history` | `GradeHistory` | `GradeHistorySerializer` |
| `visas` | `Visa` | `VisaSerializer` / `AnnualVisaSerializer` / `MedicalVisaSerializer` |
| `athlete_results` | `CategoryAthleteScore` | `CategoryAthleteScoreSerializer` |

## Key Learnings

1. **Always check backend serializer** - Don't assume field names match model field names
2. **Backend uses `obtained_date`** not `date_earned` for grades
3. **Event field is ID** not nested object - serializer has `event_name` for display
4. **Visas don't return athlete_name** - must get from local database
5. **Status defaults differ** - Admin submissions default to 'approved', athlete submissions to 'pending'
6. **Visa expiration calculated** - Not stored in database, computed from `issued_date + days`

## Verification Checklist

- [x] Database tables match backend models
- [x] Sync methods use correct field names
- [x] Data loads correctly in UI
- [x] Foreign key relationships preserved
- [x] Color coding works (status, validity, ranks)
- [x] Date formatting works
- [x] Empty states handled gracefully
- [x] Auto-load on dialog open
- [x] Integrated into main sync workflow

## Next Steps (Optional Enhancements)

1. Add refresh button on each tab to re-sync specific athlete
2. Add filters (by status, by date range)
3. Add sorting (click column headers)
4. Export to PDF/Excel
5. Show sync timestamp on each tab
6. Push changes back to server (currently read-only)

## Conclusion

✅ Grade history and visas now sync correctly from web app to offline app
✅ Data displays in athlete profile with proper formatting and color coding
✅ All field mappings aligned with backend Django models
✅ Integrated into main sync workflow for seamless user experience
