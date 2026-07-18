import { test, expect } from '../fixtures';
import { putConfig, seedDisplaySharedState } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { DisplayNode, ScreenConfiguration } from '@/types/config';

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
