# Desktop App Updates - Dashboard & Search/Filter

## Changes Made

### 1. ✅ Dashboard Tab Added
**File**: `desktop/ui/dashboard.py` (NEW)

**Features**:
- 📊 **Statistics Cards**: Total Athletes, Clubs, Competitions, Matches
- 📈 **Breakdown Charts**:
  - Athletes by Grade (visual bar charts)
  - Athletes by Club (top 10)
  - Athletes by City (top 10)
- 🎨 **Color-coded UI**: Different colors for each metric
- 🔄 **Auto-refresh**: Updates when data is synced

**Usage**: First tab in the application - opens by default

---

### 2. ✅ Search & Filter for Athletes Tab
**File**: `desktop/ui/athlete_list.py` (UPDATED)

**New Features**:
- 🔍 **Search Box**: Search athletes by first or last name (live search)
- 🏢 **Club Filter**: Dropdown to filter by club
- 🌍 **City Filter**: Dropdown to filter by city/team place
- 🥋 **Grade Filter**: Dropdown to filter by current grade
- ✖ **Clear Filters Button**: Reset all filters at once

**How Filters Work**:
- All filters work together (AND logic)
- Live search - updates as you type
- Dropdowns auto-populate from database
- Shows only athletes matching ALL active filters

---

### 3. ✅ Visa Sync Error Reporting
**Files**: 
- `desktop/sync/sync_manager.py` (UPDATED)
- `desktop/ui/main_window.py` (UPDATED)

**Improvements**:
- ❌ **Shows Authentication Errors**: If visa endpoints require auth and you're not logged in, you'll see:
  - "Visas: ERROR - medical: Authentication required; annual: Authentication required"
- 📝 **Better Error Messages**: Shows specific errors for medical vs annual visas
- ⚠️ **Warnings**: If some visas sync but others fail, you'll see both success count and warnings

**Why Visas Might Be Empty**:
1. **Not logged in** - Login via File → Login first
2. **No visas in database** - Check web admin: http://127.0.0.1:8000/admin/api/visa/
3. **Authentication failed** - Error message will now show in sync results

---

## How to Use

### Dashboard
1. Start desktop app: `python desktop/main.py`
2. Dashboard is the first tab (📊 Dashboard)
3. View statistics and charts
4. Charts update automatically after syncing data

### Search & Filter Athletes
1. Go to **👥 Athletes** tab
2. **Search by name**:
   - Type in the search box
   - Searches both first and last name
   - Updates instantly as you type

3. **Filter by attributes**:
   - Select a club from Club dropdown
   - Select a city from City dropdown
   - Select a grade from Grade dropdown
   - All filters work together

4. **Clear filters**:
   - Click **✖ Clear Filters** button
   - Or manually reset each dropdown to "All"

### Debugging Visa Sync

**Step 1**: Verify visas exist in backend
```powershell
python check_visas.py
```
Should show: "Total Visas: X, Medical: Y, Annual: Z"

**Step 2**: Login to desktop app
- File → Login
- Use your admin credentials

**Step 3**: Sync data
- Sync → Download from Server
- Look for "Visas: X" or "Visas: ERROR - ..." in the results

**Step 4**: Check athlete profile
- Double-click an athlete
- Go to **📋 Visas** tab
- Should show medical/annual visas with expiration dates

---

## Testing Checklist

### Dashboard
- [ ] Dashboard tab is first tab
- [ ] Shows correct athlete count
- [ ] Shows correct club count
- [ ] Breakdown charts display data
- [ ] Charts update after sync

### Search & Filter
- [ ] Search box filters by name
- [ ] Club filter shows all clubs
- [ ] City filter shows all cities
- [ ] Grade filter shows all grades
- [ ] Filters work together correctly
- [ ] Clear button resets all filters
- [ ] Table updates instantly

### Visa Sync
- [ ] Login required error shows if not logged in
- [ ] Sync shows visa count or error message
- [ ] Visas appear in athlete profile tabs
- [ ] Expiration dates calculated correctly (medical: +180 days, annual: +365 days)

---

## Known Issues & Solutions

### Issue: "Visas: ERROR - Authentication required"
**Solution**: Login first via File → Login with valid admin credentials

### Issue: Visas show 0 count but no error
**Solution**: No visas in database. Add visas via web admin first.

### Issue: Dashboard shows 0 for everything
**Solution**: Sync data first via Sync → Download from Server

### Issue: Filter dropdowns empty
**Solution**: First load of athletes populates dropdowns automatically

### Issue: Search not working
**Solution**: Make sure athletes are loaded (Refresh button or restart app)

---

## Files Modified

1. **desktop/ui/dashboard.py** (NEW)
   - Dashboard widget with stats and charts
   - 290 lines of code

2. **desktop/ui/athlete_list.py** (UPDATED)
   - Added search box
   - Added 3 filter dropdowns
   - Added filter logic to query builder
   - +100 lines of code

3. **desktop/ui/main_window.py** (UPDATED)
   - Added dashboard tab as first tab
   - Dashboard loads on app start and refresh
   - Visa sync errors now shown in sync results

4. **desktop/sync/sync_manager.py** (UPDATED)
   - Visa sync collects and reports errors
   - Shows specific error per endpoint (medical vs annual)

---

## Next Steps

If visas still don't show after these changes:

1. **Check backend server is running**:
   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   python manage.py runserver
   ```

2. **Verify visa records exist**:
   - Open http://127.0.0.1:8000/admin/api/visa/
   - Should see visa records listed

3. **Test API endpoints directly** (requires login token):
   ```powershell
   python test_visa_sync.py
   ```

4. **Check database migration ran**:
   ```powershell
   python -c "import sqlite3; conn = sqlite3.connect('desktop/data/offline_db.sqlite3'); cursor = conn.cursor(); cursor.execute('PRAGMA table_info(visas)'); print([row[1] for row in cursor.fetchall()])"
   ```
   Should show: `['id', 'server_id', 'athlete_id', 'athlete_name', 'visa_type', 'issued_date', ...]`

5. **Enable debug output**:
   - When syncing, check terminal/console for error messages
   - Look for traceback from `pull_visas()` method
