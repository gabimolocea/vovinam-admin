// Deprecated: This file is intentionally left blank after migration to apis.js. Safe to delete.
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

