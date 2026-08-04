import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockStart = vi.fn();
const mockGetJob = vi.fn();
vi.mock('@/lib/google-picker', () => ({
  startPickerImport: (...args: unknown[]) => mockStart(...args),
  getPickerImport: (...args: unknown[]) => mockGetJob(...args),
}));

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/google-picker/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/google-picker/import${query}`);
}

describe('/api/google-picker/import', () => {
  beforeEach(() => {
    vi.resetModules();
    mockStart.mockReset();
    mockGetJob.mockReset();
  });

  async function importRoute() {
    return import('@/app/api/google-picker/import/route');
  }

  it('POST starts an import with the default folder', async () => {
    mockStart.mockResolvedValue({ jobId: 'j1', total: 12 });
    const { POST } = await importRoute();
    const response = await POST(postRequest({ sessionId: 's1' }));
    expect(response.status).toBe(202);
    expect(mockStart).toHaveBeenCalledWith('s1', 'google-photos');
    expect(await response.json()).toEqual({ jobId: 'j1', total: 12 });
  });

  it('POST maps lib errors to statuses', async () => {
    const { POST } = await importRoute();
    expect((await POST(postRequest({}))).status).toBe(400);

    mockStart.mockResolvedValue({ error: 'busy' });
    expect((await POST(postRequest({ sessionId: 's1' }))).status).toBe(409);

    mockStart.mockResolvedValue({ error: 'nothing-picked' });
    expect((await POST(postRequest({ sessionId: 's1' }))).status).toBe(400);
  });

  it('GET polls a job and 404s unknown ids', async () => {
    mockGetJob.mockReturnValue({ id: 'j1', state: 'running', total: 12, done: 3, skipped: 0, failed: 0 });
    const { GET } = await importRoute();
    const json = await (await GET(getRequest('?jobId=j1'))).json();
    expect(json.done).toBe(3);

    mockGetJob.mockReturnValue(null);
    expect((await GET(getRequest('?jobId=missing'))).status).toBe(404);
  });
});
