import { test, expect } from '../fixtures';
import { getConfig, putConfig, seedDisplaySharedState } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { autosaved } from '../helpers/editor';
import { seedFixturePlugin, FIXTURE_PLUGIN_TYPE, FIXTURE_STATE_KEY } from '../helpers/fixture-plugin';
import type { APIRequestContext, Page } from '@playwright/test';
import { DEFAULT_MODULE_STYLE, type ModuleInstance, type ScreenConfiguration, type VisibilityCondition } from '@/types/config';

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

/**
 * A config owning the given modules on one screen. With a `display` id the
 * screen lives on that display (multi-display registry) so the editor polls
 * that display's own shared-state slot — tests that seed or assert live
 * verdicts use a per-purpose display id to stay isolated from every other
 * test and spec file on the shared worker server (the hub's in-memory
 * snapshot slots have no reset seam).
 */
function conditionsConfig(modules: ModuleInstance[], display?: string): ScreenConfiguration {
  if (!display) return baseConfig({ screens: [makeScreen('s1', 'S1', modules)] });
  const config = baseConfig({ screens: [] });
  config.displays = [{ id: display, name: 'Live', screens: [makeScreen('s1', 'S1', modules)] }];
  return config;
}

/** PUT a single-module config, open the editor, select the module, and open the Conditions accordion. */
async function openConditions(page: Page, request: APIRequestContext, mod: ModuleInstance, display?: string): Promise<void> {
  await putConfig(request, conditionsConfig([mod], display));
  await page.goto(display ? `/editor?display=${display}` : '/editor');
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

  // Focusing Value blurs (and commits) the key field; Value.blur() commits the
  // value. Two commits can coalesce into one debounced PUT, so poll for the
  // final persisted shape rather than reading immediately after one save.
  await page.getByLabel('What to check').fill('plugin:e2e-fixture:flag');
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

test('checking "or equal to" persists an inclusive bound independently per side', async ({ page, request }) => {
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'numeric', sourceKey: 'plugin:e2e-fixture:temp', above: 60, below: 80 }] },
  });
  await openConditions(page, request, mod);

  const orEqualCheckboxes = page.getByRole('checkbox', { name: 'Or equal to' });
  await expect(orEqualCheckboxes).toHaveCount(2);

  await autosaved(page, async () => {
    await orEqualCheckboxes.first().check();
  });

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ above: 60, aboveInclusive: true, below: 80 });
  expect((await savedVisibility(request))!.conditions[0]).not.toHaveProperty('belowInclusive', true);
});

test('authoring a time condition persists a window and a day toggle', async ({ page, request }) => {
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:flag', equals: 'on' }] },
  });
  await openConditions(page, request, mod);

  // Switch the leaf to a Time of day condition — it defaults to a daytime window.
  await autosaved(page, async () => {
    await page.getByLabel('Condition type').first().selectOption('time');
  });
  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toEqual({ kind: 'time', startTime: '07:00', endTime: '21:00' });

  // Narrow the window (time inputs commit on change).
  await autosaved(page, async () => {
    await page.getByLabel('From', { exact: true }).fill('08:30');
  });
  await autosaved(page, async () => {
    await page.getByLabel('Until', { exact: true }).fill('17:00');
  });
  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'time', startTime: '08:30', endTime: '17:00' });

  // Days are picked on the week strip now, one chip per row, named in full.
  // All-days is stored as undefined, so the first removal materializes the
  // explicit array.
  await expect(page.getByTestId('schedule-week-strip')).toBeVisible();
  await autosaved(page, async () => {
    await page.getByRole('switch', { name: 'Sunday', exact: true }).click();
  });
  await expect
    .poll(async () => {
      const c = (await savedVisibility(request))!.conditions[0];
      return c.kind === 'time' ? c.daysOfWeek : null;
    })
    .toEqual([1, 2, 3, 4, 5, 6]);
});

test('a time condition can be one stretch across several days', async ({ page, request }) => {
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'time', daysOfWeek: [1], startTime: '08:00', endTime: '20:00' }] },
  });
  await openConditions(page, request, mod);

  // Same two shapes the module Schedule accordion offers.
  const shape = page.getByTestId('condition-time-shape');
  await expect(shape).toHaveValue('repeat');
  await expect(page.getByTestId('condition-time-end-day')).toHaveCount(0);

  await autosaved(page, async () => {
    await shape.selectOption('span');
  });
  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'time', daysOfWeek: [1], endDayOffset: 1 });

  // The end is named outright, because a stretch has one start day.
  const endDay = page.getByTestId('condition-time-end-day');
  await autosaved(page, async () => {
    await endDay.selectOption({ label: 'Thursday' });
  });
  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'time', daysOfWeek: [1], startTime: '08:00', endTime: '20:00', endDayOffset: 3 });

  // Monday through Thursday lit as one unbroken run, and nothing after it.
  const strip = page.getByTestId('schedule-week-strip');
  for (const day of [1, 2, 3, 4]) {
    await expect(strip.getByTestId(`schedule-track-${day}`).getByTestId('schedule-band')).toHaveCount(1);
  }
  for (const day of [5, 6, 0]) {
    await expect(strip.getByTestId(`schedule-track-${day}`).getByTestId('schedule-band')).toHaveCount(0);
  }
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
  expect(await optionValues(kindSelects.first())).toEqual(['state', 'numeric', 'time', 'and', 'or', 'not']);

  // Innermost leaf (depth 4) drops the group kinds but keeps every leaf kind
  // (`time` is a leaf, always available).
  expect(await optionValues(kindSelects.last())).toEqual(['state', 'numeric', 'time']);
});

test('verdicts stay neutral when the display has never reported', async ({ page, request }) => {
  // 'vc-fresh' is never seeded anywhere: no chip and no verdict may render —
  // only the neutral no-live-data line, never a stale or default-false
  // verdict. The canvas condition badge stays neutral for the same reason.
  // The key's namespace must belong to NO installed plugin: the editor now
  // mounts state providers against its own bus (EditorStateProviderLayer),
  // so a fixture-owned key would legitimately publish in-tab and show a live
  // verdict if another spec left the provider bundle installed.
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:not-installed:mode', equals: 'sunny' }] },
  });
  await openConditions(page, request, mod, 'vc-fresh');

  await expect(page.locator('[data-visibility-outcome="offline"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-condition-verdict]')).toHaveCount(0);
  await expect(page.locator('[data-condition-badge]')).toHaveAttribute('data-condition-badge', 'neutral');
});

// ── Task 15: live-value hint, case-mismatch warning, suggestion keyboard nav ─
// The editor's only window into a display's live shared-state is
// useDisplaySharedState, which polls GET /api/display/shared-state for the
// selected display. These specs seed through the status-heartbeat seam into
// this file's own 'vc-live' display slot and open the editor on it.

// Shared-state keys are lowercase-only (SHARED_STATE_KEY_RE); the case mismatch
// this warns about is on the matched VALUE, so the live value is mixed-case.
const LIVE_KEY = 'plugin:e2e-fixture:mode';
const LIVE_DISPLAY = 'vc-live';

test('a case-only value mismatch against the live display value surfaces a warning', async ({ page, request }) => {
  // The display currently publishes 'Clear'; the condition matches 'clear' —
  // right letters, wrong case. isCaseOnlyMismatch flips the warning on.
  await seedDisplaySharedState(request, { [LIVE_KEY]: 'Clear' }, LIVE_DISPLAY);

  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: LIVE_KEY, equals: 'clear' }] },
  });
  await openConditions(page, request, mod, LIVE_DISPLAY);

  // The warning interpolates the live value and calls out case-sensitivity. The
  // editor polls the seeded snapshot on mount (immediate) then every 5s.
  await expect(page.getByText(/publishes 'Clear'/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/case-sensitive/i)).toBeVisible();
});

test('the live display value shows next to the condition key input', async ({ page, request }) => {
  await seedDisplaySharedState(request, { [LIVE_KEY]: 'sunny' }, LIVE_DISPLAY);

  // equals matches the live value exactly (same case) so no mismatch warning
  // competes — only the live-value hint should render.
  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: LIVE_KEY, equals: 'sunny' }] },
  });
  await openConditions(page, request, mod, LIVE_DISPLAY);

  // SourceKeyInput renders the "On the display now:" label and the value in a
  // <code>, straight from the display's last heartbeat.
  await expect(page.getByText('On the display now:')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('code', { hasText: 'sunny' })).toBeVisible();
});

// ── Friendly condition builder: plugin searchStateKeys → picker → value select ─
// The fixture's SEARCH_BUNDLE exports searchStateKeys with two descriptors
// (an enum door sensor and a numeric temperature). No fixture module is
// placed on any screen: key discovery must work from the loaded plugin alone,
// which is the whole point of search over static provider advertising.

test('searching by friendly name picks a key and the value select stores the raw vocabulary value', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { search: true });

  const gated = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: '', equals: '' }] },
  });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [gated])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator('[data-module-id="text-gated"]').click();
  await page.getByRole('button', { name: 'Conditions' }).click();

  // Type a friendly-name fragment; the plugin's search answers with the door
  // descriptor (grouped under the plugin name + area header).
  const keyInput = page.getByRole('combobox', { name: 'What to check' });
  await keyInput.click();
  await keyInput.fill('door');
  const option = page.getByRole('option').filter({ hasText: 'Back Door Sensor' });
  await expect(option).toBeVisible();
  await expect(option).toContainText('plugin:e2e-fixture:door');
  await autosaved(page, async () => {
    await option.click();
  });
  await expect(keyInput).toHaveValue('plugin:e2e-fixture:door');

  // The value control switches from free text to the raw-vocabulary select;
  // "Open (on)" displays both vocabularies and stores the raw `on`.
  const valueSelect = page.locator('select[aria-label="Value"]');
  await expect(valueSelect).toBeVisible();
  await expect(valueSelect.locator('option', { hasText: 'Open (on)' })).toHaveCount(1);
  await autosaved(page, async () => {
    await valueSelect.selectOption('on');
  });

  await expect
    .poll(async () => (await savedVisibility(request))!.conditions[0])
    .toMatchObject({ kind: 'state', sourceKey: 'plugin:e2e-fixture:door', equals: 'on' });
});

test('a query with no matches says so instead of an empty dropdown', async ({ page, request, sandboxDir }) => {
  // The failure this guards: a search-capable plugin that is unconfigured
  // (or a genuine miss) returns [] and the dropdown used to render nothing —
  // indistinguishable from "search is broken". The hint row names the next
  // step (check the plugin's connection).
  seedFixturePlugin(sandboxDir, { search: true });

  const gated = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: '', equals: '' }] },
  });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [gated])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator('[data-module-id="text-gated"]').click();
  await page.getByRole('button', { name: 'Conditions' }).click();

  const keyInput = page.getByRole('combobox', { name: 'What to check' });
  await keyInput.click();
  await keyInput.fill('zzz-no-such-entity');
  await expect(page.getByTestId('key-search-no-results')).toBeVisible();
  await expect(page.getByTestId('key-search-no-results')).toContainText('No matches');
});

test('a stored numeric condition on a searchable key shows its current value and unit', async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { search: true });

  // Round-trip path: the key was committed in an earlier session; on reopen
  // the editor resolves its descriptor (useStateKeyDescriptor) and surfaces
  // the numeric hint without any user interaction.
  const gated = textModule('GATED', {
    visibility: { conditions: [{ kind: 'numeric', sourceKey: 'plugin:e2e-fixture:temp', above: 70 }] },
  });
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [gated])] }));
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.locator('[data-module-id="text-gated"]').click();
  await page.getByRole('button', { name: 'Conditions' }).click();

  await expect(page.getByText('Current value: 72.5 °F')).toBeVisible();
  // Numeric conditions keep the bounds inputs (no value select).
  await expect(page.getByLabel('Above')).toHaveValue('70');
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

  // The input and the open dropdown <ul> share aria-label "What to check", so target
  // the input by its combobox role to stay unambiguous once the list is open.
  const keyInput = page.getByRole('combobox', { name: 'What to check' });
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

// ── Condition inspector: live verdict chips + header outcome line ──────────
// The editor runs the display's own evaluators over the last-reported
// snapshot: each condition node gets a met/unmet/unknown chip and the header
// states the final outcome, calling out the whenUnknown gate explicitly when
// a referenced key was never published.

test('condition nodes show live verdicts and the header explains the outcome', async ({ page, request }) => {
  await seedDisplaySharedState(request, { [LIVE_KEY]: 'sunny' }, LIVE_DISPLAY);

  const mod = textModule('GATED', {
    visibility: {
      conditions: [
        { kind: 'state', sourceKey: LIVE_KEY, equals: 'sunny' },
        { kind: 'state', sourceKey: LIVE_KEY, equals: 'rainy' },
      ],
    },
  });
  await openConditions(page, request, mod, LIVE_DISPLAY);

  // Node chips from the three-valued evaluator: first matches, second doesn't.
  await expect(page.locator('[data-condition-verdict="met"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-condition-verdict="unmet"]')).toBeVisible();

  // AND semantics: one unmet node hides the module, and the header says so.
  const outcome = page.locator('[data-visibility-outcome]');
  await expect(outcome).toHaveAttribute('data-visibility-outcome', 'hidden');
  await expect(outcome).toContainText('Hidden on the display right now');
});

test('the header calls out an unpublished key as the reason for the outcome', async ({ page, request }) => {
  // The snapshot exists (display online) but publishes a different key, so
  // the condition's key is unknown and the whenUnknown gate decides.
  await seedDisplaySharedState(request, { [LIVE_KEY]: 'sunny' }, LIVE_DISPLAY);

  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:e2e-fixture:never', equals: 'on' }] },
  });
  await openConditions(page, request, mod, LIVE_DISPLAY);

  await expect(page.locator('[data-condition-verdict="unknown"]')).toBeVisible({ timeout: 10_000 });
  const outcome = page.locator('[data-visibility-outcome="hidden"]');
  await expect(outcome).toContainText('waiting for plugin:e2e-fixture:never');
});

test('an unhealthy provider explains a waiting condition in the outcome line', async ({ page, request }) => {
  // The key's owning plugin is reported down, so "waiting for <key>" gains the
  // provider's verbatim message instead of a bare missing-key note.
  await seedDisplaySharedState(
    request,
    { [LIVE_KEY]: 'sunny' },
    LIVE_DISPLAY,
    { 'not-installed': { message: 'Cannot reach the service', since: Date.now() - 30_000 } },
  );

  const mod = textModule('GATED', {
    visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:not-installed:mode', equals: 'on' }] },
  });
  await openConditions(page, request, mod, LIVE_DISPLAY);

  const outcome = page.locator('[data-visibility-outcome="hidden"]');
  await expect(outcome).toContainText('Cannot reach the service', { timeout: 10_000 });
});

// ── Canvas condition badges: the live met/unmet tint on gated modules ──────
// DraggableModule runs the display's own evaluateVisibility over the same
// snapshot the panels use and tags the badge with data-condition-badge.

test('canvas condition badges show live met and unmet verdicts', async ({ page, request }) => {
  await seedDisplaySharedState(request, { [LIVE_KEY]: 'sunny' }, LIVE_DISPLAY);

  const met = textModule('SHOWN', {
    visibility: { conditions: [{ kind: 'state', sourceKey: LIVE_KEY, equals: 'sunny' }] },
  });
  const unmet = textModule('HIDDEN', {
    visibility: { conditions: [{ kind: 'state', sourceKey: LIVE_KEY, equals: 'rainy' }] },
  });
  await putConfig(request, conditionsConfig([met, unmet], LIVE_DISPLAY));
  await page.goto(`/editor?display=${LIVE_DISPLAY}`);
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // No module selected, no panel open — the badge verdicts come from the
  // canvas's own poll (armed because the screen has gated modules).
  await expect(page.locator(`[data-module-id="${met.id}"] [data-condition-badge="met"]`)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`[data-module-id="${unmet.id}"] [data-condition-badge="unmet"]`)).toBeVisible();
});

test('the canvas does not poll shared state while nothing is gated', async ({ page, request }) => {
  // The shared-state GET arms the display's fast re-reporting, so an editor
  // showing zero condition-gated modules must not fire it at all.
  await putConfig(request, conditionsConfig([textModule('PLAIN')]));
  let polled = false;
  await page.route('**/api/display/shared-state*', async (route) => {
    polled = true;
    await route.continue();
  });
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  // The poll fires immediately on mount when armed, so a short settle after
  // the canvas renders is enough to prove its absence.
  await page.waitForTimeout(1_000);
  expect(polled).toBe(false);
});

