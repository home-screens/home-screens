import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-plugin-auth-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

/** Seed a plugin manifest on disk so getPluginManifest/getPluginSecret resolve. */
async function seedManifest(pluginId: string, manifest: Record<string, unknown>) {
  const dir = path.join(tmpDir, 'data', 'plugins', pluginId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ id: pluginId, name: pluginId, version: '1.0.0', moduleType: 'w', category: 'c', ...manifest }),
  );
}

/** Write out-of-tree plugin secrets directly (bypasses manifest validation). */
async function seedSecret(pluginId: string, keyOrObj: string | Record<string, string>, value?: string) {
  const dir = path.join(tmpDir, 'data', 'plugin-secrets');
  await fs.mkdir(dir, { recursive: true });
  const obj = typeof keyOrObj === 'string' ? { [keyOrObj]: value as string } : keyOrObj;
  await fs.writeFile(path.join(dir, `${pluginId}.json`), JSON.stringify(obj));
}

function jsonResponse(body: unknown, init?: { status?: number; setCookie?: string[] }): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const c of init?.setCookie ?? []) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers });
}

const OAUTH_MANIFEST = {
  secrets: [{ key: 'client_id', label: 'Client ID', required: true }],
  allowedDomains: ['api.example.com'],
  auth: {
    type: 'oauth2',
    flow: 'authorization_code',
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['read'],
    tokenPlacement: 'header',
    tokenTargetDomains: ['api.example.com'],
    secrets: { clientId: 'client_id' },
  },
};

const DEVICE_MANIFEST = {
  secrets: [{ key: 'client_id', label: 'Client ID', required: true }],
  allowedDomains: ['api.example.com'],
  auth: {
    type: 'oauth2',
    flow: 'device_code',
    authorizationUrl: 'https://auth.example.com/device',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['read'],
    tokenPlacement: 'header',
    tokenTargetDomains: ['api.example.com'],
    secrets: { clientId: 'client_id' },
  },
};

const CLIENT_CREDS_MANIFEST = {
  secrets: [
    { key: 'client_id', label: 'Client ID', required: true },
    { key: 'client_secret', label: 'Client Secret', required: true },
  ],
  allowedDomains: ['api.example.com'],
  auth: {
    type: 'oauth2',
    flow: 'client_credentials',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['read'],
    tokenPlacement: 'header',
    tokenTargetDomains: ['api.example.com'],
    clientAuthentication: 'header',
    secrets: { clientId: 'client_id', clientSecret: 'client_secret' },
  },
};

describe('plugin-auth token storage', () => {
  it('saves, loads, and deletes tokens round-trip', async () => {
    const { savePluginTokens, loadPluginTokens, deletePluginTokens } = await import('../plugin-auth');
    const tokens = { access_token: 'a', refresh_token: 'r', token_type: 'Bearer', expiry_date: Date.now() + 100000 };
    await savePluginTokens('p1', tokens);
    expect(await loadPluginTokens('p1')).toMatchObject({ access_token: 'a', refresh_token: 'r' });
    await deletePluginTokens('p1');
    expect(await loadPluginTokens('p1')).toBeNull();
  });

  it('writes token files with 0600 permissions', async () => {
    const { savePluginTokens } = await import('../plugin-auth');
    await savePluginTokens('p1', { access_token: 'a', token_type: 'Bearer', expiry_date: Date.now() + 1000 });
    const stat = await fs.stat(path.join(tmpDir, 'data', 'plugin-tokens', 'p1.json'));
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('plugin-auth redirect URI derivation', () => {
  it('uses the Host header over the bind-address host in request.url', async () => {
    const { getPluginAuthRedirectUri } = await import('../plugin-auth');
    const request = new Request('http://0.0.0.0:3000/api/plugins/auth/strava/start', {
      headers: { host: '192.168.86.175:3000' },
    });
    expect(getPluginAuthRedirectUri(request)).toBe(
      'http://192.168.86.175:3000/api/plugins/auth/callback',
    );
  });

  it('prefers x-forwarded-host and x-forwarded-proto behind a reverse proxy', async () => {
    const { getPluginAuthRedirectUri } = await import('../plugin-auth');
    const request = new Request('http://0.0.0.0:3000/api/plugins/auth/strava/start', {
      headers: {
        host: '192.168.86.175:3000',
        'x-forwarded-host': 'screens.example.com',
        'x-forwarded-proto': 'https',
      },
    });
    expect(getPluginAuthRedirectUri(request)).toBe(
      'https://screens.example.com/api/plugins/auth/callback',
    );
  });

  it('falls back to the request URL host when no Host header is present', async () => {
    const { getPluginAuthRedirectUri } = await import('../plugin-auth');
    const request = new Request('http://localhost:3000/api/plugins/auth/strava/start');
    request.headers.delete('host');
    expect(getPluginAuthRedirectUri(request)).toBe(
      'http://localhost:3000/api/plugins/auth/callback',
    );
  });
});

describe('plugin-auth state signing', () => {
  it('signs and verifies a state parameter round-trip', async () => {
    const { signAuthFlowState, verifyAuthFlowState } = await import('../plugin-auth');
    const state = await signAuthFlowState('spotify');
    expect(await verifyAuthFlowState(state)).toBe('spotify');
  });

  it('rejects a tampered state', async () => {
    const { signAuthFlowState, verifyAuthFlowState } = await import('../plugin-auth');
    const state = await signAuthFlowState('spotify');
    const tampered = state.slice(0, -2) + (state.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifyAuthFlowState(tampered)).toBeNull();
  });

  it('rejects a malformed state', async () => {
    const { verifyAuthFlowState } = await import('../plugin-auth');
    expect(await verifyAuthFlowState('not-a-real-state')).toBeNull();
  });

  it('concurrent first-time signs share one persisted secret', async () => {
    const { signAuthFlowState } = await import('../plugin-auth');
    // Both start before the .state-secret file exists. Un-serialized, each
    // read misses, each generates its own secret, and only one write
    // survives — the loser's state then fails verification at the callback.
    const [stateA, stateB] = await Promise.all([
      signAuthFlowState('spotify'),
      signAuthFlowState('garmin'),
    ]);

    // Verify through a fresh module instance so verification reads the
    // persisted file, not any in-memory memo. Both states must match what
    // actually landed on disk.
    vi.resetModules();
    const fresh = await import('../plugin-auth');
    expect(await fresh.verifyAuthFlowState(stateA)).toBe('spotify');
    expect(await fresh.verifyAuthFlowState(stateB)).toBe('garmin');
  });
});

describe('plugin-auth getValidAccessToken', () => {
  it('returns a fresh token without hitting the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await seedManifest('p1', OAUTH_MANIFEST);
    const { savePluginTokens, getValidAccessToken } = await import('../plugin-auth');
    await savePluginTokens('p1', { access_token: 'fresh', refresh_token: 'r', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });
    expect(await getValidAccessToken('p1')).toBe('fresh');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and preserves the refresh_token when the provider omits it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'renewed', expires_in: 3600 }), // no refresh_token in response
    );
    vi.stubGlobal('fetch', fetchMock);
    await seedManifest('p1', OAUTH_MANIFEST);
    await seedSecret('p1', 'client_id', 'cid');
    const { savePluginTokens, getValidAccessToken, loadPluginTokens } = await import('../plugin-auth');
    await savePluginTokens('p1', { access_token: 'stale', refresh_token: 'keep-me', token_type: 'Bearer', expiry_date: Date.now() - 1000 });

    expect(await getValidAccessToken('p1')).toBe('renewed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stored = await loadPluginTokens('p1');
    expect(stored?.access_token).toBe('renewed');
    expect(stored?.refresh_token).toBe('keep-me'); // preserved across refresh
  });

  it('returns null and leaves nothing when there are no stored tokens', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await seedManifest('p1', OAUTH_MANIFEST);
    const { getValidAccessToken } = await import('../plugin-auth');
    expect(await getValidAccessToken('p1')).toBeNull();
  });
});

describe('plugin-auth authorization_code callback', () => {
  it('applies tokenResponseTransform to a non-standard token response', async () => {
    await seedManifest('p1', {
      ...OAUTH_MANIFEST,
      auth: {
        ...OAUTH_MANIFEST.auth,
        tokenResponseTransform: { accessTokenPath: 'data.token', expiresInPath: 'data.ttl' },
      },
    });
    await seedSecret('p1', 'client_id', 'cid');
    const { signAuthFlowState, savePendingAuth, handleAuthorizationCodeCallback, loadPluginTokens } = await import('../plugin-auth');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ data: { token: 'nested-access', ttl: 7200 } }),
    ));
    await savePendingAuth('p1', { kind: 'authorization_code', redirectUri: 'http://localhost/api/plugins/auth/callback' });
    const state = await signAuthFlowState('p1');

    const pluginId = await handleAuthorizationCodeCallback('the-code', state);
    expect(pluginId).toBe('p1');
    const stored = await loadPluginTokens('p1');
    expect(stored?.access_token).toBe('nested-access');
    expect(stored?.expiry_date).toBeGreaterThan(Date.now() + 7000_000);
  });

  it('rejects a callback whose state fails verification', async () => {
    await seedManifest('p1', OAUTH_MANIFEST);
    const { handleAuthorizationCodeCallback } = await import('../plugin-auth');
    await expect(handleAuthorizationCodeCallback('code', 'bogus.state')).rejects.toThrow();
  });

  it('surfaces the provider error when the token exchange fails', async () => {
    await seedManifest('p1', OAUTH_MANIFEST);
    await seedSecret('p1', 'client_id', 'cid');
    const { signAuthFlowState, savePendingAuth, handleAuthorizationCodeCallback } = await import('../plugin-auth');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'invalid_grant', error_description: 'code used' }, { status: 400 }),
    ));
    await savePendingAuth('p1', { kind: 'authorization_code', redirectUri: 'http://localhost/api/plugins/auth/callback' });
    const state = await signAuthFlowState('p1');
    await expect(handleAuthorizationCodeCallback('the-code', state)).rejects.toThrow(/code used/);
  });

  it('rejects a callback with no matching pending state', async () => {
    await seedManifest('p1', OAUTH_MANIFEST);
    const { signAuthFlowState, handleAuthorizationCodeCallback } = await import('../plugin-auth');
    const state = await signAuthFlowState('p1');
    await expect(handleAuthorizationCodeCallback('the-code', state)).rejects.toThrow(/expired/i);
  });
});

describe('plugin-auth device_code flow', () => {
  it('starts the flow, honoring the provider code lifetime for the pending TTL', async () => {
    await seedManifest('p1', DEVICE_MANIFEST);
    await seedSecret('p1', 'client_id', 'cid');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      device_code: 'DC', user_code: 'WXYZ', verification_uri: 'https://ex/act', expires_in: 1800, interval: 5,
    })));
    const { startDeviceFlow, loadPendingAuth } = await import('../plugin-auth');
    const start = await startDeviceFlow('p1', DEVICE_MANIFEST.auth as never);
    expect(start).toMatchObject({ userCode: 'WXYZ', verificationUrl: 'https://ex/act', expiresIn: 1800 });
    const pending = await loadPendingAuth('p1');
    // Pending expiry follows the provider's 1800s code, not a fixed 10-min window.
    expect(pending?.expiresAt).toBeGreaterThan(Date.now() + 20 * 60 * 1000);
  });

  it('answers "pending" without hitting the provider when polled before the interval', async () => {
    await seedManifest('p1', DEVICE_MANIFEST);
    const { savePendingAuth, pollDeviceFlow } = await import('../plugin-auth');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await savePendingAuth('p1', {
      kind: 'device_code', deviceCode: 'DC', intervalMs: 5000, nextPollAt: Date.now() + 5000,
    });
    expect(await pollDeviceFlow('p1', DEVICE_MANIFEST.auth as never)).toEqual({ status: 'pending' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports pending on authorization_pending and backs off on slow_down', async () => {
    await seedManifest('p1', DEVICE_MANIFEST);
    await seedSecret('p1', 'client_id', 'cid');
    const { savePendingAuth, pollDeviceFlow, loadPendingAuth } = await import('../plugin-auth');
    await savePendingAuth('p1', {
      kind: 'device_code', deviceCode: 'DC', intervalMs: 5000, nextPollAt: Date.now() - 1,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'slow_down' }, { status: 400 })));
    expect(await pollDeviceFlow('p1', DEVICE_MANIFEST.auth as never)).toEqual({ status: 'pending' });
    const pending = await loadPendingAuth('p1');
    expect(pending?.kind === 'device_code' && pending.intervalMs).toBe(10000); // +5000
  });

  it('stores tokens and clears pending on a successful poll', async () => {
    await seedManifest('p1', DEVICE_MANIFEST);
    await seedSecret('p1', 'client_id', 'cid');
    const { savePendingAuth, pollDeviceFlow, loadPluginTokens, loadPendingAuth } = await import('../plugin-auth');
    await savePendingAuth('p1', {
      kind: 'device_code', deviceCode: 'DC', intervalMs: 5000, nextPollAt: Date.now() - 1,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access_token: 'AT', expires_in: 3600 })));
    expect(await pollDeviceFlow('p1', DEVICE_MANIFEST.auth as never)).toEqual({ status: 'connected' });
    expect((await loadPluginTokens('p1'))?.access_token).toBe('AT');
    expect(await loadPendingAuth('p1')).toBeNull();
  });

  it('reports expired on expired_token and clears pending', async () => {
    await seedManifest('p1', DEVICE_MANIFEST);
    await seedSecret('p1', 'client_id', 'cid');
    const { savePendingAuth, pollDeviceFlow, loadPendingAuth } = await import('../plugin-auth');
    await savePendingAuth('p1', {
      kind: 'device_code', deviceCode: 'DC', intervalMs: 5000, nextPollAt: Date.now() - 1,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'expired_token' }, { status: 400 })));
    const res = await pollDeviceFlow('p1', DEVICE_MANIFEST.auth as never);
    expect(res.status).toBe('expired');
    expect(await loadPendingAuth('p1')).toBeNull();
  });

  it('serializes concurrent polls into a single provider call', async () => {
    await seedManifest('p1', DEVICE_MANIFEST);
    await seedSecret('p1', 'client_id', 'cid');
    const { savePendingAuth, pollDeviceFlow } = await import('../plugin-auth');
    await savePendingAuth('p1', {
      kind: 'device_code', deviceCode: 'DC', intervalMs: 5000, nextPollAt: Date.now() - 1,
    });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'authorization_pending' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = DEVICE_MANIFEST.auth as never;
    await Promise.all([pollDeviceFlow('p1', auth), pollDeviceFlow('p1', auth), pollDeviceFlow('p1', auth)]);
    // Three concurrent polls collapse to one token-endpoint POST.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('plugin-auth client_credentials flow', () => {
  it('mints a token with HTTP Basic client auth (no refresh token)', async () => {
    await seedManifest('p1', CLIENT_CREDS_MANIFEST);
    await seedSecret('p1', { client_id: 'cid', client_secret: 'sek' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'CC', expires_in: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    const { runClientCredentialsFlow, loadPluginTokens } = await import('../plugin-auth');
    await runClientCredentialsFlow('p1', CLIENT_CREDS_MANIFEST.auth as never);
    expect((await loadPluginTokens('p1'))?.access_token).toBe('CC');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Basic ' + Buffer.from('cid:sek').toString('base64'));
  });

  it('re-mints via client_credentials when a token expires without a refresh token', async () => {
    await seedManifest('p1', CLIENT_CREDS_MANIFEST);
    await seedSecret('p1', { client_id: 'cid', client_secret: 'sek' });
    const { savePluginTokens, getValidAccessToken } = await import('../plugin-auth');
    await savePluginTokens('p1', { access_token: 'old', token_type: 'Bearer', expiry_date: Date.now() - 1000 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ access_token: 'reminted', expires_in: 3600 })));
    expect(await getValidAccessToken('p1')).toBe('reminted');
  });
});

describe('plugin-auth disconnect', () => {
  it('revokes at the provider (with revokeUrl) then clears local state', async () => {
    await seedManifest('p1', {
      ...OAUTH_MANIFEST,
      auth: { ...OAUTH_MANIFEST.auth, revokeUrl: 'https://auth.example.com/revoke' },
    });
    await seedSecret('p1', 'client_id', 'cid');
    const { savePluginTokens, disconnectPluginAuth, loadPluginTokens } = await import('../plugin-auth');
    await savePluginTokens('p1', { access_token: 'AT', refresh_token: 'RT', token_type: 'Bearer', expiry_date: Date.now() + 1000 });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    await disconnectPluginAuth('p1');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/revoke');
    expect(fetchMock.mock.calls[0][1].body.toString()).toContain('token=AT');
    expect(await loadPluginTokens('p1')).toBeNull();
  });

  it('still clears local state when revocation errors', async () => {
    await seedManifest('p1', {
      ...OAUTH_MANIFEST,
      auth: { ...OAUTH_MANIFEST.auth, revokeUrl: 'https://auth.example.com/revoke' },
    });
    await seedSecret('p1', 'client_id', 'cid');
    const { savePluginTokens, disconnectPluginAuth, loadPluginTokens } = await import('../plugin-auth');
    await savePluginTokens('p1', { access_token: 'AT', token_type: 'Bearer', expiry_date: Date.now() + 1000 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await disconnectPluginAuth('p1');
    expect(await loadPluginTokens('p1')).toBeNull();
  });
});

describe('plugin-auth tokenInjectionSpec', () => {
  it('scopes a Garmin bearer to garmin.com hosts only', async () => {
    const { tokenInjectionSpec } = await import('../plugin-auth');
    const spec = tokenInjectionSpec({ type: 'garmin' }, ['connectapi.garmin.com', 'cdn.example.com']);
    expect(spec).toEqual({ targetDomains: ['connectapi.garmin.com'], placement: 'header' });
  });

  it('uses the declared target domains + placement for oauth2', async () => {
    const { tokenInjectionSpec } = await import('../plugin-auth');
    const spec = tokenInjectionSpec(
      { ...OAUTH_MANIFEST.auth, tokenPlacement: 'query', tokenParamName: 'token' } as never,
      ['api.example.com', 'cdn.example.com'],
    );
    expect(spec).toEqual({ targetDomains: ['api.example.com'], placement: 'query', paramName: 'token' });
  });
});
