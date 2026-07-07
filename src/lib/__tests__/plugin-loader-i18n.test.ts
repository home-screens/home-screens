import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadPluginTranslations,
  __resetPluginLoaderActiveLocaleCacheForTests,
} from '@/lib/plugin-loader';
import { __resetLoaderForTests, getCachedNamespace } from '@/i18n/loader';
import type { PluginManifest } from '@/types/plugins';

/**
 * Build a minimal manifest stub. Only the fields the i18n loading path
 * actually reads are required; we cast through `as PluginManifest` so the
 * tests don't have to fill every required manifest field.
 */
function stubManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    moduleType: 'my-plugin',
    icon: 'box',
    defaultConfig: {},
    defaultSize: { w: 200, h: 200 },
    exports: { component: 'default' },
    ...overrides,
  } as PluginManifest;
}

/**
 * Mock fetch that routes by URL. `routes` maps URL substring → handler.
 * Returns the spy so tests can assert on call counts.
 */
function mockFetchRoutes(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    for (const [needle, handler] of Object.entries(routes)) {
      if (url.includes(needle)) return handler();
    }
    return new Response('Not Found', { status: 404 });
  });
}

const CONFIG_RESPONSE_EN = () =>
  new Response(JSON.stringify({ settings: { locale: 'en-US' } }), { status: 200 });

const CONFIG_RESPONSE_DE = () =>
  new Response(JSON.stringify({ settings: { locale: 'de-DE' } }), { status: 200 });

const CONFIG_RESPONSE_NONE = () =>
  new Response(JSON.stringify({ settings: {} }), { status: 200 });

describe('loadPluginTranslations', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetLoaderForTests();
    __resetPluginLoaderActiveLocaleCacheForTests();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the active-locale dictionary and registers under plugin:<id>', async () => {
    mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_EN,
      '/api/plugins/asset/my-plugin/translations/en-US.json': () =>
        new Response(JSON.stringify({ greeting: 'Hello' }), { status: 200 }),
    });

    const manifest = stubManifest({
      translations: { 'en-US': 'translations/en-US.json' },
    });

    await loadPluginTranslations(manifest);

    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toEqual({ greeting: 'Hello' });
  });

  it('picks the active locale over en-US when both are listed', async () => {
    mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_DE,
      '/api/plugins/asset/my-plugin/translations/de-DE.json': () =>
        new Response(JSON.stringify({ greeting: 'Hallo' }), { status: 200 }),
      '/api/plugins/asset/my-plugin/translations/en-US.json': () =>
        new Response(JSON.stringify({ greeting: 'Hello' }), { status: 200 }),
    });

    const manifest = stubManifest({
      translations: {
        'en-US': 'translations/en-US.json',
        'de-DE': 'translations/de-DE.json',
      },
    });

    await loadPluginTranslations(manifest);

    // Registered under the active locale (de-DE), with the de-DE strings.
    expect(getCachedNamespace('de-DE', 'plugin:my-plugin')).toEqual({ greeting: 'Hallo' });
  });

  it('falls back to en-US when the active locale is not in the manifest', async () => {
    mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_DE,
      '/api/plugins/asset/my-plugin/translations/en-US.json': () =>
        new Response(JSON.stringify({ greeting: 'Hello' }), { status: 200 }),
    });

    const manifest = stubManifest({
      translations: { 'en-US': 'translations/en-US.json' },
    });

    await loadPluginTranslations(manifest);

    // Registered under the active locale tag (de-DE) so subsequent
    // lookups for de-DE find the fallback content directly.
    expect(getCachedNamespace('de-DE', 'plugin:my-plugin')).toEqual({ greeting: 'Hello' });
  });

  it('skips silently when manifest.translations is absent', async () => {
    const fetchSpy = mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_EN,
    });

    const manifest = stubManifest();

    await expect(loadPluginTranslations(manifest)).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('skips silently when manifest.translations is an empty object', async () => {
    const fetchSpy = mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_EN,
    });

    const manifest = stubManifest({ translations: {} });

    await loadPluginTranslations(manifest);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns and does not throw when the translations file is missing (404)', async () => {
    mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_EN,
      // No matching asset route → 404 from default handler.
    });

    const manifest = stubManifest({
      translations: { 'en-US': 'translations/en-US.json' },
    });

    await expect(loadPluginTranslations(manifest)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
  });

  it('warns and does not throw on malformed translations JSON', async () => {
    mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_EN,
      '/api/plugins/asset/my-plugin/translations/en-US.json': () =>
        // JSON parses, but the payload is an array, not a dictionary object.
        new Response(JSON.stringify(['not', 'a', 'dictionary']), { status: 200 }),
    });

    const manifest = stubManifest({
      translations: { 'en-US': 'translations/en-US.json' },
    });

    await expect(loadPluginTranslations(manifest)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
  });

  it('warns and does not throw when the JSON body fails to parse', async () => {
    mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_EN,
      '/api/plugins/asset/my-plugin/translations/en-US.json': () =>
        new Response('this is not json', { status: 200 }),
    });

    const manifest = stubManifest({
      translations: { 'en-US': 'translations/en-US.json' },
    });

    await expect(loadPluginTranslations(manifest)).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
  });

  it('uses DEFAULT_LOCALE when /api/config has no settings.locale', async () => {
    mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_NONE,
      '/api/plugins/asset/my-plugin/translations/en-US.json': () =>
        new Response(JSON.stringify({ greeting: 'Hello' }), { status: 200 }),
    });

    const manifest = stubManifest({
      translations: { 'en-US': 'translations/en-US.json' },
    });

    await loadPluginTranslations(manifest);

    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toEqual({ greeting: 'Hello' });
  });

  describe('path-traversal hardening in buildTranslationUrl', () => {
    it('rejects manifest paths with parent-directory traversal', async () => {
      const fetchSpy = mockFetchRoutes({
        '/api/config': CONFIG_RESPONSE_EN,
      });

      const manifest = stubManifest({
        translations: { 'en-US': '../../../etc/passwd' },
      });

      await loadPluginTranslations(manifest);

      // Only /api/config should have been fetched — the asset URL is
      // never built because the path is rejected upfront.
      const calls = fetchSpy.mock.calls.map((c) => {
        const input = c[0];
        return typeof input === 'string' ? input : (input as Request).url;
      });
      expect(calls.some((u) => u.includes('/api/plugins/asset/'))).toBe(false);
      expect(calls.some((u) => u.includes('passwd'))).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        '[plugin]',
        expect.stringMatching(/parent-directory traversal/),
      );
      expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
    });

    it('rejects manifest paths with absolute http:// schemes', async () => {
      const fetchSpy = mockFetchRoutes({
        '/api/config': CONFIG_RESPONSE_EN,
      });

      const manifest = stubManifest({
        translations: { 'en-US': 'http://evil.example.com/x.json' },
      });

      await loadPluginTranslations(manifest);

      const calls = fetchSpy.mock.calls.map((c) => {
        const input = c[0];
        return typeof input === 'string' ? input : (input as Request).url;
      });
      expect(calls.some((u) => u.includes('evil.example.com'))).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        '[plugin]',
        expect.stringMatching(/absolute scheme/),
      );
    });

    it('rejects manifest paths with file:// schemes', async () => {
      mockFetchRoutes({ '/api/config': CONFIG_RESPONSE_EN });
      const manifest = stubManifest({
        translations: { 'en-US': 'file:///etc/passwd' },
      });
      await loadPluginTranslations(manifest);
      expect(warnSpy).toHaveBeenCalledWith(
        '[plugin]',
        expect.stringMatching(/absolute scheme/),
      );
    });

    it('rejects manifest paths containing backslashes', async () => {
      mockFetchRoutes({ '/api/config': CONFIG_RESPONSE_EN });
      const manifest = stubManifest({
        translations: { 'en-US': 'translations\\..\\..\\etc\\passwd' },
      });
      await loadPluginTranslations(manifest);
      expect(warnSpy).toHaveBeenCalledWith(
        '[plugin]',
        expect.stringMatching(/NUL or backslash/),
      );
    });

    it('rejects manifest paths containing NUL bytes', async () => {
      mockFetchRoutes({ '/api/config': CONFIG_RESPONSE_EN });
      const manifest = stubManifest({
        translations: { 'en-US': 'translations/en-US.json\0../etc/passwd' },
      });
      await loadPluginTranslations(manifest);
      expect(warnSpy).toHaveBeenCalledWith(
        '[plugin]',
        expect.stringMatching(/NUL or backslash/),
      );
    });
  });

  describe('size-cap hardening', () => {
    it('aborts via Content-Length header when payload exceeds 1MB', async () => {
      // Returns a synthetic Response with a 50MB Content-Length header.
      // The loader must short-circuit on the header alone — whether the
      // body is even consumed is implementation detail (Node's fetch
      // eagerly drains tiny streams), but the warning and the absence
      // of a registered dictionary are observable.
      mockFetchRoutes({
        '/api/config': CONFIG_RESPONSE_EN,
        '/api/plugins/asset/my-plugin/translations/en-US.json': () => {
          // A trivial body that JSON-parses; the size cap should reject
          // it on the header alone before the parse would succeed.
          return new Response(JSON.stringify({ greeting: 'Hello' }), {
            status: 200,
            headers: {
              'content-length': '50000000',
              'content-type': 'application/json',
            },
          });
        },
      });

      const manifest = stubManifest({
        translations: { 'en-US': 'translations/en-US.json' },
      });

      await loadPluginTranslations(manifest);

      expect(warnSpy).toHaveBeenCalledWith(
        '[plugin]',
        expect.stringMatching(/exceeds 1000000B/),
      );
      // Critical: the dictionary must NOT be registered even though the
      // body would have parsed cleanly. The header gate is the only
      // thing keeping a malicious 50MB payload out.
      expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
    });

    it('aborts mid-stream when running byte counter exceeds 1MB without Content-Length', async () => {
      // No content-length header — the loader must read in chunks and
      // bail when the running counter exceeds the cap.
      mockFetchRoutes({
        '/api/config': CONFIG_RESPONSE_EN,
        '/api/plugins/asset/my-plugin/translations/en-US.json': () => {
          const oversized = new Uint8Array(2_000_000);
          const stream = new ReadableStream({
            pull(controller) {
              controller.enqueue(oversized);
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      });

      const manifest = stubManifest({
        translations: { 'en-US': 'translations/en-US.json' },
      });

      await loadPluginTranslations(manifest);

      expect(warnSpy).toHaveBeenCalledWith(
        '[plugin]',
        expect.stringMatching(/exceeds 1000000B/),
      );
      expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toBeUndefined();
    });
  });

  it('treats baseUrl as a remote dev-server origin', async () => {
    const fetchSpy = mockFetchRoutes({
      '/api/config': CONFIG_RESPONSE_EN,
      'https://dev.example.com/translations/en-US.json': () =>
        new Response(JSON.stringify({ greeting: 'Dev' }), { status: 200 }),
    });

    const manifest = stubManifest({
      translations: { 'en-US': 'translations/en-US.json' },
    });

    await loadPluginTranslations(manifest, 'https://dev.example.com');

    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toEqual({ greeting: 'Dev' });
    // Confirm the dev-server URL was actually fetched (not the
    // /api/plugins/asset path).
    const calledUrls = fetchSpy.mock.calls.map((call) => {
      const input = call[0];
      return typeof input === 'string' ? input : (input as Request).url;
    });
    expect(calledUrls.some((u) => u.startsWith('https://dev.example.com/'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/api/plugins/asset/'))).toBe(false);
  });
});

describe('getActiveLocale failure-path behaviour', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    __resetPluginLoaderActiveLocaleCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not cache the fallback when /api/config returns 5xx — the next call retries', async () => {
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/config')) {
        callCount++;
        if (callCount === 1) {
          return new Response('boom', { status: 500 });
        }
        return new Response(JSON.stringify({ settings: { locale: 'de-DE' } }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const { getActiveLocale } = await import('@/lib/plugin-loader');

    const first = await getActiveLocale();
    expect(first).toBe('en-US'); // fallback on failure
    const second = await getActiveLocale();
    expect(second).toBe('de-DE'); // retry succeeded; not pinned to fallback
    expect(callCount).toBe(2);
  });

  it('does not cache the fallback when /api/config throws', async () => {
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/config')) {
        callCount++;
        if (callCount === 1) throw new Error('network down');
        return new Response(JSON.stringify({ settings: { locale: 'fr-FR' } }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const { getActiveLocale } = await import('@/lib/plugin-loader');

    const first = await getActiveLocale();
    expect(first).toBe('en-US');
    const second = await getActiveLocale();
    expect(second).toBe('fr-FR');
  });

  it('caches successful results within the TTL window', async () => {
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/config')) {
        callCount++;
        return new Response(JSON.stringify({ settings: { locale: 'de-DE' } }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const { getActiveLocale } = await import('@/lib/plugin-loader');

    expect(await getActiveLocale()).toBe('de-DE');
    expect(await getActiveLocale()).toBe('de-DE');
    expect(callCount).toBe(1); // second call hit the cache
  });
});

describe('clearActiveLocaleCache', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    __resetPluginLoaderActiveLocaleCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forces the next getActiveLocale call to re-fetch', async () => {
    let currentLocale = 'en-US';
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({ settings: { locale: currentLocale } }),
        { status: 200 },
      );
    });

    const { getActiveLocale, clearActiveLocaleCache } = await import('@/lib/plugin-loader');

    expect(await getActiveLocale()).toBe('en-US');
    currentLocale = 'de-DE';
    // Without clearing, the cache returns the stale value.
    expect(await getActiveLocale()).toBe('en-US');
    expect(callCount).toBe(1);
    clearActiveLocaleCache();
    expect(await getActiveLocale()).toBe('de-DE');
    expect(callCount).toBe(2);
  });
});
