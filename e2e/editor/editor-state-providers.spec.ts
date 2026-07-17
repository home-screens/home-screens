import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { seedFixturePlugin, FIXTURE_PLUGIN_TYPE } from '../helpers/fixture-plugin';
import type { ModuleInstance, ScreenConfiguration } from '@/types/config';

/**
 * Editor-mounted state providers (`EditorStateProviderLayer` +
 * `useEditorSharedState`): the whole conditions loop — reference a key,
 * demand it, publish it, judge it — works inside a single editor tab with NO
 * display page open anywhere. The fixture plugin's `stateProvider` publishes
 * every demanded key with 'on' into the editor tab's own bus, and every
 * verdict surface falls back to that bus because the per-test display ids
 * here are never seeded on the hub (each test uses its own, so the hub slot
 * is offline forever regardless of what else runs on this worker).
 */

const KEY = `${FIXTURE_PLUGIN_TYPE}:door`;

function displayConfig(displayId: string, modules: ModuleInstance[]): ScreenConfiguration {
  const config = baseConfig({ screens: [] });
  config.displays = [{ id: displayId, name: 'Local', screens: [makeScreen('s1', 'Home', modules)] }];
  return config;
}

// The provider bundle stays installed in this worker's sandbox after these
// tests; restore the plain bundle so later spec files that reference
// fixture-namespaced keys don't inherit a publisher they never asked for.
test.afterAll(({ server }) => {
  seedFixturePlugin(server.sandboxDir, {});
});

test('condition verdicts go live from the editor tab itself, no display running', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { stateProvider: true });

  // Two conditions on the same provider-published key: 'on' matches what the
  // fixture provider publishes, 'off' cannot — one met chip, one unmet chip.
  const mod = textModule('GATED', {
    visibility: {
      conditions: [
        { kind: 'state', sourceKey: KEY, equals: 'on' },
        { kind: 'state', sourceKey: KEY, equals: 'off' },
      ],
    },
  });
  await putConfig(request, displayConfig('esp-panel', [mod]));
  await page.goto('/editor?display=esp-panel');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${mod.id}"]`).click();
  await page.getByRole('button', { name: 'Conditions' }).click();

  // Demand flows from the draft config to the in-tab provider, which
  // publishes within one effect pass — the chips only wait on React, not on
  // any heartbeat/poll cycle, but keep the generous timeout of the seeded
  // verdict specs for slow CI.
  await expect(page.locator('[data-condition-verdict="met"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-condition-verdict="unmet"]')).toBeVisible();

  // AND semantics: the unmet node hides the module and the header says so.
  await expect(page.locator('[data-visibility-outcome]')).toHaveAttribute('data-visibility-outcome', 'hidden');
});

test('canvas condition badges tint from the editor bus with no display running', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { stateProvider: true });

  const met = textModule('SHOWN', {
    visibility: { conditions: [{ kind: 'state', sourceKey: KEY, equals: 'on' }] },
  });
  const unmet = textModule('HIDDEN', {
    visibility: { conditions: [{ kind: 'state', sourceKey: KEY, equals: 'off' }] },
  });
  await putConfig(request, displayConfig('esp-canvas', [met, unmet]));
  await page.goto('/editor?display=esp-canvas');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await expect(page.locator(`[data-module-id="${met.id}"] [data-condition-badge="met"]`)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`[data-module-id="${unmet.id}"] [data-condition-badge="unmet"]`)).toBeVisible();
});

test('the bus inspector shows editor-published values and says where they come from', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { stateProvider: true });

  const gated = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: KEY, equals: 'on' }] },
  });
  await putConfig(request, displayConfig('esp-inspect', [gated]));
  await page.goto('/editor/settings?section=defaults&page=shared-state&display=esp-inspect');

  // The referenced key is published by the in-tab provider: an active row
  // with the live value, not a "Never published" warning.
  const row = page.locator(`[data-state-key="${KEY}"]`);
  await expect(row).toHaveAttribute('data-state-status', 'active', { timeout: 10_000 });
  await expect(row.locator('code', { hasText: 'on' })).toBeVisible();

  // The banner attributes the values to the editor, not to a display report.
  await expect(page.locator('[data-state-source="editor"]')).toBeVisible();
  await expect(page.getByText('Live values from this editor', { exact: false })).toBeVisible();
});
