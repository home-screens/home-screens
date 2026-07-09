import { test, expect } from '../fixtures';
import type { Page, APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { putConfig } from '../helpers/api';
import { writeSandboxFile } from '../helpers/sandbox';
import {
  seedFixturePlugin,
  FIXTURE_PLUGIN_ID,
  FIXTURE_PLUGIN_TYPE,
  FIXTURE_STATE_KEY,
} from '../helpers/fixture-plugin';
import { UNKNOWN_VALUE_PLACEHOLDER } from '@/lib/shared-state-template';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, ModuleVisibility } from '@/types/config';

/**
 * Shared-state bus, end to end on a real display.
 *
 * The only producer wired for E2E is the fixture plugin: its component
 * publishes `plugin:e2e-fixture:flag = "on"` on mount via the host SDK. The
 * same `window.__HS_SDK__` surface (mounted by PluginGlobals in the root
 * layout, present on every route) also exposes `publishState` / `clearState`,
 * so a test can drive value changes and clears through the exact path a plugin
 * uses — no store poking. `publishState(pluginId, key, value)` force-namespaces
 * the key to `plugin:<id>:<key>`, so the short sub-key (`flag`) maps to the
 * full `FIXTURE_STATE_KEY` a condition references.
 */

// Second key the fixture plugin does NOT publish; the test drives it directly.
const LEVEL_KEY = 'plugin:e2e-fixture:level';
// A third key the fixture plugin never publishes — used by the watched/unwatched
// timing test, which drives it through the SDK and reads it back off the hub.
const WATCH_KEY = 'plugin:e2e-fixture:watch';

/**
 * Rewrite the sandbox's `plugins/installed.json` to hold exactly one entry per
 * given version (or none). A live display polls `/api/plugins/installed` every
 * 3s; changing the set changes the `pluginHash` it returns, which drives the
 * display's `loadAllPlugins` reload on the next poll. An empty list removes the
 * fixture plugin entirely; a bumped version keeps it installed across a reload.
 */
function writeInstalled(sandboxDir: string, versions: string[]): void {
  writeSandboxFile(sandboxDir, 'plugins/installed.json', {
    schemaVersion: 1,
    plugins: versions.map((version) => ({
      id: FIXTURE_PLUGIN_ID,
      version,
      installedAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
      moduleType: FIXTURE_PLUGIN_ID,
    })),
  });
}

/** Read one key's value out of the hub's per-display shared-state snapshot.
 *  NOTE: this GET also marks the editor's "interest" in the display (15s TTL),
 *  which is what arms the display's fast bus-change re-reporting. */
async function readHubSharedState(
  request: APIRequestContext,
  displayId: string,
  key: string,
): Promise<string | null> {
  const res = await request.get(`/api/display/shared-state?display=${encodeURIComponent(displayId)}`);
  if (!res.ok()) return null;
  const body = (await res.json()) as { entries?: Record<string, { value?: string }> };
  return body.entries?.[key]?.value ?? null;
}

function pluginModule(overrides: Partial<ModuleInstance> = {}): ModuleInstance {
  return {
    id: 'e2e-plugin-1',
    type: FIXTURE_PLUGIN_TYPE,
    position: { x: 0, y: 0 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { label: 'E2E PLUGIN' },
    ...overrides,
  } as ModuleInstance;
}

function conditioned(id: string, content: string, visibility: ModuleVisibility): ModuleInstance {
  return textModule(content, { id, visibility });
}

/** A text module rendering `content` verbatim (tokens + template vars resolve at render). */
function tokenText(id: string, content: string, templateVariables: boolean): ModuleInstance {
  return textModule(content, {
    id,
    config: { content, templateVariables, alignment: 'center' },
  });
}

/** Wait until the host SDK is installed on `window` (PluginGlobals mount). */
async function waitForSdk(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window.__HS_SDK__ as { publishState?: unknown } | undefined)?.publishState === 'function',
  );
}

/** Publish through the host SDK, exactly as a plugin would. `subKey` is namespaced to `plugin:e2e-fixture:`. */
async function publishState(page: Page, subKey: string, value: string): Promise<void> {
  await page.evaluate(
    ([k, v]) => {
      const sdk = window.__HS_SDK__ as unknown as { publishState(id: string, key: string, value: string): void };
      sdk.publishState('e2e-fixture', k, v);
    },
    [subKey, value] as const,
  );
}

/** Clear (tombstone) a key through the host SDK. */
async function clearState(page: Page, subKey: string): Promise<void> {
  await page.evaluate((k) => {
    const sdk = window.__HS_SDK__ as unknown as { clearState(id: string, key: string): void };
    sdk.clearState('e2e-fixture', k);
  }, subKey);
}

// Seed the fixture plugin before any navigation so the first installed-plugins
// read (on page load) registers it.
test.beforeEach(async ({ sandboxDir }) => {
  seedFixturePlugin(sandboxDir);
});

test('a plugin-published key gates a module and flips it live when the value changes', async ({ page, request }) => {
  const gate: ModuleVisibility = {
    conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }],
    whenUnknown: 'hide',
  };
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule(), conditioned('gated', 'GATED CONTENT', gate)])],
  }));

  // The plugin publishes flag=on on mount → the condition (equals 'on') is met.
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('GATED CONTENT')).toBeVisible();

  // Producer changes the value → the consumer hides live, no reload.
  await publishState(page, 'flag', 'off');
  await expect(page.locator('[data-module-id="gated"]')).toHaveCount(0);

  // Back to a matching value → the module returns.
  await publishState(page, 'flag', 'on');
  await expect(page.getByText('GATED CONTENT')).toBeVisible();
});

test('numeric / and / or / not conditions evaluate and flip on live value changes', async ({ page, request }) => {
  const numMod = conditioned('num-mod', 'NUM MOD', {
    conditions: [{ kind: 'numeric', sourceKey: LEVEL_KEY, above: 50 }],
    whenUnknown: 'hide',
  });
  const andMod = conditioned('and-mod', 'AND MOD', {
    conditions: [{
      kind: 'and',
      conditions: [
        { kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' },
        { kind: 'numeric', sourceKey: LEVEL_KEY, above: 50 },
      ],
    }],
    whenUnknown: 'hide',
  });
  const orMod = conditioned('or-mod', 'OR MOD', {
    conditions: [{
      kind: 'or',
      conditions: [
        { kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' },
        { kind: 'numeric', sourceKey: LEVEL_KEY, above: 50 },
      ],
    }],
    whenUnknown: 'hide',
  });
  const notMod = conditioned('not-mod', 'NOT MOD', {
    conditions: [{ kind: 'not', conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'off' }] }],
    whenUnknown: 'hide',
  });

  // A plain anchor module keeps the screen non-empty while every conditioned
  // module starts hidden (its referenced keys are unpublished).
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [textModule('READY', { id: 'anchor' }), numMod, andMod, orMod, notMod])],
  }));
  await waitForSdk(page);

  // flag=on, level=75: numeric(>50) ✓, and(on ∧ >50) ✓, or ✓, not(!off) ✓.
  await publishState(page, 'flag', 'on');
  await publishState(page, 'level', '75');
  await expect(page.locator('[data-module-id="num-mod"]')).toBeVisible();
  await expect(page.locator('[data-module-id="and-mod"]')).toBeVisible();
  await expect(page.locator('[data-module-id="or-mod"]')).toBeVisible();
  await expect(page.locator('[data-module-id="not-mod"]')).toBeVisible();

  // level=25: numeric fails, so numeric + and hide; or still holds via flag=on; not unaffected.
  await publishState(page, 'level', '25');
  await expect(page.locator('[data-module-id="num-mod"]')).toHaveCount(0);
  await expect(page.locator('[data-module-id="and-mod"]')).toHaveCount(0);
  await expect(page.locator('[data-module-id="or-mod"]')).toBeVisible();
  await expect(page.locator('[data-module-id="not-mod"]')).toBeVisible();

  // flag=off: or now has neither branch true; not(off) becomes false → both hide.
  await publishState(page, 'flag', 'off');
  await expect(page.locator('[data-module-id="or-mod"]')).toHaveCount(0);
  await expect(page.locator('[data-module-id="not-mod"]')).toHaveCount(0);
});

test('clearing a key holds its last value through the grace window, and a fresh publish writes through the tombstone', async ({ page, request }) => {
  const gate: ModuleVisibility = {
    conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }],
    whenUnknown: 'hide',
  };
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule(), conditioned('gated', 'GRACE CONTENT', gate)])],
  }));
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('GRACE CONTENT')).toBeVisible();

  // Clearing tombstones the key: its last value ('on') is held for a 15s grace
  // window. An immediate delete would make the key unknown and (whenUnknown:
  // hide) drop the module — so the module staying put well inside the window
  // proves the grace-hold (no blink on a routine producer restart).
  await clearState(page, 'flag');
  await page.waitForTimeout(2000);
  await expect(page.getByText('GRACE CONTENT')).toBeVisible();

  // A fresh publish must WRITE THROUGH the tombstone (the store never coalesces
  // a publish onto a stale entry). Publishing a DIFFERENT value flips the gate,
  // which proves the publish genuinely revived the entry — not that the module
  // merely coasted on the grace hold.
  await publishState(page, 'flag', 'off');
  await expect(page.locator('[data-module-id="gated"]')).toHaveCount(0);

  // And reviving back to the matching value shows it again.
  await publishState(page, 'flag', 'on');
  await expect(page.getByText('GRACE CONTENT')).toBeVisible();
});

/**
 * A `backgroundProvider: true` module renders only in the hidden
 * BackgroundProviderLayer, keeps its data loop running across screen rotation,
 * and publishes state that gates a conditioned module.
 *
 * The ONLY producer wired for E2E is the fixture plugin, and here it is used
 * purely as a background provider. Plugin bundles register asynchronously AFTER
 * the layer's first render, and none of the layer's memoized props
 * (`[screens, settings, sharedData]`) change identity on registration — so the
 * layer subscribes to the plugin store's registration count directly and
 * re-renders when the bundle registers, at which point `getModuleComponent`
 * resolves and the provider mounts and publishes. (Before that subscription
 * existed the provider never mounted, since memo blocked the only re-render
 * that could have picked up the now-available component.)
 *
 * Rotation is a comfortable 2.5s per screen so each screen lingers well above
 * Playwright's poll cadence — the A → B → A sequence below must not race a fast
 * interval.
 */
test('a background-provider module publishes state and keeps running across screen rotation', async ({ page, request }) => {
  const gate: ModuleVisibility = {
    conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }],
    whenUnknown: 'hide',
  };
  const bgProvider = pluginModule({ id: 'bg-provider', backgroundProvider: true });

  await putConfig(request, baseConfig({
    settings: { rotationIntervalMs: 2500 },
    screens: [
      makeScreen('a', 'A', [textModule('ANCHOR A', { id: 'anchor-a' }), bgProvider, conditioned('gated', 'SCREEN A GATED', gate)]),
      makeScreen('b', 'B', [textModule('SCREEN B', { id: 'screen-b' })]),
    ],
  }));
  await page.goto('/display');
  await expect(page.getByText('ANCHOR A')).toBeVisible();

  const marker = page.locator('[data-plugin-marker="e2e"]');

  // On screen A: the provider renders ONLY in the hidden background layer — it
  // has no on-screen module wrapper — yet its published state gates the module.
  await expect(page.getByText('SCREEN A GATED')).toBeVisible({ timeout: 5000 });
  await expect(page.locator(`[data-module-type="${FIXTURE_PLUGIN_TYPE}"]`)).toHaveCount(0);
  await expect(marker).toBeAttached();

  // Rotate to screen B (contains neither the provider nor the gated module).
  // The provider stays mounted in the background layer across rotation.
  await expect(page.getByText('SCREEN B')).toBeVisible();
  await expect(marker).toBeAttached();

  // Rotate back to screen A: the gate is still satisfied — the state never lapsed.
  await expect(page.getByText('SCREEN A GATED')).toBeVisible();
});

test('the Text module resolves state tokens and template variables, en-dash for unknown keys', async ({ page, request }) => {
  const withVars = tokenText(
    'tokens',
    `flag=[{${FIXTURE_STATE_KEY}}] time=[{{time}}] missing=[{plugin:e2e-fixture:missing}]`,
    true,
  );
  // templateVariables OFF: `{{time}}` must stay literal (the token matcher's
  // lookbehind must not half-resolve a double-brace var as a state token).
  const literal = tokenText('literal', 'literal=[{{time}}]', false);

  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule(), withVars, literal])],
  }));
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();

  const tokens = page.locator('[data-module-id="tokens"]');
  // Plugin published flag=on → token resolves; {{time}} → HH:MM; unknown key → en dash.
  await expect(tokens).toContainText('flag=[on]');
  await expect(tokens).toContainText(/time=\[\d{2}:\d{2}\]/);
  await expect(tokens).toContainText(`missing=[${UNKNOWN_VALUE_PLACEHOLDER}]`);

  // A double-brace variable with templateVariables off is passed through untouched.
  await expect(page.locator('[data-module-id="literal"]')).toContainText('literal=[{{time}}]');

  // The token tracks live producer updates.
  await publishState(page, 'flag', 'off');
  await expect(tokens).toContainText('flag=[off]');
});

/**
 * Plugin reload — PURGE side of the swap. When the plugin is uninstalled and
 * the display reloads its plugin set, `loadAllPlugins` finds the plugin gone
 * from the new set and tombstones its `plugin:<id>:*` keys
 * (src/lib/plugin-loader.ts). A module conditioned on one of those keys then
 * flips per its `whenUnknown` — but only AFTER the 15s tombstone grace, since a
 * purge holds the last value first (routine restarts must not blink).
 */
test('uninstalling a plugin purges its shared-state keys on reload; the gated module hides after the grace window', async ({ page, request, sandboxDir }) => {
  test.setTimeout(50_000);
  const gate: ModuleVisibility = {
    conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }],
    whenUnknown: 'hide',
  };
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule(), conditioned('gated', 'PURGE CONTENT', gate)])],
  }));
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  await expect(page.getByText('PURGE CONTENT')).toBeVisible();

  // The display's config poll records the current plugin hash on its first
  // pass WITHOUT reloading; mutating installed.json before that lands would
  // just reset the baseline and never trigger a reload. One poll cycle (3s) is
  // plenty — wait past it before removing the plugin.
  await page.waitForTimeout(4000);

  // Remove the plugin. Next poll (≤3s) sees a changed pluginHash → reload →
  // e2e-fixture is gone from the new set → its keys tombstone (15s grace).
  writeInstalled(sandboxDir, []);

  // Through the grace window the gate still reads 'on', so the module stays.
  // Once the tombstone expires the key is unknown and whenUnknown:hide drops
  // it — the reload (≤3s) + grace (15s) fits comfortably under this bound.
  await expect(page.locator('[data-module-id="gated"]')).toHaveCount(0, { timeout: 25_000 });
});

/**
 * Plugin reload — PRESERVE side of the swap. When the plugin stays installed
 * across a reload, `loadAllPlugins` keeps its shared-state keys (the reload is
 * a swap, not a purge). We prove this with a key the plugin never republishes
 * (`level`): if the reload had purged it, the level-gated module would tombstone
 * and hide ~15s later; because the plugin is kept, the key is never touched and
 * the module stays put well past that window.
 *
 * A second module gated on the plugin's OWN key (`flag`) is the reload witness:
 * we force `flag=off` (hiding it) just before the reload, and only the plugin's
 * remounted producer republishes `flag=on`, so its reappearance confirms the
 * reload actually fired.
 */
test('reloading with the plugin still installed preserves its shared-state keys (swap, not purge)', async ({ page, request, sandboxDir }) => {
  test.setTimeout(60_000);
  const flagGate = conditioned('flag-mod', 'FLAG MOD', {
    conditions: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }],
    whenUnknown: 'hide',
  });
  const levelGate = conditioned('level-mod', 'LEVEL MOD', {
    conditions: [{ kind: 'numeric', sourceKey: LEVEL_KEY, above: 50 }],
    whenUnknown: 'hide',
  });
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [pluginModule(), flagGate, levelGate])],
  }));
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  // Plugin published flag=on on mount → FLAG MOD visible.
  await expect(page.getByText('FLAG MOD')).toBeVisible();

  // Drive `level` (a key the plugin never publishes) high → LEVEL MOD visible.
  await publishState(page, 'level', '75');
  await expect(page.getByText('LEVEL MOD')).toBeVisible();

  // Let the display record its baseline plugin hash before we bump it.
  await page.waitForTimeout(4000);

  // Force flag=off so FLAG MOD hides — its later reappearance can then only be
  // the remounted plugin republishing flag=on, i.e. proof the reload happened.
  await publishState(page, 'flag', 'off');
  await expect(page.locator('[data-module-id="flag-mod"]')).toHaveCount(0);

  // Keep the plugin installed but bump its version → changed pluginHash →
  // reload. The plugin remounts (republishing flag=on) and its keys are NOT
  // purged (it is still in the new set).
  writeInstalled(sandboxDir, ['2.0.0']);

  // Reload witnessed: only the remounted producer republishes flag=on.
  await expect(page.getByText('FLAG MOD')).toBeVisible({ timeout: 20_000 });

  // `level` survived the swap: LEVEL MOD is still up right after the reload and
  // remains up past the tombstone TTL — had the reload purged the key, it would
  // have gone unknown ~15s after the reload and hidden the module.
  await expect(page.getByText('LEVEL MOD')).toBeVisible();
  await page.waitForTimeout(16_000);
  await expect(page.getByText('LEVEL MOD')).toBeVisible();
});

/**
 * BackgroundProviderLayer mount accounting. Two provider instances with the
 * same type + config (across two screens) dedupe to a SINGLE hidden mount via
 * `stableConfigKey`; a provider with a DIFFERENT config gets its own mount; and
 * an `enabled: false` provider mounts zero times
 * (src/components/display/BackgroundProviderLayer.tsx).
 *
 * Background providers are excluded from ScreenRenderer, so every
 * `data-plugin-marker="e2e"` in the DOM is a background-layer mount — the layer
 * is hidden + zero-size, so we count with toHaveCount (attachment), never
 * visibility. Distinct `config.label` values let each mount be counted apart.
 */
test('the background-provider layer dedupes identical providers and skips disabled ones', async ({ page, request }) => {
  const bg = (id: string, label: string, extra: Partial<ModuleInstance> = {}) =>
    pluginModule({ id, backgroundProvider: true, config: { label }, ...extra });

  await renderOnDisplay(page, request, baseConfig({
    screens: [
      makeScreen('a', 'A', [
        textModule('BG ANCHOR', { id: 'anchor' }),
        bg('dedupe-1', 'DEDUPEME'),
        bg('active-1', 'ACTIVEBG'),
        bg('disabled-1', 'DISABLEDBG', { enabled: false }),
      ]),
      // Same type + config as dedupe-1 → collapses to one shared mount even
      // though it lives on a different (rotated-out) screen; the layer sees all
      // configured screens, not just the visible one.
      makeScreen('b', 'B', [bg('dedupe-2', 'DEDUPEME')]),
    ],
  }));

  const marker = page.locator('[data-plugin-marker="e2e"]');
  // ACTIVEBG proves the plugin registered and the layer mounted its providers.
  await expect(marker.filter({ hasText: 'ACTIVEBG' })).toHaveCount(1);
  // Two identical providers across two screens → exactly one deduped mount.
  await expect(marker.filter({ hasText: 'DEDUPEME' })).toHaveCount(1);
  // The disabled provider never mounts.
  await expect(marker.filter({ hasText: 'DISABLEDBG' })).toHaveCount(0);
});

/**
 * `sharedStateWatched` arming. The editor polling GET /api/display/shared-state
 * marks per-display interest (15s TTL); the kiosk's commands drain returns
 * `sharedStateWatched:true`, which arms a fast throttled status re-report on bus
 * changes. Unwatched, a bus change instead rides the 30s heartbeat.
 *
 * A distinct display id keeps this test's per-worker interest/report maps
 * isolated from every other spec. Margins are deliberately wide: we prove the
 * WATCHED path reaches the hub well under 30s and the UNWATCHED path does not
 * arrive within a bounded short window — never exact intervals.
 */
test('an editor watching a display arms fast shared-state re-reporting; an unwatched change rides the heartbeat', async ({ page, request }) => {
  test.setTimeout(60_000);
  const DISPLAY = 'ss-timing';
  await putConfig(request, baseConfig({
    displays: [{
      id: DISPLAY,
      name: DISPLAY,
      screens: [makeScreen('s1', 'S1', [textModule('TIMING ANCHOR', { id: 'anchor' })])],
    }],
  }));
  await page.goto(`/display/${DISPLAY}`);
  await expect(page.getByText('TIMING ANCHOR')).toBeVisible();
  await waitForSdk(page);

  // --- UNWATCHED: no editor has read this display's shared-state, so the
  // command drain reports sharedStateWatched:false and never arms.
  //
  // First CONFIRM the display's initial status heartbeat has fired, so the
  // "did not arrive" assertion below can't be undermined by a delayed first
  // heartbeat coincidentally carrying `unwatched-1`. We probe GET /status (not
  // GET /shared-state) because /status reads the heartbeat WITHOUT marking
  // shared-state interest — reading /shared-state here would arm the display
  // and defeat the unwatched premise. baseConfig has one screen and no sleep
  // settings, so the display's status key never changes after mount: this
  // first heartbeat is the only unforced status POST until the 30s periodic,
  // and it carried an empty snapshot (published before `unwatched-1`).
  await expect
    .poll(async () => (await request.get(`/api/display/status?display=${DISPLAY}`)).status(), {
      timeout: 15_000,
      intervals: [500],
    })
    .toBe(200);

  await publishState(page, 'watch', 'unwatched-1');
  // Deliberately do NOT read the hub yet — the read itself marks interest.
  // Let a window longer than the watched fast-path latency pass with no
  // interest; the change must not have reached the hub. No status POST fires in
  // this window: the display is unwatched (no armed bus-change report), the
  // single significant-change heartbeat already fired above, and the 30s
  // periodic is still far off this early in the page's life.
  await page.waitForTimeout(6000);
  expect(await readHubSharedState(request, DISPLAY, WATCH_KEY)).not.toBe('unwatched-1');

  // --- WATCHED: the read above marked interest. Keep reading so interest stays
  // fresh and the display's next command drains observe sharedStateWatched:true
  // and arm fast reporting.
  for (let i = 0; i < 4; i++) {
    await readHubSharedState(request, DISPLAY, WATCH_KEY);
    await page.waitForTimeout(2000);
  }
  // Now armed: a fresh bus change fast-reports and reaches the hub quickly.
  await publishState(page, 'watch', 'watched-2');
  await expect
    .poll(() => readHubSharedState(request, DISPLAY, WATCH_KEY), { timeout: 15_000, intervals: [1000] })
    .toBe('watched-2');
});
