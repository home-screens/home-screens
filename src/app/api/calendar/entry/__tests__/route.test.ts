import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ requireDisplayAuth: vi.fn(), requireSession: vi.fn() }));
vi.mock('@/lib/calendar-event-writes', () => ({
  calendarEntryInfo: vi.fn(async () => ({ enabled: true, google: 'ready', calendars: [{ id: 'family', name: 'Family', color: '#4073ff', source: 'google' }], defaultCalendarId: 'family', defaultMinutes: 60, timezone: 'America/Chicago', wallDefault: true })),
}));

describe('GET /api/calendar/entry', () => {
  it('answers what the forms offer', async () => {
    const { GET } = await import('@/app/api/calendar/entry/route');
    const res = await GET(new NextRequest('http://localhost/api/calendar/entry'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enabled: true, google: 'ready', defaultCalendarId: 'family', calendars: [{ id: 'family' }] });
  });
});
