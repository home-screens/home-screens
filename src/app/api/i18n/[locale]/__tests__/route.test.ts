/**
 * Route-level tests for `GET /api/i18n/[locale]`.
 *
 * Mocks `node:fs/promises` so we don't depend on the on-disk
 * `src/translations/` layout for any locale beyond what each test sets up.
 * Calls the exported `GET` directly with a synthetic `NextRequest` —
 * no real server, no Next runtime.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { NextRequest } from 'next/server';

// In-memory file system stub. Keys are absolute paths; values are the
// file's contents (already stringified JSON). The mocked `readFile`
// throws ENOENT when a path isn't present, mirroring node's behavior so
// the route's `try { ... } catch { return null }` branch fires correctly.
const FAKE_FILES = new Map<string, string>();

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (p: string) => {
      const v = FAKE_FILES.get(p);
      if (v === undefined) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return v;
    }),
  },
  readFile: vi.fn(async (p: string) => {
    const v = FAKE_FILES.get(p);
    if (v === undefined) {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return v;
  }),
}));

// Import AFTER the mock so the route's `import fs from 'node:fs/promises'`
// resolves to our stub.
import { GET } from '../route';

const TRANSLATIONS_DIR = path.join(process.cwd(), 'src', 'translations');

function seedFile(locale: string, namespace: string, content: object): void {
  const p = path.join(TRANSLATIONS_DIR, locale, `${namespace}.json`);
  FAKE_FILES.set(p, JSON.stringify(content));
}

function makeRequest(locale: string, query: string): {
  request: NextRequest;
  ctx: { params: Promise<{ locale: string }> };
} {
  const url = `http://test.local/api/i18n/${locale}${query ? `?${query}` : ''}`;
  return {
    request: new NextRequest(url),
    ctx: { params: Promise.resolve({ locale }) },
  };
}

describe('GET /api/i18n/[locale]', () => {
  beforeEach(() => {
    FAKE_FILES.clear();
    // Seed a known good en-US dictionary across the namespaces tests need.
    seedFile('en-US', 'core', { hello: 'Hello', today: 'Today' });
    seedFile('en-US', 'modules', { weather: { sunny: 'Sunny' } });
    seedFile('en-US', 'editor', { title: 'Editor' });
    // de-DE has core but not editor — used by the "missing namespace falls
    // back to en-US per-namespace" test.
    seedFile('de-DE', 'core', { hello: 'Hallo', today: 'Heute' });
  });

  it('known locale + ?ns=core returns the core dictionary', async () => {
    const { request, ctx } = makeRequest('de-DE', 'ns=core');
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ core: { hello: 'Hallo', today: 'Heute' } });
  });

  it('known locale + ?ns=core,modules returns both namespaces', async () => {
    const { request, ctx } = makeRequest('en-US', 'ns=core,modules');
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      core: { hello: 'Hello', today: 'Today' },
      modules: { weather: { sunny: 'Sunny' } },
    });
  });

  it('unknown locale (xx-YY) falls back silently to en-US', async () => {
    const { request, ctx } = makeRequest('xx-YY', 'ns=core');
    const res = await GET(request, ctx);
    // No redirect — the body is the en-US dictionary served at 200.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ core: { hello: 'Hello', today: 'Today' } });
    // X-Locale names the tag whose chain was walked, not the file served.
    expect(res.headers.get('X-Locale')).toBe('xx-YY');
    expect(res.headers.get('X-Locale-Registered')).toBe('false');
  });

  it('unregistered regional tag (de-AT) serves its registered sibling, matching SSR', async () => {
    // buildLocaleBlob walks de-AT → de-DE for server rendering; the API
    // route must resolve identically or a de-AT display would SSR German
    // and then hydrate English from this endpoint.
    const { request, ctx } = makeRequest('de-AT', 'ns=core');
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ core: { hello: 'Hallo', today: 'Heute' } });
    expect(res.headers.get('X-Locale')).toBe('de-AT');
    expect(res.headers.get('X-Locale-Registered')).toBe('false');
  });

  it('a locale segment that is not BCP-47-shaped is treated as the fallback', async () => {
    const { request, ctx } = makeRequest('..%2Fnot-a-locale', 'ns=core');
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ core: { hello: 'Hello', today: 'Today' } });
    expect(res.headers.get('X-Locale')).toBe('en-US');
  });

  it('rejects path-traversal namespace with HTTP 400', async () => {
    const { request, ctx } = makeRequest('en-US', 'ns=' + encodeURIComponent('../etc/passwd'));
    const res = await GET(request, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid namespace/);
  });

  it('rejects half-good namespace list (one valid, one traversal) with HTTP 400', async () => {
    const { request, ctx } = makeRequest('en-US', 'ns=' + encodeURIComponent('core,../foo'));
    const res = await GET(request, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid namespace/);
    // Must NOT half-serve — even though `core` is valid, the response
    // shouldn't contain it.
    expect(body.core).toBeUndefined();
  });

  it('falls back per-namespace to en-US when the locale lacks the file', async () => {
    // de-DE was seeded above with `core` only — `editor.json` doesn't exist
    // for de-DE. The route should walk the fallback chain and serve the
    // en-US `editor` dictionary under the `editor` key.
    const { request, ctx } = makeRequest('de-DE', 'ns=editor');
    const res = await GET(request, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ editor: { title: 'Editor' } });
  });

  it('Cache-Control header matches the public/maxage policy in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const { request, ctx } = makeRequest('en-US', 'ns=core');
      const res = await GET(request, ctx);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=86400');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('Cache-Control header is no-store in development so JSON edits show up on reload', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const { request, ctx } = makeRequest('en-US', 'ns=core');
      const res = await GET(request, ctx);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
