import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-garmin-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

function jsonResponse(body: unknown, init?: { status?: number; setCookie?: string[] }): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const c of init?.setCookie ?? []) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

const CONSUMER = { consumer_key: 'ck', consumer_secret: 'cs' };
const OAUTH1 = 'oauth_token=OT1&oauth_token_secret=OS1';

/**
 * Route the Garmin flow's fetches by URL so tests stay robust to call
 * ordering (sign-in page priming, consumer fetch, preauthorization, exchange).
 * Overrides let a test swap in an error or MFA response for one leg.
 */
function garminFetchMock(overrides: Partial<{
  login: Response;
  mfa: Response;
  preauth: Response;
  exchange: Response;
}> = {}) {
  return vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/mobile/sso/en/sign-in')) return new Response('<html></html>', { status: 200 });
    if (url.includes('thegarth.s3.amazonaws.com')) return jsonResponse(CONSUMER);
    if (url.includes('/mobile/api/login')) return overrides.login ?? jsonResponse({ serviceTicketId: 'ST-123' });
    if (url.includes('/mobile/api/mfa/verifyCode')) return overrides.mfa ?? jsonResponse({ serviceTicketId: 'ST-mfa' });
    if (url.includes('/oauth-service/oauth/preauthorized')) return overrides.preauth ?? textResponse(OAUTH1);
    if (url.includes('/oauth-service/oauth/exchange')) {
      return overrides.exchange ?? jsonResponse({ access_token: 'AT', token_type: 'Bearer', expires_in: 3600 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const PASSWORD = 'sup3r-s3cret-pw';

describe('garmin adapter', () => {
  it('logs in and completes the OAuth1 → OAuth2 exchange (happy path)', async () => {
    const fetchMock = garminFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const { garminLogin } = await import('../plugin-auth-garmin');
    const result = await garminLogin('user@example.com', PASSWORD);

    expect(result.status).toBe('connected');
    if (result.status !== 'connected') throw new Error('unreachable');
    expect(result.tokens.access_token).toBe('AT');
    // The durable credential is the OAuth1 token/secret, not a refresh_token.
    expect(result.tokens.garmin_oauth1).toEqual({ token: 'OT1', secret: 'OS1' });
    expect(result.tokens.refresh_token).toBeUndefined();

    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('sso.garmin.com/mobile/api/login'))).toBe(true);
    expect(calls.some((u) => u.includes('connectapi.garmin.com/oauth-service/oauth/preauthorized'))).toBe(true);
    expect(calls.some((u) => u.includes('connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0'))).toBe(true);
    // No fabricated diauth.garmin.com endpoint is ever contacted.
    expect(calls.some((u) => u.includes('diauth.garmin.com'))).toBe(false);
  });

  it('signs the OAuth1 requests (Authorization: OAuth ... on preauthorized + exchange)', async () => {
    const fetchMock = garminFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const { garminLogin } = await import('../plugin-auth-garmin');
    await garminLogin('user@example.com', PASSWORD);

    const preauth = fetchMock.mock.calls.find((c) => String(c[0]).includes('/preauthorized'));
    const exchange = fetchMock.mock.calls.find((c) => String(c[0]).includes('/exchange/'));
    const preauthAuth = (preauth?.[1]?.headers as Record<string, string>)?.Authorization ?? '';
    const exchangeAuth = (exchange?.[1]?.headers as Record<string, string>)?.Authorization ?? '';
    expect(preauthAuth).toMatch(/^OAuth /);
    expect(preauthAuth).toContain('oauth_signature=');
    // The exchange is signed as the resource owner (carries oauth_token).
    expect(exchangeAuth).toContain('oauth_token=');
    // The login-time exchange declares the mobile-app audience.
    const exchangeBody = String((exchange?.[1] as RequestInit)?.body ?? '');
    expect(exchangeBody).toContain('audience=GARMIN_CONNECT_MOBILE_ANDROID_DI');
  });

  it('surfaces an MFA challenge with continuation state (no password retained)', async () => {
    const fetchMock = garminFetchMock({
      login: jsonResponse(
        { responseStatus: { type: 'MFA_REQUIRED' }, customerMfaInfo: { mfaLastMethodUsed: 'email' } },
        { setCookie: ['GARMIN-SSO=abc; Path=/'] },
      ),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { garminLogin } = await import('../plugin-auth-garmin');
    const result = await garminLogin('user@example.com', PASSWORD);

    expect(result.status).toBe('mfa_required');
    if (result.status !== 'mfa_required') throw new Error('unreachable');
    expect(result.pending.cookies).toContain('GARMIN-SSO=abc');
    expect(result.pending.mfaMethod).toBe('email');
    // The continuation state must never carry the password.
    expect(JSON.stringify(result.pending)).not.toContain(PASSWORD);
  });

  it('completes MFA with the one-time code', async () => {
    const fetchMock = garminFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const { garminContinueMfa } = await import('../plugin-auth-garmin');
    const result = await garminContinueMfa({ cookies: ['GARMIN-SSO=abc'], mfaMethod: 'email' }, '123456');

    expect(result.status).toBe('connected');
    if (result.status !== 'connected') throw new Error('unreachable');
    expect(result.tokens.access_token).toBe('AT');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('mfa/verifyCode'))).toBe(true);
  });

  it('reports a wrong MFA code as retryable', async () => {
    const fetchMock = garminFetchMock({
      mfa: jsonResponse({ responseStatus: { type: 'INVALID' } }, { status: 401 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { garminContinueMfa } = await import('../plugin-auth-garmin');
    const result = await garminContinueMfa({ cookies: ['GARMIN-SSO=abc'], mfaMethod: 'email' }, '000000');
    expect(result.status).toBe('mfa_required');
    if (result.status !== 'mfa_required') throw new Error('unreachable');
    expect(result.error).toBeTruthy();
  });

  it('re-mints the bearer from the stored OAuth1 credential on refresh', async () => {
    const fetchMock = garminFetchMock({
      exchange: jsonResponse({ access_token: 'AT-new', token_type: 'Bearer', expires_in: 3600 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { refreshGarminTokens } = await import('../plugin-auth-garmin');
    const renewed = await refreshGarminTokens({
      access_token: 'AT-old', token_type: 'Bearer', expiry_date: 0,
      garmin_oauth1: { token: 'OT1', secret: 'OS1' },
    });
    expect(renewed.access_token).toBe('AT-new');
    expect(renewed.garmin_oauth1).toEqual({ token: 'OT1', secret: 'OS1' });
    // Refresh re-exchanges WITHOUT the login audience (garth's refresh path).
    const exchange = fetchMock.mock.calls.find((c) => String(c[0]).includes('/exchange/'));
    expect(String((exchange?.[1] as RequestInit)?.body ?? '')).not.toContain('audience=');
  });

  it('replays the MFA token on re-exchange when the account used MFA', async () => {
    const fetchMock = garminFetchMock({
      exchange: jsonResponse({ access_token: 'AT-mfa', token_type: 'Bearer', expires_in: 3600 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { refreshGarminTokens } = await import('../plugin-auth-garmin');
    await refreshGarminTokens({
      access_token: 'x', token_type: 'Bearer', expiry_date: 0,
      garmin_oauth1: { token: 'OT1', secret: 'OS1', mfa_token: 'MFA-TOK' },
    });
    const exchange = fetchMock.mock.calls.find((c) => String(c[0]).includes('/exchange/'));
    expect(String((exchange?.[1] as RequestInit)?.body ?? '')).toContain('mfa_token=MFA-TOK');
  });

  it('throws a reconnect error when no OAuth1 credential is stored', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { refreshGarminTokens } = await import('../plugin-auth-garmin');
    await expect(refreshGarminTokens({
      access_token: 'x', token_type: 'Bearer', expiry_date: 0,
    })).rejects.toThrow(/reconnect/i);
  });

  it('produces an RFC 5849-correct HMAC-SHA1 signature (Twitter reference vector)', async () => {
    // Canonical worked example from Twitter's OAuth1 docs — proves the
    // base-string construction, parameter sorting, and HMAC key are correct
    // (a subtle bug here would pass format checks but be rejected by Garmin).
    const { oauth1Header } = await import('../plugin-auth-garmin');
    const url = 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true';
    const header = oauth1Header(
      'POST',
      url,
      {
        consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
        consumer_secret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Y7QYqw',
      },
      {
        token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
        tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
        bodyParams: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
        nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
        timestamp: '1318622958',
      },
    );
    // HMAC-SHA1 of Twitter's published signature base string for this request,
    // percent-encoded into the header value. Verifies base-string assembly,
    // RFC 3986 param encoding, byte-order sorting, and the signing key.
    expect(header).toContain('oauth_signature="7pQcc1waNGKUD54QL8XmwCyc74k%3D"');
  });

  it('never writes the password to disk during the full flow', async () => {
    vi.stubGlobal('fetch', garminFetchMock());

    const { garminLogin } = await import('../plugin-auth-garmin');
    const { savePluginTokens } = await import('../plugin-auth');
    const result = await garminLogin('user@example.com', PASSWORD);
    if (result.status !== 'connected') throw new Error('unreachable');
    await savePluginTokens('garmin-plugin', result.tokens);

    // Scan everything under data/ for the plaintext password.
    async function scan(dir: string): Promise<boolean> {
      let found = false;
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found ||= await scan(full);
        else found ||= (await fs.readFile(full, 'utf-8')).includes(PASSWORD);
      }
      return found;
    }
    expect(await scan(path.join(tmpDir, 'data'))).toBe(false);
  });
});
