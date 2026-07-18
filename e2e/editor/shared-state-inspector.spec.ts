import { test, expect } from '../fixtures';
import { putConfig, seedDisplaySharedState } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { seedFixturePlugin, FIXTURE_PLUGIN_TYPE, FIXTURE_STATE_KEY } from '../helpers/fixture-plugin';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { DisplayNode, ModuleInstance, ScreenConfiguration } from '@/types/config';

/**
 * Editor › Settings › Shared state (`SharedStateSection`): the bus inspector.
 * One row per key the display publishes or references, cross-referenced so
 * both failure modes are visible: referenced-but-never-published (warning)
 * and published-but-unreferenced (dimmed). Rows carry `data-state-key` /
 * `data-state-status` for exactly this kind of assertion.
 *
 * Every test uses its own display id (multi-display config + `?display=`
 * URL), so its hub snapshot slot can't be contaminated by seeds from other
 * tests or spec files sharing the worker's server — the hub's in-memory
 * slots have no reset seam.
 */

// Namespaced to a plugin that is NEVER installed: the editor mounts state
// providers against its own bus (EditorStateProviderLayer), so fixture-owned
// keys would publish in-tab whenever another spec leaves the provider bundle
// installed on this worker — flipping "never published" rows to active. An
// unowned namespace keeps these deterministic; the hub-seeded test is
// unaffected because a fresh display snapshot outranks the local bus.
const PUBLISHED_KEY = 'plugin:not-installed:door';
const MISSING_KEY = 'plugin:not-installed:never';
const UNREFERENCED_KEY = 'plugin:not-installed:orphan';

/**
 * A single-display registry whose display references PUBLISHED_KEY (module
 * condition + rule condition) and MISSING_KEY (text token).
 */
function inspectorConfig(displayId: string): ScreenConfiguration {
  const gated = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: PUBLISHED_KEY, equals: 'on' }] },
  });
  const tokens = textModule(`Missing: {${MISSING_KEY}}`, { id: 'text-tokens' });
  const display: DisplayNode = {
    id: displayId,
    name: 'Inspector',
    screens: [makeScreen('s1', 'Home', [gated, tokens])],
    // Rules are display-owned in multi-display mode (getActiveRules).
    rules: [{
      id: 'rule-1',
      name: 'Doorbell',
      when: [{ kind: 'state', sourceKey: PUBLISHED_KEY, equals: 'on' }],
      action: { kind: 'wake' },
    }],
  };
  const config = baseConfig({ screens: [] });
  config.displays = [display];
  return config;
}

test('shows the no-report hint before the display ever reports', async ({ page, request }) => {
  // 'ssi-fresh' is never seeded anywhere, so this holds regardless of what
  // other tests or files ran before it on this worker.
  await putConfig(request, inspectorConfig('ssi-fresh'));
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-fresh');

  await expect(page.getByText("This display hasn't reported any values yet", { exact: false })).toBeVisible();
  // Referenced keys still render (as never-published) even with no snapshot.
  await expect(page.locator(`[data-state-key="${PUBLISHED_KEY}"]`)).toHaveAttribute('data-state-status', 'missing');
});

test('cross-references the snapshot against config references', async ({ page, request }) => {
  await putConfig(request, inspectorConfig('ssi-seeded'));
  await seedDisplaySharedState(request, {
    [PUBLISHED_KEY]: 'on',
    [UNREFERENCED_KEY]: '42',
  }, 'ssi-seeded');
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-seeded');

  // Published + referenced: value chip and both consumers listed (module by
  // registry label + screen name, rule by name).
  const active = page.locator(`[data-state-key="${PUBLISHED_KEY}"]`);
  await expect(active).toHaveAttribute('data-state-status', 'active', { timeout: 10_000 });
  await expect(active.locator('code', { hasText: 'on' })).toBeVisible();
  await expect(active).toContainText('Text · Home');
  await expect(active).toContainText('Rule: Doorbell');

  // Referenced by a Text token but never published: warning row.
  const missing = page.locator(`[data-state-key="${MISSING_KEY}"]`);
  await expect(missing).toHaveAttribute('data-state-status', 'missing');
  await expect(missing).toContainText('Never published');

  // Published but nothing references it: dimmed regression-signal row.
  const orphan = page.locator(`[data-state-key="${UNREFERENCED_KEY}"]`);
  await expect(orphan).toHaveAttribute('data-state-status', 'unreferenced');
  await expect(orphan).toContainText('Nothing references this key.');
});

test('surfaces an unhealthy provider in a banner and on its missing key row', async ({ page, request }) => {
  await putConfig(request, inspectorConfig('ssi-health'));
  // The display reports its Home Assistant provider as down, riding the same
  // heartbeat as the shared-state snapshot (recordProviderHealthReport).
  await seedDisplaySharedState(
    request,
    { [PUBLISHED_KEY]: 'on' },
    'ssi-health',
    { 'not-installed': { message: 'Cannot reach the service', since: Date.now() - 60_000 } },
  );
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-health');

  // Banner at the top: one row per unhealthy plugin, message verbatim.
  const banner = page.locator('[data-testid="provider-health-banner"] [data-provider-health="not-installed"]');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toContainText('Cannot reach the service');
  await expect(banner).toContainText('since');

  // The missing key owned by that plugin appends the same message to its detail.
  const missing = page.locator(`[data-state-key="${MISSING_KEY}"]`);
  await expect(missing).toContainText('Cannot reach the service');
});

/**
 * The "Available" sub-tab: a browse list of every key this display's plugins
 * can provide, whether or not anything references it. Sourced from the same
 * static catalogue (`collectProvidedStateKeys`) + cross-plugin search
 * (`searchStateKeys`) the visibility-condition picker uses.
 *
 * The provider bundle stays installed in this worker's sandbox after these
 * tests; restore the plain bundle so later spec files that reference
 * fixture-namespaced keys don't inherit a search provider they never asked for.
 */
test.afterAll(({ server }) => {
  seedFixturePlugin(server.sandboxDir, {});
});

/** A background-provider fixture-plugin module, advertising FIXTURE_STATE_KEY. */
function providerModule(): ModuleInstance {
  return {
    id: 'provider-1',
    type: FIXTURE_PLUGIN_TYPE as ModuleInstance['type'],
    position: { x: 100, y: 100 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { label: 'PROVIDER' },
    backgroundProvider: true,
  };
}

test('Available tab lists a provided key nothing references, and filters on search', async ({ page, request, sandboxDir }) => {
  // Base fixture advertises providesState `flag` → `plugin:e2e-fixture:flag`.
  seedFixturePlugin(sandboxDir, {});

  // A provider module with no consumer anywhere: the key can only surface via
  // the Available catalogue, never the reference-driven Watching list.
  const config = baseConfig({ screens: [] });
  config.displays = [{
    id: 'ssi-available',
    name: 'Available',
    screens: [makeScreen('s1', 'Home', [providerModule()])],
  } as DisplayNode];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-available');

  // Defaults to Watching; the provided key is not there (nothing references or
  // publishes it), so it can't be a false positive for the Available assertion.
  await expect(page.getByTestId('shared-state-tab-watching')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('shared-state-tab-available')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator(`[data-available-key="${FIXTURE_STATE_KEY}"]`)).toHaveCount(0);

  // Switch to Available: the key shows regardless of references.
  await page.getByTestId('shared-state-tab-available').click();
  await expect(page.getByTestId('shared-state-tab-available')).toHaveAttribute('aria-pressed', 'true');
  const available = page.locator(`[data-available-key="${FIXTURE_STATE_KEY}"]`);
  await expect(available).toBeVisible({ timeout: 10_000 });

  // A non-matching query filters it out; a matching one brings it back.
  const search = page.getByTestId('shared-state-available-search');
  await search.fill('zzzznope');
  await expect(available).toHaveCount(0);
  await expect(page.getByTestId('shared-state-available-empty')).toBeVisible();
  await search.fill('flag');
  await expect(available).toBeVisible();
});

test('Available tab groups values under their add-on and collapses a group', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, {});

  const config = baseConfig({ screens: [] });
  config.displays = [{
    id: 'ssi-group',
    name: 'Group',
    screens: [makeScreen('s1', 'Home', [providerModule()])],
  } as DisplayNode];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-group');

  await page.getByTestId('shared-state-tab-available').click();

  // The provided key renders inside a producer group headed by the plugin's
  // display name, with a summary line above the search box.
  const group = page.locator(
    '[data-testid="shared-state-available-group"][data-group-producer="E2E Fixture Plugin"]',
  );
  await expect(group).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('shared-state-available-summary')).toBeVisible();

  const flag = page.locator(`[data-available-key="${FIXTURE_STATE_KEY}"]`);
  await expect(flag).toBeVisible();

  // Collapsing the group hides its rows and flips the toggle's expanded state.
  const toggle = group.getByTestId('shared-state-available-group-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(flag).toHaveCount(0);
});

test('Available tab explains itself when no add-on can share values', async ({ page, request, sandboxDir }) => {
  // Plain bundle (no searchStateKeys export) and no provider module placed:
  // the static catalogue is empty AND search is unavailable, which is the
  // distinct no-providers hint, not the searched-and-missed empty state.
  seedFixturePlugin(sandboxDir, {});

  const config = baseConfig({ screens: [] });
  config.displays = [{
    id: 'ssi-noproviders',
    name: 'NoProviders',
    screens: [makeScreen('s1', 'Home', [textModule('PLAIN')])],
  } as DisplayNode];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-noproviders');

  await page.getByTestId('shared-state-tab-available').click();
  await expect(page.getByText('Nothing is available to share yet', { exact: false }))
    .toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('shared-state-available-summary')).toHaveCount(0);
});

test('Available tab surfaces cross-plugin search results with no provider placed', async ({ page, request, sandboxDir }) => {
  // Search-capable fixture: exports searchStateKeys (door + temp), no manifest
  // providesState needed and no module placed on the display.
  seedFixturePlugin(sandboxDir, { search: true });

  const config = baseConfig({ screens: [] });
  config.displays = [{
    id: 'ssi-search',
    name: 'Search',
    screens: [makeScreen('s1', 'Home', [textModule('PLAIN')])],
  } as DisplayNode];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-search');

  await page.getByTestId('shared-state-tab-available').click();
  await page.getByTestId('shared-state-available-search').fill('door');

  // The searchStateKeys door descriptor (key plugin:e2e-fixture:door) appears
  // even though no module on the display advertises it statically.
  await expect(page.locator(`[data-available-key="${FIXTURE_PLUGIN_TYPE}:door"]`))
    .toBeVisible({ timeout: 10_000 });
});

test('Available tab previews a long category behind show more and fetches past the combobox cap', async ({ page, request, sandboxDir }) => {
  // Search fixture emitting 40 same-group ("Sensors") descriptors — more than
  // the combobox's 30-result cap and more than the category preview limit.
  seedFixturePlugin(sandboxDir, { search: true, settings: { bulkCount: 40 } });

  const config = baseConfig({ screens: [] });
  config.displays = [{
    id: 'ssi-bulk',
    name: 'Bulk',
    screens: [makeScreen('s1', 'Home', [textModule('PLAIN')])],
  } as DisplayNode];
  await putConfig(request, config);
  await page.goto('/editor/settings?section=defaults&page=automation&panel=live&display=ssi-bulk');

  await page.getByTestId('shared-state-tab-available').click();
  await page.getByTestId('shared-state-available-search').fill('bulk');

  // The "Sensors" run previews only the first 10 rows; the rest hide behind a
  // "show more" toggle (proving the per-category cap, not a global 30 cap).
  const bulkRows = page.locator('[data-available-key^="plugin:e2e-fixture:bulk_"]');
  await expect(bulkRows).toHaveCount(10, { timeout: 10_000 });

  const toggle = page.getByTestId('shared-state-available-run-toggle');
  await expect(toggle).toBeVisible();

  // Expanding reveals all 40 — impossible if the browse tab were still capped
  // at the combobox's 30-result SEARCH_LIMIT, so this also proves the larger
  // BROWSE_SEARCH_LIMIT request is in effect.
  await toggle.click();
  await expect(bulkRows).toHaveCount(40);

  // Collapsing returns to the 10-row preview.
  await toggle.click();
  await expect(bulkRows).toHaveCount(10);
});
