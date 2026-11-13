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

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

// The album reader behind fetchICloudMedia for a photos.icloud.com/shared/album link.
vi.mock('@/lib/icloud-link', () => ({ fetchCloudKitAlbum: vi.fn() }));

import { GET } from '@/app/api/icloud/video/route';
import { fetchWithTimeout } from '@/lib/api-utils';
import { fetchCloudKitAlbum } from '@/lib/icloud-link';
import { icloudMediaResource, icloudVideoUrl } from '@/lib/icloud-media';

const mockAlbum = vi.mocked(fetchCloudKitAlbum);
const mockFetch = vi.mocked(fetchWithTimeout);
const SECRET = 's'.repeat(64);

const TOKEN = 'Ab12Cd34Ef56';
const LINK = `https://photos.icloud.com/shared/album/${TOKEN}`;
const CDN = 'https://cvws.icloud-content.com';
const ALBUM = [
  { url: `${CDN}/v1`, type: 'video' as const, guid: 'V1', posterUrl: `${CDN}/v1.jpg` },
  { url: `${CDN}/p1`, type: 'image' as const, guid: 'P1' },
  { url: 'https://elsewhere.example/v9', type: 'video' as const, guid: 'V9' },
];

function videoReq(guid: string, opts: { headers?: Record<string, string>; mt?: string } = {}) {
  const mt = opts.mt ? `&mt=${encodeURIComponent(opts.mt)}` : '';
  return new NextRequest(`http://localhost${icloudVideoUrl(LINK, guid)}${mt}`, { headers: opts.headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.authRejects = false;
  authState.secret = null;
  mockAlbum.mockResolvedValue(ALBUM);
});

describe('GET /api/icloud/video', () => {
  it('proxies a 206 range response from the URL the album has now, passing headers and body through', async () => {
    mockFetch.mockResolvedValue(new Response('chunk-bytes', {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': 'bytes 0-10/1000',
        'Content-Length': '11',
        'Accept-Ranges': 'bytes',
      },
    }));

    const res = await GET(videoReq('V1', { headers: { range: 'bytes=0-10' } }));

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Content-Range')).toBe('bytes 0-10/1000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(await res.text()).toBe('chunk-bytes');

    expect(mockAlbum).toHaveBeenCalledWith(TOKEN);
    const [url, init] = mockFetch.mock.calls[0] as [string, { headers?: Record<string, string>; retries?: number; signal?: AbortSignal }];
    expect(url).toBe(`${CDN}/v1`);
    expect(init.headers).toEqual({ Range: 'bytes=0-10' });
    // A half-consumed stream is never asked for twice, and stops with the kiosk.
    expect(init.retries).toBe(0);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes a 416 through so the browser can correct its range', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */1000' } }));
    const res = await GET(videoReq('V1', { headers: { range: 'bytes=5000-' } }));
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe('bytes */1000');
  });

  it('answers 502 when Apple refuses the video', async () => {
    mockFetch.mockResolvedValue(new Response('gone', { status: 410 }));
    expect((await GET(videoReq('V1'))).status).toBe(502);
  });

  it('is a 404 for a video the album no longer has, and for a photo', async () => {
    expect((await GET(videoReq('gone'))).status).toBe(404);
    expect((await GET(videoReq('P1'))).status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never fetches a URL outside Apple\'s content hosts', async () => {
    expect((await GET(videoReq('V9'))).status).toBe(502);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requires a link that is an album, and an id', async () => {
    const get = (query: string) => GET(new NextRequest(`http://localhost/api/icloud/video${query}`));
    expect((await get('')).status).toBe(400);
    expect((await get('?link=https%3A%2F%2Fexample.com%2Falbum&id=V1')).status).toBe(400);
    expect(mockAlbum).not.toHaveBeenCalled();
  });

  describe('with sign-in on and no display credentials (a bare <video src>)', () => {
    beforeEach(() => {
      authState.authRejects = true;
      authState.secret = SECRET;
      mockFetch.mockResolvedValue(new Response('ok', { status: 200, headers: { 'Content-Type': 'video/mp4' } }));
    });

    it('plays with a token signed for this album item', async () => {
      const mt = signMediaToken(SECRET, icloudMediaResource(LINK, 'V1'));
      expect((await GET(videoReq('V1', { mt }))).status).toBe(200);
    });

    it('refuses a token signed for another item, and no token at all', async () => {
      const other = signMediaToken(SECRET, icloudMediaResource(LINK, 'V2'));
      expect((await GET(videoReq('V1', { mt: other }))).status).toBe(401);
      expect((await GET(videoReq('V1'))).status).toBe(401);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
