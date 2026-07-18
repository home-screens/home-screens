import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signMediaToken } from '@/lib/media-token';

const authState = vi.hoisted(() => ({ authRejects: false, secret: null as string | null }));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {
    if (authState.authRejects) throw new Response('{"error":"Authentication required"}', { status: 401 });
  }),
  requireDisplayAuth: vi.fn(async () => {
    if (authState.authRejects) throw new Response('{"error":"Authentication required"}', { status: 401 });
  }),
  getMediaTokenSecret: vi.fn(async () => authState.secret),
  isAuthEnabled: vi.fn(async () => authState.secret !== null),
}));

vi.mock('@/lib/immich', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/immich')>();
  return { ...actual, immichFetch: vi.fn() };
});

import { immichFetch } from '@/lib/immich';
import { GET } from '@/app/api/immich/video/route';

const mockImmichFetch = vi.mocked(immichFetch);
const SECRET = 's'.repeat(64);

function videoReq(query: string, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost/api/immich/video${query}`, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.authRejects = false;
  authState.secret = null;
});

describe('GET /api/immich/video', () => {
  it('proxies a 206 range response, passing headers and body through', async () => {
    mockImmichFetch.mockResolvedValue(new Response('chunk-bytes', {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': 'bytes 0-10/1000',
        'Content-Length': '11',
        'Accept-Ranges': 'bytes',
      },
    }));

    const res = await GET(videoReq('?assetId=abc-123', { range: 'bytes=0-10' }));

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Content-Range')).toBe('bytes 0-10/1000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(await res.text()).toBe('chunk-bytes');

    // The incoming Range header was forwarded to Immich
    const init = mockImmichFetch.mock.calls[0][1] as { headers?: Record<string, string>; retries?: number };
    expect(init.headers).toEqual({ Range: 'bytes=0-10' });
    expect(init.retries).toBe(0);
  });

  it('propagates the client abort signal to the upstream fetch', async () => {
    mockImmichFetch.mockResolvedValue(new Response('bytes', { status: 200 }));

    const req = videoReq('?assetId=abc-123');
    await GET(req);

    const init = mockImmichFetch.mock.calls[0][1] as { signal?: AbortSignal };
    expect(init.signal).toBe(req.signal);
  });

  it('passes a 416 through with its Content-Range instead of masking it as 502', async () => {
    mockImmichFetch.mockResolvedValue(new Response(null, {
      status: 416,
      headers: { 'Content-Range': 'bytes */1000' },
    }));

    const res = await GET(videoReq('?assetId=abc-123', { range: 'bytes=5000-' }));

    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('proxies a full 200 response when no Range header is sent', async () => {
    mockImmichFetch.mockResolvedValue(new Response('full-bytes', {
      status: 200,
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': '10' },
    }));

    const res = await GET(videoReq('?assetId=abc-123'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('full-bytes');
    const init = mockImmichFetch.mock.calls[0][1] as { headers?: unknown };
    expect(init.headers).toBeUndefined();
  });

  it('returns 502 when Immich errors', async () => {
    mockImmichFetch.mockResolvedValue(new Response('', { status: 500 }));
    const res = await GET(videoReq('?assetId=abc-123'));
    expect(res.status).toBe(502);
  });

  it('rejects a missing or malformed assetId', async () => {
    expect((await GET(videoReq(''))).status).toBe(400);
    expect((await GET(videoReq('?assetId=../etc'))).status).toBe(400);
  });

  it('accepts a valid mt token bound to the assetId when no Bearer is present', async () => {
    authState.authRejects = true;
    authState.secret = SECRET;
    mockImmichFetch.mockResolvedValue(new Response('bytes', { status: 200 }));

    const mt = signMediaToken(SECRET, 'abc-123');
    const res = await GET(videoReq(`?assetId=abc-123&mt=${encodeURIComponent(mt)}`));
    expect(res.status).toBe(200);
  });

  it('rejects a token minted for a different asset', async () => {
    authState.authRejects = true;
    authState.secret = SECRET;

    const mt = signMediaToken(SECRET, 'other-asset');
    const res = await GET(videoReq(`?assetId=abc-123&mt=${encodeURIComponent(mt)}`));
    expect(res.status).toBe(401);
  });

  it('rejects requests with no credential at all', async () => {
    authState.authRejects = true;
    authState.secret = SECRET;
    const res = await GET(videoReq('?assetId=abc-123'));
    expect(res.status).toBe(401);
  });
});
