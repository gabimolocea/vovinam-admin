# Referee Role Implementation & Dashboard Guide

## Overview
Successfully implemented the 'referee' role in the system, allowing both dedicated referees and athletes (with referee role assigned) to access the referee scoring system.

## Changes Made

### 1. Backend Changes

#### User Model Update (`backend/api/models.py`)
Added 'referee' role to the system:

```python
ROLE_CHOICES = [
    ('admin', 'Admin'),
    ('athlete', 'Athlete'),
    ('referee', 'Referee'),  # NEW - Can be assigned to athletes or dedicated referees
    ('supporter', 'Supporter'),
    ('user', 'User'),
]

@property
def is_referee(self):
    return self.role == 'referee'
```

**Key Points:**
- Athletes can now be assigned the 'referee' role in addition to their athlete role
- Admins can manage referee assignments through Django admin interface
- The `is_referee` property provides easy role checking in views

#### Admin Interface
The Django admin (http://localhost:8000/admin) now supports:
- Assigning 'referee' role to users
- Filtering users by role (including 'referee')
- Viewing all referee users in the User list

### 2. Frontend Changes

#### RefereeLoginPage Component (`frontend/src/pages/RefereeLoginPage.jsx`)
Completely redesigned to support dashboard functionality:

**Features:**
1. **Login Form** (for unauthenticated users)
   - Email and password inputs
   - Test credentials displayed
   - Error handling and loading states

2. **Referee Dashboard** (after login)
   - Welcome message with user's name and role
   - Logout button
   - Two main sections:
     - **Categories Section**: Shows assigned categories/events with athlete counts
     - **Fields Section**: Shows competition fields and current categories
   - "Begin Scoring" button for referees to proceed to scoring page

**Conditional Rendering:**
- Public login form for anyone
- Protected dashboard for users with 'referee' or 'admin' role
- Category-specific actions based on role

#### API Integration (`frontend/src/services/api.js`)
Added new `fieldAPI` service for accessing competition fields:

```javascript
export const fieldAPI = {
  list: () => api.get('/competition-fields/'),
  get: (id) => api.get(`/competition-fields/${id}/`),
  create: (data) => api.post('/competition-fields/', data),
  update: (id, data) => api.put(`/competition-fields/${id}/`, data),
  delete: (id) => api.delete(`/competition-fields/${id}/`),
};
```

#### Styling (`frontend/src/pages/RefereeLoginPage.css`)
Professional styling with:
- Gradient background
- Responsive grid layouts
- Card-based UI for categories and fields
- Mobile-friendly design
- Hover effects and transitions

### 3. Routing Configuration
The `/referee/login` route remains public, allowing:
- ✅ Admins to login and view referee dashboard
- ✅ Referees to login and access scoring
- ✅ Public access to the login form

## How to Test

### Test 1: Create a Referee User

1. Go to Django Admin: http://localhost:8000/admin/api/user/
2. Create a new user or edit existing user:
   - Set `role` to **'Referee'**
   - Ensure user is active
3. Click Save

### Test 2: Login as Referee

1. Navigate to: http://localhost:5173/referee/login
2. Login with referee credentials
3. **Expected Dashboard:**
   - Welcome message: "Welcome, [First Name] [Last Name]"
   - Role badge showing "Referee"
   - Categories section with assigned categories
   - Fields section with competition fields
   - "Begin Scoring" button to proceed to `/referee/score`

### Test 3: Login as Admin

1. Use same login URL: http://localhost:5173/referee/login
2. Login with admin credentials
3. **Expected Dashboard:**
   - Welcome message: "Welcome, [Admin Name]"
   - Role badge showing "Administrator"
   - Categories and fields visible (same as referees)
   - Logout button to return to login
   - Note: "Begin Scoring" button only shows for referees

### Test 4: Assign Referee Role to Athlete

1. Django Admin: http://localhost:8000/admin/api/athlete/
2. Edit an athlete profile
3. In the "Status & Workflow" section, check **`is_referee`** checkbox
4. Save
5. Go to User profile for that athlete
6. Set `role` to **'Referee'**
7. Verify they can now login and access referee dashboard

## API Endpoints Used

### Competitions/Categories
- **Endpoint:** `/api/events/` (or `/api/competitions/`)
- **Method:** GET
- **Returns:** List of competition events/categories

### Competition Fields
- **Endpoint:** `/api/competition-fields/`
- **Method:** GET
- **Returns:** List of fields configured for competitions

### Current User
- **Endpoint:** `/api/auth/me/`
- **Method:** GET
- **Returns:** Current logged-in user details including role

## Access Control

### Public Routes
- `/referee/login` - Anyone can access (shows login form)

### Protected Routes (require authentication)
- `/referee/score` - Requires role: 'referee' or 'admin'
- `/admin/*` - Requires role: 'admin'

### Role-Based Features
| Feature | Admin | Referee |
|---------|-------|---------|
| View Login Page | ✅ | ✅ |
| Access Dashboard | ✅ | ✅ |
| See Categories | ✅ | ✅ |
| See Fields | ✅ | ✅ |
| Begin Scoring | ❌ | ✅ |
| Logout | ✅ | ✅ |

## User Flow Diagram

```
Entry: http://localhost:5173/referee/login
    |
    v
Is user logged in?
    |
    +--- NO ----> Show Login Form
    |                  |
    |                  v
    |            User submits credentials
    |                  |
    |                  v
    |            Authenticate via /api/auth/login/
    |                  |
    +--- YES ---> Load Categories & Fields
                      |
                      v
                 Show Dashboard
                      |
                      +--- If Admin: Show overview only
                      |
                      +--- If Referee: Show overview + "Begin Scoring" button
                                            |
                                            v
                                     Navigate to /referee/score
```

## Troubleshooting

### Dashboard Shows "Loading" Forever
1. Check browser console (F12) for errors
2. Verify `/api/events/` and `/api/competition-fields/` endpoints are responding
3. Ensure user is authenticated (check localStorage for authToken)
4. Check Django backend logs for API errors

### "Role badge shows wrong text"
1. Clear browser cache and localStorage
2. Logout completely and login again
3. Verify user role in Django Admin

### Categories/Fields Not Appearing
1. Create sample data in Django Admin:
   - Create an Event/Competition
   - Create a CompetitionField
2. Verify these objects have proper data
3. Check network requests in browser DevTools

### Logout Not Working
1. Clear all localStorage manually:
   ```javascript
   localStorage.clear()
   ```
2. Hard refresh browser (Cmd+Shift+R on Mac)
3. Return to login page

## Next Steps

1. **Assign Categories to Referees** (Optional)
   - Create a RefereeAssignment model to link referees to specific categories
   - Update dashboard to only show assigned categories

2. **Real-time Category Status**
   - Add live updates of which referee is scoring what category
   - Show field occupancy and current matches

3. **Enhanced Field View**
   - Click on field to see current category/athletes
   - Quick navigation to score that field
   - Live scoring status updates

4. **Mobile Optimization**
   - Add touch-friendly controls
   - Optimize layout for tablets
   - Add offline support for scoring

## Code References

- **User Model:** [backend/api/models.py](backend/api/models.py) (lines 15-60)
- **User Admin:** [backend/api/admin.py](backend/api/admin.py) (lines 3815-3850)
- **Referee Login:** [frontend/src/pages/RefereeLoginPage.jsx](frontend/src/pages/RefereeLoginPage.jsx)
- **API Service:** [frontend/src/services/api.js](frontend/src/services/api.js) (lines 83-100)
- **Styling:** [frontend/src/pages/RefereeLoginPage.css](frontend/src/pages/RefereeLoginPage.css)

## Summary

✅ **Referee role added to User model**
✅ **Referee dashboard implemented with categories/fields overview**
✅ **Both admins and referees can login at /referee/login**
✅ **API endpoints integrated for categories and fields**
✅ **Professional UI with responsive design**
✅ **Proper access control and role-based rendering**

The system is now ready for Phase 5 testing with full referee functionality!
