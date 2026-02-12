import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests (always as Bearer)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token && typeof token === 'string' && token.length > 0) {
    config.headers['Authorization'] = `Bearer ${token}`;
  // This file is intentionally left as a stub after migration to apis.js in club-enrollment.
  // Remove this file if you are sure no code references it.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userRole');
      window.location.href = '/referee/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
  logout: () => api.post('/auth/logout/'),
  getCurrentUser: () => api.get('/auth/me/'),
  verifyQRCode: (code) => api.get(`/qr-code/${code}/`),
};

export const refereeAPI = {
  getAssignedCategories: () => api.get('/referees/me/assigned-categories/'),
  getAssignedMatches: () => api.get('/referees/me/assigned-matches/'),
  getCategory: (id) => api.get(`/categories/${id}/`),
  getMatch: (id) => api.get(`/matches/${id}/`),
  getCategoryScores: (categoryId) => api.get(`/categories/${categoryId}/scores/`),
  getMatchScores: (matchId) => api.get(`/matches/${matchId}/scores/`),
  submitCategoryScore: (athleteScoreId, deductions) =>
    api.post('/category-referee-scores/', { athlete_score_id: athleteScoreId, deductions }),
  submitMatchScore: (matchId, roundNumber, redScore, blueScore) =>
    api.post('/match-referee-scores/', { match_id: matchId, round_number: roundNumber, red_score: redScore, blue_score: blueScore }),
  submitWinnerSelection: (matchId, winner) =>
    api.post('/match-winner-selection/', { match_id: matchId, winner }),
};

export const monitorAPI = {
  getField: (id) => api.get(`/competition-fields/${id}/`),
  getFieldSession: (fieldId) => api.get(`/display-monitor-sessions/field/${fieldId}/`),
  updateFieldSession: (fieldId, data) =>
    api.put(`/display-monitor-sessions/field/${fieldId}/`, data),
  getCompetition: (id) => api.get(`/events/${id}/`),
  getCompetitionFields: (eventId) => api.get('/competition-fields/', { params: { event_id: eventId } }),
};

export const adminAPI = {
  createField: (eventId, data) =>
    api.post(`/competition-fields/`, { event: eventId, ...data }),
  updateFieldAssignment: (categoryId, data) =>
    api.put(`/category-field-assignments/${categoryId}/`, data),
  generateQRCodes: (categoryId, matchId) =>
    api.post('/qr-code-assignments/', { category_id: categoryId, match_id: matchId }),
  getCompetitionResults: (eventId) =>
    api.get('/category-athlete-score/', { params: { event_id: eventId } }),
  getCategories: (eventId) =>
    api.get('/categories/', { params: { event: eventId } }),
  getMatches: (categoryId) =>
    api.get('/matches/', { params: { category_id: categoryId } }),
  listReferees: () => api.get('/athletes/', { params: { is_referee: true } }),
  getEventStats: (eventId) => api.get(`/events/${eventId}/stats/`),
};

export const competitionAPI = {
  listEvents: () => api.get('/events/'),
  listFields: (eventId) => api.get('/competition-fields/', { params: { event_id: eventId } }),
  list: () => api.get('/events/'),
  get: (id) => api.get(`/events/${id}/`),
  create: (data) => api.post('/events/', data),
  update: (id, data) => api.put(`/events/${id}/`, data),
  delete: (id) => api.delete(`/events/${id}/`),
  getFields: (eventId) => api.get('/competition-fields/', { params: { event_id: eventId } }),
  getCategories: (eventId) => api.get('/categories/', { params: { event: eventId } }),
  getResults: (eventId) => api.get(`/events/${eventId}/results/`),
  createEvent: (data) => api.post('/events/', data),
  createField: (data) => api.post('/competition-fields/', data),
  listCategories: (eventId) => api.get('/categories/', { params: { event: eventId } }),
  listAssignments: (eventId) => api.get('/category-field-assignments/', { params: { event_id: eventId } }),
  createAssignment: (data) => api.post('/category-field-assignments/', data),
};


// Named export for fieldAPI (do not use default import for this)
export const fieldAPI = {
  list: () => api.get('/competition-fields/'),
  get: (id) => api.get(`/competition-fields/${id}/`),
  create: (data) => api.post('/competition-fields/', data),
  update: (id, data) => api.put(`/competition-fields/${id}/`, data),
  delete: (id) => api.delete(`/competition-fields/${id}/`),
};

// Default export for raw axios instance (not for API groups)
export default api;
