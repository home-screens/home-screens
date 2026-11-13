import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

// The album reader behind fetchICloudMedia for an icloud.com/sharedalbum link.
vi.mock('@/lib/icloud-album', () => ({ fetchSharedStreamsAlbum: vi.fn(), fetchSharedStreamsAlbumForImport: vi.fn() }));

import { GET } from '@/app/api/icloud/serve/route';
import { fetchWithTimeout } from '@/lib/api-utils';
import { requireDisplayAuth } from '@/lib/auth';
import { fetchSharedStreamsAlbum } from '@/lib/icloud-album';
import { icloudPhotoBytesCache, icloudServeUrl } from '@/lib/icloud-media';

const mockAlbum = vi.mocked(fetchSharedStreamsAlbum);
const mockFetch = vi.mocked(fetchWithTimeout);

const TOKEN = 'B0aG5oqs3qGhrh';
const LINK = `https://www.icloud.com/sharedalbum/#${TOKEN}`;
const CDN = 'https://cvws.icloud-content.com';
const ALBUM = [
  { url: `${CDN}/p1`, type: 'image' as const, guid: 'G1' },
  { url: `${CDN}/orig-2`, previewUrl: `${CDN}/med-2`, type: 'image' as const, guid: 'Aq1w2e/0200==' },
  { url: `${CDN}/v1`, type: 'video' as const, guid: 'G3', posterUrl: `${CDN}/v1.jpg` },
  { url: `${CDN}/v2`, type: 'video' as const, guid: 'G4' },
  { url: 'https://elsewhere.example/p5', type: 'image' as const, guid: 'G5' },
];

/** A request for the address the list hands the wall. */
function serveReq(guid: string, poster = false) {
  return new NextRequest(`http://localhost${icloudServeUrl(LINK, guid, poster)}`);
}

function picture(bytes = 3, contentType = 'image/jpeg') {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': contentType } });
}

beforeEach(() => {
  vi.clearAllMocks();
  icloudPhotoBytesCache.clear();
  mockAlbum.mockResolvedValue(ALBUM);
  mockFetch.mockImplementation(async () => picture());
});

describe('GET /api/icloud/serve', () => {
  it('serves a photo by its guid from the URL the album has for it now', async () => {
    const res = await GET(serveReq('G1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800, immutable');
    expect((await res.arrayBuffer()).byteLength).toBe(3);
    expect(mockAlbum).toHaveBeenCalledWith(TOKEN);
    expect(mockFetch).toHaveBeenCalledWith(`${CDN}/p1`, { timeout: 30_000 });
    // Display-polled route: the display tier, never session-only.
    expect(requireDisplayAuth).toHaveBeenCalled();
  });

  it('serves the screen-sized copy when Apple has one, not the camera original', async () => {
    await GET(serveReq('Aq1w2e/0200=='));
    expect(mockFetch).toHaveBeenCalledWith(`${CDN}/med-2`, { timeout: 30_000 });
  });

  it('follows the link Apple signs anew: the same address works after the album is re-read', async () => {
    await GET(serveReq('G1'));
    icloudPhotoBytesCache.clear();
    mockAlbum.mockResolvedValue([{ ...ALBUM[0], url: `${CDN}/p1-resigned` }]);

    expect((await GET(serveReq('G1'))).status).toBe(200);
    expect(mockFetch).toHaveBeenLastCalledWith(`${CDN}/p1-resigned`, { timeout: 30_000 });
  });

  it('keeps the bytes, so a repeat asks neither the album nor Apple', async () => {
    await GET(serveReq('G1'));
    const again = await GET(serveReq('G1'));

    expect(again.status).toBe(200);
    expect(mockAlbum).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('serves a picture too large to keep without keeping it', async () => {
    mockFetch.mockImplementation(async () => picture(4 * 1024 * 1024 + 1));
    expect((await GET(serveReq('G1'))).status).toBe(200);
    expect((await GET(serveReq('G1'))).status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('serves a video\'s poster frame with poster=1, kept apart from a photo of the same guid', async () => {
    const res = await GET(serveReq('G3', true));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(`${CDN}/v1.jpg`, { timeout: 30_000 });
  });

  it('is a 404 for a photo the album no longer has, a video, or a poster that does not exist', async () => {
    expect((await GET(serveReq('gone'))).status).toBe(404);
    expect((await GET(serveReq('G3'))).status).toBe(404);
    expect((await GET(serveReq('G4', true))).status).toBe(404);
    expect((await GET(serveReq('G1', true))).status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never fetches a URL outside Apple\'s content hosts', async () => {
    expect((await GET(serveReq('G5'))).status).toBe(502);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('answers 502 when Apple refuses the picture, and does not keep the refusal', async () => {
    mockFetch.mockResolvedValueOnce(new Response('gone', { status: 410 }));
    expect((await GET(serveReq('G1'))).status).toBe(502);
    expect((await GET(serveReq('G1'))).status).toBe(200);
  });

  it('requires a link, an id, and a link that is an album', async () => {
    const get = (query: string) => GET(new NextRequest(`http://localhost/api/icloud/serve${query}`));
    expect((await get('')).status).toBe(400);
    expect((await get(`?link=${encodeURIComponent(LINK)}`)).status).toBe(400);
    expect((await get('?id=G1')).status).toBe(400);
    expect((await get('?link=https%3A%2F%2Fexample.com%2Falbum&id=G1')).status).toBe(400);
    expect((await get(`?link=${encodeURIComponent(LINK)}&id=${'x'.repeat(201)}`)).status).toBe(400);
    expect(mockAlbum).not.toHaveBeenCalled();
  });
});
