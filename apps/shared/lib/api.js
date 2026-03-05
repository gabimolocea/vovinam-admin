import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
    }
    return Promise.reject(err);
  },
);

export default api;

// ── Auth ──────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
  logout: () => api.post('/auth/logout/'),
  me: () => api.get('/auth/me/'),
  sessionCheck: () => api.get('/auth/session-check/'),
  register: (data) => api.post('/auth/register-enhanced/', data),
};

// ── Competitions / Events ─────────────────────────────
export const competitionAPI = {
  list: (params) => api.get('/competitions/', { params }),
  get: (id) => api.get(`/competitions/${id}/`),
  create: (data) => api.post('/competitions/', data),
  update: (id, data) => api.patch(`/competitions/${id}/`, data),
  delete: (id) => api.delete(`/competitions/${id}/`),
  stats: (id) => api.get(`/competitions/${id}/stats/`),
};

// ── Categories ────────────────────────────────────────
export const categoryAPI = {
  list: (params) => api.get('/categories/', { params }),
  get: (id) => api.get(`/categories/${id}/`),
  create: (data) => api.post('/categories/', data),
  update: (id, data) => api.patch(`/categories/${id}/`, data),
  delete: (id) => api.delete(`/categories/${id}/`),
  bulkAdd: (eventId, categories) => api.post('/categories/bulk-add/', { event_id: eventId, categories }),
  reorder: (order) => api.post('/categories/reorder/', { order }),
};

// ── Groups ────────────────────────────────────────────
export const groupAPI = {
  list: (params) => api.get('/groups/', { params }),
  create: (data) => api.post('/groups/', data),
  update: (id, data) => api.put(`/groups/${id}/`, data),
  delete: (id) => api.delete(`/groups/${id}/`),
  reorder: (order) => api.post('/groups/reorder/', { order }),
};

// ── Athletes ──────────────────────────────────────────
export const athleteAPI = {
  list: (params) => api.get('/athletes/', { params }),
  get: (id) => api.get(`/athletes/${id}/`),
  create: (data) => api.post('/athletes/', data),
  update: (id, data) => api.patch(`/athletes/${id}/`, data),
  myProfile: () => api.get('/athletes/my-profile/'),
  approve: (id) => api.post(`/athletes/${id}/approve/`),
  process: (id, data) => api.post(`/athletes/${id}/process_application/`, data),
};

// ── Clubs ─────────────────────────────────────────────
export const clubAPI = {
  list: () => api.get('/clubs/'),
  get: (id) => api.get(`/clubs/${id}/`),
  reorder: (order) => api.post('/clubs/reorder/', { order }),
};

// ── Grades ────────────────────────────────────────────
export const gradeAPI = {
  list: () => api.get('/grades/'),
};

// ── Coaches ───────────────────────────────────────────
export const coachAPI = {
  list: (params) => api.get('/coaches/', { params }),
};

// ── Enrollment ────────────────────────────────────────
export const enrollmentAPI = {
  categoryAthletes: {
    list: (params) => api.get('/category-athletes/', { params }),
    create: (data) => api.post('/category-athletes/', data),
    update: (id, data) => api.patch(`/category-athletes/${id}/`, data),
    delete: (id) => api.delete(`/category-athletes/${id}/`),
  },
  categoryTeams: {
    list: (params) => api.get('/category-teams/', { params }),
    create: (data) => api.post('/category-teams/', data),
    delete: (id) => api.delete(`/category-teams/${id}/`),
  },
  eventEnrollments: {
    create: (data) => api.post('/event-enrollments/', data),
    delete: (id) => api.delete(`/event-enrollments/${id}/`),
  },
};

// ── Teams ─────────────────────────────────────────────
export const teamAPI = {
  list: (params) => api.get('/teams/', { params }),
  create: (data) => api.post('/teams/', data),
  get: (id) => api.get(`/teams/${id}/`),
  members: {
    list: (params) => api.get('/team-members/', { params }),
    create: (data) => api.post('/team-members/', data),
    delete: (id) => api.delete(`/team-members/${id}/`),
  },
};

// ── Matches ───────────────────────────────────────────
export const matchAPI = {
  list: (params) => api.get('/matches/', { params }),
  get: (id) => api.get(`/matches/${id}/`),
  create: (data) => api.post('/matches/', data),
  update: (id, data) => api.patch(`/matches/${id}/`, data),
};

// ── Fields / Tatamis ──────────────────────────────────
export const fieldAPI = {
  list: (params) => api.get('/competition-fields/', { params }),
  get: (id) => api.get(`/competition-fields/${id}/`),
  create: (data) => api.post('/competition-fields/', data),
  update: (id, data) => api.patch(`/competition-fields/${id}/`, data),
  delete: (id) => api.delete(`/competition-fields/${id}/`),
  setCount: (eventId, count) => api.post('/competition-fields/set-count/', { event_id: eventId, count }),
  assignments: {
    list: (params) => api.get('/category-field-assignments/', { params }),
    create: (data) => api.post('/category-field-assignments/', data),
    update: (id, data) => api.patch(`/category-field-assignments/${id}/`, data),
    delete: (id) => api.delete(`/category-field-assignments/${id}/`),
  },
};

// ── Referee Scoring ───────────────────────────────────
export const refereeAPI = {
  assignedCategories: () => api.get('/referees/me/assigned-categories/'),
  assignedMatches: () => api.get('/referees/me/assigned-matches/'),
  categoryScores: {
    list: (params) => api.get('/category-referee-score/', { params }),
    create: (data) => api.post('/category-referee-score/', data),
    update: (id, data) => api.patch(`/category-referee-score/${id}/`, data),
  },
  pointEvents: {
    list: (matchId) => api.get(`/clubs/${matchId}/point_events/`),
    create: (matchId, data) => api.post(`/clubs/${matchId}/point_events/`, data),
  },
};

// ── Scores / Results ──────────────────────────────────
export const scoreAPI = {
  list: (params) => api.get('/category-athlete-score/', { params }),
  get: (id) => api.get(`/category-athlete-score/${id}/`),
  create: (data) => api.post('/category-athlete-score/', data),
  approve: (id, data) => api.post(`/category-athlete-score/${id}/approve/`, data),
  reject: (id, data) => api.post(`/category-athlete-score/${id}/reject/`, data),
  pendingReview: () => api.get('/category-athlete-score/pending_review/'),
  myResults: () => api.get('/category-athlete-score/my_results/'),
};

// ── Monitor / Display ─────────────────────────────────
export const monitorAPI = {
  sessions: {
    list: (params) => api.get('/monitor-sessions/', { params }),
    get: (id) => api.get(`/monitor-sessions/${id}/`),
    update: (id, data) => api.patch(`/monitor-sessions/${id}/`, data),
    create: (data) => api.post('/monitor-sessions/', data),
  },
};

// ── Match Rounds ──────────────────────────────────────
export const roundAPI = {
  list: (params) => api.get('/match-rounds/', { params }),
  create: (data) => api.post('/match-rounds/', data),
  update: (id, data) => api.patch(`/match-rounds/${id}/`, data),
};

// ── Visas ─────────────────────────────────────────────
export const visaAPI = {
  annual: {
    list: (params) => api.get('/annual-visas/', { params }),
    create: (data) => api.post('/annual-visas/', data),
  },
  medical: {
    list: (params) => api.get('/medical-visas/', { params }),
    create: (data) => api.post('/medical-visas/', data),
  },
};

// ── Grade History ─────────────────────────────────────
export const gradeHistoryAPI = {
  list: (params) => api.get('/grade-histories/', { params }),
  submissions: {
    list: (params) => api.get('/grade-submissions/', { params }),
    create: (data) => api.post('/grade-submissions/', data),
    approve: (id, data) => api.post(`/grade-submissions/${id}/approve/`, data),
    reject: (id, data) => api.post(`/grade-submissions/${id}/reject/`, data),
  },
};

// ── Notifications ─────────────────────────────────────
export const notificationAPI = {
  list: () => api.get('/notifications/'),
  unreadCount: () => api.get('/notifications/unread_count/'),
  markRead: (id) => api.post(`/notifications/${id}/mark_read/`),
  markAllRead: () => api.post('/notifications/mark_all_read/'),
};
