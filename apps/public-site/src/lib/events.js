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
  const fullOptions = { day: 'numeric', month: 'long', year: 'numeric' };

  if (startDate.toDateString() === endDate.toDateString()) {
    return startDate.toLocaleDateString('ro-RO', fullOptions);
  }

  const endLabel = endDate.toLocaleDateString('ro-RO', fullOptions);

  if (startDate.getFullYear() !== endDate.getFullYear()) {
    return `${startDate.toLocaleDateString('ro-RO', fullOptions)} – ${endLabel}`;
  }

  if (startDate.getMonth() !== endDate.getMonth()) {
    return `${startDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })} – ${endLabel}`;
  }

  return `${startDate.toLocaleDateString('ro-RO', { day: 'numeric' })} – ${endLabel}`;
}
