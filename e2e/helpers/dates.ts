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
