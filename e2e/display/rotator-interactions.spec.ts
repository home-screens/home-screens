import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, Profile } from '@/types/config';
import { seedFixturePlugin, FIXTURE_PLUGIN_TYPE } from '../helpers/fixture-plugin';

/**
 * ScreenRotator touch-interaction cluster: the pagination-dot controls
 * (single tap = navigate + reset timer, double-tap = pause/resume), the
 * pause auto-resume / opt-out settings, plugin-driven navigation events, and
 * the screen-set-switch reset. These exercise ScreenRotator's `handleDotClick`
 * / `useScreenRotationTimer` / `pluginEventBus` wiring — see
 * src/components/display/ScreenRotator.tsx.
 *
 * Selectors are anchored to the component's real accessibility contract:
 *   - each dot is a <button>; the active one carries aria-current="true",
 *   - an inactive dot's aria-label is `Go to screen ${n}: ${name}`,
 *   - the paused state renders a visible "PAUSED" text label.
 *
 * Timing is the subject of several assertions, so durations are kept short and
 * every timing claim is proven with a bounded negative wait ("did not advance
 * early") followed by a positive expect with generous slack ("did advance
 * later") — never an exact deadline.
 */

/** Three distinctly-labelled screens; ids match the pagination order. */
function threeScreens() {
  return [
    makeScreen('a', 'A', [textModule('ROTATOR SCREEN A')]),
    makeScreen('b', 'B', [textModule('ROTATOR SCREEN B')]),
    makeScreen('c', 'C', [textModule('ROTATOR SCREEN C')]),
  ];
}

const A = 'ROTATOR SCREEN A';
const B = 'ROTATOR SCREEN B';
const C = 'ROTATOR SCREEN C';

// ---------------------------------------------------------------------------
// Pagination dots: single tap navigates and resets the rotation timer.
// ---------------------------------------------------------------------------

test('a single tap on a dot navigates to that screen, moves aria-current, and resets the rotation timer', async ({ page, request }) => {
  // A 2s interval is short enough to observe an auto-advance yet long enough to
  // leave a comfortable margin between "old timer would have fired" and "new
  // timer fires". Screen A is the wrap-target after C, so its reappearance is
  // the auto-advance signal.
  const T = 2000;
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreens(),
    settings: { rotationIntervalMs: T },
  }));

  await expect(page.getByText(A, { exact: true })).toBeVisible();

  // Let most of A's dwell window elapse, THEN jump to C. If the tap did not
  // reset the timer, A's residual (~T left minus what elapsed) would fire
  // shortly after the tap and advance C away almost immediately.
  await page.waitForTimeout(1700);
  await page.getByRole('button', { name: 'Go to screen 3: C' }).click();

  // The tap navigated to C and moved the active marker onto C's dot.
  await expect(page.getByText(C, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause rotation (double-tap)' }))
    .toHaveAttribute('aria-current', 'true');

  // "Did not advance early": A's pre-tap deadline was ~300ms after the tap; a
  // 1000ms hold sails well past it. C is still shown and its wrap-target A has
  // not mounted — proof the old schedule was discarded.
  await page.waitForTimeout(1000);
  await expect(page.getByText(C, { exact: true })).toBeVisible();
  await expect(page.getByText(A, { exact: true })).toHaveCount(0);

  // "Did advance later": the reset granted C a fresh full interval, after which
  // it wraps to A. Generous timeout — no exact deadline is asserted.
  await expect(page.getByText(A, { exact: true })).toBeVisible({ timeout: 4000 });
});

// ---------------------------------------------------------------------------
// Double-tap the active dot toggles pause.
// ---------------------------------------------------------------------------

test('double-tapping the active dot pauses rotation; double-tapping again resumes it', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreens(),
    // Frozen interval — this test is about the pause toggle, not auto-advance.
    settings: { rotationIntervalMs: 3_600_000 },
  }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  // First double-tap pauses (the two synthetic clicks land inside the 300ms
  // double-tap window ScreenRotator checks in handleDotClick).
  await page.locator('button[aria-current="true"]').dblclick();
  await expect(page.getByText('PAUSED')).toBeVisible();

  // Second double-tap on the same (still-active) dot resumes.
  await page.locator('button[aria-current="true"]').dblclick();
  await expect(page.getByText('PAUSED')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// pauseTimeoutSeconds / pauseEnabled settings.
// ---------------------------------------------------------------------------

test('a paused rotator auto-resumes after pauseTimeoutSeconds', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreens(),
    settings: { rotationIntervalMs: 3_600_000, pauseTimeoutSeconds: 2 },
  }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  await page.locator('button[aria-current="true"]').dblclick();
  await expect(page.getByText('PAUSED')).toBeVisible();

  // The 2s auto-resume timer clears pause on its own; PAUSED disappears well
  // within the generous timeout.
  await expect(page.getByText('PAUSED')).toHaveCount(0, { timeout: 6000 });
});

test('pauseTimeoutSeconds:0 keeps the rotator paused past a normal timeout window', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreens(),
    settings: { rotationIntervalMs: 3_600_000, pauseTimeoutSeconds: 0 },
  }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  await page.locator('button[aria-current="true"]').dblclick();
  await expect(page.getByText('PAUSED')).toBeVisible();

  // 0 means "stay paused indefinitely" — no auto-resume timer is armed. Hold
  // past a window that a small non-zero timeout would have resumed within.
  await page.waitForTimeout(3000);
  await expect(page.getByText('PAUSED')).toBeVisible();
});

test('pauseEnabled:false makes double-tapping the active dot a no-op', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreens(),
    settings: { rotationIntervalMs: 3_600_000, pauseEnabled: false },
  }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  // With the feature disabled, handleDotClick never toggles pause — the
  // double-tap collapses to same-index navigation with no visible effect.
  await page.locator('button[aria-current="true"]').dblclick();
  await page.waitForTimeout(500);
  await expect(page.getByText('PAUSED')).toHaveCount(0);
  // Still parked on the same screen.
  await expect(page.getByText(A, { exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Plugin-driven navigation events (SDK.emit → pluginEventBus → ScreenRotator).
// ---------------------------------------------------------------------------

test.describe('plugin navigate events', () => {
  // The nav bundle renders next/prev/goto-2 buttons, each firing a real
  // `navigate` event through the same SDK.emit path a shipped plugin uses.
  test.beforeEach(async ({ sandboxDir }) => {
    seedFixturePlugin(sandboxDir, { nav: true });
  });

  function navPluginModule(): ModuleInstance {
    return {
      id: 'nav-plugin',
      type: FIXTURE_PLUGIN_TYPE,
      position: { x: 0, y: 0 },
      size: { w: 400, h: 300 },
      zIndex: 1,
      style: { ...DEFAULT_MODULE_STYLE },
      config: { label: 'NAV PLUGIN' },
    } as ModuleInstance;
  }

  /** Plugin lives on screen A (index 0); B and C are plain text screens. */
  function pluginFirstScreens() {
    return [
      makeScreen('a', 'A', [navPluginModule()]),
      makeScreen('b', 'B', [textModule(B)]),
      makeScreen('c', 'C', [textModule(C)]),
    ];
  }

  test("a plugin's next event advances the rotator", async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: pluginFirstScreens(),
      settings: { rotationIntervalMs: 3_600_000 },
    }));
    await page.goto('/display');
    await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();

    await page.locator('[data-plugin-nav="next"]').click();
    await expect(page.getByText(B, { exact: true })).toBeVisible();
  });

  test("a plugin's prev event moves the rotator backward (wrapping to the last screen)", async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: pluginFirstScreens(),
      settings: { rotationIntervalMs: 3_600_000 },
    }));
    await page.goto('/display');
    await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();

    // From index 0, prev wraps to the last screen (C).
    await page.locator('[data-plugin-nav="prev"]').click();
    await expect(page.getByText(C, { exact: true })).toBeVisible();
  });

  test("a plugin's goto event jumps to the targeted screen index", async ({ page, request }) => {
    await putConfig(request, baseConfig({
      screens: pluginFirstScreens(),
      settings: { rotationIntervalMs: 3_600_000 },
    }));
    await page.goto('/display');
    await expect(page.locator('[data-plugin-marker="e2e"]')).toBeVisible();

    // goto-2 emits { direction: 'screen', screenIndex: 2 } → screen C.
    await page.locator('[data-plugin-nav="goto-2"]').click();
    await expect(page.getByText(C, { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Screen-set switch (profile activation) resets index to 0 and clears pause.
// ---------------------------------------------------------------------------

test('activating a profile mid-session resets the rotator to the first screen and clears pause', async ({ page, request }) => {
  // Start with all three screens and no active profile. The profile is defined
  // but dormant (no schedule, not active), so all screens rotate initially.
  const profile: Profile = { id: 'subset', name: 'Subset', screenIds: ['a', 'b'] };
  const config = baseConfig({
    screens: threeScreens(),
    settings: { rotationIntervalMs: 3_600_000 },
  });
  config.profiles = [profile];

  await renderOnDisplay(page, request, config);
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  // Navigate to B (index 1) and pause there — a non-zero index AND paused, the
  // two pieces of state the switch must clear.
  await page.getByRole('button', { name: 'Go to screen 2: B' }).click();
  await expect(page.getByText(B, { exact: true })).toBeVisible();
  await page.locator('button[aria-current="true"]').dblclick();
  await expect(page.getByText('PAUSED')).toBeVisible();

  // Activate the profile mid-session. useLiveConfig picks up the PUT within its
  // 3s poll; the resolved screen set becomes [A, B] — a different screenKey,
  // which fires ScreenRotator's reset effect (currentIndex→0, paused→false).
  config.settings.activeProfile = 'subset';
  await putConfig(request, config);

  await expect(page.getByText(A, { exact: true })).toBeVisible({ timeout: 9000 });
  await expect(page.getByText('PAUSED')).toHaveCount(0);
  // C is no longer in the active set, so it never mounts.
  await expect(page.getByText(C, { exact: true })).toHaveCount(0);
});
