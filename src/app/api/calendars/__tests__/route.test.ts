/**
 * Route-level tests for `GET /api/calendars`.
 *
 * Mocks `google-auth` (client + token inspection) and the `googleapis`
 * calendar client. The missing-credential branch is the important surface: with
 * no authenticated client, the route returns a 403 whose message depends on why
 * auth failed (no tokens / no refresh token / refresh failed) and makes NO
 * upstream call. Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/google-auth', () => ({
  getAuthenticatedClient: vi.fn(),
  loadTokens: vi.fn(),
}));

const { calendarListMock } = vi.hoisted(() => ({ calendarListMock: vi.fn() }));
vi.mock('googleapis', () => ({
  google: { calendar: vi.fn(() => ({ calendarList: { list: calendarListMock } })) },
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getAuthenticatedClient, loadTokens } from '@/lib/google-auth';

const mockClient = vi.mocked(getAuthenticatedClient);
const mockTokens = vi.mocked(loadTokens);

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/calendars', { method: 'GET' });
}

describe('GET /api/calendars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 with a sign-in prompt when no tokens exist', async () => {
    mockClient.mockResolvedValue(null);
    mockTokens.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/No Google tokens found/);
    expect(calendarListMock).not.toHaveBeenCalled();
  });

  it('returns 403 pointing at the missing refresh token', async () => {
    mockClient.mockResolvedValue(null);
    mockTokens.mockResolvedValue({ access_token: 'a' } as never);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/refresh token/);
  });

  it('returns 403 for a failed refresh when a refresh token is present', async () => {
    mockClient.mockResolvedValue(null);
    mockTokens.mockResolvedValue({ access_token: 'a', refresh_token: 'r' } as never);
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/refresh failed/);
  });

  it('lists calendars when authenticated', async () => {
    mockClient.mockResolvedValue({} as never);
    calendarListMock.mockResolvedValue({
      data: {
        items: [
          { id: 'primary@x', summary: 'Home', backgroundColor: '#123456', primary: true },
          { id: 'work@x', summary: null },
        ],
      },
    });
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ id: 'primary@x', summary: 'Home', backgroundColor: '#123456', primary: true });
    // Missing fields fall back to defaults.
    expect(body[1]).toEqual({ id: 'work@x', summary: '(Untitled)', backgroundColor: '#3b82f6', primary: false });
  });
});
