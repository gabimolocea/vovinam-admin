// Shared helpers for athlete-related public pages (Sportivi list, club
// detail "Sportivi" tab, athlete detail page).

export const ATHLETE_STATUS_LABELS = {
  approved: 'Activ',
  pending: 'În așteptare',
  rejected: 'Respins',
  revision_required: 'Necesită revizuire',
};

export function medalSummary(medals) {
  if (!medals) return '—';
  const { gold = 0, silver = 0, bronze = 0 } = medals;
  if (!gold && !silver && !bronze) return '—';
  return `🥇 ${gold}  🥈 ${silver}  🥉 ${bronze}`;
}
