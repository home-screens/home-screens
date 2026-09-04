import { test, expect } from '../fixtures';
import type { Locator, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { windowAround, overnightWindowContainingNow } from '../helpers/schedule-windows';
import type { SleepSettings } from '@/types/config';

/**
 * Sleep manager, dim, and screensaver behavior on the live display.
 *
 * `useSleepManager` (src/hooks/useSleepManager.ts) drives three display states
 * — active / dimmed / asleep — surfaced through `SleepOverlay` (a fixed
 * `z-index: 9997` layer that renders nothing while active). The schedule check
 * runs on a 10s `setInterval` with no immediate first pass, so the overlay only
 * settles into its scheduled state once that interval fires. Both the interval
 * and the schedule comparison read `Date`/`setInterval` in the page's own JS —
 * so `page.clock` (installed before navigation) fakes them and lets tests fire
 * the check with `clock.runFor(...)` instead of a real wait. But the 10s
 * interval isn't guaranteed to survive uninterrupted: `useLiveConfig`'s 3s
 * config poll (src/components/display/useLiveConfig.ts) can hand the effect a
 * new `sleep`/`timezone` reference, which tears down and restarts the interval
 * before its first tick — confirmed by instrumenting the hook, where a
 * `runFor(10_000)` reliably fired zero ticks. `runFor(31_000)` mirrors the
 * original real-clock tests' 30s margin, giving room for a reset plus a full
 * clean 10s cycle after it — and since it's virtual time, it still resolves in
 * under a second of real wall time. The overlay's 1s opacity transition is a
 * real CSS transition on the compositor, not a page timer, so it still needs a
 * short real poll after the interval fires.
 *
 * Schedule windows are bracketed around wall time (the same technique as
 * scheduling.spec.ts): the display evaluates windows against a timezone-aware
 * clock which, with no `settings.timezone`, is `new Date()` on this same runner.
 * `clock.install()` (no `time` override) seeds the fake clock from the real
 * current time, so a window built from real wall time just before install still
 * lines up with what the display evaluates.
 */

const DIM_BRIGHTNESS = 40; // dimmed overlay opacity = 1 - 40/100 = 0.6

/** Full sleep settings with idle timers pushed far out so schedules govern alone. */
function sleepSettings(overrides: Partial<SleepSettings>): SleepSettings {
  return {
    enabled: true,
    dimAfterMinutes: 600,
    sleepAfterMinutes: 600,
    dimBrightness: DIM_BRIGHTNESS,
    ...overrides,
  };
}

/** The SleepOverlay layer — absent (count 0) while the display is active. */
function overlay(page: Page): Locator {
  return page.locator('div[style*="z-index: 9997"]');
}

/** The black dimming layer inside the overlay; its opacity encodes the state. */
function dimLayer(page: Page): Locator {
  return page.locator('div[style*="z-index: 9997"] > div').first();
}

async function overlayOpacity(page: Page): Promise<number> {
  const layer = dimLayer(page);
  if ((await layer.count()) === 0) return 0;
  const raw = await layer.evaluate((el) => getComputedStyle(el).opacity);
  return Number.parseFloat(raw);
}

test('a sleep schedule window containing now blacks out the display', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('AWAKE CONTENT')])],
    settings: { sleep: sleepSettings({ schedule: windowAround(-120, 120) }) },
  }));
  await page.clock.install();
  await page.goto('/display');
  await expect(page.getByText('AWAKE CONTENT')).toBeVisible();

  // See file-header note: 31s of virtual time survives a mid-window effect
  // reset and still lands a clean 10s cycle, then a short real poll rides the
  // overlay's 1s CSS opacity transition (not a page timer, so the clock can't
  // fake it).
  await page.clock.runFor(31_000);
  await expect
    .poll(() => overlayOpacity(page), { timeout: 5_000, intervals: [100] })
    .toBeGreaterThan(0.98);
  await expect(overlay(page)).toHaveCount(1);
});

test('a sleep schedule window that excludes now leaves content visible', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('AWAKE CONTENT')])],
    // Window starts an hour out and ends three hours out — now is outside it.
    settings: { sleep: sleepSettings({ schedule: windowAround(60, 180) }) },
  }));
  await page.clock.install();
  await page.goto('/display');
  await expect(page.getByText('AWAKE CONTENT')).toBeVisible();

  // Fire one full 10s check interval, then confirm the overlay never mounted.
  await page.clock.runFor(12_000);
  await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByText('AWAKE CONTENT')).toBeVisible();
});

test('an overnight sleep window (start > end) spanning midnight blacks out the display', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('AWAKE CONTENT')])],
    settings: { sleep: sleepSettings({ schedule: overnightWindowContainingNow() }) },
  }));
  await page.clock.install();
  await page.goto('/display');
  await expect(page.getByText('AWAKE CONTENT')).toBeVisible();

  await page.clock.runFor(31_000);
  await expect
    .poll(() => overlayOpacity(page), { timeout: 5_000, intervals: [100] })
    .toBeGreaterThan(0.98);
});

test('a dim schedule window dims the display while keeping content present', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('DIMMED CONTENT')])],
    // dimSchedule (not sleep schedule) → the display dims but does not black out.
    settings: { sleep: sleepSettings({ dimSchedule: windowAround(-120, 120) }) },
  }));
  await page.clock.install();
  await page.goto('/display');
  await expect(page.getByText('DIMMED CONTENT')).toBeVisible();

  await page.clock.runFor(31_000);
  // dimBrightness 40 → overlay opacity 0.6: partly dark, not fully asleep.
  await expect
    .poll(() => overlayOpacity(page), { timeout: 5_000, intervals: [100] })
    .toBeGreaterThan(0.5);
  expect(await overlayOpacity(page)).toBeLessThan(0.7);
  // Content stays in the DOM under the semi-transparent overlay.
  await expect(page.getByText('DIMMED CONTENT')).toBeVisible();
});

test('a flick on a dimmed display wakes it without changing screens', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('a', 'A', [textModule('DIM SWIPE A')]),
      makeScreen('b', 'B', [textModule('DIM SWIPE B')]),
    ],
    // Frozen rotation so any screen change could only come from the flick.
    // wakeHoldMinutes: 0 — the cursor-parking mousemove below counts as
    // activity, and with the default wake hold it would keep the display
    // bright for minutes, so the scheduled dim this test waits for would
    // never arrive. The hold has its own coverage; this test is about the
    // swipe gate.
    settings: {
      rotationIntervalMs: 3_600_000,
      sleep: sleepSettings({ dimSchedule: windowAround(-120, 120), wakeHoldMinutes: 0 }),
    },
  }));
  await page.clock.install();
  await page.goto('/display');
  await expect(page.getByText('DIM SWIPE A')).toBeVisible();
  // Position the cursor BEFORE the display dims: mousemove is a wake-activity
  // event, and a move after dimming races the pointerdown against React
  // committing the wake — on a slow runner the gate samples 'active' and the
  // flick navigates. A real touch has no such prelude (pointerdown precedes
  // touchstart), so parking the cursor first matches hardware ordering. The
  // fake clock governs Date.now() here too, so the activity timestamp it sets
  // stays consistent with the interval fired below.
  await page.mouse.move(800, 1400);
  await page.clock.runFor(31_000);
  await expect
    .poll(() => overlayOpacity(page), { timeout: 5_000, intervals: [100] })
    .toBeGreaterThan(0.5);

  // The swipe gate samples displayState at pointerdown, which still reads
  // 'dimmed' for the very touch that wakes the display — so this qualifying
  // flick wakes (via the sleep manager's activity listener) but must not
  // navigate.
  await page.mouse.down();
  await page.mouse.move(300, 1400, { steps: 5 });
  await page.mouse.up();

  await page.waitForTimeout(500);
  await expect(page.getByText('DIM SWIPE A')).toBeVisible();
  await expect(page.getByText('DIM SWIPE B')).toHaveCount(0);
});

test('a clock screensaver renders during a dim window', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('DIMMED CONTENT')])],
    settings: {
      sleep: sleepSettings({ dimSchedule: windowAround(-120, 120) }),
      screensaver: { mode: 'clock' },
    },
  }));
  await page.clock.install();
  await page.goto('/display');
  await expect(page.getByText('DIMMED CONTENT')).toBeVisible();

  await page.clock.runFor(31_000);
  // Screensaver mounts only in the dimmed state: its own z-index 9998 layer
  // lives inside the 9997 sleep overlay (scoped so it can't match AlertOverlay,
  // which shares 9998 but only renders while the display is active).
  const screensaver = page.locator('div[style*="z-index: 9997"] div[style*="z-index: 9998"]');
  await expect(screensaver).toBeVisible({ timeout: 5_000 });
  // The drifting clock renders a formatted time string (e.g. "3:45 PM"); the
  // page's own Date is faked, but the format only needs any valid reading.
  await expect(screensaver).toHaveText(/\d{1,2}:\d{2}/, { timeout: 5_000 });
});

test('the offline indicator appears when the network drops and clears when it returns', async ({ page, request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('AWAKE CONTENT')])],
  }));
  await page.goto('/display');
  await expect(page.getByText('AWAKE CONTENT')).toBeVisible();

  const indicator = page.locator('.lucide-wifi-off');
  await expect(indicator).toHaveCount(0);

  // useNetworkStatus debounces the offline event by 3s before showing the icon.
  await page.context().setOffline(true);
  await expect(indicator).toBeVisible({ timeout: 8_000 });

  // Coming back online clears immediately (the debounce timer is cancelled).
  await page.context().setOffline(false);
  await expect(indicator).toHaveCount(0, { timeout: 8_000 });
});
