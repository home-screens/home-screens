import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ requireDisplayAuth: vi.fn(), requireSession: vi.fn() }));
const eventForEdit = vi.fn();
const changeEvent = vi.fn();
const removeEvent = vi.fn();
vi.mock('@/lib/calendar-event-writes', () => ({
  eventForEdit: (...a: unknown[]) => eventForEdit(...a),
  changeEvent: (...a: unknown[]) => changeEvent(...a),
  removeEvent: (...a: unknown[]) => removeEvent(...a),
}));
let gate: Response | null = null;
const requireGrownUp = vi.fn(async () => gate);
vi.mock('@/lib/grown-up-gate', () => ({ requireGrownUp: (...a: unknown[]) => requireGrownUp(...(a as [])) }));

const ID = 'family%40group.calendar.google.com%3Aev1';
const ctx = { params: Promise.resolve({ id: 'family@group.calendar.google.com:ev1' }) };
const req = (method: string, body?: unknown, query = '') => new NextRequest(`http://localhost/api/calendar/events/${ID}${query}`, {
  method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

describe('/api/calendar/events/[id]', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const m of [eventForEdit, changeEvent, removeEvent, requireGrownUp]) m.mockClear();
    gate = null;
  });
  const route = () => import('@/app/api/calendar/events/[id]/route');

  it('GET loads the event for the Change form, passing an iCloud address on', async () => {
    eventForEdit.mockResolvedValue({ calendarId: 'family', eventId: 'ev1' });
    const { GET } = await route();
    const res = await GET(req('GET', undefined, '?ref=https%3A%2F%2Fcaldav.icloud.com%2Fx.ics'), ctx);
    expect(await res.json()).toEqual({ calendarId: 'family', eventId: 'ev1' });
    expect(eventForEdit.mock.calls[0].slice(1)).toEqual(['family@group.calendar.google.com:ev1', 'https://caldav.icloud.com/x.ics']);
  });

  it('PATCH changes one day without asking for the grown-up code', async () => {
    const { PATCH } = await route();
    const res = await PATCH(req('PATCH', { scope: 'instance', etag: '"e1"' }), ctx);
    expect(res.status).toBe(200);
    expect(requireGrownUp).not.toHaveBeenCalled();
    expect(changeEvent).toHaveBeenCalledOnce();
  });

  it('PATCH for every time, and DELETE, ask the grown-up gate first and stop when it says no', async () => {
    gate = Response.json({ needsGrownUpCode: true }, { status: 403 });
    const { PATCH, DELETE } = await route();
    expect((await PATCH(req('PATCH', { scope: 'series', etag: '"e1"' }), ctx)).status).toBe(403);
    expect(requireGrownUp).toHaveBeenLastCalledWith(expect.anything(), 'calendar-change-series');
    expect((await DELETE(req('DELETE', { scope: 'instance' }), ctx)).status).toBe(403);
    expect(requireGrownUp).toHaveBeenLastCalledWith(expect.anything(), 'calendar-remove');
    expect(changeEvent).not.toHaveBeenCalled();
    expect(removeEvent).not.toHaveBeenCalled();
  });

  it('DELETE removes once the gate lets it through', async () => {
    const { DELETE } = await route();
    const res = await DELETE(req('DELETE', { scope: 'series', seriesId: 'soccer' }), ctx);
    expect(res.status).toBe(200);
    expect(removeEvent.mock.calls[0].slice(1)).toEqual(['family@group.calendar.google.com:ev1', { scope: 'series', seriesId: 'soccer' }]);
  });
});
