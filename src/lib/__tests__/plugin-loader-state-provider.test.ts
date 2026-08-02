// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadAllPlugins } from '@/lib/plugin-loader';
import { usePluginStore } from '@/stores/plugin-store';
import { sharedStateStore } from '@/lib/shared-state-store';
import type { PluginManifest } from '@/types/plugins';

/**
 * State-provider resolution + plugin-settings seeding in loadAllPlugins.
 *
 * `executeBundle` resolves `manifest.exports.stateProvider` from the bundle's
 * `window.__HS_PLUGIN__` exports: a named export that the bundle SET becomes
 * the entry's `stateProvider`; a named export the bundle omitted leaves
 * `stateProvider` undefined WITHOUT failing the load (the plugin still
 * registers via its component export). Separately, `loadAllPlugins` seeds the
 * plugin-settings map (keyed by lowercased id) from the installed payload
 * BEFORE any bundle loads.
 */

interface InstalledEntry {
  id: string;
  moduleType: string;
  version: string;
  enabled?: boolean;
  settings?: Record<string, unknown>;
}

function makeManifest(
  id: string,
  moduleType: string,
  extra?: Partial<PluginManifest>,
): PluginManifest {
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
    ...extra,
  } as PluginManifest;
}

/** Bundle exporting both a display component and a headless state provider. */
const BUNDLE_WITH_PROVIDER =
  'window.__HS_PLUGIN__ = {' +
  ' default: function Noop() { return null; },' +
  ' StateProvider: function StateProvider() { return null; }' +
  '};';

/** Bundle exporting ONLY a display component (no StateProvider). */
const BUNDLE_NO_PROVIDER =
  'window.__HS_PLUGIN__ = { default: function Noop() { return null; } };';

/** Bundle with the conventional `searchStateKeys` export (a function). */
const BUNDLE_WITH_SEARCH =
  'window.__HS_PLUGIN__ = {' +
  ' default: function Noop() { return null; },' +
  ' searchStateKeys: function search() { return []; }' +
  '};';

/** Bundle whose `searchStateKeys` export is NOT a function (junk shape). */
const BUNDLE_WITH_BAD_SEARCH =
  'window.__HS_PLUGIN__ = {' +
  ' default: function Noop() { return null; },' +
  ' searchStateKeys: 42' +
  '};';

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

/**
 * Route /api/plugins/installed, /manifest/<id>, /bundle/<id>, and /api/config.
 * `manifests` maps pluginId -> manifest; `bundles` maps pluginId -> bundle text
 * (a 404 when absent so 5c can prove settings seed before the bundle load).
 */
function mockFetch(opts: {
  installed: InstalledEntry[];
  manifests: Record<string, PluginManifest>;
  bundles: Record<string, string>;
}) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;

    if (url.includes('/api/plugins/installed')) {
      return new Response(
        JSON.stringify({
          plugins: opts.installed.map((p) => ({ enabled: true, ...p })),
        }),
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
      const bundle = opts.bundles[bundleMatch[1]];
      if (bundle !== undefined) return new Response(bundle, { status: 200 });
      return new Response('Not Found', { status: 404 });
    }

    if (url.includes('/api/config')) {
      return new Response(JSON.stringify({ settings: { locale: 'en-US' } }), { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  });
}

describe('loadAllPlugins state provider + settings seeding', () => {
  beforeEach(() => {
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

    // Vitest's jsdom runs injected <script> tags in jsdom's inner window,
    // while test code (and executeBundle) sees the populated Node global as
    // `window`. Bridge __HS_PLUGIN__ so the bundle's assignment is visible.
    const inner = (globalThis as unknown as { jsdom: { window: Record<string, unknown> } }).jsdom.window;
    Object.defineProperty(globalThis, '__HS_PLUGIN__', {
      configurable: true,
      get: () => inner.__HS_PLUGIN__,
      set: (v) => { inner.__HS_PLUGIN__ = v; },
    });
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__HS_PLUGIN__;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('5a: resolves the stateProvider export named by the manifest', async () => {
    const manifest = makeManifest('provider-plugin', 'provider-plugin', {
      exports: { component: 'default', stateProvider: 'StateProvider' },
    });
    mockFetch({
      installed: [{ id: 'provider-plugin', moduleType: 'provider-plugin', version: '1.0.0' }],
      manifests: { 'provider-plugin': manifest },
      bundles: { 'provider-plugin': BUNDLE_WITH_PROVIDER },
    });

    await loadAllPlugins({ surface: 'editor' });

    const state = usePluginStore.getState();
    const entry = state.plugins.get('plugin:provider-plugin');
    expect(entry).toBeDefined();
    expect(entry?.stateProvider).toBeTypeOf('function');
    expect(state.errors.get('provider-plugin')).toBeUndefined();
  });

  it('5b: leaves stateProvider undefined when the named export is missing, without failing the load', async () => {
    const manifest = makeManifest('halfbaked', 'halfbaked', {
      exports: { component: 'default', stateProvider: 'StateProvider' },
    });
    mockFetch({
      installed: [{ id: 'halfbaked', moduleType: 'halfbaked', version: '1.0.0' }],
      manifests: { halfbaked: manifest },
      bundles: { halfbaked: BUNDLE_NO_PROVIDER },
    });

    await loadAllPlugins({ surface: 'editor' });

    const state = usePluginStore.getState();
    const entry = state.plugins.get('plugin:halfbaked');
    // Component still registered — the plugin loaded successfully.
    expect(entry).toBeDefined();
    expect(entry?.component).toBeTypeOf('function');
    // But no state provider, and no recorded error.
    expect(entry?.stateProvider).toBeUndefined();
    expect(state.errors.get('halfbaked')).toBeUndefined();
  });

  it('5c: seeds pluginSettings keyed by lowercased id, defaulting to {} when settings absent', async () => {
    mockFetch({
      installed: [
        { id: 'HAlink', moduleType: 'halink', version: '1.0.0', settings: { url: 'http://ha' } },
        { id: 'NoSettings', moduleType: 'nosettings', version: '1.0.0' },
      ],
      // No manifests/bundles → bundle fetch 404s. Settings seed regardless
      // because setPluginSettingsMap runs before bundle load.
      manifests: {},
      bundles: {},
    });

    await loadAllPlugins({ surface: 'editor' });

    const settings = usePluginStore.getState().pluginSettings;
    expect(settings.get('halink')).toEqual({ url: 'http://ha' });
    // Settings-less plugin gets an empty object, not undefined.
    expect(settings.get('nosettings')).toEqual({});
    // Keyed by lowercased id — original casing is not a key.
    expect(settings.has('HAlink')).toBe(false);
  });

  it('5d: resolves the conventional searchStateKeys export when it is a function', async () => {
    const manifest = makeManifest('searchy', 'searchy');
    mockFetch({
      installed: [{ id: 'searchy', moduleType: 'searchy', version: '1.0.0' }],
      manifests: { searchy: manifest },
      bundles: { searchy: BUNDLE_WITH_SEARCH },
    });

    await loadAllPlugins({ surface: 'editor' });

    const state = usePluginStore.getState();
    expect(state.plugins.get('plugin:searchy')?.searchStateKeys).toBeTypeOf('function');
    expect(state.errors.get('searchy')).toBeUndefined();
  });

  it('5e: coerces a non-function searchStateKeys export to undefined without failing the load', async () => {
    const manifest = makeManifest('junky', 'junky');
    mockFetch({
      installed: [{ id: 'junky', moduleType: 'junky', version: '1.0.0' }],
      manifests: { junky: manifest },
      bundles: { junky: BUNDLE_WITH_BAD_SEARCH },
    });

    await loadAllPlugins({ surface: 'editor' });

    const state = usePluginStore.getState();
    const entry = state.plugins.get('plugin:junky');
    // Component still registered — the plugin loaded successfully.
    expect(entry?.component).toBeTypeOf('function');
    // But the junk export never reaches the registration as a callable.
    expect(entry?.searchStateKeys).toBeUndefined();
    expect(state.errors.get('junky')).toBeUndefined();
  });
});
