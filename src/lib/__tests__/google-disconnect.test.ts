import { describe, it, expect, vi, beforeEach } from 'vitest';

// Disconnecting one Google service must not cancel the other at Google. Google
// keeps one sign-in per person per Cloud project, so cancelling Google Photos
// import's grant also cancelled Google Calendar's when both came from Home
// Screens' app (or from one project of the household's own). These tests
// drive the real stores over an in-memory secrets file and tokens files and
// watch for calls to Google's revoke endpoint.

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

const { disconnect } = await import('@/lib/google-auth');
const { disconnectPicker } = await import('@/lib/google-picker');

const CALENDAR = 'data/google-tokens.json';
const PHOTOS = 'data/google-picker-tokens.json';

function grant(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ access_token: 'ya29.access', refresh_token: '1//refresh', expiry_date: Date.now() + 3_600_000, ...extra });
}

let fetchMock: ReturnType<typeof vi.fn>;
const revokes = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/revoke'));

beforeEach(() => {
  secrets.clear();
  files.clear();
  preference = 'own';
  vi.stubEnv('HS_GOOGLE_HOSTED', '1');
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('disconnecting one Google service on Home Screens\' app', () => {
  it('keeps the sign-in at Google while the other service still uses it', async () => {
    files.set(CALENDAR, grant({ client_mode: 'hosted' }));
    files.set(PHOTOS, grant({ client_mode: 'hosted' }));

    expect(await disconnectPicker()).toEqual({ stillUsedBy: 'calendar' });

    expect(revokes()).toHaveLength(0);
    expect(JSON.parse(files.get(PHOTOS)!)).toEqual({});
    // Calendar's grant is untouched.
    expect(JSON.parse(files.get(CALENDAR)!).refresh_token).toBe('1//refresh');
  });

  it('keeps it too when Calendar signed in on the web to add events', async () => {
    files.set(CALENDAR, grant({ client_mode: 'hosted', client_kind: 'web' }));
    files.set(PHOTOS, grant({ client_mode: 'hosted' }));

    expect(await disconnect()).toEqual({ stillUsedBy: 'photos' });
    expect(revokes()).toHaveLength(0);
    expect(JSON.parse(files.get(CALENDAR)!)).toEqual({});
  });

  it('cancels it at Google once the last one is disconnected', async () => {
    files.set(CALENDAR, grant({ client_mode: 'hosted' }));
    files.set(PHOTOS, grant({ client_mode: 'hosted' }));

    await disconnectPicker();
    expect(await disconnect()).toEqual({ stillUsedBy: null });

    expect(revokes()).toHaveLength(1);
    expect((revokes()[0][1]!.body as URLSearchParams).get('token')).toBe('ya29.access');
  });

  it('cancels it at Google when the other service has nothing saved', async () => {
    files.set(PHOTOS, grant({ client_mode: 'hosted' }));
    files.set(CALENDAR, JSON.stringify({}));

    expect(await disconnectPicker()).toEqual({ stillUsedBy: null });
    expect(revokes()).toHaveLength(1);
  });
});

describe('disconnecting one Google service on the household\'s own app', () => {
  it('keeps the sign-in when both clients are in one project', async () => {
    secrets.set('google_client_id', '111111-device.apps.googleusercontent.com');
    secrets.set('google_client_secret', 's');
    secrets.set('google_web_client_id', '111111-web.apps.googleusercontent.com');
    secrets.set('google_web_client_secret', 's');
    files.set(CALENDAR, grant());
    files.set(PHOTOS, grant());

    expect(await disconnect()).toEqual({ stillUsedBy: 'photos' });
    expect(revokes()).toHaveLength(0);
  });

  it('cancels it when the clients are in different projects', async () => {
    secrets.set('google_client_id', '111111-device.apps.googleusercontent.com');
    secrets.set('google_client_secret', 's');
    secrets.set('google_web_client_id', '222222-web.apps.googleusercontent.com');
    secrets.set('google_web_client_secret', 's');
    files.set(CALENDAR, grant());
    files.set(PHOTOS, grant());

    expect(await disconnect()).toEqual({ stillUsedBy: null });
    expect(revokes()).toHaveLength(1);
  });

  it('keeps it when the other service\'s project cannot be told', async () => {
    // A Photos grant from the household's own app whose web client was since removed.
    secrets.set('google_client_id', '111111-device.apps.googleusercontent.com');
    secrets.set('google_client_secret', 's');
    files.set(CALENDAR, grant());
    files.set(PHOTOS, grant());

    expect(await disconnect()).toEqual({ stillUsedBy: 'photos' });
    expect(revokes()).toHaveLength(0);
  });
});

describe('mixing the two apps', () => {
  it('cancels Photos from the household\'s own app while Calendar uses Home Screens\' app', async () => {
    secrets.set('google_web_client_id', '333333-web.apps.googleusercontent.com');
    secrets.set('google_web_client_secret', 's');
    files.set(CALENDAR, grant({ client_mode: 'hosted' }));
    files.set(PHOTOS, grant());

    expect(await disconnectPicker()).toEqual({ stillUsedBy: null });
    expect(revokes()).toHaveLength(1);
  });
});
