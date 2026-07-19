import { promises as fs } from 'fs';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { putConfig, getConfig } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import { writeSandboxFile } from '../helpers/sandbox';
import {
  MANIFEST,
  BUNDLE,
  seedFixturePlugin,
  FIXTURE_PLUGIN_ID,
  FIXTURE_PLUGIN_TYPE,
} from '../helpers/fixture-plugin';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance } from '@/types/config';
import type { PluginRegistry, RegistryPlugin } from '@/types/plugins';

/**
 * Plugin store lifecycle tabs (Browse / Installed / Updates) and the modals they
 * drive (InstallConfirmModal + PluginInstallPreview, InstallFromUrlModal,
 * ExternalUpdateModal, PluginConfigRenderer).
 *
 * Two hard boundaries shape what's reachable end to end:
 *
 *  - The marketplace registry (`/api/plugins/registry`) is fetched by the panel
 *    in the browser, so `page.route` can stub the catalog. But the marketplace
 *    *install* route (`/api/plugins/install`) re-fetches the registry
 *    SERVER-SIDE from a hardcoded GitHub URL (src/lib/plugins.ts
 *    DEFAULT_REGISTRY_URL, no env/config override), then downloads the entry's
 *    downloadUrl server-side — neither is interceptable by page.route. A stubbed
 *    registry entry therefore 404s at install time. So the marketplace Browse
 *    and Updates flows here assert catalog rendering, the install preview, and
 *    update *detection* only; the marketplace install/update POST completion is
 *    the documented gap.
 *
 *  - The *external* install path (`/api/plugins/install-external`) downloads the
 *    tarball server-side too, but `validateExternalUrl` allows `http://127.0.0.1`
 *    as a test escape hatch (see plugin-lifecycle.spec.ts), so a throwaway
 *    loopback server serving tarball bytes drives the real install/update
 *    pipeline. That covers the genuine "install from URL" happy path and the
 *    real bundle-version swap through ExternalUpdateModal.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Build a RegistryPlugin catalog entry with sensible defaults for one version. */
function registryEntry(o: {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  permissions?: RegistryPlugin['permissions'];
  changelog?: string;
  verified?: boolean;
  channel?: RegistryPlugin['channel'];
}): RegistryPlugin {
  return {
    id: o.id,
    name: o.name,
    description: o.description,
    author: o.author,
    repo: `https://example.com/${o.id}`,
    license: 'MIT',
    category: 'Media & Display',
    tags: [o.id],
    icon: 'Star',
    verified: o.verified ?? false,
    channel: o.channel,
    permissions: o.permissions,
    versions: [{
      version: o.version,
      minAppVersion: '1.0.0',
      releaseDate: '2026-01-01',
      // Points nowhere reachable — the marketplace install POST re-fetches the
      // real registry server-side anyway, so this is never actually downloaded.
      downloadUrl: `https://plugin.invalid/${o.id}/${o.version}.tar.gz`,
      sha256: '0'.repeat(64),
      changelog: o.changelog,
    }],
  };
}

/**
 * Stub the browser's registry GET so the panel never reaches GitHub. Must be
 * called before the panel opens (it fetches the registry on mount). Every
 * panel-opening test stubs it — even with an empty catalog — so no test makes a
 * real upstream registry call.
 */
async function stubRegistry(page: Page, plugins: RegistryPlugin[] = []): Promise<void> {
  await page.route('**/api/plugins/registry', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, lastUpdated: '2026-01-01', plugins } satisfies PluginRegistry),
    }),
  );
}

/** Open the plugin store panel from the editor toolbar. */
async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Plugins' }).click();
  const dialog = page.getByRole('dialog', { name: 'Plugins' });
  await expect(dialog).toBeVisible();
  return dialog;
}

interface LocalServer {
  origin: string;
  close: () => Promise<void>;
}

/**
 * A loopback server serving `getBuffer()`'s bytes for any path. Binds on
 * 127.0.0.1 so the install route's `validateExternalUrl` loopback escape hatch
 * accepts it. `getBuffer` is re-read per request so the served version can be
 * swapped between an install and a later update.
 */
async function startTarballServer(getBuffer: () => Buffer): Promise<LocalServer> {
  const server = http.createServer((req, res) => {
    const bytes = getBuffer();
    const headers = { 'content-type': 'application/gzip', 'content-length': String(bytes.length) };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    res.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Build a `.tar.gz` buffer shaped like a published plugin: a top-level `<id>/`
 * directory wrapping manifest.json + dist/bundle.js, which the install
 * pipeline's `tar --strip-components=1` unwraps. Mirrors the committed-fixture
 * generator (e2e/fixtures/plugins/build-plugin-fixtures.ts) but returns bytes
 * for an ad-hoc version instead of writing a committed file.
 */
function buildTarball(id: string, manifest: unknown, bundle: string): Buffer {
  const staging = mkdtempSync(path.join(os.tmpdir(), `hs-store-${id}-`));
  try {
    const root = path.join(staging, id);
    mkdirSync(path.join(root, 'dist'), { recursive: true });
    writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(path.join(root, 'dist', 'bundle.js'), bundle);
    const tarPath = path.join(staging, `${id}.tar.gz`);
    execFileSync('tar', ['-czf', tarPath, '-C', staging, id]);
    return readFileSync(tarPath);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function readInstalled(sandboxDir: string): Promise<{ plugins: Array<Record<string, unknown>> }> {
  const raw = await fs.readFile(path.join(sandboxDir, 'data', 'plugins', 'installed.json'), 'utf-8');
  return JSON.parse(raw);
}

// The worker server's data/ persists across the tests in this file, so a plugin
// left installed by one test would leak into the next (a seeded, non-external
// entry even blocks a later external install with a marketplace-collision
// error). Reset the plugins directory before each test for a clean slate.
test.beforeEach(async ({ sandboxDir }) => {
  await fs.rm(path.join(sandboxDir, 'data', 'plugins'), { recursive: true, force: true });
});

/**
 * Any install/toggle/uninstall calls loadPlugins(), which flips the plugin
 * store's `loading` flag — and the editor page renders a full-screen loader
 * while that is true, unmounting and remounting PluginStorePanel back on its
 * default Browse tab. Callers that acted from the Installed tab must re-select
 * it afterward; this helper clicks the always-present Installed tab button and
 * auto-waits through the remount.
 */
async function selectInstalledTab(dialog: ReturnType<Page['getByRole']>): Promise<void> {
  await dialog.getByRole('button', { name: 'Installed' }).click();
}

// ---------------------------------------------------------------------------
// Browse / Store tab
// ---------------------------------------------------------------------------

test('the browse tab renders the stubbed registry catalog and filters by search', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await stubRegistry(page, [
    registryEntry({ id: 'alpha-widget', name: 'Alpha Widget', description: 'First plugin', author: 'Team Alpha', version: '1.2.0' }),
    registryEntry({ id: 'beta-gadget', name: 'Beta Gadget', description: 'Second plugin', author: 'Team Beta', version: '0.9.0' }),
  ]);

  const dialog = await openPanel(page);

  // Both catalog rows render, each with its latest version.
  await expect(dialog.getByText('Alpha Widget')).toBeVisible();
  await expect(dialog.getByText('1.2.0')).toBeVisible();
  await expect(dialog.getByText('Beta Gadget')).toBeVisible();
  await expect(dialog.getByText('0.9.0')).toBeVisible();

  // The client-side search filter narrows the list.
  await dialog.getByPlaceholder('Search plugins…').fill('beta');
  await expect(dialog.getByText('Beta Gadget')).toBeVisible();
  await expect(dialog.getByText('Alpha Widget')).toBeHidden();
});

test('the install confirmation preview surfaces the plugin\'s requested permissions', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await stubRegistry(page, [
    registryEntry({
      id: 'perm-plugin',
      name: 'Perm Plugin',
      description: 'Wants access',
      author: 'Author',
      version: '1.0.0',
      permissions: ['network', 'secrets'],
    }),
  ]);

  const dialog = await openPanel(page);
  // Install on the catalog row (exact, so it does not match "Install from URL…").
  await dialog.getByRole('button', { name: 'Install', exact: true }).click();

  // InstallConfirmModal renders PluginInstallPreview. The plugin is not on disk,
  // so its manifest fetch 404s and the registry-declared permissions are shown.
  await expect(page.getByRole('heading', { name: 'Install Plugin' })).toBeVisible();
  await expect(page.getByText('Permissions requested')).toBeVisible();
  await expect(page.getByText('Network access')).toBeVisible();
  await expect(page.getByText('Secret storage')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Install from URL — the real (reachable) install pipeline
// ---------------------------------------------------------------------------

test('installing from a URL downloads a real tarball and lists it as an installed plugin', async ({ page, request, sandboxDir }) => {
  const buffer = buildTarball(FIXTURE_PLUGIN_ID, MANIFEST, BUNDLE);
  const server = await startTarballServer(() => buffer);
  try {
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await stubRegistry(page); // keep the Browse fetch off GitHub

    const dialog = await openPanel(page);
    await dialog.getByRole('button', { name: /Install from URL/ }).click();

    const modal = page.getByRole('dialog', { name: 'Install plugin from URL' });
    await expect(modal).toBeVisible();
    await modal.getByPlaceholder(/plugin\.tar\.gz/i).fill(`${server.origin}/plugin.tar.gz`);

    const installedResponse = page.waitForResponse(
      (r) => r.url().includes('/api/plugins/install-external') && r.request().method() === 'POST' && r.ok(),
    );
    await modal.getByRole('button', { name: 'Install', exact: true }).click();
    await installedResponse;

    // The successful install fires a plugin reload, so the editor flashes its
    // loader and the panel remounts on Browse — re-select Installed to see it.
    await selectInstalledTab(dialog);
    await expect(dialog.getByText(FIXTURE_PLUGIN_ID)).toBeVisible();
    await expect(dialog.getByText('External')).toBeVisible();

    // Persisted to disk under the sandbox, tagged as an external source.
    const manifestPath = path.join(sandboxDir, 'data', 'plugins', FIXTURE_PLUGIN_ID, 'manifest.json');
    await expect(fs.access(manifestPath)).resolves.toBeUndefined();
    const installed = await readInstalled(sandboxDir);
    expect(installed.plugins.find((p) => p.id === FIXTURE_PLUGIN_ID)).toMatchObject({
      version: '1.0.0',
      source: 'external',
    });
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// Installed tab — enable / disable / uninstall
// ---------------------------------------------------------------------------

test('disabling an installed plugin unregisters its module and enabling restores it', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir);
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule()])],
  }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  const marker = page.locator('[data-plugin-marker="e2e"]');
  await expect(marker).toBeVisible();

  await stubRegistry(page);
  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: 'Installed' }).click();

  // Disable → loadPlugins drops the disabled plugin from the registered set, so
  // its module component unregisters and the canvas marker leaves the DOM.
  await dialog.getByRole('button', { name: `Disable ${FIXTURE_PLUGIN_ID}` }).click();
  await expect(marker).toBeHidden();

  // The reload remounts the panel on Browse; go back to Installed to re-enable.
  await selectInstalledTab(dialog);
  await dialog.getByRole('button', { name: `Enable ${FIXTURE_PLUGIN_ID}` }).click();
  await expect(marker).toBeVisible();
});

test('uninstalling removes the plugin files, its installed entry, and its palette listing', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir);
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // The plugin is offered in the module palette before uninstall.
  await page.getByPlaceholder('Search modules…').fill('E2E Fixture');
  await expect(page.getByTestId(`palette-${FIXTURE_PLUGIN_TYPE}`)).toBeVisible();

  await stubRegistry(page);
  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: 'Installed' }).click();

  const del = page.waitForResponse(
    (r) => r.url().includes('/api/plugins/install') && r.request().method() === 'DELETE' && r.ok(),
  );
  await dialog.getByRole('button', { name: `Uninstall ${FIXTURE_PLUGIN_ID}` }).click();
  await del;

  // The reload remounts the panel on Browse; re-select Installed to see it empty.
  await selectInstalledTab(dialog);
  await expect(dialog.getByText('No plugins installed')).toBeVisible();

  // Files are gone from disk and installed.json no longer references the plugin.
  // (uninstallPlugin also tombstones the plugin's shared-state namespace via the
  // loader's purge; that clear carries a 15s tombstone grace, so it is not
  // deterministically observable inside a fast spec — the durable file/registry
  // effects are asserted instead.)
  await expect(fs.access(path.join(sandboxDir, 'data', 'plugins', FIXTURE_PLUGIN_ID))).rejects.toThrow();
  const installed = await readInstalled(sandboxDir);
  expect(installed.plugins.find((p) => p.id === FIXTURE_PLUGIN_ID)).toBeUndefined();

  // The palette entry disappears once the store reloads without the plugin.
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toBeHidden();
  await page.getByPlaceholder('Search modules…').fill('E2E Fixture');
  await expect(page.getByTestId(`palette-${FIXTURE_PLUGIN_TYPE}`)).toBeHidden();
});

// ---------------------------------------------------------------------------
// Installed tab — plugin-level settings (manifest settingsSchema)
// ---------------------------------------------------------------------------

test('the plugin settings section round-trips plugin-level settings from the Installed tab', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, {
    settingsSchema: { type: 'object', properties: { publishValue: { type: 'string', title: 'Publish value' } } },
    settings: { publishValue: 'before' },
  });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await stubRegistry(page);
  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: 'Installed' }).click();

  // The gear affordance renders only for plugins whose loaded manifest
  // declares a settingsSchema; it toggles the schema-rendered form open.
  await dialog.getByRole('button', { name: `Plugin settings for ${FIXTURE_PLUGIN_ID}` }).click();
  const section = dialog.getByTestId(`plugin-settings-${FIXTURE_PLUGIN_ID}`);
  await expect(section).toBeVisible();

  // The stored value round-trips into the schema-rendered field.
  const field = section.getByLabel('Publish value');
  await expect(field).toHaveValue('before');
  await field.fill('after');

  const put = page.waitForResponse(
    (r) => r.url().includes('/api/plugins/settings/') && r.request().method() === 'PUT' && r.ok(),
  );
  await section.getByRole('button', { name: 'Save' }).click();
  await put;

  // The save pushes settings into the plugin store without a bundle reload,
  // so the section stays mounted and the confirmation actually renders.
  await expect(section.getByText('Saved successfully')).toBeVisible();

  // Persisted onto the plugin's installed.json record (not config.json).
  const installed = await readInstalled(sandboxDir);
  expect(installed.plugins.find((p) => p.id === FIXTURE_PLUGIN_ID)?.settings).toEqual({ publishValue: 'after' });

  // The section survived the save (no remount) — toggle it closed, then
  // reopen: the persisted value round-trips back through the GET.
  await dialog.getByRole('button', { name: `Plugin settings for ${FIXTURE_PLUGIN_ID}` }).click();
  await expect(section).toBeHidden();
  await dialog.getByRole('button', { name: `Plugin settings for ${FIXTURE_PLUGIN_ID}` }).click();
  await expect(dialog.getByTestId(`plugin-settings-${FIXTURE_PLUGIN_ID}`).getByLabel('Publish value')).toHaveValue('after');
});

test('the installed card shows settings and secrets as one block', async ({ page, request, sandboxDir }) => {
  // Both declared: the expandable section must render the schema form AND
  // the secret input together — to the user they are one thing ("connect
  // this plugin"), even though storage differs (installed.json vs
  // plugin-secrets). Before this block existed on the card, secrets were
  // only reachable from a placed module's PropertyPanel.
  seedFixturePlugin(sandboxDir, {
    settingsSchema: { type: 'object', properties: { haUrl: { type: 'string', title: 'Server address' } } },
    secrets: [{ key: 'api_token', label: 'API Token', required: true }],
  });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await stubRegistry(page);
  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: 'Installed' }).click();
  await dialog.getByRole('button', { name: `Plugin settings for ${FIXTURE_PLUGIN_ID}` }).click();

  // Settings form and secret field are siblings in the same expanded block.
  await expect(dialog.getByTestId(`plugin-settings-${FIXTURE_PLUGIN_ID}`).getByLabel('Server address')).toBeVisible();
  const secretInput = dialog.getByPlaceholder('Enter api token');
  await expect(secretInput).toBeVisible();
  await expect(secretInput).toHaveAttribute('type', 'password');

  // Saving the secret from the card hits the same secrets endpoint the
  // PropertyPanel path uses.
  const savePut = page.waitForResponse(
    (r) => r.url().includes(`/api/plugins/secrets/${FIXTURE_PLUGIN_ID}`) && r.request().method() === 'PUT' && r.ok(),
  );
  await secretInput.fill('tok-123');
  await secretInput.locator('..').getByRole('button', { name: 'Save' }).click();
  await savePut;
  await expect(secretInput).toHaveValue('');
});

// ---------------------------------------------------------------------------
// Updates tab + ExternalUpdateModal
// ---------------------------------------------------------------------------

test('the updates tab flags an installed plugin when the registry advertises a newer version', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir); // installed at v1.0.0
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await stubRegistry(page, [
    registryEntry({
      id: FIXTURE_PLUGIN_ID,
      name: 'E2E Fixture Plugin',
      description: 'newer available',
      author: 'e2e',
      version: '2.0.0',
      changelog: 'Big update',
    }),
  ]);

  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: /Updates/ }).click();

  // Update detection: the installed v1 is flagged against the registry's v2.
  await expect(dialog.getByText('v1.0.0 → v2.0.0')).toBeVisible();
  await expect(dialog.getByText('Big update')).toBeVisible();
});

test('update detection ignores registry array order and app-incompatible versions', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir); // installed at v1.0.0
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // Versions listed ASCENDING (the 2026-07-12 Garmin registry mistake: the newest
  // entry appended instead of prepended), with an extra entry that needs a far
  // newer app. The panel must pick 2.0.0 — not versions[0] (1.1.0), and not the
  // incompatible 9.9.9.
  const entry = registryEntry({
    id: FIXTURE_PLUGIN_ID,
    name: 'E2E Fixture Plugin',
    description: 'appended release',
    author: 'e2e',
    version: '2.0.0',
    changelog: 'Appended release',
  });
  entry.versions.unshift({
    version: '1.1.0',
    minAppVersion: '1.0.0',
    releaseDate: '2026-01-01',
    downloadUrl: 'https://plugin.invalid/old.tar.gz',
    sha256: '0'.repeat(64),
  });
  entry.versions.push({
    version: '9.9.9',
    minAppVersion: '99.0.0',
    releaseDate: '2026-01-01',
    downloadUrl: 'https://plugin.invalid/future.tar.gz',
    sha256: '0'.repeat(64),
  });
  await stubRegistry(page, [entry]);

  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: /Updates/ }).click();

  await expect(dialog.getByText('v1.0.0 → v2.0.0')).toBeVisible();
  await expect(dialog.getByText('Appended release')).toBeVisible();
});

test('the external update modal swaps an external plugin to a newer bundle version', async ({ page, request, sandboxDir }) => {
  const v1 = buildTarball(FIXTURE_PLUGIN_ID, MANIFEST, BUNDLE);
  const v2 = buildTarball(FIXTURE_PLUGIN_ID, { ...MANIFEST, version: '2.0.0' }, BUNDLE);
  let current = v1;
  const server = await startTarballServer(() => current);
  try {
    // Install v1 as an external plugin through the real pipeline.
    const installRes = await request.post('/api/plugins/install-external', {
      data: { tarballUrl: `${server.origin}/plugin.tar.gz` },
    });
    expect(installRes.ok()).toBe(true);
    expect((await readInstalled(sandboxDir)).plugins.find((p) => p.id === FIXTURE_PLUGIN_ID)).toMatchObject({
      version: '1.0.0',
      source: 'external',
    });

    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    await stubRegistry(page);

    const dialog = await openPanel(page);
    await dialog.getByRole('button', { name: 'Installed' }).click();
    await expect(dialog.getByText('External')).toBeVisible();

    // Point the loopback at v2, then run the update (URL is pre-filled from the
    // stored externalUrl, so the same path now serves the newer bundle).
    current = v2;
    await dialog.getByRole('button', { name: `Check for update to ${FIXTURE_PLUGIN_ID}` }).click();

    const updateModal = page.getByRole('dialog', { name: `Update ${FIXTURE_PLUGIN_ID}` });
    await expect(updateModal).toBeVisible();

    const updateResponse = page.waitForResponse(
      (r) => r.url().includes('/api/plugins/install-external') && r.request().method() === 'POST' && r.ok(),
    );
    await updateModal.getByRole('button', { name: 'Install', exact: true }).click();
    await updateResponse;

    // The update writes installed.json before the response returns; the modal's
    // "done" step is transient (the reload remounts the editor), so assert the
    // durable on-disk version reflects the swapped-in bundle.
    await expect
      .poll(async () => (await readInstalled(sandboxDir)).plugins.find((p) => p.id === FIXTURE_PLUGIN_ID)?.version)
      .toBe('2.0.0');
  } finally {
    await server.close();
  }
});

// ---------------------------------------------------------------------------
// Beta channel — opt-in visibility, beta-only updates, and graduation
// ---------------------------------------------------------------------------

test('a beta registry entry is hidden until the show-beta toggle is on, then carries a Beta badge', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await stubRegistry(page, [
    registryEntry({
      id: 'beta-only-plugin',
      name: 'Beta Only Plugin',
      description: 'Only ships a beta build',
      author: 'e2e',
      version: '2.0.0-beta.1',
      channel: 'beta',
    }),
  ]);

  const dialog = await openPanel(page); // opens on Browse tab

  // Off by default: the beta entry is filtered out of the Browse catalog.
  await expect(dialog.getByText('Beta Only Plugin')).toBeHidden();

  await dialog.getByLabel('Show beta plugins').check();

  // Now visible, with a Beta badge scoped to its own row (bare "Beta" text could
  // otherwise clash with the toggle label / other rows under strict mode).
  const row = dialog.locator('div').filter({ hasText: 'Beta Only Plugin' }).last();
  await expect(dialog.getByText('Beta Only Plugin')).toBeVisible();
  await expect(row.getByText('Beta', { exact: true })).toBeVisible();
});

test('a stable plugin whose only offered version is beta is hidden from Browse until opted in', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // No plugin-level channel — the entry is stable, but its ONLY version is a
  // beta build. This is isBetaOnlyForNonOptedUser's branch, distinct from
  // isBetaHiddenEntry (which fires on a beta plugin-level channel instead).
  const entry = registryEntry({
    id: 'beta-version-only-plugin',
    name: 'Beta Version Only Plugin',
    description: 'Stable plugin, beta-only build',
    author: 'e2e',
    version: '2.0.0-beta.1',
  });
  entry.versions[0].channel = 'beta';
  await stubRegistry(page, [entry]);

  const dialog = await openPanel(page); // opens on Browse tab

  // Off by default: hidden even though nothing is plugin-level beta.
  await expect(dialog.getByText('Beta Version Only Plugin')).toBeHidden();

  await dialog.getByLabel('Show beta plugins').check();

  const row = dialog.locator('div').filter({ hasText: 'Beta Version Only Plugin' }).last();
  await expect(dialog.getByText('Beta Version Only Plugin')).toBeVisible();
  await expect(row.getByText('Beta', { exact: true })).toBeVisible();
});

test('the install confirmation modal badges and warns for a beta version', async ({ page, request }) => {
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await stubRegistry(page, [
    registryEntry({
      id: 'beta-confirm-plugin',
      name: 'Beta Confirm Plugin',
      description: 'Only ships a beta build',
      author: 'e2e',
      version: '2.0.0-beta.1',
      channel: 'beta',
    }),
  ]);

  const dialog = await openPanel(page);
  await dialog.getByLabel('Show beta plugins').check();
  await dialog.getByRole('button', { name: 'Install', exact: true }).click();

  const heading = page.getByRole('heading', { name: 'Install Plugin' });
  await expect(heading).toBeVisible();
  // Badge sits inside the modal heading; scope to it so it can't match a
  // leftover Beta badge on a Browse row underneath.
  await expect(heading.getByText('Beta', { exact: true })).toBeVisible();
  await expect(page.getByText('Beta versions are still being tested and may have problems.')).toBeVisible();
});

test('a stable install with only a beta-newer version offers "Try beta" only when opted in', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir); // installed at v1.0.0, stable (no channel)
  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // Registry offers the exact installed 1.0.0 as the only stable row (so no
  // stable update exists) plus a newer beta build.
  const entry = registryEntry({
    id: FIXTURE_PLUGIN_ID,
    name: 'E2E Fixture Plugin',
    description: 'beta build available',
    author: 'e2e',
    version: '1.0.0',
  });
  entry.versions.push({
    version: '2.0.0-beta.1',
    minAppVersion: '1.0.0',
    releaseDate: '2026-01-01',
    downloadUrl: 'https://plugin.invalid/beta.tar.gz',
    sha256: '0'.repeat(64),
    channel: 'beta',
  });
  await stubRegistry(page, [entry]);

  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: /Updates/ }).click();

  // Toggle off: no stable update and betaUpgradable is suppressed → up to date.
  await expect(dialog.getByText('All plugins are up to date')).toBeVisible();
  await expect(dialog.getByText(/Try beta/)).toBeHidden();

  // Opt in on the Browse tab, then return to Updates.
  await dialog.getByRole('button', { name: /Browse/ }).click();
  await dialog.getByLabel('Show beta plugins').check();
  await dialog.getByRole('button', { name: /Updates/ }).click();

  // The beta build is now surfaced under its own "Try beta v…" affordance.
  // Not clicked: the marketplace install POST re-fetches the real registry
  // server-side and 404s (see the file header) — presence is the coverage.
  await expect(dialog.getByText('All plugins are up to date')).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Try beta v2.0.0-beta.1' })).toBeVisible();
});

test('a beta-channel install shows the Beta badge and graduates via the normal Update path', async ({ page, request, sandboxDir }) => {
  // Hand-seed an installed record pinned to a beta version/channel — seedFixturePlugin
  // can't override version/channel, so follow the local seedConfigPlugin pattern.
  writeSandboxFile(sandboxDir, 'plugins/installed.json', {
    schemaVersion: 1,
    plugins: [{
      id: FIXTURE_PLUGIN_ID,
      version: '1.2.0-beta.1',
      installedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
      moduleType: FIXTURE_PLUGIN_TYPE,
      channel: 'beta',
    }],
  });
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/manifest.json`, { ...MANIFEST, version: '1.2.0-beta.1' });
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/dist/bundle.js`, BUNDLE);

  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // Registry: the currently-installed beta row plus a newer STABLE graduation build.
  const entry = registryEntry({
    id: FIXTURE_PLUGIN_ID,
    name: 'E2E Fixture Plugin',
    description: 'graduated to stable',
    author: 'e2e',
    version: '1.2.0-beta.1',
    changelog: 'Graduation release',
  });
  entry.versions[0].channel = 'beta';
  entry.versions.unshift({
    version: '1.3.0',
    minAppVersion: '1.0.0',
    releaseDate: '2026-02-01',
    downloadUrl: 'https://plugin.invalid/1.3.0.tar.gz',
    sha256: '0'.repeat(64),
    changelog: 'Graduation release',
  });
  await stubRegistry(page, [entry]);

  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: 'Installed' }).click();

  // The installed beta record renders a Beta badge next to its id.
  const installedRow = dialog.locator('div').filter({ hasText: FIXTURE_PLUGIN_ID }).last();
  await expect(installedRow.getByText('Beta', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: /Updates/ }).click();

  // The stable 1.3.0 is offered through the ordinary Update button (not "Try
  // beta"), proving a beta install graduates once a stable release exists.
  await expect(dialog.getByText('v1.2.0-beta.1 → v1.3.0')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Try beta/ })).toBeHidden();
});

test('the installed tab falls back to the registry version channel for a record predating the channel field', async ({ page, request, sandboxDir }) => {
  // No `channel` field at all on the install record — as if it were written
  // before the beta channel existed. The Installed tab must still recognize
  // it as beta by matching the installed version against the registry.
  writeSandboxFile(sandboxDir, 'plugins/installed.json', {
    schemaVersion: 1,
    plugins: [{
      id: FIXTURE_PLUGIN_ID,
      version: '1.2.0-beta.1',
      installedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
      moduleType: FIXTURE_PLUGIN_TYPE,
    }],
  });
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/manifest.json`, { ...MANIFEST, version: '1.2.0-beta.1' });
  writeSandboxFile(sandboxDir, `plugins/${FIXTURE_PLUGIN_ID}/dist/bundle.js`, BUNDLE);

  await putConfig(request, baseConfig());
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  const entry = registryEntry({
    id: FIXTURE_PLUGIN_ID,
    name: 'E2E Fixture Plugin',
    description: 'legacy beta install',
    author: 'e2e',
    version: '1.2.0-beta.1',
  });
  entry.versions[0].channel = 'beta';
  await stubRegistry(page, [entry]);

  const dialog = await openPanel(page);
  await dialog.getByRole('button', { name: 'Installed' }).click();

  const installedRow = dialog.locator('div').filter({ hasText: FIXTURE_PLUGIN_ID }).last();
  await expect(installedRow.getByText('Beta', { exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Plugin config UI — the schema-fallback renderer
// ---------------------------------------------------------------------------

const CFG_ID = 'e2e-cfg';
const CFG_TYPE = 'plugin:e2e-cfg';

// A self-contained bundle (no publishState side effects) that renders config.label.
const CFG_BUNDLE = `(function () {
  var R = window.React;
  window.__HS_PLUGIN__ = { default: function (props) {
    var cfg = (props && props.config) || {};
    return R.createElement('div', { 'data-plugin-marker': 'e2e-cfg', style: { width: '100%', height: '100%' } }, cfg.label || 'CONFIG START');
  } };
})();`;

// A manifest with a configSchema and no configSection export → PropertyPanel
// takes the schema-fallback branch and renders PluginConfigRenderer.
const CFG_MANIFEST = {
  id: CFG_ID,
  name: 'E2E Config Plugin',
  version: '1.0.0',
  description: 'E2E config-schema fixture',
  author: 'e2e',
  license: 'MIT',
  minAppVersion: '1.0.0',
  moduleType: CFG_ID,
  category: 'Media & Display',
  icon: 'Star',
  defaultConfig: { label: 'CONFIG START' },
  defaultSize: { w: 320, h: 200 },
  exports: { component: 'default' },
  configSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', title: 'Headline' },
    },
  },
};

function seedConfigPlugin(sandboxDir: string): void {
  writeSandboxFile(sandboxDir, 'plugins/installed.json', {
    schemaVersion: 1,
    plugins: [{
      id: CFG_ID,
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
      moduleType: CFG_ID,
    }],
  });
  writeSandboxFile(sandboxDir, `plugins/${CFG_ID}/manifest.json`, CFG_MANIFEST);
  writeSandboxFile(sandboxDir, `plugins/${CFG_ID}/dist/bundle.js`, CFG_BUNDLE);
}

test('editing a plugin config field via the schema renderer persists into the module instance', async ({ page, request, sandboxDir }) => {
  seedConfigPlugin(sandboxDir);
  const mod: ModuleInstance = {
    id: 'cfg-mod',
    type: CFG_TYPE,
    position: { x: 100, y: 100 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { label: 'CONFIG START' },
  } as ModuleInstance;

  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  const marker = page.locator('[data-plugin-marker="e2e-cfg"]');
  await expect(marker).toHaveText('CONFIG START');

  // Select the module → PropertyPanel renders the schema-fallback Config section.
  await page.locator('[data-module-id="cfg-mod"]').click();

  // The schema's `label` string field renders as a "Headline" text input.
  await autosaved(page, async () => {
    await page.getByLabel('Headline').fill('EDITED HEADLINE');
  });

  // The live preview re-renders from the updated instance config...
  await expect(marker).toHaveText('EDITED HEADLINE');
  // ...and the edit persisted to the module instance config on disk.
  const config = await getConfig(request);
  const persisted = config.screens[0].modules.find((m) => m.id === 'cfg-mod')!.config as Record<string, unknown>;
  expect(persisted.label).toBe('EDITED HEADLINE');
});
