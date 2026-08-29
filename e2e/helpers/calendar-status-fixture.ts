/**
 * A `/api/calendar` payload with one healthy source next to one failing
 * source (the E2E stand-in for a dead ICS URL beside a live feed). Shared by
 * the display and editor specs so both surfaces are asserted against the
 * same body: the failing source gets an amber-ringed legend entry, a named
 * header pill, and a "saved" suffix on its rows; healthy rows are untouched.
 */
export function sourceStatusBody() {
  // Same today-spanning shape as todayCalendarEvents(): always on today's
  // date and always "upcoming", whatever wall-clock time the suite runs at.
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date, h: number, m: number) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sinceMs = new Date().setHours(7, 10, 0, 0);
  return {
    events: [
      { id: 'ok-1', title: 'Healthy Event', start: iso(today, 0, 1), end: iso(tomorrow, 23, 59), allDay: false, calendarColor: '#3B82F6', sourceId: 'family', sourceName: 'Family' },
      { id: 'bad-1', title: 'Saved Event', start: iso(today, 0, 2), end: iso(tomorrow, 23, 59), allDay: false, calendarColor: '#6366F1', sourceId: 'school', sourceName: 'School' },
    ],
    sourceStatus: [
      { id: 'family', name: 'Family', ok: true, fetchedAt: Date.now() },
      { id: 'school', name: 'School', ok: false, error: 'Could not reach the link (HTTP 404)', fetchedAt: sinceMs },
    ],
  };
}
