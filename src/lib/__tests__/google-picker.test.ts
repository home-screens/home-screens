import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
}));

let tokensContent: string | null = null;

// The token store persists through createJsonStore; stub it with an
// in-memory backing so tests can seed and observe the tokens file.
vi.mock('@/lib/json-store', () => ({
  createJsonStore: (opts: { path: string; defaultValue: unknown }) => ({
    read: async () => (tokensContent === null ? structuredClone(opts.defaultValue) : JSON.parse(tokensContent)),
    write: async (data: unknown) => { tokensContent = JSON.stringify(data, null, 2); },
    updateAtomic: async () => { throw new Error('updateAtomic is not used by the token store'); },
    remove: async () => { tokensContent = null; },
    get filePath() { return opts.path; },
  }),
}));

const mockMkdir = vi.fn();
const mockReaddir = vi.fn();
vi.mock('fs', () => ({
  promises: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    readdir: (...args: unknown[]) => mockReaddir(...args),
  },
}));

const mockWriteLibraryFile = vi.fn();
const mockSafeLibraryPath = vi.fn();
vi.mock('@/lib/library-files', () => ({
  writeLibraryFile: (...args: unknown[]) => mockWriteLibraryFile(...args),
  safeLibraryPath: (...args: unknown[]) => mockSafeLibraryPath(...args),
  MAX_VIDEO_BYTES: 200 * 1024 * 1024,
  MAX_IMPORT_IMAGE_BYTES: 50 * 1024 * 1024,
}));

const { getSecret } = await import('@/lib/secrets');
const {
  getPickerAuthUrl,
  extractAuthCode,
  exchangePickerCode,
  isPickerConnected,
  createPickerSession,
  getPickerSession,
  startPickerImport,
  getPickerImport,
  clearPickerImportJobs,
  REDIRECT_URI,
} = await import('@/lib/google-picker');

const mockedGetSecret = vi.mocked(getSecret);

// ── Helpers ──────────────────────────────────────────────────────────

function setupCredentials() {
  mockedGetSecret.mockImplementation(async (key) => {
    if (key === 'google_web_client_id') return 'web-client-id';
    if (key === 'google_web_client_secret') return 'web-client-secret';
    return null;
  });
}

function seedTokens(tokens: Record<string, unknown> | null) {
  tokensContent = tokens === null ? null : JSON.stringify(tokens);
}

function validTokens() {
  return {
    access_token: 'ya29.picker-token',
    refresh_token: '1//picker-refresh',
    expiry_date: Date.now() + 3_600_000,
  };
}

interface StubResponse {
  ok?: boolean;
  status?: number;
  body?: unknown;
  contentType?: string;
}

function installFetch(routes: Array<[string, StubResponse | ((url: string, init?: RequestInit) => StubResponse)]>) {
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    for (const [match, response] of routes) {
      if (!url.includes(match)) continue;
      const r = typeof response === 'function' ? response(url, init) : response;
      return {
        ok: r.ok ?? true,
        status: r.status ?? (r.ok === false ? 400 : 200),
        json: () => Promise.resolve(r.body ?? {}),
        body: 'stream',
        headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? r.contentType ?? null : null) },
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

async function waitForJob(jobId: string) {
  await vi.waitFor(() => {
    const job = getPickerImport(jobId);
    if (!job || job.state === 'running') throw new Error('still running');
  });
  return getPickerImport(jobId)!;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockedGetSecret.mockReset();
  mockMkdir.mockReset().mockResolvedValue(undefined);
  mockReaddir.mockReset().mockRejectedValue(new Error('ENOENT'));
  mockWriteLibraryFile.mockReset().mockResolvedValue(undefined);
  mockSafeLibraryPath.mockReset().mockReturnValue('/sandbox/library/google-photos');
  tokensContent = null;
  clearPickerImportJobs();
});

// ── Auth ─────────────────────────────────────────────────────────────

describe('getPickerAuthUrl', () => {
  it('throws without web client credentials', async () => {
    mockedGetSecret.mockResolvedValue(null);
    await expect(getPickerAuthUrl()).rejects.toThrow('web Client ID');
  });

  it('builds the consent URL with the picker scope and helper redirect', async () => {
    setupCredentials();
    const url = new URL(await getPickerAuthUrl());
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/photospicker.mediaitems.readonly');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });
});

describe('extractAuthCode', () => {
  it('accepts a bare code', () => {
    expect(extractAuthCode('  4/0AdLIrY-abc_def ')).toBe('4/0AdLIrY-abc_def');
  });

  it('accepts a full pasted redirect URL', () => {
    expect(extractAuthCode('https://homescreens.dev/connect/google?code=4%2F0AdLIrYxyz&scope=photos')).toBe('4/0AdLIrYxyz');
  });

  it('rejects garbage', () => {
    expect(extractAuthCode('')).toBeNull();
    expect(extractAuthCode('not a code at all!!')).toBeNull();
  });
});

describe('exchangePickerCode', () => {
  it('exchanges the code against the helper redirect URI and stores tokens', async () => {
    setupCredentials();
    const fetchMock = installFetch([
      ['oauth2.googleapis.com/token', { body: { access_token: 'ya29.new', refresh_token: '1//new', expires_in: 3600 } }],
    ]);

    const result = await exchangePickerCode('4/0AdLIrY-code');

    expect(result).toEqual({ ok: true });
    const body = fetchMock.mock.calls[0][1]!.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(JSON.parse(tokensContent!).refresh_token).toBe('1//new');
  });

  it('reports Google errors without storing anything', async () => {
    setupCredentials();
    installFetch([
      ['oauth2.googleapis.com/token', { ok: false, status: 400, body: { error: 'invalid_grant', error_description: 'Bad code' } }],
    ]);

    const result = await exchangePickerCode('4/0AdLIrY-code');
    expect(result).toEqual({ ok: false, error: 'Bad code' });
    expect(tokensContent).toBeNull();
  });

  it('rejects unparseable pastes before calling Google', async () => {
    setupCredentials();
    const fetchMock = installFetch([]);
    const result = await exchangePickerCode('total garbage!!');
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry the single-use code exchange on a transient 5xx', async () => {
    setupCredentials();
    const fetchMock = installFetch([
      ['oauth2.googleapis.com/token', { ok: false, status: 503, body: { error: 'temporarily_unavailable' } }],
    ]);

    const result = await exchangePickerCode('4/0AdLIrY-code');

    expect(result.ok).toBe(false);
    // A retry would replay a code Google may already have redeemed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('isPickerConnected', () => {
  it('is true with a fresh grant and false without tokens', async () => {
    seedTokens(validTokens());
    expect(await isPickerConnected()).toBe(true);
    seedTokens(null);
    expect(await isPickerConnected()).toBe(false);
  });

  it('is false when the grant has been revoked (refresh rejected)', async () => {
    setupCredentials();
    seedTokens({ ...validTokens(), expiry_date: Date.now() - 60_000 });
    installFetch([
      ['oauth2.googleapis.com/token', { ok: false, status: 400, body: { error: 'invalid_grant' } }],
    ]);

    // Liveness-checked so a revoked grant surfaces the sign-in UI again.
    expect(await isPickerConnected()).toBe(false);
  });
});

// ── Sessions ─────────────────────────────────────────────────────────

describe('picker sessions', () => {
  it('creates a session with auth and parses the polling config', async () => {
    setupCredentials();
    seedTokens(validTokens());
    const fetchMock = installFetch([
      ['photospicker.googleapis.com/v1/sessions', {
        body: { id: 'sess-1', pickerUri: 'https://photos.google.com/picker/abc', mediaItemsSet: false, pollingConfig: { pollInterval: '2.5s' } },
      }],
    ]);

    const session = await createPickerSession();

    expect(session).toEqual({ id: 'sess-1', pickerUri: 'https://photos.google.com/picker/abc', mediaItemsSet: false, pollIntervalMs: 2500 });
    const init = fetchMock.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ya29.picker-token');
  });

  it('returns null for a vanished session', async () => {
    setupCredentials();
    seedTokens(validTokens());
    installFetch([
      ['/v1/sessions/gone', { ok: false, status: 404, body: {} }],
    ]);

    expect(await getPickerSession('gone')).toBeNull();
  });
});

// ── Import ───────────────────────────────────────────────────────────

function pickedItem(id: string, type: 'PHOTO' | 'VIDEO' = 'PHOTO') {
  return {
    id,
    type,
    mediaFile: {
      baseUrl: `https://lh3.googleusercontent.com/picker/${id}`,
      mimeType: type === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
      filename: `${id}.jpg`,
    },
  };
}

describe('startPickerImport', () => {
  it('downloads picked items with auth: sized web-safe images, transcoded videos', async () => {
    setupCredentials();
    seedTokens(validTokens());
    const fetchMock = installFetch([
      ['/v1/mediaItems', { body: { mediaItems: [pickedItem('aaa'), pickedItem('bbb', 'VIDEO')] } }],
      ['lh3.googleusercontent.com/picker/', { contentType: 'image/jpeg' }],
    ]);

    const started = await startPickerImport('sess-1', 'google-photos');
    expect('jobId' in started && started.total).toBe(2);

    const job = await waitForJob((started as { jobId: string }).jobId);
    expect(job.state).toBe('done');
    expect(job.done).toBe(2);

    const downloadUrls = fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('googleusercontent'));
    // =w4096-h4096 (not =d): HEIC originals can't render on the Pi's
    // Chromium, so images import as Google's sized web-safe rendition.
    expect(downloadUrls).toContain('https://lh3.googleusercontent.com/picker/aaa=w4096-h4096');
    expect(downloadUrls).toContain('https://lh3.googleusercontent.com/picker/bbb=dv');
    const downloadInit = fetchMock.mock.calls.find(([u]) => String(u).includes('googleusercontent'))![1]!;
    expect((downloadInit.headers as Record<string, string>).Authorization).toBe('Bearer ya29.picker-token');
    expect(mockWriteLibraryFile).toHaveBeenCalledTimes(2);
  });

  it('refuses oversized picks instead of silently truncating', async () => {
    setupCredentials();
    seedTokens(validTokens());
    let page = 0;
    installFetch([
      ['/v1/mediaItems', () => {
        page++;
        return {
          body: {
            mediaItems: Array.from({ length: 100 }, (_, i) => pickedItem(`p${page}-${i}`)),
            // Keep promising more pages until the lister's cap stops asking.
            nextPageToken: `page-${page + 1}`,
          },
        };
      }],
    ]);

    expect(await startPickerImport('sess-1', 'google-photos')).toEqual({ error: 'too-many-items' });
  });

  it('skips items already in the library (dedup by stem)', async () => {
    setupCredentials();
    seedTokens(validTokens());
    mockReaddir.mockResolvedValue([
      { name: 'google-aaa.jpg', isFile: () => true },
    ]);
    installFetch([
      ['/v1/mediaItems', { body: { mediaItems: [pickedItem('aaa')] } }],
    ]);

    const started = await startPickerImport('sess-1', 'google-photos');
    const job = await waitForJob((started as { jobId: string }).jobId);

    expect(job.skipped).toBe(1);
    expect(mockWriteLibraryFile).not.toHaveBeenCalled();
  });

  it('aborts the job when the connection is lost mid-import', async () => {
    setupCredentials();
    seedTokens(validTokens());
    // Gate the download loop at mkdir so the connection can be severed
    // deterministically between listing and the first download.
    let releaseMkdir: () => void;
    const gate = new Promise<void>((resolve) => { releaseMkdir = resolve; });
    mockMkdir.mockImplementation(async () => { await gate; });
    const fetchMock = installFetch([
      ['/v1/mediaItems', { body: { mediaItems: [pickedItem('aaa'), pickedItem('bbb')] } }],
    ]);

    const started = await startPickerImport('sess-1', 'google-photos');
    expect('jobId' in started).toBe(true);

    seedTokens(null);
    releaseMkdir!();

    const job = await waitForJob((started as { jobId: string }).jobId);
    expect(job.state).toBe('error');
    expect(job.done).toBe(0);
    // The abort happens before any per-item download — no grinding through
    // the batch one auth failure at a time.
    const downloads = fetchMock.mock.calls.filter(([u]) => String(u).includes('googleusercontent'));
    expect(downloads).toHaveLength(0);
  });

  it('reports nothing-picked for an empty session', async () => {
    setupCredentials();
    seedTokens(validTokens());
    installFetch([
      ['/v1/mediaItems', { body: { mediaItems: [] } }],
    ]);

    expect(await startPickerImport('sess-1', 'google-photos')).toEqual({ error: 'nothing-picked' });
  });

  it('rejects unsafe folders', async () => {
    setupCredentials();
    seedTokens(validTokens());
    mockSafeLibraryPath.mockReturnValue(null);
    expect(await startPickerImport('sess-1', '../outside')).toEqual({ error: 'invalid-folder' });
  });

  it('refuses concurrent imports', async () => {
    setupCredentials();
    seedTokens(validTokens());
    let releaseDownload: () => void;
    const gate = new Promise<void>((resolve) => { releaseDownload = resolve; });
    mockWriteLibraryFile.mockImplementation(async () => { await gate; });
    installFetch([
      ['/v1/mediaItems', { body: { mediaItems: [pickedItem('aaa')] } }],
      ['lh3.googleusercontent.com/picker/', { contentType: 'image/jpeg' }],
    ]);

    const first = await startPickerImport('sess-1', 'google-photos');
    expect('jobId' in first).toBe(true);
    expect(await startPickerImport('sess-2', 'google-photos')).toEqual({ error: 'busy' });

    releaseDownload!();
    await waitForJob((first as { jobId: string }).jobId);
  });
});
