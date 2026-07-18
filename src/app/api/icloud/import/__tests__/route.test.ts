import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/icloud-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/icloud-import')>();
  return {
    ...actual,
    startICloudImport: vi.fn(),
    getICloudImport: vi.fn(),
  };
});

import { getICloudImport, startICloudImport } from '@/lib/icloud-import';
import { GET, POST } from '@/app/api/icloud/import/route';

const mockStart = vi.mocked(startICloudImport);
const mockGet = vi.mocked(getICloudImport);

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/icloud/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(query = '') {
  return new NextRequest(`http://localhost/api/icloud/import${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/icloud/import', () => {
  it('starts an import and returns 202 with the job handle', async () => {
    mockStart.mockResolvedValue({ jobId: 'job-1', total: 12 });

    const res = await POST(postReq({ url: 'https://share.icloud.com/photos/0f0aXYZ-abc123', folder: 'family' }));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: 'job-1', total: 12 });
    expect(mockStart).toHaveBeenCalledWith('https://share.icloud.com/photos/0f0aXYZ-abc123', 'family');
  });

  it('defaults folder to the library root', async () => {
    mockStart.mockResolvedValue({ jobId: 'job-1', total: 1 });
    await POST(postReq({ url: 'B125ON9t3mbLNC' }));
    expect(mockStart).toHaveBeenCalledWith('B125ON9t3mbLNC', '');
  });

  it('requires a url', async () => {
    const res = await POST(postReq({ folder: 'family' }));
    expect(res.status).toBe(400);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('maps busy to 409 and other start errors to 400', async () => {
    mockStart.mockResolvedValue({ error: 'busy' });
    expect((await POST(postReq({ url: 'B125ON9t3mbLNC' }))).status).toBe(409);

    mockStart.mockResolvedValue({ error: 'link-expired' });
    const res = await POST(postReq({ url: 'B125ON9t3mbLNC' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('link-expired');
  });
});

describe('GET /api/icloud/import', () => {
  it('returns the job status', async () => {
    mockGet.mockReturnValue({
      id: 'job-1', state: 'running', total: 10, done: 3, skipped: 1, failed: 0, folder: '', videoFiles: [], startedAt: 1,
    });

    const res = await GET(getReq('?jobId=job-1'));
    expect(res.status).toBe(200);
    expect((await res.json()).done).toBe(3);
  });

  it('404s for unknown jobs', async () => {
    mockGet.mockReturnValue(null);
    expect((await GET(getReq('?jobId=nope'))).status).toBe(404);
  });
});
