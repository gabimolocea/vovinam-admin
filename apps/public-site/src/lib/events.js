export const EVENT_TYPE_LABELS = {
  competition: 'Competiție',
  examination: 'Examen',
  training_seminar: 'Seminar de pregătire',
};

/** An event can be more than one type at once (e.g. a training seminar
 * that also includes grade examinations) - `event.event_types` is the
 * list to render as badges; `event.event_type` (a single value) is kept
 * as a fallback for any payload shape that doesn't carry the list. */
export function getEventTypeLabels(event) {
  const types = event?.event_types?.length ? event.event_types : [event?.event_type].filter(Boolean);
  return types.map((type) => EVENT_TYPE_LABELS[type] || type);
}

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
