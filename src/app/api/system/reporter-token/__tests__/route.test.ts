import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
  setSecret: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { getSecret, setSecret } from '@/lib/secrets';

const { GET, POST } = await import('@/app/api/system/reporter-token/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/system/reporter-token', () => {
  it('returns the stored token', async () => {
    vi.mocked(getSecret).mockResolvedValue('abcdef1234567890abcdef1234567890');
    const res = await GET(new NextRequest('http://localhost/api/system/reporter-token'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ token: 'abcdef1234567890abcdef1234567890' });
    expect(getSecret).toHaveBeenCalledWith('reporter_token');
  });

  it('returns null when no token is set', async () => {
    vi.mocked(getSecret).mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/system/reporter-token'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ token: null });
  });
});

describe('POST /api/system/reporter-token', () => {
  it('generates a new 32-char hex token and persists it', async () => {
    vi.mocked(setSecret).mockResolvedValue();
    const res = await POST(new NextRequest('http://localhost/api/system/reporter-token', { method: 'POST' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.token).toBe('string');
    expect(json.token).toMatch(/^[0-9a-f]{32}$/);
    expect(setSecret).toHaveBeenCalledWith('reporter_token', json.token);
  });

  it('returns a different token on each rotation', async () => {
    vi.mocked(setSecret).mockResolvedValue();
    const res1 = await POST(new NextRequest('http://localhost/api/system/reporter-token', { method: 'POST' }));
    const res2 = await POST(new NextRequest('http://localhost/api/system/reporter-token', { method: 'POST' }));
    const t1 = (await res1.json()).token;
    const t2 = (await res2.json()).token;
    expect(t1).not.toBe(t2);
  });
});
