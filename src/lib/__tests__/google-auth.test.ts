import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
}));

// The token store persists through createJsonStore; stub it with an
// in-memory file-per-path so tests can seed and observe writes.
const mockWriteFile = vi.fn();
const storeFiles = new Map<string, string>();

vi.mock('@/lib/json-store', () => ({
  createJsonStore: (opts: { path: string; defaultValue: unknown }) => ({
    read: async () => {
      const raw = storeFiles.get(opts.path);
      return raw === undefined ? structuredClone(opts.defaultValue) : JSON.parse(raw);
    },
    write: async (data: unknown) => {
      const raw = JSON.stringify(data, null, 2);
      await mockWriteFile(opts.path, raw);
      storeFiles.set(opts.path, raw);
    },
    updateAtomic: async () => { throw new Error('updateAtomic is not used by the token store'); },
    remove: async () => { storeFiles.delete(opts.path); },
    get filePath() { return opts.path; },
  }),
}));

const mockSetCredentials = vi.fn();

vi.mock('googleapis', () => {
  // Must use function (not arrow) so it can be called with `new`
  const mockOAuth2 = vi.fn(function (this: Record<string, unknown>) {
    this.setCredentials = mockSetCredentials;
  });
  return {
    google: {
      auth: { OAuth2: mockOAuth2 },
    },
  };
});

// Dynamic import after mocks are in place
const { getSecret } = await import('@/lib/secrets');
const {
  requestDeviceCode,
  pollDeviceToken,
  getAuthenticatedClient,
  isAuthenticated,
  disconnect,
  hasGoogleCredentials,
} = await import('@/lib/google-auth');

const mockedGetSecret = vi.mocked(getSecret);

// ── Helpers ──────────────────────────────────────────────────────────

const TOKENS_PATH = 'data/google-tokens.json';

function mockFetchResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

function makeTokens(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'ya29.access-token',
    refresh_token: '1//refresh-token',
    expiry_date: Date.now() + 3_600_000, // 1 hour from now
    token_type: 'Bearer',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    ...overrides,
  };
}

function setupCredentials(clientId = 'test-client-id', clientSecret = 'test-client-secret') {
  mockedGetSecret.mockImplementation(async (key) => {
    if (key === 'google_client_id') return clientId;
    if (key === 'google_client_secret') return clientSecret;
    return null;
  });
}

function setupTokensFile(tokens: Record<string, unknown> | null) {
  if (tokens === null) {
    storeFiles.delete(TOKENS_PATH);
  } else {
    storeFiles.set(TOKENS_PATH, JSON.stringify(tokens));
  }
}

/** Fetch stub that answers Google's token endpoint (refresh grant). */
function mockRefreshFetch(body: unknown, ok = true) {
  const impl = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) {
      return { ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) };
    }
    if (url.includes('oauth2.googleapis.com/revoke')) {
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.unstubAllGlobals();
  mockedGetSecret.mockReset();
  storeFiles.clear();
  mockWriteFile.mockReset();
  mockSetCredentials.mockReset();
});

// ── requestDeviceCode ────────────────────────────────────────────────

describe('requestDeviceCode', () => {
  it('throws when google_client_id is not configured', async () => {
    mockedGetSecret.mockResolvedValue(null);

    await expect(requestDeviceCode()).rejects.toThrow(
      'Google Calendar Client ID is not configured',
    );
  });

  it('makes POST to device code URL with correct body', async () => {
    setupCredentials();
    const deviceResponse = {
      device_code: 'dev-code-123',
      user_code: 'ABCD-EFGH',
      verification_url: 'https://www.google.com/device',
      expires_in: 1800,
      interval: 5,
    };
    globalThis.fetch = mockFetchResponse(deviceResponse);

    await requestDeviceCode();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/device/code',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = call[1]!.body as URLSearchParams;
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly');
  });

  it('returns device code response on success', async () => {
    setupCredentials();
    const deviceResponse = {
      device_code: 'dev-code-123',
      user_code: 'ABCD-EFGH',
      verification_url: 'https://www.google.com/device',
      expires_in: 1800,
      interval: 5,
    };
    globalThis.fetch = mockFetchResponse(deviceResponse);

    const result = await requestDeviceCode();

    expect(result).toEqual(deviceResponse);
  });

  it('throws with error_description from Google on failure', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'invalid_client', error_description: 'The OAuth client was not found.' },
      false,
      401,
    );

    await expect(requestDeviceCode()).rejects.toThrow('The OAuth client was not found.');
  });

  it('throws with fallback message when neither error field is present', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse({}, false, 400);

    await expect(requestDeviceCode()).rejects.toThrow('Failed to request device code');
  });
});

// ── pollDeviceToken ──────────────────────────────────────────────────

describe('pollDeviceToken', () => {
  it('throws when client ID or secret missing', async () => {
    mockedGetSecret.mockResolvedValue(null);

    await expect(pollDeviceToken('device-code')).rejects.toThrow(
      'Google Calendar Client ID and Secret are not configured',
    );
  });

  it('returns success and writes tokens to file on success', async () => {
    setupCredentials();
    const tokenData = {
      access_token: 'ya29.new-token',
      refresh_token: '1//new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    };
    globalThis.fetch = mockFetchResponse(tokenData);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await pollDeviceToken('device-code');

    expect(result).toEqual({ status: 'success' });
    expect(mockWriteFile).toHaveBeenCalledOnce();

    const writtenPath = mockWriteFile.mock.calls[0][0] as string;
    expect(writtenPath).toContain('google-tokens.json');

    const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenData.access_token).toBe('ya29.new-token');
    expect(writtenData.refresh_token).toBe('1//new-refresh');
  });

  it('returns success with warning when no refresh_token in response', async () => {
    setupCredentials();
    const tokenData = {
      access_token: 'ya29.new-token',
      expires_in: 3600,
      token_type: 'Bearer',
    };
    globalThis.fetch = mockFetchResponse(tokenData);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await pollDeviceToken('device-code');

    expect(result.status).toBe('success');
    expect(result.error).toContain('refresh token');
    expect(mockWriteFile).toHaveBeenCalledOnce();
  });

  it('computes expiry_date from expires_in when not present', async () => {
    setupCredentials();
    const beforeCall = Date.now();

    const tokenData = {
      access_token: 'ya29.new-token',
      refresh_token: '1//new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    };
    globalThis.fetch = mockFetchResponse(tokenData);
    mockWriteFile.mockResolvedValue(undefined);

    await pollDeviceToken('device-code');

    const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenData.expiry_date).toBeGreaterThanOrEqual(beforeCall + 3600 * 1000);
    expect(writtenData.expiry_date).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  it('does not overwrite existing expiry_date', async () => {
    setupCredentials();
    const existingExpiry = 9999999999999;
    const tokenData = {
      access_token: 'ya29.new-token',
      refresh_token: '1//new-refresh',
      expires_in: 3600,
      expiry_date: existingExpiry,
      token_type: 'Bearer',
    };
    globalThis.fetch = mockFetchResponse(tokenData);
    mockWriteFile.mockResolvedValue(undefined);

    await pollDeviceToken('device-code');

    const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenData.expiry_date).toBe(existingExpiry);
  });

  it('returns pending for authorization_pending and slow_down', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse({ error: 'authorization_pending' }, false, 428);
    expect((await pollDeviceToken('device-code')).status).toBe('pending');

    globalThis.fetch = mockFetchResponse({ error: 'slow_down' }, false, 428);
    expect((await pollDeviceToken('device-code')).status).toBe('pending');
  });

  it('returns expired for expired_token error', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse({ error: 'expired_token' }, false, 400);

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'expired', error: 'Code expired. Please try again.' });
  });

  it('returns denied for access_denied error', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse({ error: 'access_denied' }, false, 403);

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'denied', error: 'Access was denied.' });
  });

  it('returns denied with error_description for unknown errors', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'some_weird_error', error_description: 'Something went wrong' },
      false,
      400,
    );

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'denied', error: 'Something went wrong' });
  });

  it('returns denied with fallback message when no error fields present', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse({}, false, 400);

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'denied', error: 'Unknown error' });
  });

  it('sends correct grant_type and device_code in request body', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse({ error: 'authorization_pending' }, false, 428);

    await pollDeviceToken('my-device-code-xyz');

    const call = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(call[0]).toBe('https://oauth2.googleapis.com/token');
    const body = call[1]!.body as URLSearchParams;
    expect(body.get('device_code')).toBe('my-device-code-xyz');
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('client_secret')).toBe('test-client-secret');
  });
});

// ── isAuthenticated ──────────────────────────────────────────────────

describe('isAuthenticated', () => {
  it('returns true when refresh_token exists in stored tokens', async () => {
    setupTokensFile(makeTokens());
    expect(await isAuthenticated()).toBe(true);
  });

  it('returns false when no tokens file exists', async () => {
    setupTokensFile(null);
    expect(await isAuthenticated()).toBe(false);
  });

  it('returns true when tokens file has access_token but no refresh_token', async () => {
    setupTokensFile({ access_token: 'ya29.something', refresh_token: null });
    expect(await isAuthenticated()).toBe(true);
  });

  it('returns false when access_token only and expiry_date is in the past', async () => {
    setupTokensFile({ access_token: 'ya29.something', refresh_token: null, expiry_date: Date.now() - 60_000 });
    expect(await isAuthenticated()).toBe(false);
  });

  it('returns false when tokens file is empty object', async () => {
    setupTokensFile({});
    expect(await isAuthenticated()).toBe(false);
  });
});

// ── hasGoogleCredentials ─────────────────────────────────────────────

describe('hasGoogleCredentials', () => {
  it('returns true when both client_id and client_secret are set', async () => {
    setupCredentials();
    expect(await hasGoogleCredentials()).toBe(true);
  });

  it('returns false when either credential is missing', async () => {
    mockedGetSecret.mockImplementation(async (key) => (key === 'google_client_secret' ? 'secret' : null));
    expect(await hasGoogleCredentials()).toBe(false);

    mockedGetSecret.mockImplementation(async (key) => (key === 'google_client_id' ? 'client-id' : null));
    expect(await hasGoogleCredentials()).toBe(false);

    mockedGetSecret.mockResolvedValue(null);
    expect(await hasGoogleCredentials()).toBe(false);
  });
});

// ── disconnect ───────────────────────────────────────────────────────

describe('disconnect', () => {
  it('writes empty object to tokens file', async () => {
    setupCredentials();
    setupTokensFile(null); // no existing tokens
    mockWriteFile.mockResolvedValue(undefined);

    await disconnect();

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('google-tokens.json'),
      JSON.stringify({}, null, 2),
    );
  });

  it('revokes the access token via Google before clearing', async () => {
    setupCredentials();
    const tokens = makeTokens();
    setupTokensFile(tokens);
    mockWriteFile.mockResolvedValue(undefined);
    const fetchMock = mockRefreshFetch({});

    await disconnect();

    const revokeCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/revoke'))!;
    expect(revokeCall).toBeDefined();
    const body = revokeCall[1]!.body as URLSearchParams;
    expect(body.get('token')).toBe(tokens.access_token);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('google-tokens.json'),
      JSON.stringify({}, null, 2),
    );
  });

  it('handles revocation errors gracefully', async () => {
    setupCredentials();
    setupTokensFile(makeTokens());
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    mockWriteFile.mockResolvedValue(undefined);

    await expect(disconnect()).resolves.toBeUndefined();

    // Still clears tokens file even when revocation fails
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('google-tokens.json'),
      JSON.stringify({}, null, 2),
    );
  });

  it('does not attempt revocation when no access_token exists', async () => {
    setupCredentials();
    setupTokensFile({ refresh_token: '1//refresh-only' });
    mockWriteFile.mockResolvedValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await disconnect();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });
});

// ── getAuthenticatedClient ───────────────────────────────────────────

describe('getAuthenticatedClient', () => {
  it('returns null when no tokens exist', async () => {
    setupCredentials();
    setupTokensFile(null);

    expect(await getAuthenticatedClient()).toBeNull();
  });

  it('returns client using access_token when no refresh_token in stored tokens', async () => {
    setupCredentials();
    setupTokensFile({ access_token: 'ya29.something' });

    const client = await getAuthenticatedClient();
    expect(client).not.toBeNull();
    expect(mockSetCredentials).toHaveBeenCalledWith({ access_token: 'ya29.something' });
  });

  it('returns null when access_token only and expired', async () => {
    setupCredentials();
    setupTokensFile({ access_token: 'ya29.expired', expiry_date: Date.now() - 60_000 });

    expect(await getAuthenticatedClient()).toBeNull();
  });

  it('returns client without refreshing when tokens are fresh', async () => {
    setupCredentials();
    setupTokensFile(makeTokens({ expiry_date: Date.now() + 3_600_000 }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(mockSetCredentials).toHaveBeenCalledWith({ access_token: 'ya29.access-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes via Google when the access token is expired', async () => {
    setupCredentials();
    setupTokensFile(makeTokens({ expiry_date: Date.now() - 120_000 }));
    mockWriteFile.mockResolvedValue(undefined);
    const fetchMock = mockRefreshFetch({ access_token: 'ya29.refreshed', expires_in: 3600 });

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    const refreshCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/token'))!;
    const body = refreshCall[1]!.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('1//refresh-token');
    expect(mockSetCredentials).toHaveBeenCalledWith({ access_token: 'ya29.refreshed' });
  });

  it('refreshes when the token expires within 60 seconds', async () => {
    setupCredentials();
    setupTokensFile(makeTokens({ expiry_date: Date.now() + 30_000 }));
    mockWriteFile.mockResolvedValue(undefined);
    const fetchMock = mockRefreshFetch({ access_token: 'ya29.refreshed', expires_in: 3600 });

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('preserves the original refresh_token when Google omits it on refresh', async () => {
    setupCredentials();
    const originalRefreshToken = '1//original-refresh-token';
    setupTokensFile(makeTokens({ refresh_token: originalRefreshToken, expiry_date: Date.now() - 120_000 }));
    mockWriteFile.mockResolvedValue(undefined);
    mockRefreshFetch({ access_token: 'ya29.refreshed', expires_in: 3600 });

    await getAuthenticatedClient();

    const writtenData = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
    expect(writtenData.refresh_token).toBe(originalRefreshToken);
    expect(writtenData.access_token).toBe('ya29.refreshed');
  });

  it('returns null when refresh fails (revoked token)', async () => {
    setupCredentials();
    setupTokensFile(makeTokens({ expiry_date: Date.now() - 120_000 }));
    mockRefreshFetch({ error: 'invalid_grant' }, false);

    expect(await getAuthenticatedClient()).toBeNull();
  });
});
