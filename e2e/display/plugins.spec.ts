import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { writeSandboxFile } from '../helpers/sandbox';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';
import {
  seedFixturePlugin,
  FIXTURE_PLUGIN_ID,
  FIXTURE_PLUGIN_TYPE,
  FIXTURE_STATE_KEY,
  BUNDLE,
  FETCH_BUNDLE,
  I18N_BUNDLE,
} from '../helpers/fixture-plugin';

function pluginModule(config: Record<string, unknown> = {}): ModuleInstance {
  return {
    id: 'e2e-plugin-1',
    type: FIXTURE_PLUGIN_TYPE,
    position: { x: 0, y: 0 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { label: 'E2E PLUGIN', ...config },
  } as ModuleInstance;
}

/** A module instance for an arbitrary plugin type (for the extra fixture plugins seeded below). */
function customModule(id: string, type: string, config: Record<string, unknown>, extra: Partial<ModuleInstance> = {}): ModuleInstance {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config,
    ...extra,
  } as ModuleInstance;
}

/** A minimal valid plugin manifest for a given id, with per-test field overrides. */
function baseManifest(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: `e2e fixture ${id}`,
    author: 'e2e',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType: id,
    category: 'Media & Display',
    icon: 'Star',
    defaultConfig: { label: id },
    defaultSize: { w: 320, h: 200 },
    exports: { component: 'default' },
    ...overrides,
  };
}

/** Seed one extra plugin's on-disk files (manifest, bundle, optional assets like translation dictionaries). */
function seedPluginFiles(
  sandboxDir: string,
  opts: { id: string; manifest: Record<string, unknown>; bundle: string; files?: Record<string, unknown> },
): void {
  writeSandboxFile(sandboxDir, `plugins/${opts.id}/manifest.json`, opts.manifest);
  writeSandboxFile(sandboxDir, `plugins/${opts.id}/dist/bundle.js`, opts.bundle);
  for (const [rel, content] of Object.entries(opts.files ?? {})) {
    writeSandboxFile(sandboxDir, `plugins/${opts.id}/${rel}`, content);
  }
}

/** Overwrite installed.json to list exactly the given plugins (all enabled). */
function writeInstalledSet(sandboxDir: string, entries: { id: string; moduleType?: string; version?: string }[]): void {
  writeSandboxFile(sandboxDir, 'plugins/installed.json', {
    schemaVersion: 1,
    plugins: entries.map((e) => ({
      id: e.id,
      version: e.version ?? '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
      moduleType: e.moduleType ?? e.id,
    })),
  });
}

// A fresh worker server per file; seed the plugin before any navigation so the
// first /api/plugins/installed read (on page load) picks it up.
test.beforeEach(async ({ sandboxDir }) => {
  seedFixturePlugin(sandboxDir);
});

test('an installed plugin renders on the display', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule({ label: 'PLUGIN RENDER OK' })])],
  }));
  await page.goto('/display');

  // The loader fetches manifest + bundle and registers the component; wait it out.
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('PLUGIN RENDER OK')).toBeVisible();
});

test('a plugin-published state key gates a conditioned module', async ({ page, request }) => {
  const gated = textModule('CONDITIONED CONTENT', {
    id: 'gated',
    visibility: { conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }], whenUnknown: 'hide' },
  });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule(), gated])],
  }));
  await page.goto('/display');

  // The plugin publishes `flag = on` on mount, which satisfies the condition.
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('CONDITIONED CONTENT')).toBeVisible();
});

test('the plugin appears in the editor palette', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await page.getByPlaceholder('Search modules…').fill('E2E Fixture');
  await expect(page.getByTestId(`palette-${FIXTURE_PLUGIN_TYPE}`)).toBeVisible();
});

test('the proxy rejects a request to a non-allowlisted domain (SSRF guard)', async ({ request }) => {
  // No page needed — the proxy reads allowedDomains from the on-disk manifest.
  const res = await request.post(`/api/plugins/proxy/${FIXTURE_PLUGIN_ID}`, {
    data: { url: 'https://evil.example.org/steal' },
  });
  // allowedDomains is ['api.example.com'], so a different host is refused.
  expect(res.ok()).toBe(false);
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('the plugin proxy rate-limits after 60 requests/minute', async ({ request }) => {
  // The rate-limit gate runs before the domain check, so requests to a
  // disallowed host still count toward the budget (each returns 403) without
  // any outbound network egress — until the limiter trips and returns 429.
  // The fixture manifest declares only the `network` permission, so the
  // non-LAN budget of 60/min applies. Loop past 61 to absorb the single
  // request the SSRF test above may have already spent in this window.
  let sawTooMany = false;
  for (let i = 0; i < 62; i++) {
    const res = await request.post(`/api/plugins/proxy/${FIXTURE_PLUGIN_ID}`, {
      data: { url: 'https://evil.example.org/steal' },
    });
    if (res.status() === 429) {
      sawTooMany = true;
      break;
    }
  }
  expect(sawTooMany).toBe(true);
});

/**
 * Successful proxy fetch, end to end. A fixture plugin's module fetches through
 * the host proxy (`SDK.pluginFetch` → `/api/plugins/proxy/<id>`) and renders a
 * field from the JSON response. The upstream is the sandbox server's OWN
 * `/api/time` on loopback (127.0.0.1) — never an external host — so this proves
 * the real proxy → upstream → plugin data path without any outbound egress.
 *
 * Reaching a loopback upstream requires the `localNetwork` permission (the
 * strict SSRF blocklist rejects 127.0.0.0/8; the relaxed LAN check allows it),
 * so the manifest declares it and allowlists 127.0.0.1.
 */
test('a plugin module renders data fetched through the host proxy from a loopback upstream', async ({ page, request, baseURL, sandboxDir }) => {
  const ID = 'e2e-fetch';
  const TYPE = `plugin:${ID}`;
  seedPluginFiles(sandboxDir, {
    id: ID,
    manifest: baseManifest(ID, { allowedDomains: ['127.0.0.1'], permissions: ['network', 'localNetwork'] }),
    bundle: FETCH_BUNDLE,
  });
  // Only this plugin installed for this test (the beforeEach default fixture
  // is unreferenced here and its installed.json entry is replaced).
  writeInstalledSet(sandboxDir, [{ id: ID }]);

  const mod = customModule('fetch-1', TYPE, { label: ID, pluginId: ID, fetchUrl: `${baseURL}/api/time` });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
  await page.goto('/display');

  await expect(page.locator('[data-plugin-marker="e2e-fetch"]')).toBeVisible();
  // The value span shows the upstream `/api/time` response's `iso` field. An
  // ISO timestamp (not the 'fetch-error'/'no-iso' sentinels) proves real data
  // flowed proxy → plugin and rendered.
  await expect(page.locator('[data-fetch-value="1"]')).toHaveText(/^\d{4}-\d{2}-\d{2}T/);
});

/**
 * localNetwork elevates the proxy rate-limit budget from 60/min to 240/min.
 * Same technique as the 60/min test: requests to a disallowed host return 403
 * (no outbound egress) but still count toward the budget, so the limiter can be
 * driven without any real upstream traffic. A dedicated plugin id keeps this
 * test's rate bucket isolated from the default fixture's.
 */
test('a localNetwork plugin gets the elevated proxy rate limit (budget above 60)', async ({ request, sandboxDir }) => {
  test.setTimeout(60_000);
  const ID = 'e2e-lan';
  seedPluginFiles(sandboxDir, {
    id: ID,
    manifest: baseManifest(ID, { allowedDomains: ['api.example.com'], permissions: ['network', 'localNetwork'] }),
    bundle: BUNDLE, // never rendered — this test only drives the proxy route
  });
  writeInstalledSet(sandboxDir, [{ id: ID }]);

  let statusAt65 = 0;
  let firstTooManyAt = -1;
  for (let i = 1; i <= 245; i++) {
    const res = await request.post(`/api/plugins/proxy/${ID}`, { data: { url: 'https://evil.example.org/steal' } });
    if (i === 65) statusAt65 = res.status();
    if (res.status() === 429) { firstTooManyAt = i; break; }
  }
  // Well past the non-LAN budget of 60, requests are still served (403 for the
  // disallowed host), not rate-limited — proof the budget moved beyond 60.
  expect(statusAt65).not.toBe(429);
  // The limiter still trips, but only after the elevated (240) budget.
  expect(firstTooManyAt).toBeGreaterThan(60);
});

/**
 * Plugin translations resolve through `__HS_SDK__.translate`, and the loader
 * only registers dictionaries whose tag is on the active locale's fallback
 * chain.
 *
 * This test anchors on en-US (the default config locale) and proves:
 * (a) a declared en-US dictionary resolves; (b) a key absent from it
 * returns the raw key (the visible-miss contract); (c) a plugin that declares
 * ONLY an off-chain locale (de-DE, not on the en-US chain) loads no dictionary,
 * so its keys stay unresolved — the loader honored the chain rather than
 * blindly loading any declared tag. The non-English path is covered by the
 * following test.
 */
test('plugin translations resolve via SDK.translate and the loader honors the active locale chain', async ({ page, request, sandboxDir }) => {
  const OK = 'e2e-i18n-ok';   // ships the active locale (en-US) → resolves
  const OFF = 'e2e-i18n-off'; // ships only de-DE (off the en-US chain) → unresolved
  seedPluginFiles(sandboxDir, {
    id: OK,
    manifest: baseManifest(OK, { translations: { 'en-US': 'i18n/en-US.json' } }),
    bundle: I18N_BUNDLE,
    files: { 'i18n/en-US.json': { greeting: 'HELLO FROM PLUGIN' } },
  });
  seedPluginFiles(sandboxDir, {
    id: OFF,
    manifest: baseManifest(OFF, { translations: { 'de-DE': 'i18n/de-DE.json' } }),
    bundle: I18N_BUNDLE,
    files: { 'i18n/de-DE.json': { greeting: 'HALLO AUS PLUGIN' } },
  });
  writeInstalledSet(sandboxDir, [{ id: OK }, { id: OFF }]);

  const okMod = customModule('ok-mod', `plugin:${OK}`, { label: OK, pluginId: OK });
  const offMod = customModule('off-mod', `plugin:${OFF}`, { label: OFF, pluginId: OFF });
  // Default config locale is en-US (baseConfig sets no locale).
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [okMod, offMod])] }));
  await page.goto('/display');

  const ok = page.locator('[data-module-id="ok-mod"]');
  await expect(ok.locator('[data-plugin-marker="e2e-i18n"]')).toBeVisible();
  // (a) declared en-US dictionary resolves.
  await expect(ok.locator('[data-i18n="greeting"]')).toHaveText('HELLO FROM PLUGIN');
  // (b) a key absent from the dictionary returns the raw key (visible miss).
  await expect(ok.locator('[data-i18n="missing"]')).toHaveText(`plugin:${OK}.nope_missing`);

  // (c) de-DE is not on the en-US chain, so the loader registered nothing for
  // this plugin — even its declared `greeting` key stays the raw key.
  const off = page.locator('[data-module-id="off-mod"]');
  await expect(off.locator('[data-plugin-marker="e2e-i18n"]')).toBeVisible();
  await expect(off.locator('[data-i18n="greeting"]')).toHaveText(`plugin:${OFF}.greeting`);
});

/**
 * The non-English path: with `settings.locale` set to de-DE, SDK.translate
 * resolves against the active locale (PluginGlobals mounts inside the display
 * group's <I18nProvider>), so a plugin shipping a de-DE dictionary renders
 * German — and a plugin shipping only en-US still resolves, because en-US is
 * the fallback tail of the de-DE chain.
 */
test('plugin translations render the active non-English locale on the display', async ({ page, request, sandboxDir }) => {
  const DE = 'e2e-i18n-de';  // ships the active locale (de-DE) → German
  const EN = 'e2e-i18n-en';  // ships only en-US → resolves via the chain tail
  seedPluginFiles(sandboxDir, {
    id: DE,
    manifest: baseManifest(DE, { translations: { 'de-DE': 'i18n/de-DE.json' } }),
    bundle: I18N_BUNDLE,
    files: { 'i18n/de-DE.json': { greeting: 'HALLO AUS PLUGIN' } },
  });
  seedPluginFiles(sandboxDir, {
    id: EN,
    manifest: baseManifest(EN, { translations: { 'en-US': 'i18n/en-US.json' } }),
    bundle: I18N_BUNDLE,
    files: { 'i18n/en-US.json': { greeting: 'HELLO FROM PLUGIN' } },
  });
  writeInstalledSet(sandboxDir, [{ id: DE }, { id: EN }]);

  const deMod = customModule('de-mod', `plugin:${DE}`, { label: DE, pluginId: DE });
  const enMod = customModule('en-mod', `plugin:${EN}`, { label: EN, pluginId: EN });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [deMod, enMod])],
    settings: { locale: 'de-DE' },
  }));
  await page.goto('/display');

  const de = page.locator('[data-module-id="de-mod"]');
  await expect(de.locator('[data-plugin-marker="e2e-i18n"]')).toBeVisible();
  await expect(de.locator('[data-i18n="greeting"]')).toHaveText('HALLO AUS PLUGIN');

  const en = page.locator('[data-module-id="en-mod"]');
  await expect(en.locator('[data-plugin-marker="e2e-i18n"]')).toBeVisible();
  await expect(en.locator('[data-i18n="greeting"]')).toHaveText('HELLO FROM PLUGIN');
});

/**
 * A manifest `providesState` field surfaces its (namespaced) key in the editor's
 * visibility-condition picker — the static-manifest counterpart to the
 * `deriveProvidedKeys` export already covered in the editor suite. The default
 * fixture MANIFEST declares `providesState: [{ key: 'flag', ... }]`, namespaced
 * to `plugin:e2e-fixture:flag` at registration (`registerPluginModule`).
 */
test('a manifest providesState key appears in the editor visibility-condition picker', async ({ page, request }) => {
  const provider = customModule('provides-1', FIXTURE_PLUGIN_TYPE, { label: 'PROVIDES' }, { backgroundProvider: true });
  const gated = textModule('GATED', {
    id: 'text-gated',
    visibility: { conditions: [{ kind: 'state', sourceKey: '', equals: '' }] },
  });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [provider, gated])] }));

  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  // The provider renders on the editor canvas once the bundle registers — its
  // marker gates the picker read (collectProvidedStateKeys needs the def).
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();

  await page.locator('[data-module-id="text-gated"]').click();
  await page.getByRole('button', { name: 'Conditions' }).click();
  // Focusing the key input opens the custom suggestion dropdown, sourced from
  // collectProvidedStateKeys → the plugin's namespaced advertised key.
  await page.getByLabel('What to check').click();
  await expect(
    page.getByRole('option').filter({ hasText: `${FIXTURE_PLUGIN_TYPE}:flag` }),
  ).toBeVisible();
});

/**
 * Plugin reload — FAILED-fetch NO-OP. `loadAllPlugins` fetches the new
 * installed list BEFORE tearing anything down, so when that fetch fails the
 * reload is a no-op: the current plugin stays mounted, its producer keeps
 * publishing, and the gated module never blinks. (The old order cleared
 * first, leaving the tab pluginless with every preserved key purged.)
 *
 * The trap: the FIRST installed poll after arming returns a NEW hash
 * (success), which makes `useLiveConfig` trigger the reload; that reload's
 * OWN installed fetch (the next request) gets a 500. We then hold well past
 * the 15s tombstone grace window — if the failed reload had purged anything,
 * the flag-gated module (whenUnknown: 'hide') would be gone by then.
 */
test('a failed plugin reload is a no-op: the plugin and its gated module survive past the grace window', async ({ page, request }) => {
  // The reload-trigger poll (useLiveConfig's CONFIG_POLL_MS, stable [displayId]
  // deps — see commands-runtime.spec.ts's note on why that makes an exact
  // runFor reliable) and the shared-state tombstone grace (TOMBSTONE_TTL_MS in
  // shared-state-store.ts) are both plain client-side setInterval/setTimeout,
  // so page.clock drives the whole sequence without a real wait.
  const gated = textModule('FULL PURGE CONTENT', {
    id: 'gated',
    visibility: {
      conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }],
      whenUnknown: 'hide',
    },
  });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [pluginModule(), gated])] }));
  await page.clock.install();
  await page.goto('/display');
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('FULL PURGE CONTENT')).toBeVisible();

  // Let the display record its baseline plugin hash from a poll before we
  // change what the installed endpoint returns (one poll cycle is ~3s).
  await page.clock.runFor(4_000);

  // Arm the trap on the client's installed fetches.
  let served = 0;
  await page.route(/\/api\/plugins\/installed(\?|$)/, async (route) => {
    served += 1;
    if (served === 1) {
      // The poll's fetch: report a NEW hash (still installed + enabled) so the
      // reload triggers — a successful reload would PRESERVE this plugin's keys.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1,
          pluginHash: 'force-reload-hash',
          plugins: [{
            id: FIXTURE_PLUGIN_ID,
            version: '1.0.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            enabled: true,
            moduleType: FIXTURE_PLUGIN_ID,
          }],
        }),
      });
    } else {
      // loadAllPlugins' own fetch (and every later poll): fail → no-op reload.
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
    }
  });

  // Reload trigger (≤3s) + tombstone grace (15s) + margin: if the failed
  // reload had purged the key, whenUnknown:hide would have dropped the module
  // inside this window. It must still be here, alongside the plugin itself.
  await page.clock.runFor(22_000);
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('FULL PURGE CONTENT')).toBeVisible();
});
