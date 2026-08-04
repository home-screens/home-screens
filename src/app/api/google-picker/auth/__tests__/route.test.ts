import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockGetAuthUrl = vi.fn();
const mockExchange = vi.fn();
vi.mock('@/lib/google-picker', () => ({
  getPickerAuthUrl: (...args: unknown[]) => mockGetAuthUrl(...args),
  exchangePickerCode: (...args: unknown[]) => mockExchange(...args),
}));

function getRequest() {
  return new NextRequest('http://localhost/api/google-picker/auth');
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/google-picker/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/google-picker/auth', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthUrl.mockReset();
    mockExchange.mockReset();
  });

  async function importRoute() {
    return import('@/app/api/google-picker/auth/route');
  }

  it('GET returns the sign-in URL', async () => {
    mockGetAuthUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const { GET } = await importRoute();
    const json = await (await GET(getRequest())).json();
    expect(json.url).toContain('accounts.google.com');
  });

  it('GET surfaces missing-credentials errors', async () => {
    mockGetAuthUrl.mockRejectedValue(new Error('Google Photos import needs a web Client ID'));
    const { GET } = await importRoute();
    const response = await GET(getRequest());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('web Client ID');
  });

  it('POST exchanges the pasted code', async () => {
    mockExchange.mockResolvedValue({ ok: true });
    const { POST } = await importRoute();
    const json = await (await POST(postRequest({ code: '4/0AdLIrY' }))).json();
    expect(mockExchange).toHaveBeenCalledWith('4/0AdLIrY');
    expect(json).toEqual({ connected: true });
  });

  it('POST rejects a missing code and passes through exchange failures', async () => {
    const { POST } = await importRoute();
    expect((await POST(postRequest({}))).status).toBe(400);

    mockExchange.mockResolvedValue({ ok: false, error: 'Bad code' });
    const response = await POST(postRequest({ code: 'x' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Bad code');
  });
});
