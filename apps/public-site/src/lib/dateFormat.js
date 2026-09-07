/** Formats/parses a date between the Romanian dd.mm.aaaa display format
 * used in onboarding forms and the ISO yyyy-mm-dd format the backend/API
 * expects. */

export function formatIsoToDisplay(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}.${month}.${year}`;
}

/** Converts free-typed text into the dd.mm.aaaa mask as the user types,
 * inserting dots automatically after day/month segments. */
export function maskDateInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join('.');
}

/** Returns the ISO yyyy-mm-dd string for a complete dd.mm.aaaa value, or
 * null if the value isn't a complete, valid calendar date yet. */
export function displayToIso(value) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value || '');
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const isValid = date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day);
  return isValid ? `${year}-${month}-${day}` : null;
}
