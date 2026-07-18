// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000/editor" }

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadAllPlugins } from '@/lib/plugin-loader';
import { usePluginStore } from '@/stores/plugin-store';
import { sharedStateStore } from '@/lib/shared-state-store';
import type { PluginManifest } from '@/types/plugins';

/**
 * Dev-override fallback: a dev plugin entry in localStorage overrides the
 * installed copy, so when its dev server is unreachable the loader must fall
 * back to the installed version instead of leaving the module unregistered
 * (a stale hs:devPlugins entry otherwise takes the module off the palette
 * with only a raw fetch error). The recorded error must name the dev URL so
 * the failure is diagnosable.
 */

const DEV_URL = 'http://localhost:5173';

function makeManifest(id: string, version: string): PluginManifest {
  return {
    id,
    name: `Plugin ${id}`,
    version,
    description: '',
    author: 'test',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType: id,
    category: 'Custom',
    icon: 'Star',
    defaultConfig: {},
    defaultSize: { w: 200, h: 200 },
    exports: { component: 'default' },
  } as PluginManifest;
}

const BUNDLE = 'window.__HS_PLUGIN__ = { default: function Noop() { return null; } };';

/** jsdom's localStorage is non-functional under this setup (see theme.test.ts);
 *  stub a working in-memory one. */
function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

function seedDevPlugin(id: string, url = DEV_URL) {
  localStorage.setItem(
    'hs:devPlugins',
    JSON.stringify({ [id]: { url, manifest: makeManifest(id, '1.0.0') } }),
  );
}

/** Installed list + installed manifest/bundle served; the dev server URL is dead. */
function mockFetch(opts: { installed: Array<{ id: string; version: string }>; devServerUp?: boolean }) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;

    if (url.startsWith(DEV_URL)) {
      if (!opts.devServerUp) {
        throw new TypeError('NetworkError when attempting to fetch resource.');
      }
      if (url.endsWith('/manifest.json')) {
        return new Response(JSON.stringify(makeManifest('garmin', '2.0.0-dev')), { status: 200 });
      }
      if (url.endsWith('/dist/bundle.js')) {
        return new Response(BUNDLE, { status: 200 });
      }
    }
    if (url.includes('/api/plugins/installed')) {
      return new Response(
        JSON.stringify({
          plugins: opts.installed.map((p) => ({ ...p, moduleType: p.id, enabled: true })),
        }),
        { status: 200 },
      );
    }
    const manifestMatch = url.match(/\/api\/plugins\/manifest\/([^/?]+)/);
    if (manifestMatch) {
      const inst = opts.installed.find((p) => p.id === manifestMatch[1]);
      if (inst) return new Response(JSON.stringify(makeManifest(inst.id, inst.version)), { status: 200 });
      return new Response('Not Found', { status: 404 });
    }
    if (url.includes('/api/plugins/bundle/')) {
      return new Response(BUNDLE, { status: 200 });
    }
    if (url.includes('/api/plugins/dev')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('Not Found', { status: 404 });
  });
}

describe('loadAllPlugins dev-override fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers(); // keeps dev polling + tombstone timers inert
    vi.stubGlobal('localStorage', makeLocalStorage());
    sharedStateStore.__resetForTests();
    usePluginStore.setState({ plugins: new Map(), errors: new Map(), loading: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Vitest's jsdom runs injected <script> tags in jsdom's inner window,
    // while test code (and executeBundle) sees the populated Node global as
    // `window`. Bridge __HS_PLUGIN__ so the bundle's assignment is visible
    // to the loader.
    const inner = (globalThis as unknown as { jsdom: { window: Record<string, unknown> } }).jsdom.window;
    Object.defineProperty(globalThis, '__HS_PLUGIN__', {
      configurable: true,
      get: () => inner.__HS_PLUGIN__,
      set: (v) => { inner.__HS_PLUGIN__ = v; },
    });
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__HS_PLUGIN__;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to the installed version when the dev server is unreachable', async () => {
    seedDevPlugin('garmin');
    mockFetch({ installed: [{ id: 'garmin', version: '1.1.0' }] });

    await loadAllPlugins();

    const state = usePluginStore.getState();
    expect(state.plugins.has('plugin:garmin')).toBe(true);
    expect(state.plugins.get('plugin:garmin')?.manifest.version).toBe('1.1.0');

    const error = state.errors.get('garmin');
    expect(error?.message).toContain(DEV_URL);
    expect(error?.message).toContain('v1.1.0');
  });

  it('names the dev URL when there is no installed copy to fall back to', async () => {
    seedDevPlugin('ghost');
    mockFetch({ installed: [] });

    await loadAllPlugins();

    const state = usePluginStore.getState();
    expect(state.plugins.has('plugin:ghost')).toBe(false);
    const error = state.errors.get('ghost');
    expect(error?.message).toContain(DEV_URL);
    expect(error?.message).toContain('NetworkError');
  });

  it('keeps the real error when the fallback load also fails', async () => {
    seedDevPlugin('garmin');
    const spy = mockFetch({ installed: [{ id: 'garmin', version: '1.1.0' }] });
    // Break the installed bundle fetch on top of the dead dev server.
    const inner = spy.getMockImplementation()!;
    spy.mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/plugins/bundle/')) return new Response('gone', { status: 500 });
      return inner(input as RequestInfo);
    });

    await loadAllPlugins();

    const state = usePluginStore.getState();
    expect(state.plugins.has('plugin:garmin')).toBe(false);
    // The fallback's own failure must not be masked by the "using installed" notice.
    expect(state.errors.get('garmin')?.message).toContain('Bundle fetch failed: 500');
  });

  it('still prefers the dev version when the dev server responds', async () => {
    seedDevPlugin('garmin');
    mockFetch({ installed: [{ id: 'garmin', version: '1.1.0' }], devServerUp: true });

    await loadAllPlugins();

    const state = usePluginStore.getState();
    expect(state.plugins.get('plugin:garmin')?.manifest.version).toBe('2.0.0-dev');
    expect(state.errors.has('garmin')).toBe(false);
  });
});
