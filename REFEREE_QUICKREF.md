# Quick Reference - Referee System (Corrected)

## What Changed

✅ **No separate 'referee' role** - Uses admin/athlete role + is_referee property
✅ **Simpler setup** - Just mark users as referees, don't create new role
✅ **Frontend fixed** - Checks is_admin and is_referee properties instead of role
✅ **Athlete referee system** - Already works with existing is_referee field on Athlete model

---

## How to Setup Referees

### Admin as Referee (Easiest)
```
Django Admin → Users → Create New User
├─ Email: admin@test.com
├─ Role: admin
└─ Save

✓ Automatically has is_referee = True
✓ Can access /referee/login
✓ Can view dashboard (no scoring)
```

### Athlete as Referee
```
Django Admin → Athlete → Edit Athlete
├─ user: Select existing athlete user
├─ Check ✓ "is_referee" checkbox
└─ Save

✓ Has is_referee = True
✓ Can access /referee/login
✓ Can view dashboard AND score
```

---

## Testing

### Test Admin Referee
```
1. Go to: http://localhost:5173/referee/login
2. Login with: admin@test.com / password
3. See: Dashboard with "Administrator" badge
4. No "Begin Scoring" button (viewing only)
```

### Test Athlete Referee
```
1. Go to: http://localhost:5173/referee/login
2. Login with: athlete@test.com / password
3. See: Dashboard with "Referee" badge
4. YES "Begin Scoring" button (can score)
```

---

## Key Files Modified

| File | Change |
|------|--------|
| `backend/api/models.py` | Removed 'referee' role, updated is_referee property |
| `frontend/src/pages/RefereeLoginPage.jsx` | Use is_admin/is_referee instead of role checks |

---

## API Response Structure

```json
{
  "id": 1,
  "email": "admin@test.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "admin",
  "is_admin": true,
  "is_athlete": false,
  "is_referee": true,
  "is_supporter": false
}
```

---

## Access Control Matrix

| User Type | View Login | See Dashboard | Score Button |
|-----------|-----------|---------------|--------------|
| Admin | ✅ | ✅ | ❌ |
| Athlete + is_referee | ✅ | ✅ | ✅ |
| Regular Athlete | ✅ | ❌ | ❌ |
| Other Users | ✅ | ❌ | ❌ |

---

## Servers Status

| Server | URL | Status |
|--------|-----|--------|
| Backend | http://127.0.0.1:8000 | ✅ Running |
| Frontend | http://localhost:5173 | ✅ Running |
| Login Page | http://localhost:5173/referee/login | ✅ Ready |

---

## Next Steps

1. **Test login** at http://localhost:5173/referee/login
2. **Create test referees** in Django admin
3. **Verify dashboard** shows correctly
4. **Test role-based features** (scoring button)

---

**Version:** 2.0 (Corrected)  
**Status:** ✅ Ready  
**Date:** Feb 7, 2026
