# Phase 5 Quick Start - Login & Testing

**Fast reference for getting started with Phase 5 testing**

---

## 🚀 30-Second Setup

### Start the Apps
```bash
# Terminal 1 - Backend
cd backend
source venv/bin/activate
python manage.py runserver 127.0.0.1:8000

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

### Access the App
- **Frontend**: http://localhost:5173
- **Backend API**: http://127.0.0.1:8000/api
- **Admin Panel**: http://127.0.0.1:8000/admin

---

## 🔐 Login Credentials

### Test Referee Account
```
Username: referee_test
Password: testpass123
Role: Referee
```

### Test Admin Account
```
Username: admin_test
Password: adminpass123
Role: Admin
```

### Test Athlete Account
```
Username: athlete_test
Password: athletepass123
Role: Athlete
```

---

## ✅ Login Checklist

- [ ] Apps running (both backend and frontend)
- [ ] Frontend loads at http://localhost:5173
- [ ] Login page appears
- [ ] Enter username `referee_test`
- [ ] Enter password `testpass123`
- [ ] Click LOGIN
- [ ] See dashboard with welcome message
- [ ] See assigned categories
- [ ] Click VIEW SCORES on a category
- [ ] See athlete list

---

## 🛠️ If Login Fails

### Check 1: Backend Running?
```bash
curl http://127.0.0.1:8000/api/
# Should return JSON, not error
```

### Check 2: Auth Endpoint Working?
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"testpass123"}'
# Should return token + user data
```

### Check 3: Clear Cache & Retry
1. Open DevTools (F12)
2. Application → Service Workers → Unregister
3. Application → Cache Storage → Delete all
4. Hard refresh (Ctrl+Shift+R)
5. Try login again

### Check 4: Check Console Errors
1. Open DevTools (F12)
2. Console tab
3. Look for red errors
4. Check if they mention failed requests

---

## 📱 Mobile Testing

### iOS Safari
1. Navigate to: http://localhost:5173
2. Share button → "Add to Home Screen"
3. Opens in full-screen app mode
4. Test login and scoring

### Android Chrome
1. Navigate to: http://localhost:5173
2. Menu → "Install app"
3. Opens in app mode
4. Test login and scoring

### Mobile Scoring
- Responsive design works on all sizes
- Touch-friendly interface
- Works offline after first load

---

## 🧪 Quick E2E Test

### Run Automated Tests
```bash
# From repo root
python test_phase5_e2e.py
```

**What it tests:**
✓ Authentication flow  
✓ API endpoints  
✓ Validation rules  
✓ Database integrity  
✓ Scoring workflow  
✓ Performance  
✓ Security  

**Expected result:** All tests pass ✓

---

## 📊 Quick Performance Test

```bash
# From repo root
python test_phase5_performance.py
```

**What it measures:**
- Page load time (target: < 3s)
- API response time (target: < 500ms)
- Cache efficiency (target: > 90%)
- Asset sizes

---

## 🎯 Typical Test Workflow

### Day 1: Functional Testing
```
1. Login as different roles
2. Test each category
3. Score some athletes
4. Try offline scoring
5. Verify sync when online
```

### Day 2: Browser Testing
```
1. Test on Chrome
2. Test on Firefox
3. Test on Safari
4. Test on Mobile
5. Test responsive design
```

### Day 3: Performance & Security
```
1. Run perf tests
2. Check network tab
3. Test validation
4. Try SQL injection (should fail)
5. Check security headers
```

### Day 4: Edge Cases
```
1. Log in, logout, log back in
2. Score while offline
3. Sync scores when online
4. Change password
5. Try invalid data entry
```

### Day 5: Final Verification
```
1. Verify all features work
2. Check admin dashboard
3. Verify approvals workflow
4. Confirm notifications
5. Sign off on readiness
```

---

## 🔄 Common Test Scenarios

### Scenario 1: Basic Scoring
```
1. Login as referee_test
2. Click category → VIEW SCORES
3. Click athlete
4. Enter score: 8
5. Click SUBMIT
6. Score appears in system ✓
```

### Scenario 2: Offline Scoring
```
1. Login and score an athlete
2. Open DevTools (F12)
3. Network tab → Offline (checkbox)
4. Try to score another athlete
5. Score should be queued
6. Turn offline off
7. Scores should sync automatically ✓
```

### Scenario 3: Password Change
```
1. Login
2. Click profile → Settings
3. Click "Change Password"
4. Enter old password
5. Enter new password (twice)
6. Click SAVE
7. Logout
8. Login with new password ✓
```

### Scenario 4: Multi-User Concurrency
```
1. Open 2 browser tabs
2. Login as different users in each
3. Score same athlete in both
4. Latest score wins
5. No conflicts ✓
```

---

## 📊 Success Metrics

### Must Pass (Blockers)
- [ ] Login works for all roles
- [ ] Can score athletes
- [ ] Offline scoring works
- [ ] Sync happens automatically
- [ ] No JavaScript errors in console
- [ ] Page loads < 3 seconds
- [ ] Mobile responsive
- [ ] Can logout successfully

### Should Pass (High Priority)
- [ ] E2E tests pass (> 95%)
- [ ] Performance tests pass
- [ ] Browser compatibility good
- [ ] Security validation passes
- [ ] No validation bypasses
- [ ] Admin dashboard working

### Nice to Have (Low Priority)
- [ ] WebSocket real-time updates
- [ ] Advanced filtering
- [ ] Export functionality
- [ ] Bulk operations

---

## 🐛 Bug Reporting Template

**If you find a bug:**

```
Title: [AREA] Brief description

Environment:
- Browser: Chrome/Firefox/Safari/etc.
- OS: Windows/Mac/Linux
- Device: Desktop/Mobile/Tablet

Steps to Reproduce:
1. Login as [username]
2. Navigate to [page]
3. Click [button]
4. See [unexpected behavior]

Expected Result:
[What should happen]

Actual Result:
[What actually happened]

Error Message:
[Copy from browser console]

Screenshots:
[If applicable]

Severity: Critical/High/Medium/Low
```

---

## 📁 Key Files for Testing

| File | Purpose |
|------|---------|
| `test_phase5_e2e.py` | Run automated E2E tests |
| `test_phase5_performance.py` | Run performance tests |
| `PHASE_5_TESTING_GUIDE.md` | Full testing guide |
| `PHASE_5_BROWSER_TESTING_GUIDE.md` | Browser compatibility |
| `REFEREE_LOGIN_GUIDE.md` | Login help |
| `SERVICE_WORKER_CACHE_FIX.md` | Cache troubleshooting |

---

## 🔗 URLs for Testing

| URL | Purpose |
|-----|---------|
| `http://localhost:5173` | Main app login |
| `http://127.0.0.1:8000/api/` | API root |
| `http://127.0.0.1:8000/admin/` | Admin panel |
| `http://localhost:5173/offline` | Offline page |

---

## 💡 Pro Tips

### DevTools Power User
```
F12               = Open DevTools
Ctrl+Shift+R      = Hard refresh (clear cache)
Ctrl+Shift+Delete = Clear all browser data
Ctrl+Shift+N      = Incognito mode (no cache)
```

### Network Tab Debugging
1. DevTools → Network tab
2. Refresh page
3. Look for red errors (404, 500, etc.)
4. Click on request to see details
5. Check Status, Response, Headers

### Console Tips
```javascript
// Check if Service Worker registered
navigator.serviceWorker.getRegistrations()

// Clear all caches
(async () => {
  const caches = await caches.keys();
  return Promise.all(caches.map(c => caches.delete(c)));
})()

// Check localStorage
localStorage

// Check current user
JSON.parse(localStorage.getItem('authToken'))
```

### Backend Debugging
```bash
# Check logs
tail -f [log file]

# Create test user
python manage.py shell
>>> from api.models import User
>>> User.objects.create_user(username='test', password='test123', email='test@test.com')

# Run Django tests
python manage.py test api.tests

# Check database
python manage.py dbshell
```

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| **Login fails** | Check backend running, verify credentials |
| **Page won't load** | Hard refresh (Ctrl+Shift+R), clear cache |
| **Slow performance** | Close other apps, check DevTools Network |
| **Offline not working** | Clear cache, reload Service Worker |
| **API 404 errors** | Check backend running on port 8000 |
| **CORS errors** | Check CORS settings in Django settings.py |
| **Mobile app won't install** | Use Chrome (Android) or Safari (iOS) |

---

## ✨ Phase 5 Success!

When you've completed Phase 5:

✅ All functional tests pass  
✅ Browser compatibility verified  
✅ Performance metrics acceptable  
✅ Security audit passed  
✅ Team approved  
✅ Ready for production deployment  

---

## 📞 Need Help?

- **Login issues**: See `REFEREE_LOGIN_GUIDE.md`
- **Cache issues**: See `SERVICE_WORKER_CACHE_FIX.md`
- **Testing guide**: See `PHASE_5_TESTING_GUIDE.md`
- **Browser issues**: See `PHASE_5_BROWSER_TESTING_GUIDE.md`
- **Code issues**: Check backend logs, run E2E tests

---

**Version**: 1.0  
**Last Updated**: February 7, 2026  
**Status**: Ready for Phase 5 Testing 🚀
