// Shared between CompetitionCentralizator.jsx and AdminCentralizatorMatrix.jsx -
// kept in its own module (not exported from the page) to avoid a circular
// import between the page and the component it renders.
export const GENDER_LABELS = { male: 'MASCULIN', female: 'FEMININ', mixt: 'MIXT' };
export const GENDER_BG     = { male: 'bg-blue-500/10', female: 'bg-pink-500/10', mixt: 'bg-amber-500/10' };
export const TYPE_LABELS   = { solo: 'Solo', team: 'Echipă', teams: 'Echipă', fight: 'Luptă' };
export const isTeamCategoryType = (type) => type === 'team' || type === 'teams';
