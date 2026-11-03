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

import {
  createOAuthTokenStore,
  resolveAccessToken,
  TokenRenewalRefusedError,
  TokenRenewalUnavailableError,
  type AccessTokenResolution,
  type OAuthTokenStoreOptions,
  type StoredOAuthTokens,
} from '@/lib/oauth-token-store';
import { logger } from '@/lib/logger';

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
  logName: 'test-store',
  getTokenClient: async () => ({ tokenUrl: 'https://login.example.test/oauth2/token', params: { client_id: 'client-id-1' } }),
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

  it('also treats a refused app (invalid_client) as needing a new sign-in', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'stale' });
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }));

    expect(await createOAuthTokenStore(idOnlyOpts()).getAccessToken()).toBeNull();
  });

  it.each([
    ['Google is down', () => new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 })],
    ['the sign-in helper is rate limiting', () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })],
    ['a proxy answers with an HTML error page', () => new Response('<html>Bad gateway</html>', { status: 502 })],
    ['the network is down', () => { throw new TypeError('fetch failed'); }],
  ])('treats a renewal that fails because %s as an outage, never as "sign in again"', async (_, answer) => {
    vi.useFakeTimers();
    const grant = { refresh_token: 'rt-1', access_token: 'at-expired', expiry_date: Date.now() - 1000 };
    tokensContent = JSON.stringify(grant);
    mockFetch.mockImplementation(async () => answer());
    const store = createOAuthTokenStore(idOnlyOpts());

    const token = store.getAccessToken();
    const outcome = expect(token).rejects.toBeInstanceOf(TokenRenewalUnavailableError);
    await vi.advanceTimersByTimeAsync(10_000); // fetchWithTimeout's own retries
    await outcome;

    // Still connected, and the grant is untouched for the next try.
    const verified = store.verifyConnected();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await verified).toBe(true);
    expect(JSON.parse(tokensContent!)).toEqual(grant);
  });

  it('keeps handing out the current token while it lasts when an early renewal fails', async () => {
    // Renewals start a minute before expiry, so a failed one can fall back.
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'at-still-good', expiry_date: Date.now() + 30_000 });
    mockFetch.mockImplementation(async () => { throw new TypeError('fetch failed'); });

    expect(await createOAuthTokenStore(idOnlyOpts()).getAccessToken()).toBe('at-still-good');
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

describe('createOAuthTokenStore: grant replaced during a refresh', () => {
  /** A fetch that stays pending until the test releases it. */
  function deferredFetch() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mockFetch.mockImplementation(() => gate.then(() => tokenResponse({ refresh_token: undefined })));
    return release;
  }

  it('discards a refresh that finishes after a restore replaced the tokens', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-old-account', access_token: 'stale' });
    const release = deferredFetch();
    const store = createOAuthTokenStore(idOnlyOpts());

    const pending = store.getAccessToken();
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await store.saveTokens({ refresh_token: 'rt-restored', access_token: 'at-restored', expiry_date: Date.now() + 3_600_000 });
    release();

    expect(await pending).toBeNull();
    expect(JSON.parse(tokensContent!)).toEqual({
      refresh_token: 'rt-restored',
      access_token: 'at-restored',
      expiry_date: expect.any(Number),
    });
    // The restored grant serves from then on, with no second refresh.
    expect(await store.getAccessToken()).toBe('at-restored');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the account disconnected when a refresh finishes after disconnect', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'stale' });
    const release = deferredFetch();
    const store = createOAuthTokenStore(idOnlyOpts());

    const pending = store.getAccessToken();
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await store.disconnect();
    release();

    expect(await pending).toBeNull();
    expect(JSON.parse(tokensContent!)).toEqual({});
    expect(await store.isConnected()).toBe(false);
  });

  it('commits a refresh nothing interrupted', async () => {
    tokensContent = JSON.stringify({ refresh_token: 'rt-1', access_token: 'stale' });
    const release = deferredFetch();
    const store = createOAuthTokenStore(idOnlyOpts());

    const pending = store.getAccessToken();
    release();

    expect(await pending).toBe('at-new');
    expect(JSON.parse(tokensContent!).access_token).toBe('at-new');
  });
});

describe('resolveAccessToken: the renewal rule the host store and the plugin engine share', () => {
  /** An in-memory grant with every knob of the rule under the test's control. */
  function grant(tokens: StoredOAuthTokens | null, overrides: Partial<AccessTokenResolution<StoredOAuthTokens>> = {}) {
    let stored = tokens;
    let generation = 0;
    const saves: StoredOAuthTokens[] = [];
    const renew = vi.fn(async (current: StoredOAuthTokens) => ({ ...current, access_token: 'renewed', expiry_date: Date.now() + 3600_000 }));
    const resolution: AccessTokenResolution<StoredOAuthTokens> = {
      key: `test-${Math.random()}`,
      log: logger('test'),
      load: async () => stored,
      save: async (next) => { generation += 1; stored = next; saves.push(next); },
      generation: () => generation,
      renewable: (current) => Boolean(current.refresh_token),
      renew,
      ...overrides,
    };
    return {
      resolution,
      renew,
      saves,
      replace: (next: StoredOAuthTokens) => { generation += 1; stored = next; },
    };
  }

  it('hands out a fresh token without renewing', async () => {
    const g = grant({ access_token: 'fresh', refresh_token: 'rt', expiry_date: Date.now() + 3600_000 });
    expect(await resolveAccessToken(g.resolution)).toBe('fresh');
    expect(g.renew).not.toHaveBeenCalled();
  });

  it('renews within the last minute and saves what came back', async () => {
    const g = grant({ access_token: 'old', refresh_token: 'rt', expiry_date: Date.now() + 30_000 });
    const onRenewed = vi.fn();
    expect(await resolveAccessToken({ ...g.resolution, onRenewed })).toBe('renewed');
    expect(g.saves).toHaveLength(1);
    expect(onRenewed).toHaveBeenCalledOnce();
  });

  it('renews a fresh token on force, for the one retry after an upstream 401', async () => {
    const g = grant({ access_token: 'fresh', refresh_token: 'rt', expiry_date: Date.now() + 3600_000 });
    expect(await resolveAccessToken({ ...g.resolution, force: true })).toBe('renewed');
  });

  it('answers null for a refused renewal and leaves the grant alone', async () => {
    const g = grant({ access_token: 'old', refresh_token: 'rt', expiry_date: Date.now() - 1000 });
    g.renew.mockRejectedValue(new TokenRenewalRefusedError('invalid_grant'));
    expect(await resolveAccessToken(g.resolution)).toBeNull();
    expect(g.saves).toHaveLength(0);
  });

  it('on an outage keeps handing out the current token while it lasts, then says the renewal is unavailable', async () => {
    const early = grant({ access_token: 'still-good', refresh_token: 'rt', expiry_date: Date.now() + 30_000 });
    early.renew.mockRejectedValue(new TypeError('fetch failed'));
    expect(await resolveAccessToken(early.resolution)).toBe('still-good');

    const expired = grant({ access_token: 'gone', refresh_token: 'rt', expiry_date: Date.now() - 1000 });
    expired.renew.mockRejectedValue(new Error('503'));
    await expect(resolveAccessToken(expired.resolution)).rejects.toBeInstanceOf(TokenRenewalUnavailableError);
  });

  it('uses a grant that cannot be renewed until it expires, then answers null', async () => {
    const live = grant({ access_token: 'solo', expiry_date: Date.now() + 30_000 });
    expect(await resolveAccessToken(live.resolution)).toBe('solo');
    expect(live.renew).not.toHaveBeenCalled();

    const dead = grant({ access_token: 'solo', expiry_date: Date.now() - 1000 });
    expect(await resolveAccessToken(dead.resolution)).toBeNull();

    // A flow that mints anew counts as renewable with no refresh token at all.
    const minted = grant({ access_token: 'old', expiry_date: Date.now() - 1000 }, { renewable: () => true });
    expect(await resolveAccessToken(minted.resolution)).toBe('renewed');
  });

  it('shares one renewal between concurrent callers of the same grant', async () => {
    const g = grant({ access_token: 'old', refresh_token: 'rt', expiry_date: Date.now() - 1000 });
    let release!: () => void;
    g.renew.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ access_token: 'renewed', refresh_token: 'rt', expiry_date: Date.now() + 3600_000 });
    }));
    const a = resolveAccessToken(g.resolution);
    const b = resolveAccessToken(g.resolution);
    await new Promise((resolve) => setImmediate(resolve));
    release();
    expect(await Promise.all([a, b])).toEqual(['renewed', 'renewed']);
    expect(g.renew).toHaveBeenCalledOnce();
  });

  it('discards a renewal that finishes after the grant was replaced', async () => {
    const g = grant({ access_token: 'old', refresh_token: 'rt-old-account', expiry_date: Date.now() - 1000 });
    let release!: () => void;
    g.renew.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ access_token: 'renewed-old', refresh_token: 'rt-old-account', expiry_date: Date.now() + 3600_000 });
    }));
    const pending = resolveAccessToken(g.resolution);
    await new Promise((resolve) => setImmediate(resolve));
    g.replace({ access_token: 'restored', refresh_token: 'rt-restored', expiry_date: Date.now() + 3600_000 });
    release();
    expect(await pending).toBeNull();
    expect(g.saves).toHaveLength(0);
  });
});
