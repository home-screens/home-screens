import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory json-store backing, same style as google-picker.test.ts.
let tokensContent: string | null = null;
vi.mock('@/lib/json-store', () => ({
  createJsonStore: (opts: { path: string; defaultValue: unknown }) => ({
    read: async () => (tokensContent === null ? structuredClone(opts.defaultValue) : JSON.parse(tokensContent)),
    write: async (data: unknown) => { tokensContent = JSON.stringify(data, null, 2); },
    updateAtomic: async () => { throw new Error('updateAtomic is not used by the token store'); },
    remove: async () => { tokensContent = null; },
    get filePath() { return opts.path; },
  }),
}));

vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(async (key: string) => (key === 'test_client_id' ? 'client-id-1' : null)),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { createOAuthTokenStore, type OAuthTokenStoreOptions } from '@/lib/oauth-token-store';

function tokenResponse(extras: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'at-new',
      expires_in: 3600,
      refresh_token: 'rt-kept',
      ...extras,
    }),
  };
}

/** Id-only credentials (the Microsoft shape). */
const idOnlyOpts = (): OAuthTokenStoreOptions => ({
  tokensPath: 'data/test-tokens.json',
  tokenUrl: 'https://login.example.test/oauth2/token',
  logName: 'test-store',
  getCredentials: async () => ({ client_id: 'client-id-1' }),
  hasCredentials: async () => true,
});

beforeEach(() => {
  tokensContent = null;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createOAuthTokenStore', () => {
  it('refreshes against the provider tokenUrl with the supplied credentials', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'stale' });
    mockFetch.mockResolvedValue(tokenResponse());

    const store = createOAuthTokenStore(idOnlyOpts());
    const token = await store.getAccessToken();

    expect(token).toBe('at-new');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://login.example.test/oauth2/token');
    expect(init.body.toString()).toBe(
      'client_id=client-id-1&refresh_token=rt-1&grant_type=refresh_token',
    );
  });

  it('returns the stored token without a request while it is fresh', async () => {
    tokensContent = JSON.stringify({
      access_token: 'fresh',
      refresh_token: 'rt-1',
      expiry_date: Date.now() + 600_000,
    });

    const token = await createOAuthTokenStore(idOnlyOpts()).getAccessToken();

    expect(token).toBe('fresh');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('coalesces concurrent refreshes into a single request', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'stale' });
    mockFetch.mockResolvedValue(tokenResponse());

    const store = createOAuthTokenStore(idOnlyOpts());
    const [a, b] = await Promise.all([store.getAccessToken(), store.getAccessToken()]);

    expect(a).toBe('at-new');
    expect(b).toBe('at-new');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous refresh token when the provider omits one', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-old', access_token: 'stale' });
    // refresh_token: undefined makes the response omit the field entirely.
    mockFetch.mockResolvedValue(tokenResponse({ refresh_token: undefined }));

    await createOAuthTokenStore(idOnlyOpts()).getAccessToken();

    const saved = JSON.parse(tokensContent!);
    expect(saved.refresh_token).toBe('rt-old');
  });

  it('returns null and keeps the file when a refresh is rejected', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-revoked', access_token: 'stale' });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    });

    const token = await createOAuthTokenStore(idOnlyOpts()).getAccessToken();

    expect(token).toBeNull();
    expect(JSON.parse(tokensContent!).refresh_token).toBe('rt-revoked');
  });

  it('disconnect without revokeUrl clears the file and makes no revoke request', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'at-1' });

    await createOAuthTokenStore(idOnlyOpts()).disconnect();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(JSON.parse(tokensContent!)).toEqual({});
  });

  it('disconnect with revokeUrl posts the access token to the provider, then clears', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'at-1' });
    mockFetch.mockResolvedValue({ ok: true });

    await createOAuthTokenStore({ ...idOnlyOpts(), revokeUrl: 'https://login.example.test/revoke' }).disconnect();

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://login.example.test/revoke');
    expect(init.body.toString()).toBe('token=at-1');
    expect(JSON.parse(tokensContent!)).toEqual({});
  });

  it('serves an access-token-only grant until its expiry passes', async () => {
    tokensContent = JSON.stringify({ access_token: 'solo', expiry_date: Date.now() + 60_000 });

    const store = createOAuthTokenStore(idOnlyOpts());
    expect(await store.getAccessToken()).toBe('solo'); // within the 60s refresh margin but not expired

    tokensContent = JSON.stringify({ access_token: 'solo', expiry_date: Date.now() - 1_000 });
    expect(await store.getAccessToken()).toBeNull();
  });

  it('hasCredentials and isConnected are passive (no network, no credentials fetch)', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1' });
    const store = createOAuthTokenStore(idOnlyOpts());

    expect(await store.hasCredentials()).toBe(true);
    expect(await store.isConnected()).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
