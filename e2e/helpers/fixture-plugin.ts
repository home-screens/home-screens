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

const MANIFEST = {
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

const BUNDLE = `(function () {
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

/** Seed the fixture plugin (installed.json, manifest, bundle) into a sandbox. */
export function seedFixturePlugin(sandboxDir: string): void {
  writeSandboxFile(sandboxDir, 'plugins/installed.json', INSTALLED);
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/manifest.json`, MANIFEST);
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/dist/bundle.js`, BUNDLE);
}
