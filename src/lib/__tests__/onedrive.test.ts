import { describe, it, expect, vi, beforeEach } from 'vitest';

let tokensContent: string | null = null;
vi.mock('@/lib/json-store', () => ({
  createJsonStore: (opts: { path: string; defaultValue: unknown }) => ({
    read: async () => (tokensContent === null ? structuredClone(opts.defaultValue) : JSON.parse(tokensContent)),
    write: async (data: unknown) => { tokensContent = JSON.stringify(data, null, 2); },
    updateAtomic: async () => { throw new Error('unused'); },
    remove: async () => { tokensContent = null; },
    get filePath() { return opts.path; },
  }),
}));

vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(async (key: string) => (key === 'microsoft_client_id' ? 'ms-client-id' : null)),
}));

// Identity shuffle keeps pagination/cap assertions deterministic.
vi.mock('@/lib/shuffle', () => ({
  shuffleArray: <T,>(arr: T[]): T[] => arr,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  startDeviceFlow, pollDeviceFlow, cancelDeviceFlow,
  listFolders, listPhotos, fetchThumbnail,
  onedriveDisconnect,
  ONEDRIVE_MAX_SAMPLE,
} from '@/lib/onedrive';

const DEVICE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const GRAPH = 'https://graph.microsoft.com/v1.0';

beforeEach(() => {
  tokensContent = null;
  mockFetch.mockReset();
  cancelDeviceFlow();
});

describe('device flow', () => {
  it('starts the flow with the configured client id and photo scopes', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        device_code: 'dev-1', user_code: 'ABC123',
        verification_uri: 'https://microsoft.com/link',
        interval: 5, expires_in: 900,
      }),
    });

    const flow = await startDeviceFlow();

    expect(flow).toEqual({
      userCode: 'ABC123',
      verificationUri: 'https://microsoft.com/link',
      intervalMs: 5000,
      expiresInSeconds: 900,
    });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(DEVICE_URL);
    expect(init.body.toString()).toContain('client_id=ms-client-id');
    expect(init.body.toString()).toContain('scope=Files.Read+offline_access+User.Read');
  });

  it('reports pending while Microsoft is waiting for the user', async () => {
    await seedPendingFlow();
    mockFetch.mockResolvedValue(errTokenResponse({ error: 'authorization_pending' }));

    const result = await pollDeviceFlow();

    expect(result.state).toBe('pending');
  });

  it('saves tokens and reports connected once the user finishes sign-in', async () => {
    await seedPendingFlow();
    mockFetch.mockResolvedValue(okTokenResponse());

    const result = await pollDeviceFlow();

    expect(result.state).toBe('connected');
    const saved = JSON.parse(tokensContent!);
    expect(saved.refresh_token).toBe('rt-1');
    expect(saved.access_token).toBe('at-1');
    expect(saved.expiry_date).toBeGreaterThan(Date.now());

    // The pending flow is consumed — a further poll no longer hits the token endpoint.
    mockFetch.mockClear();
    expect((await pollDeviceFlow()).state).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps expired_token and authorization_declined to terminal states', async () => {
    await seedPendingFlow();
    mockFetch.mockResolvedValue(errTokenResponse({ error: 'expired_token' }));
    expect((await pollDeviceFlow()).state).toBe('expired');

    await seedPendingFlow();
    mockFetch.mockResolvedValue(errTokenResponse({ error: 'authorization_declined' }));
    expect((await pollDeviceFlow()).state).toBe('declined');
  });

  it('maps any other token error to failed with the provider message', async () => {
    await seedPendingFlow();
    mockFetch.mockResolvedValue(errTokenResponse({ error: 'invalid_client', error_description: 'AADSTS700016: app not found' }));

    const result = await pollDeviceFlow();
    expect(result.state).toBe('failed');
    expect(result.message).toContain('app not found');
  });

  it('backs off and reports the longer interval on slow_down', async () => {
    await seedPendingFlow();
    mockFetch.mockResolvedValue(errTokenResponse({ error: 'slow_down' }));

    const result = await pollDeviceFlow();

    expect(result).toEqual({ state: 'pending', intervalMs: 10_000 });
  });

  it('clears the pending flow on disconnect so a late sign-in cannot resurrect the grant', async () => {
    await seedPendingFlow();
    mockFetch.mockClear();

    await onedriveDisconnect();

    expect((await pollDeviceFlow()).state).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('listFolders', () => {
  it('returns the folder, its display path, child count, and only folder children', async () => {
    seedConnected();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/me/drive/items/fld-1?')) {
        return json({
          id: 'fld-1', name: 'Family',
          folder: { childCount: 42 },
          parentReference: { path: '/drive/root:/Pictures' },
        });
      }
      return json({
        value: [
          { id: 'sub-1', name: '2024', folder: {} },
          { id: 'img-1', name: 'photo.jpg', image: {} },
          { id: 'sub-2', name: '2025', folder: {} },
        ],
      });
    });

    const result = await listFolders('fld-1');

    expect(result.folder).toEqual({ id: 'fld-1', name: 'Family', path: 'OneDrive / Pictures / Family', childCount: 42 });
    expect(result.subfolders).toEqual([
      { id: 'sub-1', name: '2024' },
      { id: 'sub-2', name: '2025' },
    ]);
  });

  it('labels the drive root plainly', async () => {
    seedConnected();
    // Fresh Response per call (like a real fetch): a body is single-use, and
    // this test's item fetch and children fetch share one mock.
    mockFetch.mockImplementation(async () => json({ id: 'root-1', name: 'root', folder: { childCount: 7 }, parentReference: { path: '/drive/root:' } }));

    const result = await listFolders();

    expect(result.folder).toEqual({ id: 'root-1', name: 'OneDrive', path: 'OneDrive', childCount: 7 });
    expect(mockFetch.mock.calls[0][0]).toBe(`${GRAPH}/me/drive/root?$select=id,name,folder,parentReference`);
  });

  it('throws a 404-mapped error when the folder does not exist', async () => {
    seedConnected();
    mockFetch.mockResolvedValue(new Response('', { status: 404 }));

    await expect(listFolders('gone')).rejects.toMatchObject({ status: 404 });
  });

  it('decodes percent-encoded segments in the display path', async () => {
    seedConnected();
    mockFetch.mockImplementation(async () => json({
      id: 'fld-2', name: 'Family',
      folder: { childCount: 3 },
      parentReference: { path: '/drive/root:/My%20Photos' },
    }));

    const result = await listFolders('fld-2');

    expect(result.folder.path).toBe('OneDrive / My Photos / Family');
  });

  it('maps an upstream item-fetch failure to 502, not a missing folder', async () => {
    seedConnected();
    mockFetch.mockResolvedValue(new Response('', { status: 500 }));

    await expect(listFolders('fld')).rejects.toMatchObject({ status: 502 });
  });
});

describe('listPhotos', () => {
  it('gathers live images from the folder\'s whole subtree via delta', async () => {
    seedConnected();
    const page = (n: number, last: boolean) => json({
      value: [
        { id: `img-${n}`, name: `a${n}.jpg`, image: {} },
        { id: `vid-${n}`, name: `v${n}.mp4`, video: {} },
        { id: 'dir-1', name: 'Sub', folder: {} },
        { id: 'del-1', name: 'gone.jpg', image: {}, deleted: {} },
      ],
      ...(last ? {} : { '@odata.nextLink': `${GRAPH}/me/drive/items/fld/delta?$skiptoken=t${n}` }),
    });
    // 4 pages × 1 image each = 4 images; videos, subfolders, and deleted
    // tombstones dropped. The shuffle is identity-mocked, so the slice takes
    // the first `count` in listing order.
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('skiptoken=t0')) return page(1, false);
      if (url.includes('skiptoken=t1')) return page(2, false);
      if (url.includes('skiptoken=t2')) return page(3, true);
      return page(0, false);
    });

    const photos = await listPhotos('fld', 2);

    expect(mockFetch.mock.calls[0][0]).toContain('/delta?');
    expect(photos).toEqual([{ id: 'img-0', name: 'a0.jpg' }, { id: 'img-1', name: 'a1.jpg' }]);
    expect(mockFetch).toHaveBeenCalledTimes(4); // first page + 3 nextLinks
  });

  it('stops paging at the documented sample cap', async () => {
    seedConnected();
    const bigPage = (n: number) => json({
      value: Array.from({ length: 200 }, (_, i) => ({ id: `p${n}-${i}`, name: `p.jpg`, image: {} })),
      '@odata.nextLink': `${GRAPH}/me/drive/items/fld/delta?$skiptoken=t${n}`,
    });
    let calls = 0;
    mockFetch.mockImplementation(async () => bigPage(calls++));

    const photos = await listPhotos('fld', 50);

    expect(calls).toBe(ONEDRIVE_MAX_SAMPLE / 200); // 5 pages then stop
    expect(photos).toHaveLength(50);
  });

  it('stops scanning at the page backstop when a folder holds no images', async () => {
    seedConnected();
    const nonImagePage = (n: number) => json({
      value: Array.from({ length: 200 }, (_, i) => ({ id: `f${n}-${i}`, name: 'doc.pdf', file: {} })),
      '@odata.nextLink': `${GRAPH}/me/drive/items/fld/children?$skiptoken=t${n}`,
    });
    let calls = 0;
    mockFetch.mockImplementation(async () => nonImagePage(calls++));

    const photos = await listPhotos('fld', 50);

    expect(calls).toBe(25); // page backstop, not nextLink exhaustion
    expect(photos).toEqual([]);
  });

  it('sends the bearer token from the stored grant', async () => {
    seedConnected();
    mockFetch.mockResolvedValue(json({ value: [] }));

    await listPhotos('fld', 10);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer at-1');
  });

  it('throws a 401-mapped error when there is no usable grant', async () => {
    // No tokens seeded → getAccessToken returns null without any fetch.
    await expect(listPhotos('fld', 10)).rejects.toMatchObject({ status: 401 });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('fetchThumbnail', () => {
  it('maps preview to the large thumbnail and thumbnail to medium', async () => {
    seedConnected();
    const bytes = new Uint8Array([1, 2, 3]);
    // Fresh Response per call (like a real fetch) — a body is single-use and
    // this test makes two fetchThumbnail calls.
    mockFetch.mockImplementation(async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }));

    const big = await fetchThumbnail('img-1', 'preview');
    expect(mockFetch.mock.calls[0][0]).toBe(`${GRAPH}/me/drive/items/img-1/thumbnails/0/large/content`);
    expect(big.contentType).toBe('image/jpeg');

    await fetchThumbnail('img-1', 'thumbnail');
    expect(mockFetch.mock.calls[1][0]).toBe(`${GRAPH}/me/drive/items/img-1/thumbnails/0/medium/content`);
  });
});

// ── helpers ──────────────────────────────────────────────────────────

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function okTokenResponse(): Response {
  return json({ token_type: 'Bearer', scope: 'Files.Read User.Read', access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 });
}

function errTokenResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 400, headers: { 'Content-Type': 'application/json' } });
}

/** Run startDeviceFlow against a canned Microsoft response. */
async function seedPendingFlow(): Promise<void> {
  mockFetch.mockResolvedValue(json({
    device_code: 'dev-1', user_code: 'ABC123',
    verification_uri: 'https://microsoft.com/link', interval: 5, expires_in: 900,
  }));
  await startDeviceFlow();
  mockFetch.mockClear();
}

/** Seed a grant the Graph calls can refresh against (no real network). */
function seedConnected(): void {
  tokensContent = JSON.stringify({
    access_token: 'at-1', refresh_token: 'rt-1', expiry_date: Date.now() + 3_600_000,
  });
}
