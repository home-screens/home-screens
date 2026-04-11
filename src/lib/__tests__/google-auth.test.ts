import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
}));

const mockWriteFile = vi.fn();
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: mockWriteFile,
}));

vi.mock('@/lib/secure-file', () => ({
  writeSecureFile: (...args: unknown[]) => mockWriteFile(...args),
}));

const mockRefreshAccessToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockRevokeToken = vi.fn();

vi.mock('googleapis', () => {
  // Must use function (not arrow) so it can be called with `new`
  const mockOAuth2 = vi.fn(function (this: Record<string, unknown>) {
    this.refreshAccessToken = mockRefreshAccessToken;
    this.setCredentials = mockSetCredentials;
    this.revokeToken = mockRevokeToken;
  });
  return {
    google: {
      auth: { OAuth2: mockOAuth2 },
    },
  };
});

// Dynamic import after mocks are in place
const { getSecret } = await import('@/lib/secrets');
const { readFile, writeFile } = await import('fs/promises');
const {
  requestDeviceCode,
  pollDeviceToken,
  getAuthenticatedClient,
  isAuthenticated,
  disconnect,
  hasGoogleCredentials,
} = await import('@/lib/google-auth');

const mockedGetSecret = vi.mocked(getSecret);
const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);

// ── Helpers ──────────────────────────────────────────────────────────

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
    mockedReadFile.mockRejectedValue(new Error('ENOENT'));
  } else {
    mockedReadFile.mockResolvedValue(JSON.stringify(tokens) as never);
  }
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  mockedGetSecret.mockReset();
  mockedReadFile.mockReset();
  mockedWriteFile.mockReset();
  mockRefreshAccessToken.mockReset();
  mockSetCredentials.mockReset();
  mockRevokeToken.mockReset();
});

// ── requestDeviceCode ────────────────────────────────────────────────

describe('requestDeviceCode', () => {
  it('throws when google_client_id is not configured', async () => {
    mockedGetSecret.mockResolvedValue(null);

    await expect(requestDeviceCode()).rejects.toThrow(
      'Google OAuth Client ID is not configured',
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

  it('throws with error field when no error_description', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'invalid_scope' },
      false,
      400,
    );

    await expect(requestDeviceCode()).rejects.toThrow('invalid_scope');
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
      'Google OAuth Client ID and Secret are not configured',
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
    mockedWriteFile.mockResolvedValue(undefined);

    const result = await pollDeviceToken('device-code');

    expect(result).toEqual({ status: 'success' });
    expect(mockedWriteFile).toHaveBeenCalledOnce();

    const writtenPath = mockedWriteFile.mock.calls[0][0] as string;
    expect(writtenPath).toContain('google-tokens.json');

    const writtenData = JSON.parse(mockedWriteFile.mock.calls[0][1] as string);
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
    mockedWriteFile.mockResolvedValue(undefined);

    const result = await pollDeviceToken('device-code');

    expect(result.status).toBe('success');
    expect(result.error).toContain('refresh token');
    expect(mockedWriteFile).toHaveBeenCalledOnce();
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
    mockedWriteFile.mockResolvedValue(undefined);

    await pollDeviceToken('device-code');

    const writtenData = JSON.parse(mockedWriteFile.mock.calls[0][1] as string);
    // expiry_date should be approximately Date.now() + 3600s (within a small margin)
    expect(writtenData.expiry_date).toBeGreaterThanOrEqual(beforeCall + 3600 * 1000);
    expect(writtenData.expiry_date).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
  });

  it('does not overwrite existing expiry_date', async () => {
    setupCredentials();
    // Use a distinctive value far in the future so it cannot be confused
    // with a computed expiry_date (Date.now() + expires_in * 1000)
    const existingExpiry = 9999999999999;
    const tokenData = {
      access_token: 'ya29.new-token',
      refresh_token: '1//new-refresh',
      expires_in: 3600,
      expiry_date: existingExpiry,
      token_type: 'Bearer',
    };
    globalThis.fetch = mockFetchResponse(tokenData);
    mockedWriteFile.mockResolvedValue(undefined);

    await pollDeviceToken('device-code');

    const writtenData = JSON.parse(mockedWriteFile.mock.calls[0][1] as string);
    expect(writtenData.expiry_date).toBe(existingExpiry);
  });

  it('returns pending for authorization_pending error', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'authorization_pending' },
      false,
      428,
    );

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'pending' });
  });

  it('returns pending for slow_down error', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'slow_down' },
      false,
      428,
    );

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'pending' });
  });

  it('returns expired for expired_token error', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'expired_token' },
      false,
      400,
    );

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'expired', error: 'Code expired. Please try again.' });
  });

  it('returns denied for access_denied error', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'access_denied' },
      false,
      403,
    );

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

  it('returns denied with error code when no error_description for unknown errors', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'some_weird_error' },
      false,
      400,
    );

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'denied', error: 'some_weird_error' });
  });

  it('returns denied with fallback message when no error fields present', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse({}, false, 400);

    const result = await pollDeviceToken('device-code');
    expect(result).toEqual({ status: 'denied', error: 'Unknown error' });
  });

  it('sends correct grant_type and device_code in request body', async () => {
    setupCredentials();
    globalThis.fetch = mockFetchResponse(
      { error: 'authorization_pending' },
      false,
      428,
    );

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

    const result = await isAuthenticated();
    expect(result).toBe(true);
  });

  it('returns false when no tokens file exists', async () => {
    setupTokensFile(null);

    const result = await isAuthenticated();
    expect(result).toBe(false);
  });

  it('returns true when tokens file has access_token but no refresh_token', async () => {
    setupTokensFile({ access_token: 'ya29.something', refresh_token: null });

    const result = await isAuthenticated();
    expect(result).toBe(true);
  });

  it('returns false when access_token only and expiry_date is in the past', async () => {
    setupTokensFile({ access_token: 'ya29.something', refresh_token: null, expiry_date: Date.now() - 60_000 });

    const result = await isAuthenticated();
    expect(result).toBe(false);
  });

  it('returns false when tokens file is empty object', async () => {
    setupTokensFile({});

    const result = await isAuthenticated();
    expect(result).toBe(false);
  });
});

// ── hasGoogleCredentials ─────────────────────────────────────────────

describe('hasGoogleCredentials', () => {
  it('returns true when both client_id and client_secret are set', async () => {
    setupCredentials();

    const result = await hasGoogleCredentials();
    expect(result).toBe(true);
  });

  it('returns false when client_id is missing', async () => {
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'google_client_secret') return 'secret';
      return null;
    });

    const result = await hasGoogleCredentials();
    expect(result).toBe(false);
  });

  it('returns false when client_secret is missing', async () => {
    mockedGetSecret.mockImplementation(async (key) => {
      if (key === 'google_client_id') return 'client-id';
      return null;
    });

    const result = await hasGoogleCredentials();
    expect(result).toBe(false);
  });

  it('returns false when both are missing', async () => {
    mockedGetSecret.mockResolvedValue(null);

    const result = await hasGoogleCredentials();
    expect(result).toBe(false);
  });
});

// ── disconnect ───────────────────────────────────────────────────────

describe('disconnect', () => {
  it('writes empty object to tokens file', async () => {
    setupCredentials();
    setupTokensFile(null); // no existing tokens
    mockedWriteFile.mockResolvedValue(undefined);

    await disconnect();

    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('google-tokens.json'),
      JSON.stringify({}),
    );
  });

  it('attempts to revoke token before clearing', async () => {
    setupCredentials();
    const tokens = makeTokens();
    setupTokensFile(tokens);
    mockRevokeToken.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);

    await disconnect();

    expect(mockRevokeToken).toHaveBeenCalledWith(tokens.access_token);
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('google-tokens.json'),
      JSON.stringify({}),
    );
  });

  it('handles revocation errors gracefully', async () => {
    setupCredentials();
    setupTokensFile(makeTokens());
    mockRevokeToken.mockRejectedValue(new Error('Network error'));
    mockedWriteFile.mockResolvedValue(undefined);

    // Should not throw
    await expect(disconnect()).resolves.toBeUndefined();

    // Still clears tokens file even when revocation fails
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('google-tokens.json'),
      JSON.stringify({}),
    );
  });

  it('does not attempt revocation when no access_token exists', async () => {
    setupCredentials();
    setupTokensFile({ refresh_token: '1//refresh-only' });
    mockedWriteFile.mockResolvedValue(undefined);

    await disconnect();

    expect(mockRevokeToken).not.toHaveBeenCalled();
    expect(mockedWriteFile).toHaveBeenCalled();
  });

  it('handles writeFile errors gracefully', async () => {
    setupCredentials();
    setupTokensFile(null);
    mockedWriteFile.mockRejectedValue(new Error('EACCES'));

    await expect(disconnect()).resolves.toBeUndefined();
  });
});

// ── getAuthenticatedClient ───────────────────────────────────────────

describe('getAuthenticatedClient', () => {
  it('returns null when no tokens exist', async () => {
    setupCredentials();
    setupTokensFile(null);

    const client = await getAuthenticatedClient();
    expect(client).toBeNull();
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

    const client = await getAuthenticatedClient();
    expect(client).toBeNull();
  });

  it('returns null when no refresh_token and no access_token', async () => {
    setupCredentials();
    setupTokensFile({});

    const client = await getAuthenticatedClient();
    expect(client).toBeNull();
  });

  it('returns client when tokens are valid and not expired', async () => {
    setupCredentials();
    const tokens = makeTokens({ expiry_date: Date.now() + 3_600_000 }); // 1 hour ahead
    setupTokensFile(tokens);

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(mockSetCredentials).toHaveBeenCalledWith(tokens);
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes token when expired (expiry_date in past)', async () => {
    setupCredentials();
    const tokens = makeTokens({ expiry_date: Date.now() - 120_000 }); // 2 minutes ago
    setupTokensFile(tokens);
    mockedWriteFile.mockResolvedValue(undefined);

    const newCredentials = {
      access_token: 'ya29.refreshed',
      expiry_date: Date.now() + 3_600_000,
      token_type: 'Bearer',
    };
    mockRefreshAccessToken.mockResolvedValue({ credentials: newCredentials });

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(mockRefreshAccessToken).toHaveBeenCalled();
    expect(mockedWriteFile).toHaveBeenCalled();
  });

  it('refreshes token when about to expire (within 60 seconds)', async () => {
    setupCredentials();
    const tokens = makeTokens({ expiry_date: Date.now() + 30_000 }); // 30 seconds from now
    setupTokensFile(tokens);
    mockedWriteFile.mockResolvedValue(undefined);

    const newCredentials = {
      access_token: 'ya29.refreshed',
      expiry_date: Date.now() + 3_600_000,
      token_type: 'Bearer',
    };
    mockRefreshAccessToken.mockResolvedValue({ credentials: newCredentials });

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(mockRefreshAccessToken).toHaveBeenCalled();
  });

  it('does not refresh when expiry is more than 60 seconds away', async () => {
    setupCredentials();
    const tokens = makeTokens({ expiry_date: Date.now() + 120_000 }); // 2 minutes from now
    setupTokensFile(tokens);

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes when no expiry_date and no access_token', async () => {
    setupCredentials();
    const tokens = { refresh_token: '1//refresh-only' };
    setupTokensFile(tokens);
    mockedWriteFile.mockResolvedValue(undefined);

    const newCredentials = {
      access_token: 'ya29.new',
      expiry_date: Date.now() + 3_600_000,
    };
    mockRefreshAccessToken.mockResolvedValue({ credentials: newCredentials });

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(mockRefreshAccessToken).toHaveBeenCalled();
  });

  it('does not refresh when no expiry_date but access_token exists', async () => {
    setupCredentials();
    const tokens = { refresh_token: '1//refresh', access_token: 'ya29.valid' };
    setupTokensFile(tokens);

    const client = await getAuthenticatedClient();

    expect(client).not.toBeNull();
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('returns null when refresh fails (revoked token)', async () => {
    setupCredentials();
    const tokens = makeTokens({ expiry_date: Date.now() - 120_000 }); // expired
    setupTokensFile(tokens);

    mockRefreshAccessToken.mockRejectedValue(new Error('Token has been revoked'));

    const client = await getAuthenticatedClient();
    expect(client).toBeNull();
  });

  it('preserves original refresh_token after refresh', async () => {
    setupCredentials();
    const originalRefreshToken = '1//original-refresh-token';
    const tokens = makeTokens({
      refresh_token: originalRefreshToken,
      expiry_date: Date.now() - 120_000,
    });
    setupTokensFile(tokens);
    mockedWriteFile.mockResolvedValue(undefined);

    // Google's refresh response often omits refresh_token
    const newCredentials = {
      access_token: 'ya29.refreshed',
      expiry_date: Date.now() + 3_600_000,
      token_type: 'Bearer',
      // Note: no refresh_token returned
    };
    mockRefreshAccessToken.mockResolvedValue({ credentials: newCredentials });

    await getAuthenticatedClient();

    const writtenData = JSON.parse(mockedWriteFile.mock.calls[0][1] as string);
    expect(writtenData.refresh_token).toBe(originalRefreshToken);
    expect(writtenData.access_token).toBe('ya29.refreshed');
  });

  it('sets credentials with merged tokens after refresh', async () => {
    setupCredentials();
    const originalRefreshToken = '1//keep-this';
    const tokens = makeTokens({
      refresh_token: originalRefreshToken,
      expiry_date: Date.now() - 60_000,
    });
    setupTokensFile(tokens);
    mockedWriteFile.mockResolvedValue(undefined);

    const newCredentials = {
      access_token: 'ya29.new-access',
      expiry_date: Date.now() + 3_600_000,
    };
    mockRefreshAccessToken.mockResolvedValue({ credentials: newCredentials });

    await getAuthenticatedClient();

    // Second setCredentials call should have the merged tokens
    const lastSetCredentialsCall = mockSetCredentials.mock.calls[1][0];
    expect(lastSetCredentialsCall.refresh_token).toBe(originalRefreshToken);
    expect(lastSetCredentialsCall.access_token).toBe('ya29.new-access');
  });
});
