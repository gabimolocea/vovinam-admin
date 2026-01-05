# Athlete Profile Enhancement Summary

## Overview
Added three new tabs to the athlete detail dialog in the offline desktop application to display grade history, visas, and competition results - matching the web app functionality.

## What Was Implemented

### 1. Database Tables Created

Three new tables were added to the SQLite database (`desktop/athletes.db`):

#### `grade_history` Table
Stores athlete grade promotions and belt history.

**Columns:**
- `id` - Primary key
- `server_id` - Server record ID (synced from API)
- `athlete_id` - Foreign key to athletes table
- `athlete_name` - Athlete name (denormalized for display)
- `grade_id` - Grade ID
- `grade_name` - Grade name (e.g., "Blue Belt", "Black Belt")
- `date_earned` - Date the grade was earned
- `event_id` - Event/competition where grade was earned
- `event_title` - Event name
- `status` - Approval status ('pending', 'approved', 'rejected')
- `submitted_date`, `reviewed_date`, `reviewed_by_id`, `admin_notes` - Workflow fields
- `last_synced_at`, `created_at` - Sync tracking

#### `visas` Table
Stores both medical and annual visas for athletes (unified table).

**Columns:**
- `id` - Primary key
- `server_id` - Server record ID
- `athlete_id` - Foreign key to athletes table
- `athlete_name` - Athlete name
- `visa_type` - Type: 'medical' or 'annual'
- `issued_date` - Date visa was issued
- `expiration_date` - When visa expires
- `health_status` - Health status notes
- `visa_status` - Current status
- `is_valid` - Boolean flag (1 = valid, 0 = expired)
- `status` - Approval status
- `submitted_date`, `reviewed_date`, `reviewed_by_id`, `admin_notes` - Workflow fields
- `document`, `image` - File paths for uploaded documents
- `last_synced_at`, `created_at` - Sync tracking

#### `athlete_results` Table
Stores competition results and scores for athletes.

**Columns:**
- `id` - Primary key
- `server_id` - Server record ID
- `athlete_id` - Foreign key to athletes table
- `athlete_name` - Athlete name
- `category_id` - Competition category ID
- `category_name` - Category name (e.g., "Male -60kg")
- `event_id` - Competition/event ID
- `event_title` - Competition name
- `score` - Numeric score
- `rank` - Final ranking (1st, 2nd, 3rd, etc.)
- `result_type` - 'individual' or 'team'
- `status` - Approval status
- `submitted_date`, `reviewed_date`, `reviewed_by_id`, `admin_notes` - Workflow fields
- `last_synced_at`, `created_at` - Sync tracking

### 2. Database Methods Added

**File:** `desktop/models/db.py`

Added methods to interact with new tables:

```python
# Grade History
get_grade_history_for_athlete(athlete_id) -> List[Dict]
insert_grade_history(grade_data: Dict) -> int

# Visas
get_visas_for_athlete(athlete_id) -> List[Dict]
insert_visa(visa_data: Dict) -> int

# Results
get_results_for_athlete(athlete_id) -> List[Dict]
insert_athlete_result(result_data: Dict) -> int
```

All insert methods use `INSERT OR REPLACE` to handle updates from API sync.

### 3. API Sync Methods Added

**File:** `desktop/sync/sync_manager.py`

Added three new sync methods that pull data from the Django API:

```python
pull_grade_history(athlete_id=None) -> Tuple[bool, str, int]
pull_visas(athlete_id=None) -> Tuple[bool, str, int]
pull_athlete_results(athlete_id=None) -> Tuple[bool, str, int]
```

**API Endpoints Used:**
- `/api/grade-histories/` - Grade history records
- `/api/medical-visas/` - Medical visas
- `/api/annual-visas/` - Annual visas
- `/api/category-athlete-score/` - Competition results

**Helper Methods:**
- `_get_local_athlete_id(server_athlete_id)` - Maps server athlete IDs to local IDs
- `_get_local_grade_id(server_grade_id)` - Maps server grade IDs to local IDs

All methods support filtering by athlete_id via query parameter: `?athlete={id}`

### 4. UI Enhancement - Three New Tabs

**File:** `desktop/ui/athlete_detail_dialog.py`

Added three read-only tabs to the athlete detail dialog (only visible when viewing existing athletes):

#### Tab 1: 🥋 Grade History
- **Table Columns:** Grade | Date Earned | Event | Status
- **Features:**
  - Color-coded status (green = approved, red = rejected)
  - Shows grade promotions in chronological order (newest first)
  - Empty state message: "No grade history yet"

#### Tab 2: 📋 Visas
- **Table Columns:** Type | Issued Date | Expiration | Status | Valid
- **Features:**
  - Displays both medical and annual visas
  - Color-coded status and validity (green = valid/approved, red = invalid/rejected)
  - Valid column shows ✓ Yes or ✗ No
  - Empty state message: "No visas yet"

#### Tab 3: 🏆 Results
- **Table Columns:** Event | Category | Type | Score | Rank | Status
- **Features:**
  - Shows both individual and team results
  - Podium positions color-coded (gold/silver/bronze for ranks 1-3)
  - Displays rank as "#1", "#2", etc.
  - Empty state message: "No competition results yet"

**New UI Methods:**
```python
load_grade_history()  # Loads grade history into table
load_visas()          # Loads visas into table
load_results()        # Loads competition results into table
```

These methods are called automatically when opening an existing athlete's profile.

## Data Flow

### Viewing Athlete Profile
1. User double-clicks athlete in Athletes tab
2. `AthleteDetailDialog` opens with athlete data
3. If athlete exists (not new):
   - Loads basic info (existing functionality)
   - **NEW:** Calls `load_grade_history()` → displays grade promotions
   - **NEW:** Calls `load_visas()` → displays medical/annual visas
   - **NEW:** Calls `load_results()` → displays competition results
4. All three new tabs display read-only data from local database

### Syncing Data
To populate the new tabs with data from the server:

1. Login to the application (provides JWT token)
2. Use the Sync menu to download data
3. Call new sync methods (can be added to main sync workflow):
   ```python
   sync_manager.pull_grade_history()      # Downloads all grade history
   sync_manager.pull_visas()              # Downloads all visas
   sync_manager.pull_athlete_results()    # Downloads all results
   ```
4. Or sync specific athlete's data:
   ```python
   sync_manager.pull_grade_history(athlete_id=5)
   ```

## Files Modified

1. **`desktop/models/db.py`** (+147 lines)
   - Added 3 new table schemas in `init_db()`
   - Added 6 new database methods

2. **`desktop/sync/sync_manager.py`** (+193 lines)
   - Added 3 new sync methods
   - Added 2 helper methods for ID mapping

3. **`desktop/ui/athlete_detail_dialog.py`** (+194 lines)
   - Added QTableWidget and Qt imports
   - Added 3 new tab widgets in `init_ui()`
   - Added 3 new data loading methods

## Integration with Web App

The offline app now displays the same historical data as the web app:

| Web App Feature | Offline App Tab | API Endpoint |
|-----------------|-----------------|--------------|
| Grade History | 🥋 Grade History | `/api/grade-histories/` |
| Medical Visas | 📋 Visas | `/api/medical-visas/` |
| Annual Visas | 📋 Visas | `/api/annual-visas/` |
| Competition Results | 🏆 Results | `/api/category-athlete-score/` |

All data is read-only in the offline app (managed on the server).

## Testing

Tables were successfully created and verified:

```
✓ Created grade_history table
✓ Created visas table
✓ Created athlete_results table
```

## Next Steps

To fully integrate the new features:

1. **Add to main sync workflow:**
   - Modify `SyncManager.sync_all()` or similar to include:
     ```python
     self.pull_grade_history()
     self.pull_visas()
     self.pull_athlete_results()
     ```

2. **Add refresh button:**
   - Add a "Refresh" button to each tab to re-sync that athlete's data

3. **Add filters/sorting:**
   - Allow filtering by status (approved/pending)
   - Sort by date (newest/oldest first)

4. **Show sync status:**
   - Display last sync time for each data type
   - Show loading indicator during sync

## Notes

- All three tabs are **read-only** - users cannot add/edit/delete records (managed on server)
- Tabs only appear when viewing existing athletes (not when creating new ones)
- Foreign key relationships ensure data integrity (CASCADE delete)
- Uses same approval workflow as other entities (pending → approved/rejected)
- Data is synced from server and stored locally for offline viewing
- Server IDs are preserved to enable bi-directional sync

## Conclusion

The offline desktop application now provides a complete athlete profile view matching the web app, displaying grade history, visas, and competition results in dedicated tabs. All data is synced from the Django API and displayed in read-only tables with color-coded status indicators.
