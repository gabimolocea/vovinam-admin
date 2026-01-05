# Quick Guide: Viewing Athlete Profile Data

## How to View Grade History, Visas, and Results

### Step 1: Open the Desktop Application
```bash
cd desktop
python main.py
```

### Step 2: Login
- Click **File → Login**
- Enter your credentials
- This provides the JWT token needed for API access

### Step 3: Sync Athletes
- Click **Sync → Download from Server**
- This downloads all athletes to your local database

### Step 4: View Athlete Profile
1. Go to the **Athletes** tab
2. **Double-click** any athlete row
3. The Athlete Detail dialog opens with 6 tabs:
   - 👤 Basic Info
   - 🏢 Club Info
   - 🚨 Emergency Contact
   - **🥋 Grade History** ← NEW!
   - **📋 Visas** ← NEW!
   - **🏆 Results** ← NEW!

### Step 5: Sync Additional Data (Optional)

To populate the new tabs, you can manually sync the data using Python:

```python
from sync.sync_manager import SyncManager

# Initialize sync manager
sync = SyncManager()
sync.set_auth_token(your_jwt_token)

# Sync all grade history
success, msg, count = sync.pull_grade_history()
print(f"{msg} - {count} records")

# Sync all visas
success, msg, count = sync.pull_visas()
print(f"{msg} - {count} records")

# Sync all competition results
success, msg, count = sync.pull_athlete_results()
print(f"{msg} - {count} records")
```

Or sync for a specific athlete:

```python
# Get athlete's local ID from database
athlete_id = 5  # example

# Sync only this athlete's data
sync.pull_grade_history(athlete_id=athlete_id)
sync.pull_visas(athlete_id=athlete_id)
sync.pull_athlete_results(athlete_id=athlete_id)
```

## What Each Tab Shows

### 🥋 Grade History Tab
Shows the athlete's belt/grade promotions over time.

**Columns:**
- **Grade** - Belt name (e.g., "Blue Belt", "Black Belt 1st Dan")
- **Date Earned** - When the grade was achieved
- **Event** - Competition or seminar where grade was earned
- **Status** - Approval status (color-coded: green = approved, red = rejected)

**Example Data:**
```
Black Belt 1st Dan | 2023-06-15 | National Championship 2023 | Approved ✓
Blue Belt          | 2021-03-20 | Spring Grading Exam       | Approved ✓
```

### 📋 Visas Tab
Shows medical certificates and annual federation visas.

**Columns:**
- **Type** - Medical or Annual
- **Issued Date** - When visa was issued
- **Expiration** - When visa expires
- **Status** - Approval status (color-coded)
- **Valid** - ✓ Yes (green) or ✗ No (red)

**Example Data:**
```
Medical | 2024-01-15 | 2025-01-14 | Approved | ✓ Yes
Annual  | 2024-01-01 | 2024-12-31 | Approved | ✓ Yes
```

### 🏆 Results Tab
Shows competition results and scores.

**Columns:**
- **Event** - Competition name
- **Category** - Weight/age category competed in
- **Type** - Individual or Team
- **Score** - Numeric score earned
- **Rank** - Final placement (#1, #2, #3, etc. - podium positions color-coded)
- **Status** - Approval status (color-coded)

**Example Data:**
```
National Championship 2023 | Male -60kg  | Individual | 45.5 | #1  | Approved ✓
Summer Cup 2023           | Male -60kg  | Individual | 38.2 | #3  | Approved ✓
```

## Empty States

If an athlete has no data for a tab, you'll see a friendly message:
- Grade History: "No grade history yet"
- Visas: "No visas yet"
- Results: "No competition results yet"

## Read-Only Data

**Important:** All three new tabs display read-only data. You cannot:
- Add new records
- Edit existing records  
- Delete records

To modify this data, use the web application. Changes will sync to the desktop app on next download.

## Tips

1. **Sync regularly** - The tabs show offline cached data. Sync often to see latest updates.

2. **Check status colors** - Quickly identify approved (green) vs pending/rejected (red) records.

3. **Look for podium finishes** - In Results tab, ranks 1-3 are color-coded (gold/silver/bronze).

4. **Verify visa validity** - Check the "Valid" column to ensure athlete has current medical clearance.

5. **Track grade progression** - Grade History shows the athlete's journey from beginner to current level.

## Troubleshooting

### "No data in new tabs"
- Make sure you've synced the data using the sync methods
- Check that the athlete has records on the server
- Verify you're logged in (JWT token is set)

### "Tables not showing"
- Ensure you're viewing an **existing** athlete (not creating a new one)
- The new tabs only appear for athletes already in the database

### "Authentication errors during sync"
- Re-login to get a fresh JWT token
- Check that your account has permission to view these records

## Future Enhancements

Planned improvements:
- Auto-sync when opening athlete profile
- Refresh button on each tab
- Filter by status (approved/pending)
- Sort by date
- Export to PDF/Excel
- Search/filter within tables
