import { test, expect } from '../fixtures';
import { getConfig, putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import { seedFixturePlugin, FIXTURE_PLUGIN_TYPE, FIXTURE_STATE_KEY } from '../helpers/fixture-plugin';
import type { APIRequestContext, Page } from '@playwright/test';
import { DEFAULT_MODULE_STYLE, type ModuleInstance, type VisibilityCondition } from '@/types/config';

/**
 * Editor-form coverage for VisibilityConditionsSection.tsx: enabling the
 * conditions block, adding/filling a `state` condition, switching a leaf to
 * `numeric`, wrapping a leaf in an "All of…" group + nesting a child, and the
 * depth cap that hides group kinds at MAX_CONDITION_DEPTH.
 *
 * display/interactive.spec.ts already proves the *runtime* gating (a single
 * unknown-key state condition hiding the module on the display); this file
 * exercises the *authoring UI* instead.
 */

/** PUT a single-module config, open the editor, select the module, and open the Conditions accordion. */
async function openConditions(page: Page, request: APIRequestContext, mod: ModuleInstance): Promise<void> {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator(`[data-module-id="${mod.id}"]`).click();
  // The conditions UI is its own accordion (propertyPanel.sections.conditions),
  // collapsed by default and separate from the "Visibility" enabled/schedule one.
  await page.getByRole('button', { name: 'Conditions' }).click();
}

/** Persisted visibility block for the single module in the single screen. */
async function savedVisibility(request: APIRequestContext) {
  const config = await getConfig(request);
  return config.screens[0].modules[0].visibility;
}

test('enabling conditions and adding one persists an empty-conditions visibility block', async ({ page, request }) => {
  const mod = textModule('GATED');
  await openConditions(page, request, mod);

  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Show only when conditions match' }).click();
  });
  expect(await savedVisibility(request)).toEqual({ conditions: [] });

  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add condition' }).click();
  });

  const visibility = await savedVisibility(request);
  expect(visibility!.conditions).toHaveLength(1);
  expect(visibility!.conditions[0]).toMatchObject({ kind: 'state', sourceKey: '', equals: '' });
});

test('filling a state condition source key and value persists on blur', async ({ page, request }) => {
  const mod = textModule('GATED', { visibility: { conditions: [{ kind: 'state', sourceKey: '', equals: '' }] } });
  await openConditions(page, request, mod);

  // Focusing Value blurs (and commits) the State key; Value.blur() commits the
  // value. Two commits can coalesce into one debounced PUT, so poll for the
  // final persisted shape rather than reading immediately after one save.
  await page.getByLabel('State key').fill('plugin:e2e-fixture:flag');
  await page.getByLabel('Value').fill('on');
  await page.getByLabel('Value').blur();

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' });
});

test('switching condition kind to numeric preserves the source key and exposes Above', async ({ page, request }) => {
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:count', equals: '5' }] },
  });
  await openConditions(page, request, mod);

  await autosaved(page, async () => {
    await page.getByLabel('Condition type').selectOption('numeric');
  });

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'numeric', sourceKey: 'plugin:e2e-fixture:count' });

  // The numeric editor swaps the value field for Above/Below bounds.
  await page.getByLabel('Above').fill('10');
  await page.getByLabel('Above').blur();

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ above: 10 });
});

test('switching to a group kind wraps the leaf and supports adding a nested child', async ({ page, request }) => {
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' }] },
  });
  await openConditions(page, request, mod);

  await autosaved(page, async () => {
    await page.getByLabel('Condition type').first().selectOption('and');
  });

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({
      kind: 'and',
      conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' }],
    });

  // The group's own "Add condition" is nested inside it and therefore precedes
  // the section-level "Add condition" in the DOM, so it is .first(), not .last()
  // (the plan guessed .last()). Clicking it appends a second child to the group.
  await autosaved(page, async () => {
    await page.getByRole('button', { name: 'Add condition' }).first().click();
  });

  const visibility = await savedVisibility(request);
  const group = visibility!.conditions[0] as Extract<VisibilityCondition, { kind: 'and' }>;
  expect(group.conditions).toHaveLength(2);
});

test('condition type options exclude group kinds at max nesting depth', async ({ page, request }) => {
  // MAX_CONDITION_DEPTH === 5. The UI hides group kinds once a ConditionEditor
  // renders at depth === MAX_CONDITION_DEPTH - 1 (4). Nest MAX_CONDITION_DEPTH - 1
  // (== 4) `and` groups ending in a leaf so the leaf editor sits at depth 4.
  const deep: VisibilityCondition = {
    kind: 'and',
    conditions: [{
      kind: 'and',
      conditions: [{
        kind: 'and',
        conditions: [{
          kind: 'and',
          conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' }],
        }],
      }],
    }],
  };
  const mod = textModule('GATED', { visibility: { conditions: [deep] } });
  await openConditions(page, request, mod);

  const kindSelects = page.getByLabel('Condition type');
  await expect(kindSelects).toHaveCount(5); // 4 groups + 1 leaf

  const optionValues = (locator: ReturnType<Page['getByLabel']>) =>
    locator.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

  // Root group (depth 0) still offers every kind.
  expect(await optionValues(kindSelects.first())).toEqual(['state', 'numeric', 'and', 'or', 'not']);

  // Innermost leaf (depth 4) drops the group kinds.
  expect(await optionValues(kindSelects.last())).toEqual(['state', 'numeric']);
});

// ── Task 15: live-value hint, case-mismatch warning, suggestion keyboard nav ─
// The editor's only window into a display's live shared-state is
// useDisplaySharedState, which polls GET /api/display/shared-state. In legacy
// single-display mode selectedDisplayId is null, so the editor reads the
// `__default__` slot — the same slot a status heartbeat with no displayId
// writes to. That heartbeat is the seam these specs seed through.

/**
 * Seed a display shared-state snapshot into the hub the way a Pi kiosk does: a
 * status heartbeat carrying a `sharedState` field. With no displayId it lands
 * in the legacy `__default__` slot the editor polls in single-display mode.
 * recordSharedStateReport replaces the whole slot, so each call is the latest
 * snapshot. requireDisplayAuth is a no-op while auth is disabled.
 */
async function seedDisplaySharedState(
  request: APIRequestContext,
  entries: Record<string, string>,
): Promise<void> {
  const now = Date.now();
  const sharedState: Record<string, { value: string; updatedAt: number }> = {};
  for (const [key, value] of Object.entries(entries)) sharedState[key] = { value, updatedAt: now };
  const res = await request.post('/api/display/status', {
    data: {
      currentScreen: { index: 0, id: 's1', name: 'S1' },
      screenCount: 1,
      displayState: 'active',
      timestamp: now,
      sharedState,
    },
  });
  expect(res.ok()).toBe(true);
}

// Shared-state keys are lowercase-only (SHARED_STATE_KEY_RE); the case mismatch
// this warns about is on the matched VALUE, so the live value is mixed-case.
const LIVE_KEY = 'plugin:e2e-fixture:mode';

test('a case-only value mismatch against the live display value surfaces a warning', async ({ page, request }) => {
  // The display currently publishes 'Clear'; the condition matches 'clear' —
  // right letters, wrong case. isCaseOnlyMismatch flips the warning on.
  await seedDisplaySharedState(request, { [LIVE_KEY]: 'Clear' });

  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: LIVE_KEY, equals: 'clear' }] },
  });
  await openConditions(page, request, mod);

  // The warning interpolates the live value and calls out case-sensitivity. The
  // editor polls the seeded snapshot on mount (immediate) then every 5s.
  await expect(page.getByText(/publishes 'Clear'/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/case-sensitive/i)).toBeVisible();
});

test('the live display value shows next to the condition key input', async ({ page, request }) => {
  await seedDisplaySharedState(request, { [LIVE_KEY]: 'sunny' });

  // equals matches the live value exactly (same case) so no mismatch warning
  // competes — only the live-value hint should render.
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: LIVE_KEY, equals: 'sunny' }] },
  });
  await openConditions(page, request, mod);

  // SourceKeyInput renders the "On the display now:" label and the value in a
  // <code>, straight from the display's last heartbeat.
  await expect(page.getByText('On the display now:')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('code', { hasText: 'sunny' })).toBeVisible();
});

test('the source-key suggestion dropdown commits a key via ArrowDown + Enter', async ({ page, request, sandboxDir }) => {
  // Suggestions are sourced from background-provider modules on this display, so
  // seed the fixture plugin as a background provider — its advertised key
  // (plugin:e2e-fixture:flag) becomes the sole dropdown suggestion. A separate
  // text module holds the condition being authored.
  seedFixturePlugin(sandboxDir);

  const provider: ModuleInstance = {
    id: 'bg-provider',
    type: FIXTURE_PLUGIN_TYPE,
    position: { x: 0, y: 0 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    backgroundProvider: true,
    config: { label: 'E2E PROVIDER' },
  } as ModuleInstance;
  const gated = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: '', equals: '' }] },
  });

  // Gated module first so savedVisibility (which reads modules[0]) targets it;
  // collectProvidedStateKeys scans every module regardless of order.
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [gated, provider])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  // The picker reads the registered plugin definition (collectProvidedStateKeys),
  // available only once the bundle loads — its on-canvas marker proves that.
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();

  await page.locator('[data-module-id="text-gated"]').click();
  await page.getByRole('button', { name: 'Conditions' }).click();

  // The input and the open dropdown <ul> share aria-label "State key", so target
  // the input by its combobox role to stay unambiguous once the list is open.
  const keyInput = page.getByRole('combobox', { name: 'State key' });
  await keyInput.click(); // focus opens the custom suggestion dropdown
  await expect(page.getByRole('option').filter({ hasText: FIXTURE_STATE_KEY })).toBeVisible();

  // ArrowDown highlights the first suggestion; Enter commits it into the input
  // (a deliberate pick, so it commits immediately rather than waiting for blur).
  await autosaved(page, async () => {
    await keyInput.press('ArrowDown');
    await keyInput.press('Enter');
  });

  await expect(keyInput).toHaveValue(FIXTURE_STATE_KEY);
  expect((await savedVisibility(request))!.conditions[0]).toMatchObject({
    kind: 'state',
    sourceKey: FIXTURE_STATE_KEY,
  });
});
