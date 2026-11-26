import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Calendar's web sign-in, which lets Home Screens add events: the link, the
// code, which client the grant renews with, and where adding stands. Driven
// end to end over an in-memory secrets file and tokens files, like
// google-hosted.test.ts.

const secrets = new Map<string, string>();
vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(async (key: string) => secrets.get(key) ?? null),
}));

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

const { HOSTED_PHOTOS_CLIENT_ID } = await import('@/lib/google-hosted');
const { getCalendarWebAuthUrl, exchangeCalendarWebCode, getGoogleEntryState } = await import('@/lib/google-auth');
const { getPickerAuthUrl, exchangePickerCode } = await import('@/lib/google-picker');
const { googleCalendarTokenStore } = await import('@/lib/google-token-stores');
const { clearPendingSignIn, signInPurpose } = await import('@/lib/google-web-sign-in');
const { GOOGLE_EVENTS_SCOPE } = await import('@/lib/calendar-write');

const CALENDAR_TOKENS = 'data/google-tokens.json';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const WEB_HELPER_URL = 'https://auth.homescreens.dev/google/photos/token';
const CALENDAR_HELPER_URL = 'https://auth.homescreens.dev/google/calendar/token';
const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const HUB = 'http://192.168.1.50:3000';

interface Call { url: string; body: URLSearchParams }

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

const tokens = (): Record<string, unknown> | null => {
  const raw = files.get(CALENDAR_TOKENS);
  return raw === undefined ? null : JSON.parse(raw);
};

function saveOwnApp() {
  secrets.set('google_client_id', 'own-tv-id');
  secrets.set('google_client_secret', 'own-tv-secret');
  secrets.set('google_web_client_id', 'own-web-id');
  secrets.set('google_web_client_secret', 'own-web-secret');
}

const linkParams = (url: string) => new URL(url).searchParams;
const bothScopes = `${READ_SCOPE} ${GOOGLE_EVENTS_SCOPE}`;
const grant = (scope = bothScopes) => ({ access_token: 'ya29.web', refresh_token: '1//web', expires_in: 3600, scope });
const expired = { access_token: 'old', refresh_token: '1//keep', expiry_date: Date.now() - 1000 };

beforeEach(() => {
  secrets.clear();
  files.clear();
  preference = 'own';
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv('HS_GOOGLE_HOSTED', '');
  vi.stubEnv('HS_GOOGLE_HOSTED_EVENTS', '');
  vi.stubEnv('HS_GOOGLE_CALENDAR_TOKEN_URL', '');
  vi.stubEnv('HS_GOOGLE_PHOTOS_TOKEN_URL', '');
  clearPendingSignIn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('own Google app', () => {
  it('signs in on the web client, asking to read calendars and to view and edit events', async () => {
    saveOwnApp();
    const calls = answerWith(grant());

    const link = await getCalendarWebAuthUrl(HUB);
    const params = linkParams(link.url);
    expect(params.get('client_id')).toBe('own-web-id');
    expect(params.get('scope')).toBe(bothScopes);
    expect(params.get('prompt')).toBe('consent');

    expect(await exchangeCalendarWebCode('4/0AdLIrY-code', params.get('state')!)).toEqual({ ok: true, canAddEvents: true });
    expect(calls[0].url).toBe(GOOGLE_TOKEN_URL);
    expect(calls[0].body.get('client_id')).toBe('own-web-id');
    expect(calls[0].body.get('client_secret')).toBe('own-web-secret');
    expect(tokens()).toMatchObject({ access_token: 'ya29.web', client_kind: 'web', scope: bothScopes });
    expect(tokens()).not.toHaveProperty('client_mode');
  });

  it('says so when Google left "View and edit events" unticked', async () => {
    saveOwnApp();
    answerWith(grant(READ_SCOPE));
    const state = linkParams((await getCalendarWebAuthUrl(HUB)).url).get('state')!;
    expect(await exchangeCalendarWebCode('4/0AdLIrY-code', state)).toEqual({ ok: true, canAddEvents: false });
    expect(await getGoogleEntryState(true)).toBe('scopeMissing');
  });

  it('renews a web grant with the web client and a short-code grant with the TV client', async () => {
    saveOwnApp();
    files.set(CALENDAR_TOKENS, JSON.stringify({ ...expired, client_kind: 'web', scope: bothScopes }));
    let calls = answerWith({ access_token: 'ya29.renewed', expires_in: 3600 });
    expect(await googleCalendarTokenStore.getAccessToken()).toBe('ya29.renewed');
    expect(calls[0].body.get('client_id')).toBe('own-web-id');
    expect(calls[0].body.get('client_secret')).toBe('own-web-secret');
    // The renewal keeps which client issued the grant and what Google granted.
    expect(tokens()).toMatchObject({ client_kind: 'web', scope: bothScopes, refresh_token: '1//keep' });

    files.set(CALENDAR_TOKENS, JSON.stringify(expired));
    calls = answerWith({ access_token: 'ya29.tv', expires_in: 3600 });
    expect(await googleCalendarTokenStore.getAccessToken()).toBe('ya29.tv');
    expect(calls[0].body.get('client_id')).toBe('own-tv-id');
  });

  it('needs a web client saved before it can offer adding', async () => {
    secrets.set('google_client_id', 'own-tv-id');
    secrets.set('google_client_secret', 'own-tv-secret');
    expect(await getGoogleEntryState(true)).toBe('needsWebClient');
    await expect(getCalendarWebAuthUrl(HUB)).rejects.toThrow('Web sign-in Client ID and Secret');
  });
});

describe("Home Screens' own Google app", () => {
  it('offers nothing with HS_GOOGLE_HOSTED_EVENTS=0', async () => {
    vi.stubEnv('HS_GOOGLE_HOSTED_EVENTS', '0');
    expect(await getGoogleEntryState(true)).toBe('notOffered');
    expect(await getGoogleEntryState(false)).toBe('notOffered');
  });

  it('signs in through its web app and the helper with nothing set', async () => {
    expect(await getGoogleEntryState(false)).toBe('off');
    expect(await getGoogleEntryState(true)).toBe('needsSignIn');

    const calls = answerWith(grant());
    const params = linkParams((await getCalendarWebAuthUrl(HUB)).url);
    expect(params.get('client_id')).toBe(HOSTED_PHOTOS_CLIENT_ID);
    expect(await exchangeCalendarWebCode('4/0AdLIrY-code', params.get('state')!)).toEqual({ ok: true, canAddEvents: true });
    expect(calls[0].url).toBe(WEB_HELPER_URL);
    expect(calls[0].body.has('client_secret')).toBe(false);
    expect(calls[0].body.has('code_verifier')).toBe(true);
    expect(tokens()).toMatchObject({ client_mode: 'hosted', client_kind: 'web' });
    expect(await getGoogleEntryState(true)).toBe('ready');
  });

  it('renews its web grant through the web helper, not the calendar one', async () => {
    files.set(CALENDAR_TOKENS, JSON.stringify({ ...expired, client_mode: 'hosted', client_kind: 'web' }));
    const calls = answerWith({ access_token: 'ya29.renewed', expires_in: 3600 });
    expect(await googleCalendarTokenStore.getAccessToken()).toBe('ya29.renewed');
    expect(calls[0].url).toBe(WEB_HELPER_URL);
    expect(calls[0].url).not.toBe(CALENDAR_HELPER_URL);
    expect(calls[0].body.get('client_id')).toBe(HOSTED_PHOTOS_CLIENT_ID);
  });

  it('counts a short-code grant as not yet able to add', async () => {
    files.set(CALENDAR_TOKENS, JSON.stringify({ access_token: 'a', refresh_token: 'r', expiry_date: Date.now() + 3_600_000, client_mode: 'hosted' }));
    expect(await getGoogleEntryState(true)).toBe('needsSignIn');
  });
});

describe('one waiting sign-in, two integrations', () => {
  it('knows which integration the code coming back is for', async () => {
    saveOwnApp();
    const state = linkParams((await getCalendarWebAuthUrl(HUB)).url).get('state')!;
    expect(signInPurpose(state)).toBe('calendar');
    expect(signInPurpose('forged.value')).toBeNull();
  });

  it('never redeems a Photos sign-in into the calendar grant, and leaves it waiting', async () => {
    saveOwnApp();
    const calls = answerWith(grant());
    const state = linkParams((await getPickerAuthUrl(HUB)).url).get('state')!;

    expect(await exchangeCalendarWebCode('4/0AdLIrY-code', state)).toMatchObject({ ok: false, expired: true });
    expect(calls).toHaveLength(0);
    expect(tokens()).toBeNull();
    // The Photos sign-in it belongs to still finishes.
    expect(await exchangePickerCode('4/0AdLIrY-code', state)).toEqual({ ok: true });
  });
});
