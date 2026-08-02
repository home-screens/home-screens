// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadAllPlugins, stopDevPolling } from '@/lib/plugin-loader';
import { usePluginStore } from '@/stores/plugin-store';
import { sharedStateStore } from '@/lib/shared-state-store';
import type { PluginManifest } from '@/types/plugins';

/**
 * Dev overrides live in localStorage, which is shared across every tab of the
 * origin — including unauthenticated display tabs that never load a dev bundle.
 * `loadAllPlugins` must therefore only skip an installed copy in favor of a dev
 * override ON THE EDITOR. On a display page the installed copy has to load as
 * the fallback, otherwise a plugin with a dev override registered in this
 * browser would load nowhere and its modules (and stateProvider) would vanish.
 */

interface InstalledEntry {
  id: string;
  moduleType: string;
  version: string;
  enabled?: boolean;
  settings?: Record<string, unknown>;
}

function makeManifest(id: string, moduleType: string): PluginManifest {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: '',
    author: 'test',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType,
    category: 'Custom',
    icon: 'Star',
    defaultConfig: {},
    defaultSize: { w: 200, h: 200 },
    exports: { component: 'default' },
  } as PluginManifest;
}

const BUNDLE = 'window.__HS_PLUGIN__ = { default: function Noop() { return null; } };';

/** jsdom's localStorage is non-functional under this setup; stub an in-memory one. */
function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

const DEV_BASE = 'http://localhost:5173';

/**
 * Routes installed + dev-server endpoints, counting how often each bundle is
 * fetched so a test can prove which copy actually loaded.
 */
function mockFetch(opts: {
  installed: InstalledEntry[];
  manifests: Record<string, PluginManifest>;
  devManifest?: PluginManifest;
}) {
  const hits = { installedBundle: 0, devBundle: 0 };
  const spy = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;

    if (url.includes('/api/plugins/installed')) {
      return new Response(
        JSON.stringify({ plugins: opts.installed.map((p) => ({ enabled: true, ...p })) }),
        { status: 200 },
      );
    }

    const manifestMatch = url.match(/\/api\/plugins\/manifest\/([^/?]+)/);
    if (manifestMatch) {
      const manifest = opts.manifests[manifestMatch[1]];
      if (manifest) return new Response(JSON.stringify(manifest), { status: 200 });
      return new Response('Not Found', { status: 404 });
    }

    const bundleMatch = url.match(/\/api\/plugins\/bundle\/([^/?]+)/);
    if (bundleMatch) {
      hits.installedBundle += 1;
      return new Response(BUNDLE, { status: 200 });
    }

    // Dev server endpoints (loadDevPlugin fetches from the override URL root).
    if (url.startsWith(DEV_BASE)) {
      if (url.endsWith('/manifest.json') && opts.devManifest) {
        return new Response(JSON.stringify(opts.devManifest), { status: 200 });
      }
      if (url.endsWith('/dist/bundle.js')) {
        if ((init?.method ?? 'GET') === 'GET') hits.devBundle += 1;
        return new Response(BUNDLE, { status: 200, headers: { etag: 'v1' } });
      }
    }

    if (url.includes('/api/plugins/dev')) return new Response('{}', { status: 200 });
    if (url.includes('/api/config')) {
      return new Response(JSON.stringify({ settings: { locale: 'en-US' } }), { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  });
  return { spy, hits };
}

describe('loadAllPlugins dev-override display fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', makeLocalStorage());
    sharedStateStore.__resetForTests();
    usePluginStore.setState({
      plugins: new Map(),
      errors: new Map(),
      pluginSettings: new Map(),
      loading: true,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Bridge __HS_PLUGIN__ from jsdom's inner window to the Node global that
    // executeBundle reads (same shim as plugin-loader-state-provider.test.ts).
    const inner = (globalThis as unknown as { jsdom: { window: Record<string, unknown> } }).jsdom.window;
    Object.defineProperty(globalThis, '__HS_PLUGIN__', {
      configurable: true,
      get: () => inner.__HS_PLUGIN__,
      set: (v) => { inner.__HS_PLUGIN__ = v; },
    });
  });

  afterEach(() => {
    stopDevPolling('overridden');
    delete (globalThis as Record<string, unknown>).__HS_PLUGIN__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads the INSTALLED copy on a display page even when a dev override is registered', async () => {
    const manifest = makeManifest('overridden', 'overridden');
    localStorage.setItem(
      'hs:devPlugins',
      JSON.stringify({ overridden: { url: DEV_BASE, manifest } }),
    );

    const { hits } = mockFetch({
      installed: [{ id: 'overridden', moduleType: 'overridden', version: '1.0.0' }],
      manifests: { overridden: manifest },
      devManifest: manifest,
    });

    await loadAllPlugins({ surface: 'display' });

    // Installed copy is the fallback on a display page: it registers, and the
    // dev bundle is never fetched (the dev loop only runs on the editor).
    expect(usePluginStore.getState().plugins.has('plugin:overridden')).toBe(true);
    expect(hits.installedBundle).toBe(1);
    expect(hits.devBundle).toBe(0);
  });

  it('skips the installed copy in favor of the dev override on the editor', async () => {
    const manifest = makeManifest('overridden', 'overridden');
    localStorage.setItem(
      'hs:devPlugins',
      JSON.stringify({ overridden: { url: DEV_BASE, manifest } }),
    );

    const { hits } = mockFetch({
      installed: [{ id: 'overridden', moduleType: 'overridden', version: '1.0.0' }],
      manifests: { overridden: manifest },
      devManifest: manifest,
    });

    await loadAllPlugins({ surface: 'editor' });

    // Editor loads the dev bundle and skips the installed one entirely.
    expect(usePluginStore.getState().plugins.has('plugin:overridden')).toBe(true);
    expect(hits.devBundle).toBe(1);
    expect(hits.installedBundle).toBe(0);
  });
});
