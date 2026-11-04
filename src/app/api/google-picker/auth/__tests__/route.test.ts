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

function getRequest(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/google-picker/auth${query}`, { headers });
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
    mockGetAuthUrl.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', returnsToHub: false });
    const { GET } = await importRoute();
    const json = await (await GET(getRequest())).json();
    expect(json.url).toContain('accounts.google.com');
    expect(json.returnsToHub).toBe(false);
    expect(mockGetAuthUrl).toHaveBeenCalledWith(null);
  });

  it("GET passes on the editor's address only when it names the host the request reached", async () => {
    mockGetAuthUrl.mockResolvedValue({ url: 'https://accounts.google.com/', returnsToHub: true });
    const { GET } = await importRoute();

    await GET(getRequest('?origin=http%3A%2F%2F192.168.1.50%3A3000', { host: '192.168.1.50:3000' }));
    expect(mockGetAuthUrl).toHaveBeenLastCalledWith('http://192.168.1.50:3000');

    await GET(getRequest('?origin=http%3A%2F%2F192.168.1.99%3A3000', { host: '192.168.1.50:3000' }));
    expect(mockGetAuthUrl).toHaveBeenLastCalledWith(null);

    // A forwarded host counts only from a peer the server stamped as a trusted proxy.
    const proxied = { host: '127.0.0.1:3000', 'x-forwarded-host': 'hub.lan' };
    await GET(getRequest('?origin=https%3A%2F%2Fhub.lan', proxied));
    expect(mockGetAuthUrl).toHaveBeenLastCalledWith(null);
    await GET(getRequest('?origin=https%3A%2F%2Fhub.lan', { ...proxied, 'x-hs-via-trusted-proxy': '1' }));
    expect(mockGetAuthUrl).toHaveBeenLastCalledWith('https://hub.lan');
  });

  it('GET answers a missing client as a setup problem, sentence intact', async () => {
    // Imported after the module reset above, so it is the class the route checks against.
    const { SetupError } = await import('@/lib/api-utils');
    mockGetAuthUrl.mockRejectedValue(new SetupError('Google Photos import needs a web Client ID', 'key', 'Google Photos', 'integrations'));
    const { GET } = await importRoute();
    const response = await GET(getRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('web Client ID'), code: 'setup', setup: { needs: 'key', service: 'Google Photos' } });
  });

  it('GET answers any other failure with a plain sentence and the cause as detail', async () => {
    mockGetAuthUrl.mockRejectedValue(new Error('helper down'));
    const { GET } = await importRoute();
    const response = await GET(getRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to build sign-in link', detail: 'helper down' });
  });

  it('POST exchanges the pasted code', async () => {
    mockExchange.mockResolvedValue({ ok: true });
    const { POST } = await importRoute();
    const json = await (await POST(postRequest({ code: '4/0AdLIrY' }))).json();
    expect(mockExchange).toHaveBeenCalledWith('4/0AdLIrY', undefined);
    expect(json).toEqual({ connected: true });
  });

  it("POST passes the return page's state on, and says when the sign-in expired", async () => {
    mockExchange.mockResolvedValue({ ok: false, error: 'That sign-in has expired.', expired: true });
    const { POST } = await importRoute();

    const response = await POST(postRequest({ code: '4/0AdLIrY', state: 'nonce.aHR0cA' }));
    expect(mockExchange).toHaveBeenCalledWith('4/0AdLIrY', 'nonce.aHR0cA');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'That sign-in has expired.', expired: true });

    expect((await POST(postRequest({ code: 'x', state: 42 }))).status).toBe(400);
    expect(mockExchange).toHaveBeenCalledTimes(1);
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
