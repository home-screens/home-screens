import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { putConfig } from '../helpers/api';
import {
  seedFixturePlugin,
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
