export const EVENT_TYPE_LABELS = {
  competition: 'Competiție',
  examination: 'Examen',
  training_seminar: 'Seminar de pregătire',
};

export const STATUS_LABELS = {
  upcoming: 'Viitor',
  ongoing: 'În desfășurare',
  past: 'Încheiat',
};

export function formatEventDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const startLabel = startDate.toLocaleDateString('ro-RO', options);
  const endLabel = endDate.toLocaleDateString('ro-RO', options);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}
