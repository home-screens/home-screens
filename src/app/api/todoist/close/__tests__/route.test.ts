import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
  setSecret: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn((...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args)),
  };
});

import { getSecret } from '@/lib/secrets';
import { requireDisplayAuth } from '@/lib/auth';
import { cache as todoistCache } from '@/app/api/todoist/route';
const { POST } = await import('@/app/api/todoist/close/route');

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/todoist/close', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  todoistCache.clear();
});

describe('POST /api/todoist/close', () => {
  it('rejects unauthenticated requests (display-auth gate)', async () => {
    // Simulate auth being enabled and the request missing a valid token/session.
    // withDisplayAuth catches a thrown Response and returns it as the response.
    vi.mocked(requireDisplayAuth).mockRejectedValueOnce(
      Response.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    vi.mocked(getSecret).mockResolvedValue('test-token');
    global.fetch = vi.fn(); // would-be Todoist call

    const res = await POST(makeRequest({ taskId: 'abc123' }));

    expect(res.status).toBe(401);
    // The upstream Todoist API must NOT be called when auth fails.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 400 when taskId is missing', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid taskId');
  });

  it('returns 400 when taskId contains non-alphanumeric chars', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');

    const res = await POST(makeRequest({ taskId: '../../etc/passwd' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid taskId');
  });

  it('returns 400 when taskId is empty string', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');

    const res = await POST(makeRequest({ taskId: '' }));

    expect(res.status).toBe(400);
  });

  it('returns 400 when no token is configured', async () => {
    vi.mocked(getSecret).mockResolvedValue(null);

    const res = await POST(makeRequest({ taskId: '6X7rfFVPjhvv84XG' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No Todoist API key configured/);
  });

  it('closes the task and busts the GET cache on success', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    // Pre-seed the cache so we can prove it gets cleared.
    todoistCache.set('default', { sentinel: true });
    expect(todoistCache.get('default')).not.toBeNull();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });

    const res = await POST(makeRequest({ taskId: '6X7rfFVPjhvv84XG' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.todoist.com/api/v1/tasks/6X7rfFVPjhvv84XG/close',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    // Cache should be cleared after a successful close so the next refresh
    // doesn't re-show the closed task.
    expect(todoistCache.get('default')).toBeNull();
  });

  it('passes through Todoist 401 unchanged', async () => {
    vi.mocked(getSecret).mockResolvedValue('bad-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const res = await POST(makeRequest({ taskId: 'abc123' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Failed to close Todoist task');
  });

  it('maps Todoist 500 to 502 (upstream failure)', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server error',
    });

    const res = await POST(makeRequest({ taskId: 'abc123' }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.detail).toBe('Server error');
  });

  it('does NOT bust the cache when close fails', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    todoistCache.set('default', { sentinel: true });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    });

    await POST(makeRequest({ taskId: 'abc123' }));

    // Cache survives a failed close — a stale read is better than churning
    // the upstream API on every retry.
    expect(todoistCache.get('default')).not.toBeNull();
  });

  it('returns 500 on network error', async () => {
    vi.mocked(getSecret).mockResolvedValue('test-token');
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const res = await POST(makeRequest({ taskId: 'abc123' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to close Todoist task');
  });
});
