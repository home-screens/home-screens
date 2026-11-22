import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ requireDisplayAuth: vi.fn(), requireSession: vi.fn() }));
const addEvent = vi.fn();
vi.mock('@/lib/calendar-event-writes', () => ({ addEvent: (...a: unknown[]) => addEvent(...a) }));

const post = (body: unknown) => new NextRequest('http://localhost/api/calendar/events', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/calendar/events', () => {
  beforeEach(() => {
    vi.resetModules();
    addEvent.mockReset();
  });
  const route = () => import('@/app/api/calendar/events/route');

  it('adds the event and answers 201 with its id', async () => {
    addEvent.mockResolvedValue({ id: 'family:ev1' });
    const { POST } = await route();
    const res = await POST(post({ calendarId: 'family', draft: { title: 'Swim' } }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'family:ev1' });
    expect(addEvent.mock.calls[0][1]).toEqual({ calendarId: 'family', draft: { title: 'Swim' } });
  });

  it('answers a refusal in words the phone and the wall translate', async () => {
    // The route's own copy of the class, loaded after the module reset above.
    const { CalendarWriteError } = await import('@/lib/calendar-write');
    addEvent.mockRejectedValue(new CalendarWriteError('calendarWrite.calendarNotTicked', "Events can't go on that calendar.", undefined, { status: 403 }));
    const { POST } = await route();
    const res = await POST(post({ calendarId: 'team', draft: {} }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'calendarWrite.calendarNotTicked' });
  });

  it('turns down a body too large for one event', async () => {
    const { POST } = await route();
    const res = await POST(post({ calendarId: 'family', draft: { title: 'x'.repeat(9000) } }));
    expect(res.status).toBe(413);
    expect(addEvent).not.toHaveBeenCalled();
  });
});
