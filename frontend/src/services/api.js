/**
 * Comprehensive API Service
 * Maps to all Django REST Framework endpoints from backend/api/urls.py
 * 
 * Backend Models (40 total):
 * - User, Athlete, AthleteActivity
 * - Club, City, Grade, Title, FederationRole
 * - Competition, Event, Category, Group, Match
 * - Team, TeamMember, CategoryTeam, CategoryAthlete
 * - GradeHistory, Visa, SupporterAthleteRelation
 * - RefereeScore, RefereePointEvent
 * - CategoryAthleteScore, CategoryTeamScore, CategoryScoreActivity
 * - TrainingSeminar, TrainingSeminarParticipation
 * - Notification, NotificationSettings
 * - NewsPost, NewsPostGallery, NewsComment
 * - AboutSection, ContactMessage, ContactInfo
 */

import AxiosInstance from '../components/Axios';

// =====================================
// AUTHENTICATION & USER MANAGEMENT
// =====================================

export const authAPI = {
  // User registration
  register: (userData) => AxiosInstance.post('/auth/register/', userData),
  
  // Enhanced registration with role selection
  registerEnhanced: (userData) => AxiosInstance.post('/auth/register-enhanced/', userData),
  
  // Login
  login: (credentials) => AxiosInstance.post('/auth/login/', credentials),
  
  // Logout
  logout: () => AxiosInstance.post('/auth/logout/'),
  
  // Session-based auth
  sessionCheck: () => AxiosInstance.get('/auth/session-check/'),
  sessionLogin: () => AxiosInstance.post('/auth/session-login/'),
  sessionLogout: () => AxiosInstance.post('/auth/session-logout/'),
  
  // JWT token refresh
  refreshToken: (refreshToken) => AxiosInstance.post('/auth/token/refresh/', { refresh: refreshToken }),
  
  // User profile
  getProfile: () => AxiosInstance.get('/auth/profile/'),
  updateProfile: (profileData) => AxiosInstance.put('/auth/profile/', profileData),
  
  // Enhanced profile
  getProfileEnhanced: () => AxiosInstance.get('/auth/profile-enhanced/'),
  updateProfileEnhanced: (profileData) => AxiosInstance.put('/auth/profile-enhanced/', profileData),
};

// =====================================
// CORE ATHLETE MANAGEMENT
// =====================================

export const athleteAPI = {
  // List/Create athletes
  list: (params) => AxiosInstance.get('/athletes/', { params }),
  create: (athleteData) => AxiosInstance.post('/athletes/', athleteData),
  
  // Retrieve/Update/Delete athlete
  get: (id) => AxiosInstance.get(`/athletes/${id}/`),
  update: (id, athleteData) => AxiosInstance.put(`/athletes/${id}/`, athleteData),
  patch: (id, athleteData) => AxiosInstance.patch(`/athletes/${id}/`, athleteData),
  delete: (id) => AxiosInstance.delete(`/athletes/${id}/`),
  
  // My athlete profile (for logged-in users)
  getMyProfile: () => AxiosInstance.get('/athletes/my-profile/'),
  createMyProfile: (profileData) => AxiosInstance.post('/athletes/my-profile/', profileData),
  updateMyProfile: (profileData) => AxiosInstance.put('/athletes/my-profile/', profileData),
  
  // Activity log
  getActivityLog: (athleteId) => AxiosInstance.get(`/athletes/${athleteId}/activity_log/`),
  
  // Approval workflow
  approve: (athleteId) => AxiosInstance.post(`/athletes/${athleteId}/approve/`),
  reject: (athleteId, reason) => AxiosInstance.post(`/athletes/${athleteId}/reject/`, { reason }),
  requestRevision: (athleteId, notes) => AxiosInstance.post(`/athletes/${athleteId}/request_revision/`, { notes }),
};

// =====================================
// REFERENCE DATA (Cities, Clubs, Grades, etc.)
// =====================================

export const referenceAPI = {
  // Cities
  cities: {
    list: (params) => AxiosInstance.get('/cities/', { params }),
    get: (id) => AxiosInstance.get(`/cities/${id}/`),
    create: (cityData) => AxiosInstance.post('/cities/', cityData),
    update: (id, cityData) => AxiosInstance.put(`/cities/${id}/`, cityData),
    delete: (id) => AxiosInstance.delete(`/cities/${id}/`),
  },
  
  // Clubs
  clubs: {
    list: (params) => AxiosInstance.get('/clubs/', { params }),
    get: (id) => AxiosInstance.get(`/clubs/${id}/`),
    create: (clubData) => AxiosInstance.post('/clubs/', clubData),
    update: (id, clubData) => AxiosInstance.put(`/clubs/${id}/`, clubData),
    delete: (id) => AxiosInstance.delete(`/clubs/${id}/`),
  },
  
  // Grades
  grades: {
    list: (params) => AxiosInstance.get('/grades/', { params }),
    get: (id) => AxiosInstance.get(`/grades/${id}/`),
    create: (gradeData) => AxiosInstance.post('/grades/', gradeData),
    update: (id, gradeData) => AxiosInstance.put(`/grades/${id}/`, gradeData),
    delete: (id) => AxiosInstance.delete(`/grades/${id}/`),
  },
  
  // Titles
  titles: {
    list: (params) => AxiosInstance.get('/titles/', { params }),
    get: (id) => AxiosInstance.get(`/titles/${id}/`),
    create: (titleData) => AxiosInstance.post('/titles/', titleData),
    update: (id, titleData) => AxiosInstance.put(`/titles/${id}/`, titleData),
    delete: (id) => AxiosInstance.delete(`/titles/${id}/`),
  },
  
  // Federation Roles
  federationRoles: {
    list: (params) => AxiosInstance.get('/federation-roles/', { params }),
    get: (id) => AxiosInstance.get(`/federation-roles/${id}/`),
    create: (roleData) => AxiosInstance.post('/federation-roles/', roleData),
    update: (id, roleData) => AxiosInstance.put(`/federation-roles/${id}/`, roleData),
    delete: (id) => AxiosInstance.delete(`/federation-roles/${id}/`),
  },
};

// =====================================
// COMPETITIONS & EVENTS
// =====================================

export const competitionAPI = {
  // Competitions
  list: (params) => AxiosInstance.get('/competitions/', { params }),
  get: (id) => AxiosInstance.get(`/competitions/${id}/`),
  create: (competitionData) => AxiosInstance.post('/competitions/', competitionData),
  update: (id, competitionData) => AxiosInstance.put(`/competitions/${id}/`, competitionData),
  delete: (id) => AxiosInstance.delete(`/competitions/${id}/`),
  
  // Categories
  categories: {
    list: (params) => AxiosInstance.get('/categories/', { params }),
    get: (id) => AxiosInstance.get(`/categories/${id}/`),
    create: (categoryData) => AxiosInstance.post('/categories/', categoryData),
    update: (id, categoryData) => AxiosInstance.put(`/categories/${id}/`, categoryData),
    delete: (id) => AxiosInstance.delete(`/categories/${id}/`),
  },
  
  // Groups
  groups: {
    list: (params) => AxiosInstance.get('/groups/', { params }),
    get: (id) => AxiosInstance.get(`/groups/${id}/`),
    create: (groupData) => AxiosInstance.post('/groups/', groupData),
    update: (id, groupData) => AxiosInstance.put(`/groups/${id}/`, groupData),
    delete: (id) => AxiosInstance.delete(`/groups/${id}/`),
  },
  
  // Matches
  matches: {
    list: (params) => AxiosInstance.get('/matches/', { params }),
    get: (id) => AxiosInstance.get(`/matches/${id}/`),
    create: (matchData) => AxiosInstance.post('/matches/', matchData),
    update: (id, matchData) => AxiosInstance.put(`/matches/${id}/`, matchData),
    delete: (id) => AxiosInstance.delete(`/matches/${id}/`),
  },
};

// =====================================
// TEAMS
// =====================================

export const teamAPI = {
  list: (params) => AxiosInstance.get('/teams/', { params }),
  get: (id) => AxiosInstance.get(`/teams/${id}/`),
  create: (teamData) => AxiosInstance.post('/teams/', teamData),
  update: (id, teamData) => AxiosInstance.put(`/teams/${id}/`, teamData),
  delete: (id) => AxiosInstance.delete(`/teams/${id}/`),
  
  // Team members
  addMember: (teamId, athleteId) => AxiosInstance.post(`/teams/${teamId}/add_member/`, { athlete_id: athleteId }),
  removeMember: (teamId, athleteId) => AxiosInstance.post(`/teams/${teamId}/remove_member/`, { athlete_id: athleteId }),
};

// =====================================
// SCORES & RESULTS
// =====================================

export const scoreAPI = {
  // Category Athlete Scores
  categoryAthleteScores: {
    list: (params) => AxiosInstance.get('/category-athlete-score/', { params }),
    get: (id) => AxiosInstance.get(`/category-athlete-score/${id}/`),
    create: (scoreData) => AxiosInstance.post('/category-athlete-score/', scoreData),
    update: (id, scoreData) => AxiosInstance.put(`/category-athlete-score/${id}/`, scoreData),
    delete: (id) => AxiosInstance.delete(`/category-athlete-score/${id}/`),
    
    // Custom actions
    allResults: (params) => AxiosInstance.get('/category-athlete-score/all_results/', { params }),
  },
  
  // Score Activity (audit log)
  categoryScoreActivity: {
    list: (params) => AxiosInstance.get('/category-score-activity/', { params }),
    get: (id) => AxiosInstance.get(`/category-score-activity/${id}/`),
  },
};

// =====================================
// GRADE & SEMINAR SUBMISSIONS
// =====================================

export const submissionAPI = {
  // Grade History Submissions
  gradeSubmissions: {
    list: (params) => AxiosInstance.get('/grade-submissions/', { params }),
    get: (id) => AxiosInstance.get(`/grade-submissions/${id}/`),
    create: (submissionData) => AxiosInstance.post('/grade-submissions/', submissionData),
    update: (id, submissionData) => AxiosInstance.put(`/grade-submissions/${id}/`, submissionData),
    delete: (id) => AxiosInstance.delete(`/grade-submissions/${id}/`),
    
    // Approval actions
    approve: (id) => AxiosInstance.post(`/grade-submissions/${id}/approve/`),
    reject: (id, reason) => AxiosInstance.post(`/grade-submissions/${id}/reject/`, { reason }),
    requestRevision: (id, notes) => AxiosInstance.post(`/grade-submissions/${id}/request_revision/`, { notes }),
  },
  
  // Seminar Submissions
  seminarSubmissions: {
    list: (params) => AxiosInstance.get('/seminar-submissions/', { params }),
    get: (id) => AxiosInstance.get(`/seminar-submissions/${id}/`),
    create: (submissionData) => AxiosInstance.post('/seminar-submissions/', submissionData),
    update: (id, submissionData) => AxiosInstance.put(`/seminar-submissions/${id}/`, submissionData),
    delete: (id) => AxiosInstance.delete(`/seminar-submissions/${id}/`),
    
    // Approval actions
    approve: (id) => AxiosInstance.post(`/seminar-submissions/${id}/approve/`),
    reject: (id, reason) => AxiosInstance.post(`/seminar-submissions/${id}/reject/`, { reason }),
    requestRevision: (id, notes) => AxiosInstance.post(`/seminar-submissions/${id}/request_revision/`, { notes }),
  },
};

// =====================================
// GRADE HISTORY & VISAS
// =====================================

export const recordsAPI = {
  // Grade Histories
  gradeHistories: {
    list: (params) => AxiosInstance.get('/grade-histories/', { params }),
    get: (id) => AxiosInstance.get(`/grade-histories/${id}/`),
    create: (historyData) => AxiosInstance.post('/grade-histories/', historyData),
    update: (id, historyData) => AxiosInstance.put(`/grade-histories/${id}/`, historyData),
    delete: (id) => AxiosInstance.delete(`/grade-histories/${id}/`),
  },
  
  // Medical Visas
  medicalVisas: {
    list: (params) => AxiosInstance.get('/medical-visas/', { params }),
    get: (id) => AxiosInstance.get(`/medical-visas/${id}/`),
    create: (visaData) => AxiosInstance.post('/medical-visas/', visaData),
    update: (id, visaData) => AxiosInstance.put(`/medical-visas/${id}/`, visaData),
    delete: (id) => AxiosInstance.delete(`/medical-visas/${id}/`),
  },
  
  // Annual Visas
  annualVisas: {
    list: (params) => AxiosInstance.get('/annual-visas/', { params }),
    get: (id) => AxiosInstance.get(`/annual-visas/${id}/`),
    create: (visaData) => AxiosInstance.post('/annual-visas/', visaData),
    update: (id, visaData) => AxiosInstance.put(`/annual-visas/${id}/`, visaData),
    delete: (id) => AxiosInstance.delete(`/annual-visas/${id}/`),
  },
};

// =====================================
// TRAINING SEMINARS
// =====================================

export const seminarAPI = {
  list: (params) => AxiosInstance.get('/training-seminars/', { params }),
  get: (id) => AxiosInstance.get(`/training-seminars/${id}/`),
  create: (seminarData) => AxiosInstance.post('/training-seminars/', seminarData),
  update: (id, seminarData) => AxiosInstance.put(`/training-seminars/${id}/`, seminarData),
  delete: (id) => AxiosInstance.delete(`/training-seminars/${id}/`),
  
  // Participation
  enroll: (seminarId, athleteId) => AxiosInstance.post(`/training-seminars/${seminarId}/enroll/`, { athlete_id: athleteId }),
};

// =====================================
// SUPPORTER RELATIONSHIPS
// =====================================

export const supporterAPI = {
  list: (params) => AxiosInstance.get('/supporter-athlete-relations/', { params }),
  get: (id) => AxiosInstance.get(`/supporter-athlete-relations/${id}/`),
  create: (relationData) => AxiosInstance.post('/supporter-athlete-relations/', relationData),
  update: (id, relationData) => AxiosInstance.put(`/supporter-athlete-relations/${id}/`, relationData),
  delete: (id) => AxiosInstance.delete(`/supporter-athlete-relations/${id}/`),
};

// =====================================
// NOTIFICATIONS
// =====================================

export const notificationAPI = {
  // Notifications
  list: (params) => AxiosInstance.get('/notifications/', { params }),
  get: (id) => AxiosInstance.get(`/notifications/${id}/`),
  markRead: (id) => AxiosInstance.post(`/notifications/${id}/mark_read/`),
  markAllRead: () => AxiosInstance.post('/notifications/mark_all_read/'),
  markSelectedRead: (ids) => AxiosInstance.post('/notifications/mark_selected_read/', { notification_ids: ids }),
  unreadCount: () => AxiosInstance.get('/notifications/unread_count/'),
  
  // Notification Settings
  settings: {
    get: () => AxiosInstance.get('/notification-settings/my_settings/'),
    update: (settingsData) => AxiosInstance.put('/notification-settings/my_settings/', settingsData),
  },
};

// =====================================
// ADMIN & APPROVALS
// =====================================

export const adminAPI = {
  pendingApprovals: () => AxiosInstance.get('/admin-approvals/pending/'),
  processApplication: (profileId, action, notes) => 
    AxiosInstance.post(`/athlete-profiles/${profileId}/process_application/`, { action, notes }),
};

// =====================================
// COACHES
// =====================================

export const coachAPI = {
  list: (params) => AxiosInstance.get('/coaches/', { params }),
  get: (id) => AxiosInstance.get(`/coaches/${id}/`),
  create: (coachData) => AxiosInstance.post('/coaches/', coachData),
  update: (id, coachData) => AxiosInstance.put(`/coaches/${id}/`, coachData),
  delete: (id) => AxiosInstance.delete(`/coaches/${id}/`),
};

// =====================================
// PUBLIC ENDPOINTS (Landing App)
// =====================================

export const publicAPI = {
  // News
  news: {
    list: () => fetch('http://127.0.0.1:8000/landing/news/').then(r => r.json()),
    get: (id) => fetch(`http://127.0.0.1:8000/landing/news/${id}/`).then(r => r.json()),
  },
  
  // Events (from landing app)
  events: {
    list: () => fetch('http://127.0.0.1:8000/landing/events/').then(r => r.json()),
    get: (id) => fetch(`http://127.0.0.1:8000/landing/events/${id}/`).then(r => r.json()),
  },
  
  // About
  about: {
    get: () => fetch('http://127.0.0.1:8000/landing/about/').then(r => r.json()),
  },
  
  // Contact
  contact: {
    submit: (messageData) => fetch('http://127.0.0.1:8000/landing/contact/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageData),
    }).then(r => r.json()),
  },
};

// =====================================
// EXPORT ALL
// =====================================

export default {
  auth: authAPI,
  athlete: athleteAPI,
  reference: referenceAPI,
  competition: competitionAPI,
  team: teamAPI,
  score: scoreAPI,
  submission: submissionAPI,
  records: recordsAPI,
  seminar: seminarAPI,
  supporter: supporterAPI,
  notification: notificationAPI,
  admin: adminAPI,
  coach: coachAPI,
  public: publicAPI,
};
