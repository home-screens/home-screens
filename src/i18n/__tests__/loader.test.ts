import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadNamespace,
  hydrateFromBlob,
  getCachedNamespace,
  registerPluginNamespace,
  __resetLoaderForTests,
} from '@/i18n/loader';

describe('loadNamespace', () => {
  beforeEach(() => {
    __resetLoaderForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the requested namespace and caches the result', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ core: { hello: 'Hi' } }), { status: 200 }),
    );

    const dict = await loadNamespace('en-US', 'core');
    expect(dict).toEqual({ hello: 'Hi' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call hits the cache — fetch shouldn't fire again.
    const cached = await loadNamespace('en-US', 'core');
    expect(cached).toEqual({ hello: 'Hi' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests for the same namespace', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      // Resolve in a microtask so both callers are pending at the same time.
      await Promise.resolve();
      return new Response(JSON.stringify({ core: { ok: 'yes' } }), { status: 200 });
    });

    const [a, b] = await Promise.all([
      loadNamespace('en-US', 'core'),
      loadNamespace('en-US', 'core'),
    ]);

    expect(a).toEqual({ ok: 'yes' });
    expect(b).toEqual({ ok: 'yes' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to en-US on 404 for non-fallback locales', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('de-DE')) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(JSON.stringify({ core: { hello: 'Hello' } }), { status: 200 });
    });

    const dict = await loadNamespace('de-DE', 'core');
    expect(dict).toEqual({ hello: 'Hello' });
    // One miss, one hit on en-US.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns an empty dictionary on 404 for the fallback locale itself', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    const dict = await loadNamespace('en-US', 'core');
    expect(dict).toEqual({});
  });

  it('returns an empty dictionary on network error', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
    const dict = await loadNamespace('en-US', 'core');
    expect(dict).toEqual({});
  });
});

describe('hydrateFromBlob', () => {
  beforeEach(() => {
    __resetLoaderForTests();
  });

  it('seeds the cache for every namespace in the blob', () => {
    hydrateFromBlob('de-DE', {
      core: { today: 'Heute' },
      modules: { weather: { sunny: 'Sonnig' } },
    });

    expect(getCachedNamespace('de-DE', 'core')).toEqual({ today: 'Heute' });
    expect(getCachedNamespace('de-DE', 'modules')).toEqual({ weather: { sunny: 'Sonnig' } });
  });

  it('hydrated namespaces are served without a fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    hydrateFromBlob('en-US', { core: { today: 'Today' } });

    const dict = await loadNamespace('en-US', 'core');
    expect(dict).toEqual({ today: 'Today' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('registerPluginNamespace', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('registers the dictionary under plugin:<id> in the cache', () => {
    registerPluginNamespace('my-plugin', 'en-US', { foo: 'bar' });
    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toEqual({ foo: 'bar' });
  });

  it('keeps separate entries per locale for the same plugin', () => {
    registerPluginNamespace('my-plugin', 'en-US', { foo: 'bar' });
    registerPluginNamespace('my-plugin', 'de-DE', { foo: 'BAR' });
    expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toEqual({ foo: 'bar' });
    expect(getCachedNamespace('de-DE', 'plugin:my-plugin')).toEqual({ foo: 'BAR' });
  });

  it('accepts every shape PLUGIN_ID_PATTERN (canonical) accepts', () => {
    // The canonical validator in `src/lib/plugin-utils.ts` accepts
    // alphanumerics, underscore and hyphen — case-insensitive. The
    // i18n-side check must agree so a legitimately-installed plugin can
    // register translations.
    expect(() => registerPluginNamespace('my-plugin', 'en-US', {})).not.toThrow();
    expect(() => registerPluginNamespace('My-Plugin', 'en-US', {})).not.toThrow();
    expect(() => registerPluginNamespace('My_Plugin', 'en-US', {})).not.toThrow();
    expect(() => registerPluginNamespace('1plugin', 'en-US', {})).not.toThrow();
    expect(() => registerPluginNamespace('123', 'en-US', {})).not.toThrow();
    expect(() => registerPluginNamespace('PLUGIN', 'en-US', {})).not.toThrow();
  });

  it('throws for invalid pluginIds', () => {
    expect(() => registerPluginNamespace('My.Plugin', 'en-US', {})).toThrow(/invalid pluginId/);
    expect(() => registerPluginNamespace('my plugin', 'en-US', {})).toThrow(/invalid pluginId/);
    expect(() => registerPluginNamespace('', 'en-US', {})).toThrow(/invalid pluginId/);
    expect(() => registerPluginNamespace('plugin/x', 'en-US', {})).toThrow(/invalid pluginId/);
    expect(() => registerPluginNamespace('plugin\\x', 'en-US', {})).toThrow(/invalid pluginId/);
    expect(() => registerPluginNamespace('plugin:x', 'en-US', {})).toThrow(/invalid pluginId/);
  });

  it('throws for invalid locale', () => {
    expect(() => registerPluginNamespace('my-plugin', '', { foo: 'bar' })).toThrow(/invalid locale/);
  });

  it('warns in development when a plugin/locale pair is registered twice', () => {
    // Tests run with NODE_ENV !== 'production', so the dev-warn path is
    // already active. `vi.stubEnv` is the supported way to flip
    // NODE_ENV inside a test under recent Vitest.
    vi.stubEnv('NODE_ENV', 'development');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      registerPluginNamespace('my-plugin', 'en-US', { foo: 'bar' });
      expect(warnSpy).not.toHaveBeenCalled();

      registerPluginNamespace('my-plugin', 'en-US', { foo: 'baz' });
      expect(warnSpy).toHaveBeenCalledWith(
        '[i18n]',
        expect.stringMatching(/registered translations for "en-US" twice/),
      );
      // Last write wins.
      expect(getCachedNamespace('en-US', 'plugin:my-plugin')).toEqual({ foo: 'baz' });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not warn in production when re-registering', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      registerPluginNamespace('my-plugin', 'en-US', { foo: 'bar' });
      registerPluginNamespace('my-plugin', 'en-US', { foo: 'baz' });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
