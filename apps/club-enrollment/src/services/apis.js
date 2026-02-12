import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

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
	} else {
		delete config.headers['Authorization'];
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
	list: () => api.get('/landing/events/'),
	get: (id) => api.get(`/landing/events/${id}/`),
	listByStatus: (status) => api.get('/landing/events/', { params: { status } }),
	create: (data) => api.post('/landing/events/', data),
	update: (id, data) => api.put(`/landing/events/${id}/`, data),
	delete: (id) => api.delete(`/landing/events/${id}/`),
};

export const athleteAPI = {
	list: () => api.get('/athletes/'),
	get: (id) => api.get(`/athletes/${id}/`),
	getClubAthletes: (clubId) => api.get(`/athletes/?club=${clubId}`),
	getAnnualVisas: (athleteId) => api.get(`/annual-visas/?athlete=${athleteId}`),
	getMedicalVisas: (athleteId) => api.get(`/medical-visas/?athlete=${athleteId}`),
};

export const categoryAPI = {
	getEventCategories: (eventId) => api.get(`/categories/?event=${eventId}`),
	get: (id) => api.get(`/categories/${id}/`),
};

export const categoryAthleteAPI = {
	list: () => api.get('/category-athletes/'),
	create: (data) => api.post('/category-athletes/', data),
	delete: (id) => api.delete(`/category-athletes/${id}/`),
	getByCategory: (categoryId) => api.get(`/category-athletes/?category=${categoryId}`),
};

export const teamAPI = {
	list: () => api.get('/teams/'),
	create: (data) => api.post('/teams/', data),
	get: (id) => api.get(`/teams/${id}/`),
	getClubTeams: (clubId) => api.get(`/teams/?club=${clubId}`),
};

export const teamMemberAPI = {
	create: (data) => api.post('/team-members/', data),
	list: (teamId) => api.get(`/team-members/?team_id=${teamId}`),
	delete: (id) => api.delete(`/team-members/${id}/`),
};

export const categoryTeamAPI = {
	list: () => api.get('/category-teams/'),
	create: (data) => api.post('/category-teams/', data),
	delete: (id) => api.delete(`/category-teams/${id}/`),
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
