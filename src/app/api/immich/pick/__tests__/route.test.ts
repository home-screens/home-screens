import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));
vi.mock('@/lib/immich', () => ({ immichFetch: vi.fn() }));
vi.mock('@/lib/background-sources/save', () => ({
  saveRotationFile: vi.fn(async (name: string) => `/api/backgrounds/serve?file=${encodeURIComponent(name)}`),
  extFromContentType: (ct: string) => (ct.includes('webp') ? '.webp' : '.jpg'),
}));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn(async () => ({ screens: [], displays: [] })) }));
vi.mock('@/lib/background-rotation-prune', () => ({ pruneRotationFiles: vi.fn(async () => {}) }));
vi.mock('@/lib/background-rotation-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/background-rotation-cache')>()),
  rotationCacheStore: { read: vi.fn(async () => ({})) },
}));

import { immichFetch } from '@/lib/immich';
import { saveRotationFile } from '@/lib/background-sources/save';
import { pruneRotationFiles } from '@/lib/background-rotation-prune';
import { POST } from '../route';

const mockFetch = vi.mocked(immichFetch);
const post = (body: unknown) => new NextRequest('http://localhost/api/immich/pick', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => vi.clearAllMocks());

describe('POST /api/immich/pick', () => {
  it('downloads the preview, saves it under the pick prefix and prunes', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const res = await POST(post({ assetId: 'abc-123' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-pick-abc-123.jpg' });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/assets/abc-123/thumbnail?size=preview');
    expect(saveRotationFile).toHaveBeenCalledWith('rotation-immich-pick-abc-123.jpg', expect.any(ReadableStream));
    expect(pruneRotationFiles).toHaveBeenCalled();
  });

  it('rejects a missing or malformed asset id', async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ assetId: '../etc' }))).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 502 when Immich cannot serve the image', async () => {
    mockFetch.mockResolvedValue(new Response('x', { status: 404 }));
    expect((await POST(post({ assetId: 'abc' }))).status).toBe(502);
    expect(saveRotationFile).not.toHaveBeenCalled();
  });
});
