/**
 * Local `YYYY-MM-DD` for `today + offsetDays` on this machine's clock. The
 * sandbox sets no household zone, so this is the day the hub keys chores,
 * meal plans and day notes by.
 */
export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The RFC 5545 weekday code of a `YYYY-MM-DD` day: what an "every week on <that day>" rule names. */
export function weekdayCode(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
