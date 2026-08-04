import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockCreate = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();
vi.mock('@/lib/google-picker', () => ({
  createPickerSession: (...args: unknown[]) => mockCreate(...args),
  getPickerSession: (...args: unknown[]) => mockGet(...args),
  deletePickerSession: (...args: unknown[]) => mockDelete(...args),
}));

function request(query = '', method = 'GET') {
  return new NextRequest(`http://localhost/api/google-picker/session${query}`, { method });
}

const SESSION = { id: 's1', pickerUri: 'https://photos.google.com/picker/x', mediaItemsSet: false, pollIntervalMs: 5000 };

describe('/api/google-picker/session', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
    mockGet.mockReset();
    mockDelete.mockReset();
  });

  async function importRoute() {
    return import('@/app/api/google-picker/session/route');
  }

  it('POST creates a session', async () => {
    mockCreate.mockResolvedValue(SESSION);
    const { POST } = await importRoute();
    const json = await (await POST(request('', 'POST'))).json();
    expect(json).toEqual(SESSION);
  });

  it('GET requires an id and 404s a vanished session', async () => {
    const { GET } = await importRoute();
    expect((await GET(request())).status).toBe(400);

    mockGet.mockResolvedValue(null);
    expect((await GET(request('?id=gone'))).status).toBe(404);
  });

  it('GET returns the session state', async () => {
    mockGet.mockResolvedValue({ ...SESSION, mediaItemsSet: true });
    const { GET } = await importRoute();
    const json = await (await GET(request('?id=s1'))).json();
    expect(json.mediaItemsSet).toBe(true);
  });

  it('DELETE closes the session', async () => {
    mockDelete.mockResolvedValue(undefined);
    const { DELETE } = await importRoute();
    const json = await (await DELETE(request('?id=s1', 'DELETE'))).json();
    expect(mockDelete).toHaveBeenCalledWith('s1');
    expect(json).toEqual({ ok: true });
  });
});
