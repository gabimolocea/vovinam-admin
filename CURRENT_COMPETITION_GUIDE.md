# Current Competition Context - Admin Guide

## Overview

The **Current Competition** feature streamlines competition management by:
- **Auto-suggesting the "current" competition** when adding categories, matches, and other competition-related items
- **Remembering your selection** across the entire admin session
- **Displaying which competition you're working with** in the admin header
- **Making bulk competition management faster** by pre-filling forms

## How It Works

### Setting the Current Competition

1. **Navigate to Events Admin**: Click on **"Event"** in the admin sidebar
2. **Find your competition** in the list
3. **Two ways to set it as current**:
   - **Method A (Recommended)**: Click the **"Set as current competition"** action button
     - Check the checkbox next to the event
     - Select "Set as current competition" from the action dropdown
     - Click "Go"
   - **Method B**: Click **"Change"** and modify the event, then it becomes current
4. **Confirmation**: You'll see a green success message: "✓ Current competition set to: [Event Name]"

### Viewing Current Competition

The current competition is displayed in **three places**:

#### 1. **Admin Header** (Top of every page)
```
★ Current Competition: International Vovinam Championship 2024
```
- Shows immediately below the "FRVV Admin" title
- Includes a **"Change"** link to quickly switch competitions
- If no competition is selected, shows: "No current competition selected. Select one →"

#### 2. **Event Admin List View**
- A **"Current"** column shows a green `★ CURRENT` badge next to the active competition
- Makes it easy to see which event is currently active

#### 3. **Add/Edit Forms** (Categories, Matches, etc.)
- The **"Event"** field is **pre-filled** with the current competition
- Saves you from manually selecting it every time
- Works for:
  - **Solo Categories** - Event field auto-filled
  - **Team Categories** - Event field auto-filled
  - **Fight Categories** - Event field auto-filled
  - **Matches** - Category field auto-suggested from current competition

## Use Cases

### Use Case 1: Organizing a New Competition

```
1. Go to Events
2. Click "Set as current competition" on "2024 National Tournament"
   → Header now shows: ★ Current Competition: 2024 National Tournament
3. Click "Add Solo Category"
   → Event field is already filled with "2024 National Tournament"
4. Click "Add Team Category"
   → Event field is already filled with "2024 National Tournament"
5. Click "Add Match"
   → Category field defaults to categories from the current competition
```

### Use Case 2: Switching Between Competitions

```
1. Currently working on "2024 National Tournament"
2. Need to quickly check "2024 Regional Qualifiers"
3. Go to Events
4. Click "Set as current competition" on "2024 Regional Qualifiers"
   → Header updates immediately
5. Click "Add Match"
   → Category field now defaults to categories from Regional Qualifiers
```

### Use Case 3: Admin Login - Getting Context

```
1. You log into the admin
2. No competition is selected yet
3. Header shows: "No current competition selected. Select one →"
4. Click the link to go to Events
5. Set your working competition
   → All subsequent forms will auto-fill with that competition
```

## Session Persistence

- The current competition is **stored in your session**
- It persists while you're logged in and working
- It's **user-specific** - each admin user has their own current competition
- It resets when you log out
- It's **not shared** with other users

## Tips & Tricks

### 💡 Quick Competition Switching
Instead of navigating away:
1. Keep the Events page open in a tab
2. When you need to switch competitions, click that tab
3. Use "Set as current competition" action
4. Return to your work - forms now pre-fill with the new competition

### 💡 Organizing by Event
The header always shows you which event you're working with, so you never accidentally add categories to the wrong competition.

### 💡 Bulk Operations
If you need to add multiple categories and matches for one competition:
1. Set it as current
2. Add all your categories - no manual selection needed
3. Add all your matches - category pre-populated from current competition

## Troubleshooting

### Header Shows "No current competition selected"
**Solution**: Go to Events > select an event > click "Set as current competition"

### Event field not pre-filling in Add Category form
**Possible causes**:
- Browser cookies/session data lost (try clearing cache and re-logging in)
- No current competition set - check the header

**Solution**: 
1. Go to Events
2. Click "Set as current competition" again
3. Return to Add Category form

### Competition doesn't persist after refresh
- This is normal behavior if your session expired
- Check the header - if it shows "No current competition selected", set it again

### I set a current competition but the header doesn't show it
- Try refreshing the page with F5 or ⌘R
- The header updates on page load

## Technical Details (For Admin/Developers)

### Implementation
- **Storage**: Django session (`request.session['current_competition_id']`)
- **Scope**: Per-user, per-session
- **Template**: `templates/admin/base_site.html`
- **Mixin**: `CurrentCompetitionMixin` in `api/admin.py`
- **Site Class**: `CompetitionAwareAdminSite`

### Affected Admins
Models that auto-fill with current competition:
- `Event` (event selection via action)
- `SoloCategory` 
- `TeamCategory`
- `FightCategory`
- `Match` (category auto-filled from current competition)

### How to Add to New Models
If you create a new competition-related model and want to use current competition context:

```python
class NewModelAdmin(CurrentCompetitionMixin, admin.ModelAdmin):
    competition_field = 'event'  # or whatever your FK field is called
```

This will:
- Auto-fill the field on add/edit forms
- Show current competition in admin header
- Add the session context to all views

## Related Features

- **Autocomplete**: Team, Athlete, Category, and Referee fields have autocomplete enabled
- **Club Context**: Athletes show their club name for easy identification
- **Global Navigation**: The sidebar provides quick access to all competition models
