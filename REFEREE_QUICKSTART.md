# 🚀 Quick Start: Referee System

## Current Status
✅ **Backend:** Running on http://127.0.0.1:8000  
✅ **Frontend:** Running on http://localhost:5173  
✅ **Referee System:** Fully Implemented

## Access the System

### 1. Open Referee Login Page
```
http://localhost:5173/referee/login
```

### 2. Test Credentials
```
Email:    referee_test
Password: testpass123

OR

Email:    admin_test  
Password: adminpass123
```

### 3. What You'll See

**Login Form (If Not Logged In)**
- Professional purple-blue gradient background
- Email and password input fields
- "Login" button
- Test credentials displayed

**Dashboard (After Login)**
- Welcome message with your name
- Role badge (Referee or Administrator)
- **Categories Section**
  - Shows assigned competitions/categories
  - Athlete count for each category
  - "Score Athletes" button (referees only)

- **Fields Section**
  - Shows all competition fields
  - Event names and current categories
  
- **Logout Button** (top right)
  - Clears session and returns to login

### 4. Next Steps

**As Referee:**
1. Login with referee credentials
2. View categories and fields
3. Click "Begin Scoring" to access `/referee/score`

**As Admin:**
1. Login with admin credentials
2. View overview of categories and fields
3. No "Begin Scoring" button visible
4. Can still navigate to admin dashboard

## System Architecture

### Backend (Django)
- User model with 'referee' role
- Authentication via `/api/auth/login/`
- Current user info via `/api/auth/me/`
- Competitions via `/api/competitions/`
- Fields via `/api/competition-fields/`

### Frontend (React + Vite)
- RefereeLoginPage component
- Login form + Dashboard view
- Responsive CSS styling
- API service layer
- Role-based conditional rendering

### Security
- JWT token authentication
- Session-based login
- Role-based access control
- Protected API endpoints
- Secure logout

## File Structure

```
vovinam-admin/
├── backend/
│   └── api/
│       ├── models.py (User with 'referee' role)
│       ├── admin.py (Django admin config)
│       └── urls.py (API endpoints)
│
└── frontend/
    └── src/
        ├── pages/
        │   └── RefereeLoginPage.jsx (Dashboard + Login)
        │       └── RefereeLoginPage.css (Styling)
        └── services/
            └── api.js (API layer with fieldAPI)
```

## Troubleshooting

### Login Page Not Loading
1. Verify frontend is running: http://localhost:5173
2. Check browser console (F12) for errors
3. Reload page (Cmd+R or Ctrl+R)

### Getting 404 Errors
1. Verify backend is running: http://127.0.0.1:8000
2. Check that endpoints match:
   - Competitions: `/api/competitions/`
   - Fields: `/api/competition-fields/`

### No Data Showing on Dashboard
1. Check browser Network tab (F12)
2. Verify API calls succeed
3. Ensure data exists in Django admin
4. Check that user has valid authentication

### Logout Not Working
1. Clear browser cookies/cache (Cmd+Shift+Delete)
2. Clear localStorage: `localStorage.clear()` in console
3. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
4. Login again

## Next Steps

### Phase 5: Testing
1. Test login flow with various user roles
2. Verify dashboard displays correctly
3. Test responsive design on different devices
4. Execute E2E test suite

### Enhancements (Optional)
1. Assign specific categories to referees
2. Real-time field status updates
3. Live scoring notifications
4. Mobile app optimization
5. Offline support

## Quick Commands

### Start Backend
```bash
cd backend
python manage.py runserver 127.0.0.1:8000
```

### Start Frontend
```bash
cd frontend
npm run dev
```

### Access Django Admin
```
http://127.0.0.1:8000/admin
(Requires Django admin account)
```

### View Logs
```bash
# Backend logs appear in terminal
# Frontend logs appear in browser console (F12)
```

## Success Indicators

✅ See referee login page at http://localhost:5173/referee/login  
✅ Can login with test credentials  
✅ Dashboard shows categories and fields  
✅ Role badge displays correctly  
✅ Can logout and return to login  
✅ Professional styling and responsive layout  

---

**Status:** Ready for Phase 5 Testing  
**Last Updated:** 2024
