import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { windowAround } from '../helpers/schedule-windows';
import {
  seedFixturePlugin,
  FIXTURE_PLUGIN_TYPE,
  FIXTURE_STATE_KEY,
} from '../helpers/fixture-plugin';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { DisplayRule, ModuleInstance, ScreenConfiguration } from '@/types/config';

/**
 * Display rules end to end on a real display: a shared-state edge fires a
 * `showScreen` takeover that pins its target instead of the rotation, and
 * releases per its mode (`for` deadline / `while` condition-clear after the
 * min hold). State is driven through `window.__HS_SDK__.publishState`, the
 * exact path a plugin producer uses (see shared-state.spec.ts).
 *
 * Keys: the doorbell tests use a key nothing publishes on mount
 * (`plugin:e2e-fixture:ring`) so the spec controls every transition. The
 * boot-safety test uses the fixture plugin's own `flag` key, which its
 * component publishes as 'on' when it mounts — the "condition true at boot"
 * scenario that must NOT fire.
 */

const RING_KEY = 'plugin:e2e-fixture:ring';

function doorbellRule(overrides: Partial<DisplayRule> = {}): DisplayRule {
  return {
    id: 'doorbell',
    name: 'Doorbell',
    when: [{ kind: 'state', sourceKey: RING_KEY, equals: 'on' }],
    action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 4 },
    ...overrides,
  };
}

/** home + cameras screens with the given rules on the legacy config. */
function rulesConfig(rules: DisplayRule[], extraScreens: ReturnType<typeof makeScreen>[] = []): ScreenConfiguration {
  const config = baseConfig({
    screens: [
      makeScreen('home', 'Home', [textModule('HOME ANCHOR', { id: 'home-anchor' })]),
      ...extraScreens,
      makeScreen('cameras', 'Cameras', [textModule('CAMERA SCREEN', { id: 'camera-text' })]),
    ],
  });
  config.rules = rules;
  return config;
}

async function waitForSdk(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window.__HS_SDK__ as { publishState?: unknown } | undefined)?.publishState === 'function',
  );
}

/** Publish through the host SDK; `subKey` is namespaced to `plugin:e2e-fixture:`. */
async function publishState(page: Page, subKey: string, value: string): Promise<void> {
  await page.evaluate(
    ([k, v]) => {
      const sdk = window.__HS_SDK__ as unknown as { publishState(id: string, key: string, value: string): void };
      sdk.publishState('e2e-fixture', k, v);
    },
    [subKey, value] as const,
  );
}

test('a for-mode rule pins its screen on a fresh edge, then rotation resumes where it was', async ({ page, request }) => {
  await renderOnDisplay(page, request, rulesConfig([doorbellRule()]));
  await expect(page.getByText('HOME ANCHOR')).toBeVisible();
  await waitForSdk(page);

  // Known-false baseline, then the edge — the takeover pins the cameras
  // screen even though rotation (frozen at 1h) never left home.
  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect(page.getByText('CAMERA SCREEN')).toBeVisible();
  await expect(page.getByText('HOME ANCHOR')).toHaveCount(0);

  // The 4s deadline releases it back to the same rotation position.
  await expect(page.getByText('HOME ANCHOR')).toBeVisible({ timeout: 10_000 });

  // Edge-triggered: the condition is STILL 'on', but the rule does not
  // re-fire without a fresh false→true transition.
  await page.waitForTimeout(1_500);
  await expect(page.getByText('HOME ANCHOR')).toBeVisible();

  // A fresh edge fires again.
  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect(page.getByText('CAMERA SCREEN')).toBeVisible();
});

test('a while-mode rule holds through the min hold and releases when the condition clears', async ({ page, request }) => {
  await renderOnDisplay(page, request, rulesConfig([
    doorbellRule({ action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } }),
  ]));
  await expect(page.getByText('HOME ANCHOR')).toBeVisible();
  await waitForSdk(page);

  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect(page.getByText('CAMERA SCREEN')).toBeVisible();

  // Clear immediately — inside the 5s min hold the takeover must stay up
  // (flap protection), then release once the hold elapses.
  await publishState(page, 'ring', 'off');
  await page.waitForTimeout(1_000);
  await expect(page.getByText('CAMERA SCREEN')).toBeVisible();
  await expect(page.getByText('HOME ANCHOR')).toBeVisible({ timeout: 10_000 });
});

test('manual navigation during a takeover releases it and the rule does not reassert', async ({ page, request }) => {
  await renderOnDisplay(page, request, rulesConfig(
    [doorbellRule({ action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } })],
    [makeScreen('second', 'Second', [textModule('SECOND SCREEN', { id: 'second-text' })])],
  ));
  await expect(page.getByText('HOME ANCHOR')).toBeVisible();
  await waitForSdk(page);

  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect(page.getByText('CAMERA SCREEN')).toBeVisible();

  // Human wins: navigating via a pagination dot ends the takeover and lands
  // on the chosen screen, even though the condition still holds.
  await page.getByRole('button', { name: 'Go to screen 2: Second' }).click();
  await expect(page.getByText('SECOND SCREEN')).toBeVisible();

  // Still true, no fresh edge — the rule must not reassert.
  await page.waitForTimeout(2_000);
  await expect(page.getByText('SECOND SCREEN')).toBeVisible();
});

test('a rule whose condition is already true at boot does not fire (provider first-publish)', async ({ page, request, sandboxDir }) => {
  // The fixture plugin's component publishes flag='on' when it mounts — from
  // the engine's perspective the key goes unknown→true right after boot,
  // which must NOT count as a firing edge.
  seedFixturePlugin(sandboxDir);
  const plugin: ModuleInstance = {
    id: 'e2e-plugin-1',
    type: FIXTURE_PLUGIN_TYPE,
    position: { x: 0, y: 400 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { label: 'E2E PLUGIN' },
  } as ModuleInstance;

  const config = baseConfig({
    screens: [
      makeScreen('home', 'Home', [textModule('HOME ANCHOR', { id: 'home-anchor' }), plugin]),
      makeScreen('cameras', 'Cameras', [textModule('CAMERA SCREEN', { id: 'camera-text' })]),
    ],
  });
  config.rules = [{
    id: 'flag-rule',
    name: 'Flag',
    when: [{ kind: 'state', sourceKey: FIXTURE_STATE_KEY, equals: 'on' }],
    action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' },
  }];

  await renderOnDisplay(page, request, config);
  // The plugin mounted and published 'on' (its marker is rendered) …
  await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();
  // … but the rule must not have fired: home stays up well past the publish.
  await page.waitForTimeout(2_500);
  await expect(page.getByText('HOME ANCHOR')).toBeVisible();
  await expect(page.getByText('CAMERA SCREEN')).toHaveCount(0);

  // A real edge (known false → true) fires.
  await waitForSdk(page);
  await publishState(page, 'flag', 'off');
  await publishState(page, 'flag', 'on');
  await expect(page.getByText('CAMERA SCREEN')).toBeVisible();
});

test('a takeover surfaces on a sleeping display and sleep resumes when it releases', async ({ page, request }) => {
  test.setTimeout(90_000);
  // Scheduled sleep covering "now" (same bracketing as sleep.spec.ts); the
  // 10s sleep-manager interval means the display settles asleep after ~10s.
  const config = rulesConfig([
    doorbellRule({ action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 6 } }),
  ]);
  config.settings.sleep = {
    enabled: true,
    dimAfterMinutes: 600,
    sleepAfterMinutes: 600,
    dimBrightness: 40,
    schedule: windowAround(-120, 120),
  };
  await renderOnDisplay(page, request, config);
  await waitForSdk(page);

  // The SleepOverlay's dim layer (z-index 9997) goes fully opaque when asleep.
  const overlayOpacity = async () => {
    const layer = page.locator('div[style*="z-index: 9997"] > div').first();
    if ((await layer.count()) === 0) return 0;
    return Number.parseFloat(await layer.evaluate((el) => getComputedStyle(el).opacity));
  };
  await expect.poll(overlayOpacity, { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0.98);

  // A rule fires while asleep: the overlay is suppressed (not woken) so the
  // alert screen is actually visible — the doorbell-at-night scenario.
  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect(page.getByText('CAMERA SCREEN')).toBeVisible();
  await expect.poll(overlayOpacity, { timeout: 10_000, intervals: [250] }).toBeLessThan(0.02);

  // At the 6s deadline the takeover releases and the still-scheduled sleep
  // re-asserts itself — the display goes black again without a wake command.
  await expect.poll(overlayOpacity, { timeout: 30_000, intervals: [500] }).toBeGreaterThan(0.98);
});

test('a sleep rule puts the display to sleep on a fresh edge (no schedule involved)', async ({ page, request }) => {
  test.setTimeout(60_000);
  const config = rulesConfig([
    doorbellRule({ id: 'nightfall', name: 'Nightfall', action: { kind: 'sleep' } }),
  ]);
  // Sleep must be enabled for the overlay to render, but with no schedule and
  // huge idle timeouts nothing sleeps the display except the rule itself.
  config.settings.sleep = {
    enabled: true,
    dimAfterMinutes: 600,
    sleepAfterMinutes: 600,
    dimBrightness: 40,
  };
  await renderOnDisplay(page, request, config);
  await expect(page.getByText('HOME ANCHOR')).toBeVisible();
  await waitForSdk(page);

  const overlayOpacity = async () => {
    const layer = page.locator('div[style*="z-index: 9997"] > div').first();
    if ((await layer.count()) === 0) return 0;
    return Number.parseFloat(await layer.evaluate((el) => getComputedStyle(el).opacity));
  };
  // Awake to start — the overlay is transparent.
  await expect.poll(overlayOpacity, { timeout: 5_000, intervals: [250] }).toBeLessThan(0.02);

  // The edge fires the sleep rule: the display blacks out exactly like the
  // remote sleep command (a `sleep` action creates no takeover).
  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect.poll(overlayOpacity, { timeout: 10_000, intervals: [250] }).toBeGreaterThan(0.98);

  // The rotation screen is untouched underneath the opaque overlay — sleep did
  // not pin a takeover, so home is still the rendered screen.
  await expect(page.getByText('HOME ANCHOR')).toBeVisible();
});

test('the status heartbeat names the takeover screen while a rule is firing', async ({ page, request }) => {
  const config = baseConfig({
    displays: [{
      id: 'kiosk',
      name: 'Kiosk',
      screens: [
        makeScreen('home', 'Home', [textModule('KIOSK HOME', { id: 'kiosk-home' })]),
        makeScreen('cameras', 'Cameras', [textModule('KIOSK CAMERAS', { id: 'kiosk-cameras' })]),
      ],
      rules: [doorbellRule({ action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 10 } })],
    }],
  });
  await renderOnDisplay(page, request, config, '/display/kiosk');
  await waitForSdk(page);

  const reportedScreen = async () => {
    const res = await request.get('/api/display/status?display=kiosk');
    if (!res.ok()) return null;
    const status = await res.json();
    return status?.currentScreen ?? null;
  };
  await expect.poll(reportedScreen, { timeout: 12_000 }).toMatchObject({ id: 'home' });

  // The takeover swaps the rendered screen without touching the rotation
  // index — the heartbeat must still re-post so the editor's "currently
  // showing" readout names the takeover screen, not the frozen rotation.
  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect(page.getByText('KIOSK CAMERAS')).toBeVisible();
  await expect.poll(reportedScreen, { timeout: 12_000 }).toMatchObject({ id: 'cameras', name: 'Cameras' });

  // And back to truth again once the takeover releases.
  await expect(page.getByText('KIOSK HOME')).toBeVisible({ timeout: 20_000 });
  await expect.poll(reportedScreen, { timeout: 12_000 }).toMatchObject({ id: 'home' });
});

test('rules on a DisplayNode drive that display (multi-display filter path)', async ({ page, request }) => {
  const config = baseConfig({
    displays: [{
      id: 'kiosk',
      name: 'Kiosk',
      screens: [
        makeScreen('home', 'Home', [textModule('KIOSK HOME', { id: 'kiosk-home' })]),
        makeScreen('cameras', 'Cameras', [textModule('KIOSK CAMERAS', { id: 'kiosk-cameras' })]),
      ],
      rules: [doorbellRule()],
    }],
  });

  await renderOnDisplay(page, request, config, '/display/kiosk');
  await expect(page.getByText('KIOSK HOME')).toBeVisible();
  await waitForSdk(page);

  await publishState(page, 'ring', 'off');
  await publishState(page, 'ring', 'on');
  await expect(page.getByText('KIOSK CAMERAS')).toBeVisible();
  await expect(page.getByText('KIOSK HOME')).toBeVisible({ timeout: 10_000 });
});
