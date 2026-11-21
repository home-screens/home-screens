import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Home Screens' own Google apps: on unless HS_GOOGLE_HOSTED=0, and never
// used while the household has any credential of its own saved. These tests
// drive the real Calendar and Photos sign-in modules end to end over an
// in-memory secrets file and tokens files.

const secrets = new Map<string, string>();
vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(async (key: string) => secrets.get(key) ?? null),
}));

// The household's switch on the API keys page (settings.googleApp), stood in
// so these tests never touch the config store.
let preference: 'own' | 'hosted' = 'own';
vi.mock('@/lib/google-app-preference', () => ({
  readGoogleAppPreference: vi.fn(async () => preference),
}));

const files = new Map<string, string>();
vi.mock('@/lib/json-store', () => ({
  createJsonStore: (opts: { path: string; defaultValue: unknown }) => ({
    read: async () => {
      const raw = files.get(opts.path);
      return raw === undefined ? structuredClone(opts.defaultValue) : JSON.parse(raw);
    },
    write: async (data: unknown) => { files.set(opts.path, JSON.stringify(data)); },
    updateAtomic: async () => { throw new Error('updateAtomic is not used by the token store'); },
    remove: async () => { files.delete(opts.path); },
    get filePath() { return opts.path; },
  }),
}));

const { HOSTED_CALENDAR_CLIENT_ID, HOSTED_PHOTOS_CLIENT_ID } = await import('@/lib/google-hosted');
const { requestDeviceCode, pollDeviceToken, isAuthenticated, hasGoogleCredentials } = await import('@/lib/google-auth');
const {
  getPickerAuthUrl,
  exchangePickerCode,
  isPickerConnected,
  hasPickerCredentials,
  REDIRECT_URI,
} = await import('@/lib/google-picker');
const { googleCalendarTokenStore, googlePickerTokenStore } = await import('@/lib/google-token-stores');
const { clearPendingSignIn } = await import('@/lib/google-picker-sign-in');

const CALENDAR_TOKENS = 'data/google-tokens.json';
const PICKER_TOKENS = 'data/google-picker-tokens.json';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const HELPER_URL = 'https://auth.homescreens.dev/google/photos/token';
const CALENDAR_HELPER_URL = 'https://auth.homescreens.dev/google/calendar/token';

interface Call { url: string; body: URLSearchParams }

/** Records every request and answers each with the given token response. */
function answerWith(body: Record<string, unknown>, status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: new URLSearchParams(String(init?.body ?? '')) });
    return {
      ok: status < 400,
      status,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }));
  return calls;
}

function tokensIn(path: string): Record<string, unknown> | null {
  const raw = files.get(path);
  return raw === undefined ? null : JSON.parse(raw);
}

function seed(path: string, tokens: Record<string, unknown>) {
  files.set(path, JSON.stringify(tokens));
}

function enableHosted() {
  vi.stubEnv('HS_GOOGLE_HOSTED', '');
}

function disableHosted() {
  vi.stubEnv('HS_GOOGLE_HOSTED', '0');
}

function saveOwnPhotosApp() {
  secrets.set('google_web_client_id', 'own-web-id');
  secrets.set('google_web_client_secret', 'own-web-secret');
}

function saveOwnCalendarApp() {
  secrets.set('google_client_id', 'own-tv-id');
  secrets.set('google_client_secret', 'own-tv-secret');
}

const grantResponse = { access_token: 'ya29.new', refresh_token: '1//new', expires_in: 3600 };

beforeEach(() => {
  secrets.clear();
  files.clear();
  preference = 'own';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  // Keep a developer's own shell settings out of the tests. Most of these
  // tests want the hosted apps off, the way a hub was before they existed.
  disableHosted();
  vi.stubEnv('HS_GOOGLE_CALENDAR_TOKEN_URL', '');
  vi.stubEnv('HS_GOOGLE_PHOTOS_TOKEN_URL', '');
  clearPendingSignIn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('switched off with HS_GOOGLE_HOSTED=0', () => {
  it('is on when the variable is unset, and off only for an exact 0', async () => {
    vi.stubEnv('HS_GOOGLE_HOSTED', '');
    expect(await googleCalendarTokenStore.getMode()).toBe('hosted');
    expect(await googlePickerTokenStore.getMode()).toBe('hosted');
    vi.stubEnv('HS_GOOGLE_HOSTED', ' 0 ');
    expect(await googleCalendarTokenStore.getMode()).toBeNull();
    vi.stubEnv('HS_GOOGLE_HOSTED', '1');
    expect(await googleCalendarTokenStore.getMode()).toBe('hosted');
  });

  it('leaves an unconfigured hub exactly as before: not set up, nothing sent', async () => {
    const calls = answerWith(grantResponse);

    expect(await hasPickerCredentials()).toBe(false);
    expect(await hasGoogleCredentials()).toBe(false);
    await expect(getPickerAuthUrl()).rejects.toThrow('Photos Import Client ID and Secret');
    await expect(requestDeviceCode()).rejects.toThrow('Client ID is not configured');
    expect(calls).toHaveLength(0);
  });

  it('stays off with only a helper address set', async () => {
    vi.stubEnv('HS_GOOGLE_CALENDAR_TOKEN_URL', 'http://localhost:8787/google/calendar/token');
    expect(await hasGoogleCredentials()).toBe(false);
    expect(await googleCalendarTokenStore.getMode()).toBeNull();
  });
});

describe("the household's own Google app always wins", () => {
  it('Photos signs in with the saved app and writes the same tokens file as before', async () => {
    enableHosted();
    saveOwnPhotosApp();
    const calls = answerWith(grantResponse);

    const authUrl = new URL((await getPickerAuthUrl()).url);
    expect(authUrl.searchParams.get('client_id')).toBe('own-web-id');
    expect(await exchangePickerCode('4/0AdLIrY-code')).toEqual({ ok: true });

    expect(calls[0].url).toBe(GOOGLE_TOKEN_URL);
    expect(calls[0].body.get('client_id')).toBe('own-web-id');
    expect(calls[0].body.get('client_secret')).toBe('own-web-secret');
    expect(tokensIn(PICKER_TOKENS)).not.toHaveProperty('client_mode');
    expect(await googlePickerTokenStore.getMode()).toBe('own');
  });

  it('Calendar signs in with the saved app and writes the same tokens file as before', async () => {
    enableHosted();
    saveOwnCalendarApp();
    const calls = answerWith({ ...grantResponse, device_code: 'dc', user_code: 'ABCD-EFGH' });

    await requestDeviceCode();
    expect(calls[0].body.get('client_id')).toBe('own-tv-id');

    await pollDeviceToken('dc');
    expect(calls[1].url).toBe(GOOGLE_TOKEN_URL);
    expect(calls[1].body.get('client_id')).toBe('own-tv-id');
    expect(calls[1].body.get('client_secret')).toBe('own-tv-secret');
    expect(tokensIn(CALENDAR_TOKENS)).not.toHaveProperty('client_mode');
  });

  it('never falls through to Home Screens\' app while the household is halfway through setting up its own', async () => {
    enableHosted();
    secrets.set('google_web_client_id', 'own-web-id');
    secrets.set('google_client_id', 'own-tv-id');
    const calls = answerWith({ device_code: 'dc', user_code: 'ABCD-EFGH' });

    await expect(getPickerAuthUrl()).rejects.toThrow('Photos Import Client ID and Secret');
    expect(await hasPickerCredentials()).toBe(false);
    // Starting a device flow needs only the id, exactly as before.
    await requestDeviceCode();
    expect(calls[0].body.get('client_id')).toBe('own-tv-id');
  });

  it('keeps an existing grant connected when the switch is turned on', async () => {
    saveOwnPhotosApp();
    seed(PICKER_TOKENS, { access_token: 'ya29.old', refresh_token: '1//old', expiry_date: Date.now() + 3_600_000 });
    expect(await isPickerConnected()).toBe(true);

    enableHosted();
    expect(await isPickerConnected()).toBe(true);
  });
});

describe("Home Screens' own app (switch on, nothing saved)", () => {
  it('Photos: signs in through the sign-in helper, never sending a secret', async () => {
    enableHosted();
    const calls = answerWith(grantResponse);

    const authUrl = new URL((await getPickerAuthUrl()).url);
    expect(authUrl.searchParams.get('client_id')).toBe(HOSTED_PHOTOS_CLIENT_ID);
    expect(authUrl.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);

    expect(await exchangePickerCode('4/0AdLIrY-code')).toEqual({ ok: true });
    expect(calls[0].url).toBe(HELPER_URL);
    expect(calls[0].body.get('client_id')).toBe(HOSTED_PHOTOS_CLIENT_ID);
    expect(calls[0].body.has('client_secret')).toBe(false);
    expect(calls[0].body.get('code')).toBe('4/0AdLIrY-code');
    expect(tokensIn(PICKER_TOKENS)).toMatchObject({ refresh_token: '1//new', client_mode: 'hosted' });
    expect(await googlePickerTokenStore.getMode()).toBe('hosted');
  });

  it('Photos: refreshes through the sign-in helper and keeps the grant marked', async () => {
    enableHosted();
    seed(PICKER_TOKENS, { access_token: 'ya29.old', refresh_token: '1//hosted', expiry_date: 0, client_mode: 'hosted' });
    const calls = answerWith({ access_token: 'ya29.refreshed', expires_in: 3600 });

    expect(await isPickerConnected()).toBe(true);
    expect(calls[0].url).toBe(HELPER_URL);
    expect(calls[0].body.get('grant_type')).toBe('refresh_token');
    expect(calls[0].body.has('client_secret')).toBe(false);
    expect(tokensIn(PICKER_TOKENS)).toMatchObject({ access_token: 'ya29.refreshed', client_mode: 'hosted' });
  });

  it('Photos: a development override points the hub at another helper', async () => {
    enableHosted();
    vi.stubEnv('HS_GOOGLE_PHOTOS_TOKEN_URL', 'http://localhost:8787/google/photos/token');
    const calls = answerWith(grantResponse);

    await getPickerAuthUrl();
    await exchangePickerCode('4/0AdLIrY-code');
    expect(calls[0].url).toBe('http://localhost:8787/google/photos/token');
  });

  it('Photos: stays connected while the sign-in helper is down or busy, instead of asking to sign in again', async () => {
    enableHosted();
    const grant = { access_token: 'ya29.old', refresh_token: '1//hosted', expiry_date: Date.now() - 1000, client_mode: 'hosted' };
    seed(PICKER_TOKENS, grant);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'rate_limited', error_description: 'Too many sign-in requests. Try again in a minute.' }),
      { status: 429, headers: { 'Retry-After': '0' } },
    )));

    expect(await isPickerConnected()).toBe(true);
    expect(tokensIn(PICKER_TOKENS)).toEqual(grant);
  });

  it('Photos: says so plainly when the sign-in helper is down, and saves nothing', async () => {
    enableHosted();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));

    await getPickerAuthUrl();
    expect(await exchangePickerCode('4/0AdLIrY-code')).toEqual({
      ok: false,
      error: "Couldn't reach the Home Screens sign-in helper. Try again in a few minutes.",
    });
    expect(tokensIn(PICKER_TOKENS)).toBeNull();
  });

  it('Calendar: asks Google for the code itself, then collects the sign-in through the helper, holding no secret', async () => {
    enableHosted();
    const calls = answerWith({ ...grantResponse, device_code: 'dc', user_code: 'ABCD-EFGH' });

    expect(await hasGoogleCredentials()).toBe(true);
    await requestDeviceCode();
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/device/code');
    expect(calls[0].body.get('client_id')).toBe(HOSTED_CALENDAR_CLIENT_ID);

    expect(await pollDeviceToken('dc')).toEqual({ status: 'success' });
    expect(calls[1].url).toBe(CALENDAR_HELPER_URL);
    expect(calls[1].body.get('client_id')).toBe(HOSTED_CALENDAR_CLIENT_ID);
    expect(calls[1].body.has('client_secret')).toBe(false);
    expect(tokensIn(CALENDAR_TOKENS)).toMatchObject({ client_mode: 'hosted' });
  });

  it('Calendar: renews through the helper, holding no secret', async () => {
    enableHosted();
    seed(CALENDAR_TOKENS, { access_token: 'ya29.old', refresh_token: '1//hosted', expiry_date: Date.now() - 1000, client_mode: 'hosted' });
    const calls = answerWith(grantResponse);

    expect(await googleCalendarTokenStore.getAccessToken()).toBe('ya29.new');
    expect(calls[0].url).toBe(CALENDAR_HELPER_URL);
    expect(calls[0].body.get('grant_type')).toBe('refresh_token');
    expect(calls[0].body.has('client_secret')).toBe(false);
  });

  it.each([
    ['the helper is unreachable', () => { throw new TypeError('fetch failed'); }],
    ['the helper is busy', () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { 'Retry-After': '0' } })],
    ['Google is briefly down', () => new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503 })],
  ])('Calendar: keeps waiting on the short code when %s', async (_, answer) => {
    enableHosted();
    vi.stubGlobal('fetch', vi.fn(async () => answer()));

    expect(await pollDeviceToken('dc')).toEqual({ status: 'pending' });
    expect(tokensIn(CALENDAR_TOKENS)).toBeNull();
  });
});

describe('switching between apps', () => {
  it("drops a grant from Home Screens' app once the household saves its own", async () => {
    enableHosted();
    seed(PICKER_TOKENS, { access_token: 'ya29.x', refresh_token: '1//hosted', expiry_date: Date.now() + 3_600_000, client_mode: 'hosted' });
    expect(await isPickerConnected()).toBe(true);

    saveOwnPhotosApp();
    const calls = answerWith(grantResponse);
    expect(await isPickerConnected()).toBe(false);
    expect(await googlePickerTokenStore.getAccessToken()).toBeNull();
    // Nothing is spent trying to refresh a grant the other app issued.
    expect(calls).toHaveLength(0);
  });

  it("drops the household's own grant once its app is removed and Home Screens' app takes over", async () => {
    saveOwnCalendarApp();
    seed(CALENDAR_TOKENS, { access_token: 'ya29.x', refresh_token: '1//own', expiry_date: Date.now() + 3_600_000 });
    expect(await isAuthenticated()).toBe(true);

    enableHosted();
    secrets.clear();
    expect(await isAuthenticated()).toBe(false);
  });

  it('connects again after signing in with the app now in use', async () => {
    enableHosted();
    seed(PICKER_TOKENS, { access_token: 'ya29.x', refresh_token: '1//own', expiry_date: Date.now() + 3_600_000 });
    expect(await isPickerConnected()).toBe(false);

    answerWith(grantResponse);
    await getPickerAuthUrl();
    await exchangePickerCode('4/0AdLIrY-code');
    expect(await isPickerConnected()).toBe(true);
  });
});

describe("the switch: Home Screens' app with the household's own details kept", () => {
  it('sends both integrations through the helper while the saved details stay put', async () => {
    enableHosted();
    saveOwnCalendarApp();
    saveOwnPhotosApp();
    preference = 'hosted';

    expect(await googleCalendarTokenStore.getMode()).toBe('hosted');
    expect(await googlePickerTokenStore.getMode()).toBe('hosted');
    const calls = answerWith(grantResponse);
    await getPickerAuthUrl();
    await exchangePickerCode('4/0AdLIrY-code');
    expect(calls[0].url).toBe(HELPER_URL);
    expect(calls[0].body.get('client_id')).toBe(HOSTED_PHOTOS_CLIENT_ID);
    expect(calls[0].body.has('client_secret')).toBe(false);
    expect(secrets.get('google_web_client_secret')).toBe('own-web-secret');
  });

  it('governs only what is saved: an integration without details already uses Home Screens\' app', async () => {
    enableHosted();
    saveOwnCalendarApp();
    expect(await googleCalendarTokenStore.getMode()).toBe('own');
    expect(await googlePickerTokenStore.getMode()).toBe('hosted');
    preference = 'hosted';
    expect(await googleCalendarTokenStore.getMode()).toBe('hosted');
    expect(await googlePickerTokenStore.getMode()).toBe('hosted');
  });

  it('cannot strand a hub: with Home Screens\' app switched off the saved details are used whatever it says', async () => {
    disableHosted();
    saveOwnCalendarApp();
    preference = 'hosted';
    expect(await googleCalendarTokenStore.getMode()).toBe('own');
    expect(await hasGoogleCredentials()).toBe(true);
  });

  it('flipping signs Google out, and flipping back brings the old sign-in back untouched', async () => {
    enableHosted();
    saveOwnCalendarApp();
    const ownGrant = { access_token: 'ya29.x', refresh_token: '1//own', expiry_date: Date.now() + 3_600_000 };
    seed(CALENDAR_TOKENS, ownGrant);
    expect(await isAuthenticated()).toBe(true);

    preference = 'hosted';
    const calls = answerWith(grantResponse);
    expect(await isAuthenticated()).toBe(false);
    expect(await googleCalendarTokenStore.getAccessToken()).toBeNull();
    expect(calls).toHaveLength(0);
    expect(tokensIn(CALENDAR_TOKENS)).toEqual(ownGrant);

    preference = 'own';
    expect(await isAuthenticated()).toBe(true);
  });
});

describe('straight back to the hub (switch on)', () => {
  const HUB = 'http://192.168.1.50:3000';

  function linkParams(url: string) {
    return new URL(url).searchParams;
  }

  function s256(verifier: string) {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  it("Home Screens' app: the link carries the hub's address, a one-time value and PKCE, and the code is redeemed with the verifier", async () => {
    enableHosted();
    const calls = answerWith(grantResponse);

    const link = await getPickerAuthUrl(HUB);
    expect(link.returnsToHub).toBe(true);
    const params = linkParams(link.url);
    const state = params.get('state')!;
    const [nonce, address] = state.split('.');
    expect(nonce).toMatch(/^[\w-]{43}$/);
    expect(Buffer.from(address, 'base64url').toString()).toBe(HUB);
    expect(params.get('code_challenge_method')).toBe('S256');

    expect(await exchangePickerCode('4/0AdLIrY-code', state)).toEqual({ ok: true });
    expect(calls[0].url).toBe(HELPER_URL);
    const verifier = calls[0].body.get('code_verifier')!;
    expect(s256(verifier)).toBe(params.get('code_challenge'));
    expect(calls[0].body.has('client_secret')).toBe(false);
    expect(tokensIn(PICKER_TOKENS)).toMatchObject({ client_mode: 'hosted' });
  });

  it("the household's own app gets the same return, straight to Google with its own secret", async () => {
    enableHosted();
    saveOwnPhotosApp();
    const calls = answerWith(grantResponse);

    const link = await getPickerAuthUrl(HUB);
    const params = linkParams(link.url);
    expect(params.get('client_id')).toBe('own-web-id');
    expect(await exchangePickerCode('4/0AdLIrY-code', params.get('state')!)).toEqual({ ok: true });

    expect(calls[0].url).toBe(GOOGLE_TOKEN_URL);
    expect(calls[0].body.get('client_secret')).toBe('own-web-secret');
    expect(s256(calls[0].body.get('code_verifier')!)).toBe(params.get('code_challenge'));
    expect(tokensIn(PICKER_TOKENS)).not.toHaveProperty('client_mode');
  });

  it('a pasted code uses the waiting sign-in, and a link without a confirmed address still gets PKCE', async () => {
    enableHosted();
    const calls = answerWith(grantResponse);

    const link = await getPickerAuthUrl(null);
    expect(link.returnsToHub).toBe(false);
    const params = linkParams(link.url);
    expect(params.get('state')).toMatch(/^[\w-]{43}$/);

    expect(await exchangePickerCode('4/0AdLIrY-code')).toEqual({ ok: true });
    expect(s256(calls[0].body.get('code_verifier')!)).toBe(params.get('code_challenge'));
  });

  it('each sign-in works once', async () => {
    enableHosted();
    const calls = answerWith(grantResponse);
    const state = linkParams((await getPickerAuthUrl(HUB)).url).get('state')!;

    expect(await exchangePickerCode('4/0AdLIrY-code', state)).toEqual({ ok: true });
    expect(await exchangePickerCode('4/0AdLIrY-code', state)).toMatchObject({ ok: false, expired: true });
    expect(await exchangePickerCode('4/0AdLIrY-code')).toMatchObject({ ok: false, expired: true });
    expect(calls).toHaveLength(1);
  });

  it('a sign-in expires after 10 minutes', async () => {
    enableHosted();
    const calls = answerWith(grantResponse);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const state = linkParams((await getPickerAuthUrl(HUB)).url).get('state')!;
      vi.advanceTimersByTime(10 * 60_000 + 1);
      expect(await exchangePickerCode('4/0AdLIrY-code', state)).toMatchObject({ ok: false, expired: true });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toHaveLength(0);
  });

  it("refuses a code whose one-time value isn't this hub's, without cancelling the real sign-in", async () => {
    enableHosted();
    const calls = answerWith(grantResponse);
    const state = linkParams((await getPickerAuthUrl(HUB)).url).get('state')!;
    const forged = `${'A'.repeat(43)}.${Buffer.from(HUB).toString('base64url')}`;

    expect(await exchangePickerCode('4/attacker-code', forged)).toMatchObject({ ok: false, expired: true });
    expect(await exchangePickerCode('4/attacker-code', '')).toMatchObject({ ok: false, expired: true });
    expect(calls).toHaveLength(0);

    expect(await exchangePickerCode('4/0AdLIrY-code', state)).toEqual({ ok: true });
  });

  it('a newer sign-in replaces the waiting one', async () => {
    enableHosted();
    answerWith(grantResponse);
    const first = linkParams((await getPickerAuthUrl(HUB)).url).get('state')!;
    const second = linkParams((await getPickerAuthUrl(HUB)).url).get('state')!;

    expect(await exchangePickerCode('4/0AdLIrY-code', first)).toMatchObject({ ok: false, expired: true });
    expect(await exchangePickerCode('4/0AdLIrY-code', second)).toEqual({ ok: true });
  });

  it("calls a code Google won't take any more an expired sign-in", async () => {
    enableHosted();
    answerWith({ error: 'invalid_grant', error_description: 'Bad Request' }, 400);
    const state = linkParams((await getPickerAuthUrl(HUB)).url).get('state')!;

    expect(await exchangePickerCode('4/0AdLIrY-code', state)).toEqual({
      ok: false,
      expired: true,
      error: 'That sign-in has expired. Each one works once, within 10 minutes. Sign in with Google again.',
    });
    expect(tokensIn(PICKER_TOKENS)).toBeNull();
  });

  it('with the switch off, a code coming back through the return page is refused and nothing is sent', async () => {
    saveOwnPhotosApp();
    const calls = answerWith(grantResponse);
    await getPickerAuthUrl(HUB);

    expect(await exchangePickerCode('4/0AdLIrY-code', 'anything')).toMatchObject({ ok: false, expired: true });
    expect(calls).toHaveLength(0);
  });
});
