import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, createTTLCache: () => ({ get: () => null, set: () => {} }) };
});

vi.mock('@/lib/onedrive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/onedrive')>();
  return {
    ...actual,
    listPhotos: vi.fn(),
  };
});

import { GET } from '@/app/api/onedrive/photos/route';
import { listPhotos, OneDriveError } from '@/lib/onedrive';

const mockListPhotos = vi.mocked(listPhotos);
import { requireDisplayAuth } from '@/lib/auth';

const mockRequireDisplayAuth = vi.mocked(requireDisplayAuth);

beforeEach(() => {
  vi.clearAllMocks();
});

function photosReq(query = '') {
  return new NextRequest(`http://localhost/api/onedrive/photos${query}`);
}

describe('GET /api/onedrive/photos', () => {
  it('answers an empty list when no folder is chosen yet', async () => {
    const res = await GET(photosReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockListPhotos).not.toHaveBeenCalled();
    // Display-polled route: the display tier, never session-only.
    expect(mockRequireDisplayAuth).toHaveBeenCalled();
  });

  it('maps photos to typed serve-URL entries', async () => {
    mockListPhotos.mockResolvedValue([
      { id: 'a!b_c', name: 'a.jpg' },
      { id: 'x=y-z', name: 'b.jpg' },
    ]);

    const res = await GET(photosReq('?folderId=fld-1&count=20'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { url: '/api/onedrive/serve?itemId=a!b_c&size=preview', type: 'image' },
      { url: '/api/onedrive/serve?itemId=x%3Dy-z&size=preview', type: 'image' },
    ]);
    expect(mockListPhotos).toHaveBeenCalledWith('fld-1', 20);
  });

  it('clamps count to 1..200 with a default of 50', async () => {
    mockListPhotos.mockResolvedValue([]);

    await GET(photosReq('?folderId=f&count=9999'));
    expect(mockListPhotos).toHaveBeenLastCalledWith('f', 200);

    await GET(photosReq('?folderId=f'));
    expect(mockListPhotos).toHaveBeenLastCalledWith('f', 50);
  });

  it('maps a dead grant to 401 and a missing folder to 404', async () => {
    mockListPhotos.mockRejectedValue(new OneDriveError('Not connected to OneDrive', 401));
    const dead = await GET(photosReq('?folderId=f'));
    expect(dead.status).toBe(401);
    // The display renders this as a "OneDrive isn't connected yet" setup card.
    expect(await dead.json()).toMatchObject({ code: 'setup', setup: { needs: 'connection', service: 'OneDrive' } });

    mockListPhotos.mockRejectedValue(new OneDriveError('Folder not found', 404));
    expect((await GET(photosReq('?folderId=f'))).status).toBe(404);
  });
});
