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

const INSTALLED = {
  schemaVersion: 1,
  plugins: [{
    id: FIXTURE_PLUGIN_ID,
    version: '1.0.0',
    installedAt: '2026-01-01T00:00:00.000Z',
    enabled: true,
    moduleType: FIXTURE_PLUGIN_ID,
  }],
};

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
}

/** Seed the fixture plugin (installed.json, manifest, bundle) into a sandbox. */
export function seedFixturePlugin(sandboxDir: string, opts: SeedFixturePluginOptions = {}): void {
  const manifest = {
    ...MANIFEST,
    ...(opts.secrets ? { secrets: opts.secrets } : {}),
  };
  writeSandboxFile(sandboxDir, 'plugins/installed.json', INSTALLED);
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/manifest.json`, manifest);
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/dist/bundle.js`, opts.nav ? NAV_BUNDLE : BUNDLE);
}
