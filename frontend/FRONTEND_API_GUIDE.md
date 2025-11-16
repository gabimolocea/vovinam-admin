# Frontend API Integration Guide

This document describes how the frontend integrates with the Django REST backend.

## Environment Configuration

The frontend uses environment variables for API configuration. These are defined in `.env.development` and `.env.production`.

### Available Environment Variables

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000/api  # API base URL
VITE_BACKEND_URL=http://127.0.0.1:8000       # Backend base URL for media files
```

### Using Environment Variables

```javascript
import { getApiBaseUrl, getBackendUrl, getMediaUrl } from '@/utils/env';

// Get API base URL
const apiUrl = getApiBaseUrl(); // http://127.0.0.1:8000/api

// Get backend URL
const backendUrl = getBackendUrl(); // http://127.0.0.1:8000

// Get full media URL from relative path
const imageUrl = getMediaUrl('/media/profile_images/image.jpg');
// Returns: http://127.0.0.1:8000/media/profile_images/image.jpg
```

## API Service Layer

The frontend provides a comprehensive API service layer in `src/services/api.js` that maps to all backend Django REST Framework endpoints.

### Import the API Service

```javascript
import api from '@/services/api';
// OR import specific modules
import { athleteAPI, competitionAPI, authAPI } from '@/services/api';
```

### Authentication

```javascript
// Register new user
const userData = {
  username: 'johndoe',
  email: 'john@example.com',
  password: 'securepass',
  password_confirm: 'securepass',
  first_name: 'John',
  last_name: 'Doe',
  role: 'athlete'
};
const response = await api.auth.registerEnhanced(userData);

// Login
const credentials = { email: 'john@example.com', password: 'securepass' };
const loginResponse = await api.auth.login(credentials);

// Get user profile
const profile = await api.auth.getProfileEnhanced();

// Logout
await api.auth.logout();
```

### Athlete Management

```javascript
// List athletes with filters
const athletes = await api.athlete.list({ club: 1, is_active: true });

// Get athlete details
const athlete = await api.athlete.get(athleteId);

// Create new athlete
const newAthlete = await api.athlete.create(athleteData);

// Update athlete
const updated = await api.athlete.update(athleteId, athleteData);

// Get my athlete profile (for logged-in users)
const myProfile = await api.athlete.getMyProfile();

// Activity log
const activities = await api.athlete.getActivityLog(athleteId);

// Approval workflow
await api.athlete.approve(athleteId);
await api.athlete.reject(athleteId, 'Reason for rejection');
await api.athlete.requestRevision(athleteId, 'Please update medical certificate');
```

### Reference Data

```javascript
// Cities
const cities = await api.reference.cities.list();
const city = await api.reference.cities.get(cityId);

// Clubs
const clubs = await api.reference.clubs.list({ city: 1 });
const club = await api.reference.clubs.get(clubId);

// Grades
const grades = await api.reference.grades.list();

// Titles
const titles = await api.reference.titles.list();

// Federation Roles
const roles = await api.reference.federationRoles.list();
```

### Competitions & Events

```javascript
// Competitions
const competitions = await api.competition.list({ status: 'upcoming' });
const competition = await api.competition.get(competitionId);
await api.competition.create(competitionData);

// Categories
const categories = await api.competition.categories.list({ competition: 1 });
const category = await api.competition.categories.get(categoryId);

// Groups
const groups = await api.competition.groups.list({ category: 1 });

// Matches
const matches = await api.competition.matches.list({ category: 1 });
```

### Teams

```javascript
// List teams
const teams = await api.team.list();

// Create team
const newTeam = await api.team.create({ name: 'Team A', club: 1 });

// Add member
await api.team.addMember(teamId, athleteId);

// Remove member
await api.team.removeMember(teamId, athleteId);
```

### Scores & Results

```javascript
// List scores
const scores = await api.score.categoryAthleteScores.list({ category: 1 });

// Create score
const newScore = await api.score.categoryAthleteScores.create({
  category: 1,
  athlete: 10,
  placement: 1,
  points: 100
});

// Get all results for an athlete
const allResults = await api.score.categoryAthleteScores.allResults({ athlete_id: 10 });

// View score activity log
const activities = await api.score.categoryScoreActivity.list({ score: 1 });
```

### Submissions (Grade & Seminar)

```javascript
// Grade submissions
const gradeSubmissions = await api.submission.gradeSubmissions.list({ athlete: 10 });
await api.submission.gradeSubmissions.approve(submissionId);
await api.submission.gradeSubmissions.reject(submissionId, 'Reason');
await api.submission.gradeSubmissions.requestRevision(submissionId, 'Notes');

// Seminar submissions
const seminarSubmissions = await api.submission.seminarSubmissions.list({ athlete: 10 });
await api.submission.seminarSubmissions.approve(submissionId);
await api.submission.seminarSubmissions.reject(submissionId, 'Reason');
```

### Records (Grade History & Visas)

```javascript
// Grade histories
const gradeHistories = await api.records.gradeHistories.list({ athlete: 10 });

// Medical visas
const medicalVisas = await api.records.medicalVisas.list({ athlete: 10 });

// Annual visas
const annualVisas = await api.records.annualVisas.list({ athlete: 10, year: 2024 });
```

### Training Seminars

```javascript
// List seminars
const seminars = await api.seminar.list({ is_published: true });

// Get seminar details
const seminar = await api.seminar.get(seminarId);

// Enroll athlete
await api.seminar.enroll(seminarId, athleteId);
```

### Notifications

```javascript
// List notifications
const notifications = await api.notification.list();

// Mark as read
await api.notification.markRead(notificationId);

// Mark all as read
await api.notification.markAllRead();

// Mark selected as read
await api.notification.markSelectedRead([1, 2, 3]);

// Unread count
const { count } = await api.notification.unreadCount();

// Notification settings
const settings = await api.notification.settings.get();
await api.notification.settings.update({ email_on_approval: true });
```

### Admin Functions

```javascript
// Get pending approvals
const pending = await api.admin.pendingApprovals();

// Process application
await api.admin.processApplication(profileId, 'approve', 'Approved by admin');
```

### Public Content (Landing App)

```javascript
// News
const newsPosts = await api.public.news.list();
const post = await api.public.news.get(postId);

// Events
const events = await api.public.events.list();
const event = await api.public.events.get(eventId);

// About
const about = await api.public.about.get();

// Contact
await api.public.contact.submit({
  name: 'John Doe',
  email: 'john@example.com',
  subject: 'Question',
  message: 'How can I register?'
});
```

## Authentication Flow

The frontend uses JWT authentication with automatic token refresh.

### AuthContext

The `AuthContext` provides authentication state and methods:

```javascript
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, loading, login, logout } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      {user ? (
        <>
          <p>Welcome, {user.first_name}!</p>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <button onClick={() => login({ email, password })}>Login</button>
      )}
    </div>
  );
}
```

### Axios Interceptors

The frontend automatically:
- Adds JWT token to request headers
- Refreshes expired tokens
- Redirects to login on 401 errors

## Type Definitions

TypeScript type definitions for all backend models are available in `src/types/api.types.js`.

```javascript
import type { Athlete, Competition, Category } from '@/types/api.types';

const athlete: Athlete = {
  id: 1,
  first_name: 'John',
  last_name: 'Doe',
  // ... other fields
};
```

## Error Handling

All API calls should be wrapped in try-catch blocks:

```javascript
try {
  const athlete = await api.athlete.get(athleteId);
  console.log(athlete);
} catch (error) {
  if (error.response) {
    // Server responded with error
    console.error('Error:', error.response.data);
    if (error.response.status === 404) {
      console.error('Athlete not found');
    }
  } else {
    // Network error
    console.error('Network error:', error.message);
  }
}
```

## File Uploads

For endpoints that accept files (e.g., profile images, certificates), use FormData:

```javascript
const formData = new FormData();
formData.append('first_name', 'John');
formData.append('last_name', 'Doe');
formData.append('profile_image', fileObject);

const athlete = await api.athlete.create(formData);
```

## Pagination

List endpoints return paginated results:

```javascript
const response = await api.athlete.list({ page: 1, page_size: 20 });
console.log(response.count);      // Total count
console.log(response.results);    // Array of athletes
console.log(response.next);       // URL for next page
console.log(response.previous);   // URL for previous page
```

## Filtering & Searching

Most list endpoints support filtering:

```javascript
// Filter athletes by club and active status
const athletes = await api.athlete.list({
  club: 1,
  is_active: true,
  search: 'john',
  ordering: '-created_at'
});

// Filter competitions by date range
const competitions = await api.competition.list({
  start_date__gte: '2024-01-01',
  end_date__lte: '2024-12-31',
  status: 'upcoming'
});
```

## Backend API Endpoints

All available endpoints are documented in `BACKEND_ANALYSIS.md`. The main categories are:

- **Authentication**: `/api/auth/*`
- **Athletes**: `/api/athletes/`
- **Clubs**: `/api/clubs/`
- **Cities**: `/api/cities/`
- **Competitions**: `/api/competitions/`
- **Categories**: `/api/categories/`
- **Teams**: `/api/teams/`
- **Scores**: `/api/category-athlete-score/`
- **Seminars**: `/api/training-seminars/`
- **Notifications**: `/api/notifications/`
- **Landing**: `/landing/news/`, `/landing/events/`, etc.

## Development vs Production

### Development
- API: `http://127.0.0.1:8000/api`
- Frontend: `http://localhost:5173`
- CORS enabled for local ports

### Production
- API: `/api` (relative path)
- Update `.env.production` with production URLs
- Configure CORS in `backend/crud/settings.py`

## Testing

Example test for API service:

```javascript
import { render, waitFor } from '@testing-library/react';
import api from '@/services/api';

test('fetches athletes', async () => {
  const athletes = await api.athlete.list();
  expect(athletes.results).toBeDefined();
  expect(Array.isArray(athletes.results)).toBe(true);
});
```

## Migration from Old Code

If you're migrating from direct fetch/axios calls:

### Before
```javascript
const response = await fetch('http://127.0.0.1:8000/api/athletes/');
const data = await response.json();
```

### After
```javascript
import api from '@/services/api';
const data = await api.athlete.list();
```

### Before
```javascript
const response = await AxiosInstance.get(`athletes/${id}/`);
const athlete = response.data;
```

### After
```javascript
import api from '@/services/api';
const athlete = await api.athlete.get(id);
```

## Resources

- **Backend Documentation**: `BACKEND_ANALYSIS.md`
- **Database Schema**: `DATABASE_SCHEMA.md`
- **API Service**: `src/services/api.js`
- **Type Definitions**: `src/types/api.types.js`
- **Environment Config**: `src/utils/env.js`
- **Axios Instance**: `src/components/Axios.jsx`
