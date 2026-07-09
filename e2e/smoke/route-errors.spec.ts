import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';

/**
 * Request-level (no browser) error-path coverage for API route handlers. Each
 * worker boots a sandboxed production server with a private data/ dir, so these
 * requests hit the REAL handlers. Every test asserts the status + error shape
 * the handler actually returns (verified against the route source), never a
 * guess, and none of them make a real upstream call.
 */

test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig());
});

test.describe('PUT /api/config', () => {
  test('rejects a malformed JSON body with 400', async ({ request }) => {
    // Sent as a Buffer of truncated JSON so it reaches the server as raw
    // unparseable bytes. (A plain-string `data` would be JSON-encoded by the
    // request client and arrive as valid JSON, hitting the shape guard below
    // instead of parseJsonBody's syntax guard.)
    const res = await request.put('/api/config', {
      data: Buffer.from('{"screens": ['),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON body');
  });

  test('rejects a config missing screens/settings with 400', async ({ request }) => {
    const res = await request.put('/api/config', { data: { hello: 'world' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('screens array and settings');
  });

  test('rejects an invalid displays registry and preserves the previous config', async ({ request }) => {
    // Two displays sharing an id — passes the top-level shape check, fails
    // validateDisplays (duplicate id) so the write never lands.
    const bad = baseConfig({
      displays: [
        { id: 'kitchen', screens: [] },
        { id: 'kitchen', screens: [] },
      ],
    });
    const res = await request.put('/api/config', { data: bad });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Duplicate display id');

    // The good config from beforeEach must still be on disk, untouched.
    const after = await getConfig(request);
    expect(after.screens).toHaveLength(1);
    expect(after.screens[0].modules[0].config.content).toBe('E2E HOME SCREEN');
    expect(after.displays).toBeUndefined();
  });
});

test.describe('PUT /api/secrets', () => {
  test('rejects a body missing key/value with 400', async ({ request }) => {
    const res = await request.put('/api/secrets', { data: { notAKey: 'x' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Missing required fields');
  });

  test('rejects an unknown secret key with 400', async ({ request }) => {
    const res = await request.put('/api/secrets', {
      data: { key: 'totally_made_up_key', value: 'abc' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Invalid secret key');
  });
});

test.describe('data routes reject malformed bodies', () => {
  test('PUT /api/chores/data rejects non-array members and stays readable', async ({ request }) => {
    const res = await request.put('/api/chores/data', {
      data: { members: {}, chores: {} },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('members must be an array');

    // Store is not corrupted — a follow-up read still works.
    const after = await request.get('/api/chores/data');
    expect(after.ok()).toBe(true);
  });

  test('PUT /api/chores/data rejects a top-level array body with 400', async ({ request }) => {
    const res = await request.put('/api/chores/data', { data: [] });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('members must be an array');
  });

  test('PUT /api/rewards/data rejects a non-array rewards field with 400', async ({ request }) => {
    const res = await request.put('/api/rewards/data', { data: { rewards: 'nope' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('rewards must be an array');

    // A well-formed follow-up write still succeeds (route stays functional).
    const ok = await request.put('/api/rewards/data', { data: { rewards: [] } });
    expect(ok.ok()).toBe(true);
  });

  test('PUT /api/meals/data rejects a non-array savedMeals with 400', async ({ request }) => {
    const res = await request.put('/api/meals/data', { data: { savedMeals: 'nope' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('savedMeals must be an array');

    const after = await request.get('/api/meals/data');
    expect(after.ok()).toBe(true);
  });

  test('PUT /api/meals/data rejects an empty body (no writable fields) with 400', async ({ request }) => {
    const res = await request.put('/api/meals/data', { data: {} });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('at least one of');
  });
});

test.describe('POST /api/todo/toggle', () => {
  // A config with one interactive todo module the toggle route can validate against.
  function todoModule(): ModuleInstance {
    return {
      id: 'todo-1',
      type: 'todo',
      position: { x: 0, y: 0 },
      size: { w: 400, h: 400 },
      zIndex: 1,
      style: { ...DEFAULT_MODULE_STYLE },
      config: {
        title: 'Tasks',
        interactive: true,
        items: [{ id: 'item-known', text: 'Walk the dog', completed: false }],
      },
    } as unknown as ModuleInstance;
  }

  test('rejects a body missing ids with 400', async ({ request }) => {
    const res = await request.post('/api/todo/toggle', { data: { screenId: 'screen-1' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Missing screenId, moduleId, or itemId');
  });

  test('returns 404 for an unknown item UUID on a real module', async ({ request }) => {
    await putConfig(request, baseConfig({ screens: [makeScreen('screen-1', 'Screen 1', [todoModule()])] }));
    const res = await request.post('/api/todo/toggle', {
      data: { screenId: 'screen-1', moduleId: 'todo-1', itemId: 'does-not-exist' },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe('Item not found');
  });

  test('returns 404 for an unknown screen', async ({ request }) => {
    const res = await request.post('/api/todo/toggle', {
      data: { screenId: 'ghost-screen', moduleId: 'todo-1', itemId: 'item-known' },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe('Screen not found');
  });
});

test.describe('/api/display/[action]', () => {
  test('GET with an unknown action returns 404', async ({ request }) => {
    const res = await request.get('/api/display/bogus-action');
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toContain('Unknown action');
  });

  test('GET with a malformed display slug returns 400', async ({ request }) => {
    const res = await request.get('/api/display/status?display=Bad_Slug');
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Invalid display id');
  });

  test('GET status for an unreported display returns 404', async ({ request }) => {
    const res = await request.get('/api/display/status?display=nonexistent');
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe('No status reported yet');
  });
});

test.describe('POST /api/backgrounds', () => {
  test('rejects a disallowed file type with 400', async ({ request }) => {
    const res = await request.post('/api/backgrounds', {
      multipart: {
        file: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('junk') },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Invalid file type');
  });

  test('rejects a multipart request with no file with 400', async ({ request }) => {
    const res = await request.post('/api/backgrounds', {
      multipart: { directory: '' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('No file provided');
  });

  test('rejects an oversized upload', async ({ request }) => {
    // The handler declares a 10 MB per-file cap that returns 413, but a
    // genuinely oversized multipart body is rejected by the framework's own
    // multipart limit BEFORE request.formData() resolves, surfacing as a 500
    // (verified empirically: 9 MB uploads succeed, 11 MB → 500). So the
    // handler's 413 branch is effectively shadowed for real oversized uploads.
    // We assert the observable contract: an 11 MB upload is rejected, not
    // written. (See findings note in the accompanying report.)
    const oversized = Buffer.alloc(11 * 1024 * 1024, 0);
    const res = await request.post('/api/backgrounds', {
      multipart: {
        file: { name: 'big.png', mimeType: 'image/png', buffer: oversized },
      },
    });
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(500);
  });
});

test.describe('POST /api/backup restore', () => {
  test('rejects a tampered bundle (bad config shape) with 400', async ({ request }) => {
    const res = await request.post('/api/backup', {
      data: { _type: 'home-screens-backup', config: { screens: 'not-an-array' } },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('screens array and settings');
  });

  test('rejects a bundle whose config has an invalid displays registry with 400', async ({ request }) => {
    const res = await request.post('/api/backup', {
      data: {
        _type: 'home-screens-backup',
        config: baseConfig({ displays: [{ id: 'kitchen', screens: [] }, { id: 'kitchen', screens: [] }] }),
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Duplicate display id');
  });

  test('rejects an unrecognized bundle format with 400', async ({ request }) => {
    const res = await request.post('/api/backup', { data: { random: 'payload' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('Unrecognized backup format');
  });

  test('rejects an oversized bundle with 413', async ({ request }) => {
    // 25 MB cap. A buffer just over it trips the Content-Length fast path
    // before any JSON parsing, so the body content need not be valid JSON.
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 16, 0x78 /* 'x' */);
    const res = await request.post('/api/backup', {
      data: oversized,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(413);
    expect((await res.json()).error).toContain('too large');
  });
});

test.describe('plugin install routes', () => {
  // /api/plugins/install is registry-driven (pluginId/version, not a tarball
  // upload). Only its pre-fetch validation is reachable without an external
  // registry call — the unknown-plugin path calls fetchRegistry() upstream.
  test('POST /api/plugins/install rejects a body missing pluginId/version with 400', async ({ request }) => {
    const res = await request.post('/api/plugins/install', { data: {} });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('pluginId and version are required');
  });

  // /api/plugins/install-external takes a tarball URL and enforces scheme +
  // SSRF guards that reject BEFORE any fetch/DNS (literal blocked IPs hit the
  // pre-DNS fast path), so these drive real hardening with zero network I/O.
  test('POST install-external rejects a missing tarballUrl with 400', async ({ request }) => {
    const res = await request.post('/api/plugins/install-external', { data: {} });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('tarballUrl is required');
  });

  test('POST install-external rejects a non-HTTPS scheme with 400', async ({ request }) => {
    const res = await request.post('/api/plugins/install-external', {
      data: { tarballUrl: 'ftp://example.com/plugin.tgz' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('HTTPS');
  });

  test('POST install-external rejects an SSRF target (cloud metadata IP) with 400', async ({ request }) => {
    const res = await request.post('/api/plugins/install-external', {
      data: { tarballUrl: 'https://169.254.169.254/plugin.tgz' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('blocked');
  });

  test('POST install-external rejects a {version} template with no version with 400', async ({ request }) => {
    const res = await request.post('/api/plugins/install-external', {
      data: { tarballUrl: 'https://example.com/plugin-{version}.tgz' },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('{version}');
  });
});

test.describe('provider routes: missing-key branches (no upstream fetch)', () => {
  test('GET /api/weather returns a 400 when a keyed provider has no key', async ({ request }) => {
    // lat/lon supplied so we pass the location guard and reach the secret
    // check; openweathermap is a keyed provider and no secret is configured.
    const res = await request.get('/api/weather?provider=openweathermap&lat=44.7&lon=-93.4');
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('API key');
  });

  test('GET /api/todoist returns a 400 when no token is configured', async ({ request }) => {
    const res = await request.get('/api/todoist');
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Todoist API key');
  });

  test('GET /api/unsplash returns a 400 when no access key is configured', async ({ request }) => {
    const res = await request.get('/api/unsplash?query=nature');
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Unsplash API key');
  });

  test('GET /api/traffic rejects missing/invalid routes before any fetch with 400', async ({ request }) => {
    const missing = await request.get('/api/traffic');
    expect(missing.status()).toBe(400);
    expect((await missing.json()).error).toBe('Missing routes parameter');

    const badJson = await request.get('/api/traffic?routes=%7Bnot-json');
    expect(badJson.status()).toBe(400);
    expect((await badJson.json()).error).toBe('Invalid routes JSON');

    const empty = await request.get('/api/traffic?routes=%5B%5D');
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error).toBe('Routes must be a non-empty array');
  });
});
