import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import { requireSession } from '@/lib/auth';
import { POST } from '@/app/api/calendar/check/route';

const mockFetch = vi.mocked(fetchWithTimeout);

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:soccer-1
DTSTART;VALUE=DATE:${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')}
SUMMARY:Practice
END:VEVENT
END:VCALENDAR`;

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/calendar/check', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/calendar/check', () => {
  it('requires an editor session', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(request({ url: 'https://example.com/a.ics' }));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a missing url', async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  it('reports a readable feed with its upcoming event count', async () => {
    mockFetch.mockResolvedValueOnce(new Response(ICS, { status: 200 }));
    const res = await POST(request({ url: 'webcal://example.com/soccer.ics' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, eventCount: 1 });
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/soccer.ics', expect.anything());
  });

  it('reports an HTTP failure with the plain-language key', async () => {
    mockFetch.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    const res = await POST(request({ url: 'https://example.com/not-a-calendar' }));
    expect(await res.json()).toEqual({
      ok: false,
      error: 'Could not reach the link (HTTP 404)',
      messageKey: 'linkHttpError',
      messageParams: { status: 404 },
    });
  });

  it('reports a page that is not a calendar', async () => {
    mockFetch.mockResolvedValueOnce(new Response('<html><body>Sign in</body></html>', { status: 200 }));
    const res = await POST(request({ url: 'https://portal.example.com/login' }));
    expect(await res.json()).toEqual({
      ok: false,
      error: "The link didn't return a readable calendar",
      messageKey: 'linkUnreadable',
    });
  });

  it('reports a bad address without fetching', async () => {
    const res = await POST(request({ url: 'not a link' }));
    expect(await res.json()).toMatchObject({ ok: false, messageKey: 'linkInvalid' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a network failure as unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await POST(request({ url: 'https://example.com/a.ics' }));
    expect(await res.json()).toEqual({ ok: false, error: 'Could not reach the link', messageKey: 'linkUnreachable' });
  });
});
