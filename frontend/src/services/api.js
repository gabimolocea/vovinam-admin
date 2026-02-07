import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration
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
  getCompetitionFields: (eventId) => api.get(`/events/${eventId}/fields/`),
};

export const adminAPI = {
  createField: (eventId, data) =>
    api.post(`/competition-fields/`, { event: eventId, ...data }),
  updateFieldAssignment: (categoryId, data) =>
    api.put(`/category-field-assignments/${categoryId}/`, data),
  generateQRCodes: (categoryId, matchId) =>
    api.post('/qr-code-assignments/', { category_id: categoryId, match_id: matchId }),
  getCompetitionResults: (eventId) =>
    api.get(`/events/${eventId}/results/`),
  getCategories: (eventId) =>
    api.get(`/events/${eventId}/categories/`),
  getMatches: (categoryId) =>
    api.get(`/categories/${categoryId}/matches/`),
  assignReferees: (categoryId, data) =>
    api.post(`/categories/${categoryId}/assign-referees/`, data),
};

export const competitionAPI = {
  list: () => api.get('/competitions/'),
  get: (id) => api.get(`/competitions/${id}/`),
  create: (data) => api.post('/competitions/', data),
  update: (id, data) => api.put(`/competitions/${id}/`, data),
  delete: (id) => api.delete(`/competitions/${id}/`),
  getFields: (eventId) => api.get(`/competitions/${eventId}/fields/`),
  getCategories: (eventId) => api.get(`/competitions/${eventId}/categories/`),
  getResults: (eventId) => api.get(`/competitions/${eventId}/results/`),
};

export const fieldAPI = {
  list: () => api.get('/competition-fields/'),
  get: (id) => api.get(`/competition-fields/${id}/`),
  create: (data) => api.post('/competition-fields/', data),
  update: (id, data) => api.put(`/competition-fields/${id}/`, data),
  delete: (id) => api.delete(`/competition-fields/${id}/`),
};

export default api;
