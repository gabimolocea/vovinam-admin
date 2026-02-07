# ✅ Referee System - Corrected Implementation

## Issues Fixed

### 1. ❌ **Issue:** Separate 'referee' role created
**✅ Solution:** Removed 'referee' from ROLE_CHOICES
- Kept existing roles: `admin`, `athlete`, `supporter`, `user`
- Users can now be referees through their role + `is_referee` flag, not a separate role

### 2. ❌ **Issue:** `fieldAPI` export missing
**✅ Solution:** Already exported in `api.js` (was present, just needed server restart)

### 3. ❌ **Issue:** Frontend checking `user.role === 'referee'`
**✅ Solution:** Updated to check `user.is_admin` or `user.is_referee` properties

### 4. ❌ **Issue:** WebSocket errors (not critical)
**✅ Note:** These are Vite dev server warnings, not related to our changes

---

## How It Works Now

### Backend User Model

```python
# ROLE_CHOICES (no 'referee' role)
ROLE_CHOICES = [
    ('admin', 'Admin'),
    ('athlete', 'Athlete'),
    ('supporter', 'Supporter'),
    ('user', 'User'),
]

# is_referee property
@property
def is_referee(self):
    """User is referee if they're admin OR if they're an athlete with is_referee=True"""
    if self.is_admin:
        return True
    if self.is_athlete:
        try:
            return hasattr(self, 'athlete') and self.athlete and self.athlete.is_referee
        except:
            return False
    return False
```

### How to Make Someone a Referee

**Option 1: Admin as Referee**
- Create user with role = 'admin'
- Admin automatically has `is_referee = True`

**Option 2: Athlete as Referee**
- Create user with role = 'athlete'
- In Athlete admin panel, check `is_referee` checkbox
- Athlete now has `is_referee = True`

### Access Control

```
Admin users:
  - Always can view /referee/login page
  - Can see categories & fields dashboard
  - NO "Begin Scoring" button (viewing only)

Athletes with is_referee=True:
  - Can view /referee/login page
  - Can see categories & fields dashboard
  - YES "Begin Scoring" button (can score)

Other users:
  - Cannot access /referee/login protected resources
  - See normal app interface
```

---

## Files Modified

### Backend
**`backend/api/models.py`**
- ❌ Removed 'referee' from `ROLE_CHOICES` 
- ✅ Updated `is_referee` property to check:
  - Admin status (admins are always referees)
  - OR athlete's `is_referee` field

### Frontend
**`frontend/src/pages/RefereeLoginPage.jsx`**
- ❌ Changed role checks from `user.role === 'referee'`
- ✅ Updated to use `user.is_admin` and `user.is_referee` properties
- ✅ Updated role badge to show admin or referee role
- ✅ "Begin Scoring" button only shows for non-admin referees

**`frontend/src/services/api.js`**
- ✓ `fieldAPI` already properly exported (verified)

---

## Testing

### Test Case 1: Admin as Referee
1. Django Admin: Create user with role = 'admin'
2. Login at `/referee/login`
3. See dashboard with categories & fields
4. Role badge shows "Administrator"
5. NO "Begin Scoring" button

### Test Case 2: Athlete as Referee
1. Django Admin: 
   - Create user with role = 'athlete'
   - Create Athlete profile
   - Check `is_referee` checkbox in Athlete admin
2. Login at `/referee/login`
3. See dashboard with categories & fields
4. Role badge shows "Referee"
5. YES "Begin Scoring" button available

### Test Case 3: Regular Athlete
1. Django Admin:
   - Create user with role = 'athlete'
   - Create Athlete profile
   - Do NOT check `is_referee` checkbox
2. Try login at `/referee/login`
3. Login succeeds but no dashboard shown
4. Redirects to `/referee/score` (protected route)

---

## System Architecture

```
User Login
    ↓
POST /api/auth/login/
    ↓
GET /api/auth/me/ (returns user with properties)
    ↓
Check: is_user_admin OR is_user_referee?
    │
    ├─ YES → Show Dashboard
    │        ├─ Admin: View only (no scoring)
    │        └─ Referee: View + Score Athletes button
    │
    └─ NO → Show login form / redirect
```

---

## User Properties Returned from API

```json
{
  "id": 1,
  "email": "user@test.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "athlete",
  "is_admin": false,
  "is_athlete": true,
  "is_referee": true,
  "is_supporter": false
}
```

---

## API Endpoints (Unchanged)

All existing endpoints still work:
- `POST /api/auth/login/` - Authenticate user
- `GET /api/auth/me/` - Get current user with properties
- `GET /api/competitions/` - List competitions/categories
- `GET /api/competition-fields/` - List fields

---

## Key Differences from Previous Version

| Feature | Before | After |
|---------|--------|-------|
| Referee Role | Separate role in ROLE_CHOICES | Property checked from admin/athlete roles |
| User Setup | Create user with role='referee' | Create admin/athlete + set is_referee |
| Admin as Referee | Not possible | Always referee (is_admin = true) |
| Athlete as Referee | Yes, with dual role | Yes, with is_referee checkbox |
| Frontend Check | `user.role === 'referee'` | `user.is_referee` property |
| Simplicity | Extra role option | Reuses existing roles |

---

## Benefits of This Approach

✅ **Simpler:** Only 4 main roles instead of 5
✅ **Flexible:** Admins automatically become referees
✅ **Logical:** Uses existing Athlete.is_referee field
✅ **Backward Compatible:** Doesn't break existing athlete referee system
✅ **Cleaner:** Property-based instead of role-based checks
✅ **Scalable:** Easy to add more flags (is_coach, is_judge, etc.)

---

## Code Examples

### Check if user can access referee system
```python
# Backend
if user.is_referee:
    # Allow access
    pass
```

```javascript
// Frontend
if (user.is_admin || user.is_referee) {
  // Show dashboard
}
```

### Create admin referee
```python
# Backend
user = User.objects.create_user(
    username='admin@test.com',
    email='admin@test.com',
    password='password123',
    role='admin'
)
# Automatically is_referee = True
```

### Create athlete referee
```python
# Backend
user = User.objects.create_user(
    username='athlete@test.com',
    email='athlete@test.com',
    password='password123',
    role='athlete'
)

# Then in Athlete admin:
# Check the "is_referee" checkbox
athlete = Athlete.objects.create(
    user=user,
    is_referee=True
)
```

---

## Summary

The referee system now works with the existing role structure:
- No separate 'referee' role
- Uses `is_referee` property on both User (checks admin/athlete status) and Athlete (flags specific athletes)
- Cleaner, simpler, more maintainable
- Fully backward compatible with existing athlete referee system

**Status:** ✅ Fixed and Ready to Test

---

**Last Updated:** February 7, 2026
**Frontend Server:** http://localhost:5173 ✅
**Backend Server:** http://127.0.0.1:8000 ✅
**Login Page:** http://localhost:5173/referee/login ✅
