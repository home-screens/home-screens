import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/onedrive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/onedrive')>();
  return {
    ...actual,
    listFolders: vi.fn(),
  };
});

import { GET } from '@/app/api/onedrive/folders/route';
import { listFolders, OneDriveError } from '@/lib/onedrive';
import { requireSession } from '@/lib/auth';

const mockListFolders = vi.mocked(listFolders);
const mockRequireSession = vi.mocked(requireSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/onedrive/folders', () => {
  it('lists the drive root when no itemId is given', async () => {
    mockListFolders.mockResolvedValue({
      folder: { id: 'root-1', name: 'OneDrive', path: 'OneDrive', childCount: 7 },
      subfolders: [{ id: 'sub-1', name: 'Pictures' }],
    });

    const res = await GET(new NextRequest('http://localhost/api/onedrive/folders'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      folder: { id: 'root-1', name: 'OneDrive', path: 'OneDrive', childCount: 7 },
      subfolders: [{ id: 'sub-1', name: 'Pictures' }],
    });
    expect(mockListFolders).toHaveBeenCalledWith(undefined);
    // Editor-facing route: session auth only, never the display tier.
    expect(mockRequireSession).toHaveBeenCalled();
  });

  it('rejects a malformed itemId', async () => {
    const res = await GET(new NextRequest('http://localhost/api/onedrive/folders?itemId=..%2Fhack'));

    expect(res.status).toBe(400);
    expect(mockListFolders).not.toHaveBeenCalled();
  });

  it('maps a missing folder to 404', async () => {
    mockListFolders.mockRejectedValue(new OneDriveError('Folder not found', 404));

    const res = await GET(new NextRequest('http://localhost/api/onedrive/folders?itemId=gone'));

    expect(res.status).toBe(404);
  });
});
