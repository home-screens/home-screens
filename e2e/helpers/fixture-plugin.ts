import { writeSandboxFile } from './sandbox';

/**
 * A minimal but real installable plugin used by the plugin E2E spec. It:
 *   - registers as module type `plugin:e2e-fixture`,
 *   - renders its `config.label` (a deterministic DOM marker), and
 *   - publishes shared-state key `plugin:e2e-fixture:flag = "on"` so a
 *     conditioned module can gate its visibility on it.
 *
 * The bundle is a hand-written IIFE that uses the host globals PluginGlobals
 * exposes (`window.React`, `window.__HS_SDK__`) and assigns
 * `window.__HS_PLUGIN__`, exactly as the loader (`executeBundle`) expects.
 */
export const FIXTURE_PLUGIN_ID = 'e2e-fixture';
export const FIXTURE_PLUGIN_TYPE = 'plugin:e2e-fixture';
export const FIXTURE_STATE_KEY = 'plugin:e2e-fixture:flag';

/**
 * The base fixture manifest (no `secrets`). Exported so the committed
 * install-tarball fixture can be checked for drift against it — see the
 * parity test in e2e/editor/plugin-lifecycle.spec.ts. Keep this the single
 * source of truth; the tarball is regenerated from it via
 * e2e/fixtures/plugins/build-plugin-fixtures.mjs.
 */
export const MANIFEST = {
  id: FIXTURE_PLUGIN_ID,
  name: 'E2E Fixture Plugin',
  version: '1.0.0',
  description: 'E2E test fixture plugin',
  author: 'e2e',
  license: 'MIT',
  minAppVersion: '1.0.0',
  moduleType: FIXTURE_PLUGIN_ID,
  category: 'Media & Display',
  icon: 'Star',
  defaultConfig: { label: 'E2E PLUGIN' },
  defaultSize: { w: 320, h: 200 },
  exports: { component: 'default' },
  providesState: [{ key: 'flag', label: 'E2E Flag' }],
  // Only this host is proxy-allowed — used to prove the SSRF guard rejects others.
  allowedDomains: ['api.example.com'],
  permissions: ['network'],
};

function installedFile(settings?: Record<string, unknown>) {
  return {
    schemaVersion: 1,
    plugins: [{
      id: FIXTURE_PLUGIN_ID,
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
      moduleType: FIXTURE_PLUGIN_ID,
      ...(settings ? { settings } : {}),
    }],
  };
}

/**
 * The base fixture bundle (IIFE). Exported alongside {@link MANIFEST} as the
 * single source of truth the committed install tarball is verified against.
 */
export const BUNDLE = `(function () {
  var React = window.React;
  var SDK = window.__HS_SDK__;
  function Component(props) {
    React.useEffect(function () {
      if (SDK && typeof SDK.publishState === 'function') {
        SDK.publishState('${FIXTURE_PLUGIN_ID}', 'flag', 'on');
      }
    }, []);
    var cfg = (props && props.config) || {};
    var label = cfg.label || 'E2E PLUGIN';
    return React.createElement('div', { 'data-plugin-marker': 'e2e', style: { width: '100%', height: '100%' } }, label);
  }
  window.__HS_PLUGIN__ = { default: Component };
})();`;

/**
 * A variant bundle that additionally renders three navigation buttons, each
 * firing a real plugin → host `navigate` event through `SDK.emit` (the same
 * path a shipped plugin uses; see PluginGlobals `emit: pluginEventBus.emit`).
 * Used only by rotator-interaction specs that drive host navigation from a
 * plugin; the committed install tarball is verified against {@link BUNDLE},
 * NOT this, so this bundle is deliberately kept separate to avoid drift.
 *
 * Buttons (addressable via `data-plugin-nav`):
 *   - `next` → { direction: 'next' }
 *   - `prev` → { direction: 'prev' }
 *   - `goto-2` → { direction: 'screen', screenIndex: 2 }
 */
export const NAV_BUNDLE = `(function () {
  var React = window.React;
  var SDK = window.__HS_SDK__;
  function nav(dir, idx) {
    return function () {
      if (SDK && typeof SDK.emit === 'function') {
        SDK.emit(idx == null
          ? { type: 'navigate', direction: dir }
          : { type: 'navigate', direction: dir, screenIndex: idx });
      }
    };
  }
  function Component(props) {
    var cfg = (props && props.config) || {};
    var label = cfg.label || 'E2E PLUGIN';
    return React.createElement('div',
      { 'data-plugin-marker': 'e2e', style: { width: '100%', height: '100%' } },
      React.createElement('span', { key: 'label' }, label),
      React.createElement('button', { key: 'next', 'data-plugin-nav': 'next', onClick: nav('next') }, 'next'),
      React.createElement('button', { key: 'prev', 'data-plugin-nav': 'prev', onClick: nav('prev') }, 'prev'),
      React.createElement('button', { key: 'goto2', 'data-plugin-nav': 'goto-2', onClick: nav('screen', 2) }, 'goto2'));
  }
  window.__HS_PLUGIN__ = { default: Component };
})();`;

/**
 * A variant bundle that fetches an upstream URL through the host proxy
 * (`SDK.pluginFetch` → `/api/plugins/proxy/<id>`) and renders a field from the
 * JSON response. Used by the "successful proxy fetch end-to-end" spec, where
 * the upstream is the sandbox server's own `/api/time` (loopback), so no
 * external host is ever hit. Config-driven so any plugin id / URL can reuse it:
 *   - `config.pluginId` — the plugin's own id (pluginFetch's first arg).
 *   - `config.fetchUrl` — absolute upstream URL to proxy.
 * Renders `data-plugin-marker="e2e-fetch"` with a `data-fetch-value` span whose
 * text is the response's `iso` field (or an error/`no-iso` sentinel).
 */
export const FETCH_BUNDLE = `(function () {
  var React = window.React;
  var SDK = window.__HS_SDK__;
  function Component(props) {
    var cfg = (props && props.config) || {};
    var s = React.useState('pending');
    var value = s[0], setValue = s[1];
    React.useEffect(function () {
      var cancelled = false;
      SDK.pluginFetch(cfg.pluginId, { url: cfg.fetchUrl, cacheTtlMs: 0 })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('status ' + res.status)); })
        .then(function (data) { if (!cancelled) setValue(data && data.iso ? String(data.iso) : 'no-iso'); })
        .catch(function () { if (!cancelled) setValue('fetch-error'); });
      return function () { cancelled = true; };
    }, []);
    return React.createElement('div',
      { 'data-plugin-marker': 'e2e-fetch', style: { width: '100%', height: '100%' } },
      React.createElement('span', { 'data-fetch-value': '1' }, value));
  }
  window.__HS_PLUGIN__ = { default: Component };
})();`;

/**
 * A variant bundle that renders host-resolved translations via
 * `SDK.translate`. Used by the plugin-translations spec. Config-driven:
 *   - `config.pluginId` — the plugin's own id; the translate namespace is
 *     `plugin:<pluginId>`.
 * Renders `data-plugin-marker="e2e-i18n"` with two spans: `data-i18n="greeting"`
 * (a key expected in the plugin dictionary) and `data-i18n="missing"` (a key
 * that is never defined, so translate returns the raw key — the miss signal).
 */
export const I18N_BUNDLE = `(function () {
  var React = window.React;
  var SDK = window.__HS_SDK__;
  function Component(props) {
    var cfg = (props && props.config) || {};
    var ns = 'plugin:' + cfg.pluginId + '.';
    return React.createElement('div',
      { 'data-plugin-marker': 'e2e-i18n', style: { width: '100%', height: '100%' } },
      React.createElement('span', { key: 'g', 'data-i18n': 'greeting' }, SDK.translate(ns + 'greeting')),
      React.createElement('span', { key: 'm', 'data-i18n': 'missing' }, SDK.translate(ns + 'nope_missing')));
  }
  window.__HS_PLUGIN__ = { default: Component };
})();`;

/**
 * A variant bundle that additionally exports a demand-driven `StateProvider`
 * (manifest `exports.stateProvider`). The provider publishes every demanded
 * key with `settings.publishValue` (default `'on'`) and clears keys that drop
 * out of the demand set — the reference implementation of the stateProvider
 * contract, exercised by the display state-provider spec with ZERO fixture
 * modules placed. The visible component is unchanged from {@link BUNDLE}.
 */
export const PROVIDER_BUNDLE = `(function () {
  var React = window.React;
  var SDK = window.__HS_SDK__;
  function Component(props) {
    var cfg = (props && props.config) || {};
    var label = cfg.label || 'E2E PLUGIN';
    return React.createElement('div', { 'data-plugin-marker': 'e2e', style: { width: '100%', height: '100%' } }, label);
  }
  function StateProvider(props) {
    var demandedKeys = (props && props.demandedKeys) || [];
    var settings = (props && props.settings) || {};
    var value = typeof settings.publishValue === 'string' ? settings.publishValue : 'on';
    var prevRef = React.useRef([]);
    React.useEffect(function () {
      demandedKeys.forEach(function (key) {
        SDK.publishState('${FIXTURE_PLUGIN_ID}', key, value);
      });
      prevRef.current.forEach(function (key) {
        if (demandedKeys.indexOf(key) < 0) SDK.clearState('${FIXTURE_PLUGIN_ID}', key);
      });
      prevRef.current = demandedKeys;
    }, [demandedKeys, value]);
    return null;
  }
  window.__HS_PLUGIN__ = { default: Component, StateProvider: StateProvider };
})();`;

/**
 * A variant bundle that additionally exports `searchStateKeys` (conventional
 * named export, no manifest entry) — the editor condition builder's friendly
 * key search. Returns two descriptors, filtered by the query against label
 * and key: an enum door sensor (friendly value vocabulary + grouping) and a
 * numeric temperature (unit + current value). The visible component is
 * unchanged from {@link BUNDLE}.
 *
 * When `settings.bulkCount` is set, it also emits that many synthetic
 * descriptors all sharing one `group` ("Sensors") — used to drive the
 * Available tab's per-category "show more" preview and to prove the browse
 * tab requests more than the combobox's 30-result cap. It also honors the
 * `opts.limit` the host passes, capping its own output, so a bulk count above
 * the request limit still can't overflow the response.
 */
export const SEARCH_BUNDLE = `(function () {
  var React = window.React;
  var SDK = window.__HS_SDK__;
  function Component(props) {
    var cfg = (props && props.config) || {};
    var label = cfg.label || 'E2E PLUGIN';
    return React.createElement('div', { 'data-plugin-marker': 'e2e', style: { width: '100%', height: '100%' } }, label);
  }
  var DESCRIPTORS = [
    {
      key: '${FIXTURE_PLUGIN_TYPE}:door',
      label: 'Back Door Sensor',
      group: 'Porch',
      valueType: 'enum',
      valueOptions: [{ value: 'on', label: 'Open' }, { value: 'off', label: 'Closed' }],
      currentValue: 'on',
    },
    {
      key: '${FIXTURE_PLUGIN_TYPE}:temp',
      label: 'Kitchen Temperature',
      group: 'Kitchen',
      valueType: 'numeric',
      unit: '\\u00B0F',
      currentValue: '72.5',
    },
  ];
  function searchStateKeys(query, opts) {
    var q = String(query || '').toLowerCase();
    var settings = (opts && opts.settings) || {};
    var limit = (opts && typeof opts.limit === 'number') ? opts.limit : Infinity;
    var all = DESCRIPTORS.slice();
    var bulk = Number(settings.bulkCount) || 0;
    for (var i = 0; i < bulk; i++) {
      all.push({
        key: '${FIXTURE_PLUGIN_TYPE}:bulk_' + i,
        label: 'Bulk Sensor ' + i,
        group: 'Sensors',
        valueType: 'string',
      });
    }
    var matched = all.filter(function (d) {
      return q === '' || d.label.toLowerCase().indexOf(q) >= 0 || d.key.toLowerCase().indexOf(q) >= 0;
    });
    return Promise.resolve(matched.slice(0, limit));
  }
  window.__HS_PLUGIN__ = { default: Component, searchStateKeys: searchStateKeys };
})();`;

/**
 * A variant bundle that paints its own card from the `style` prop, the way
 * every shipped plugin does (each carries a ModuleStyle-to-CSS function and
 * spreads it onto its root; see plan 50, item 2). Plugins render bare, outside
 * ModuleWrapper, so this is the only way Style controls reach them, and it is
 * what the style matrix (e2e/display/module-style.spec.ts) proves the host
 * still delivers. The visible label is unchanged from {@link BUNDLE}.
 */
export const STYLE_BUNDLE = `(function () {
  var React = window.React;
  function Component(props) {
    var cfg = (props && props.config) || {};
    var s = (props && props.style) || {};
    var label = cfg.label || 'E2E PLUGIN';
    return React.createElement('div', {
      'data-plugin-marker': 'e2e',
      style: {
        width: '100%', height: '100%', boxSizing: 'border-box',
        color: s.textColor, backgroundColor: s.backgroundColor,
        padding: s.padding, fontSize: s.fontSize, fontFamily: s.fontFamily,
        borderRadius: s.borderRadius, opacity: s.opacity,
      },
    }, label);
  }
  window.__HS_PLUGIN__ = { default: Component };
})();`;

/** A single declared secret, mirroring `PluginSecretDeclaration` in the manifest. */
export interface FixtureSecretDeclaration {
  key: string;
  label: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
}

interface SeedFixturePluginOptions {
  /**
   * When provided, the seeded manifest declares these secrets so the editor
   * PropertyPanel renders its "Secrets" section for the plugin module. Omit
   * for the default no-secrets fixture used by the display/proxy specs.
   */
  secrets?: FixtureSecretDeclaration[];
  /**
   * When true, seed {@link NAV_BUNDLE} (navigation buttons) instead of the
   * default {@link BUNDLE}. Only rotator-interaction specs need this; every
   * other consumer gets the unchanged default bundle.
   */
  nav?: boolean;
  /**
   * When true, seed {@link PROVIDER_BUNDLE} and declare
   * `exports.stateProvider` in the manifest, turning the fixture into a
   * demand-driven state provider.
   */
  stateProvider?: boolean;
  /**
   * When true, seed {@link SEARCH_BUNDLE} so the fixture exports
   * `searchStateKeys` for the editor's friendly condition builder.
   */
  search?: boolean;
  /**
   * When true, seed {@link STYLE_BUNDLE}, which paints its card from the
   * `style` prop like a shipped plugin.
   */
  styled?: boolean;
  /**
   * When provided, the seeded manifest declares this `settingsSchema` so the
   * plugin manager renders its "Plugin settings" section.
   */
  settingsSchema?: Record<string, unknown>;
  /** Initial plugin-level settings stored on the installed.json record. */
  settings?: Record<string, unknown>;
}

/** Seed the fixture plugin (installed.json, manifest, bundle) into a sandbox. */
export function seedFixturePlugin(sandboxDir: string, opts: SeedFixturePluginOptions = {}): void {
  const manifest = {
    ...MANIFEST,
    ...(opts.secrets ? { secrets: opts.secrets } : {}),
    ...(opts.settingsSchema ? { settingsSchema: opts.settingsSchema } : {}),
    ...(opts.stateProvider
      ? { exports: { ...MANIFEST.exports, stateProvider: 'StateProvider' } }
      : {}),
  };
  const bundle = opts.stateProvider ? PROVIDER_BUNDLE
    : opts.search ? SEARCH_BUNDLE
    : opts.styled ? STYLE_BUNDLE
    : opts.nav ? NAV_BUNDLE : BUNDLE;
  writeSandboxFile(sandboxDir, 'plugins/installed.json', installedFile(opts.settings));
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/manifest.json`, manifest);
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/dist/bundle.js`, bundle);
}
