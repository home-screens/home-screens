import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { DEFAULT_MODULE_STYLE, type ModuleInstance } from '@/types/config';

/**
 * Flick-to-navigate gesture cluster: a quick horizontal flick anywhere on the
 * display goes to the next (left) / previous (right) screen. Exercises
 * useSwipeNavigation + classifySwipe wiring in ScreenRotator — see
 * src/components/display/useSwipeNavigation.ts and src/lib/swipe-gesture.ts.
 *
 * Gesture simulation uses page.mouse drags: CDP mouse input makes Chromium
 * synthesize the same trusted pointerdown/pointerup events the hook listens
 * for on real touchscreens (the hook deliberately doesn't filter pointerType).
 * A 5-step drag completes well inside the 500ms flick window; the slow-drag
 * case holds between down() and the move to exceed it.
 *
 * Timing convention matches rotator-interactions.spec.ts: negative claims use
 * a bounded wait ("did not navigate"), positive claims a generous expect.
 */

/** Three distinctly-labelled screens; ids match the pagination order. */
function threeScreens() {
  return [
    makeScreen('a', 'A', [textModule('SWIPE SCREEN A')]),
    makeScreen('b', 'B', [textModule('SWIPE SCREEN B')]),
    makeScreen('c', 'C', [textModule('SWIPE SCREEN C')]),
  ];
}

const A = 'SWIPE SCREEN A';
const B = 'SWIPE SCREEN B';
const C = 'SWIPE SCREEN C';

/** Frozen rotation — these tests are about the gesture, not auto-advance. */
function frozenConfig(settings: Record<string, unknown> = {}) {
  return baseConfig({
    screens: threeScreens(),
    settings: { rotationIntervalMs: 3_600_000, ...settings },
  });
}

/**
 * Drag from → to with the mouse. y=1400 keeps the track clear of module
 * content near the top and the pagination dots at the bottom edge (1080×1920
 * portrait viewport). `slowMs` holds between press and move so the gesture
 * exceeds the 500ms flick window and must be rejected.
 */
async function flick(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts: { slowMs?: number } = {},
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (opts.slowMs) await page.waitForTimeout(opts.slowMs);
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

test('a leftward flick advances to the next screen', async ({ page, request }) => {
  await renderOnDisplay(page, request, frozenConfig());
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  await flick(page, { x: 800, y: 1400 }, { x: 300, y: 1400 });
  await expect(page.getByText(B, { exact: true })).toBeVisible();
});

test('a rightward flick goes to the previous screen, wrapping to the last', async ({ page, request }) => {
  await renderOnDisplay(page, request, frozenConfig());
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  // From index 0, prev wraps to the last screen (C).
  await flick(page, { x: 300, y: 1400 }, { x: 800, y: 1400 });
  await expect(page.getByText(C, { exact: true })).toBeVisible();
});

test('a slow drag is not a flick', async ({ page, request }) => {
  await renderOnDisplay(page, request, frozenConfig());
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  // Same distance as a qualifying flick, but the 700ms hold pushes the
  // gesture past the duration cap.
  await flick(page, { x: 800, y: 1400 }, { x: 300, y: 1400 }, { slowMs: 700 });
  await page.waitForTimeout(500);
  await expect(page.getByText(A, { exact: true })).toBeVisible();
  await expect(page.getByText(B, { exact: true })).toHaveCount(0);
});

test('a drag on the display-control brightness slider does not navigate', async ({ page, request }) => {
  // Regression: a slider drag ends in pointerup (never pointercancel), so
  // without the range-input exclusion every brightness adjustment would also
  // flip screens.
  const screens = threeScreens();
  const displayControl: ModuleInstance = {
    id: 'dc-1',
    type: 'display-control',
    position: { x: 140, y: 700 },
    size: { w: 680, h: 320 },
    zIndex: 2,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { layout: 'panel', defaultTarget: 'self', allowRetargeting: true },
  };
  screens[0].modules.push(displayControl);
  await renderOnDisplay(page, request, baseConfig({
    screens,
    settings: { rotationIntervalMs: 3_600_000 },
  }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  const slider = page.locator('input[type="range"]').first();
  await expect(slider).toBeVisible();
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  // A fast, long, horizontal drag starting on the slider — exactly the
  // gesture that must adjust brightness without changing screens.
  await flick(page, { x: box.x + box.width * 0.85, y }, { x: box.x + box.width * 0.15, y });
  await page.waitForTimeout(500);
  await expect(page.getByText(A, { exact: true })).toBeVisible();
  await expect(page.getByText(B, { exact: true })).toHaveCount(0);
});

test('a short flick under the distance threshold is ignored', async ({ page, request }) => {
  await renderOnDisplay(page, request, frozenConfig());
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  // 40px is over Chromium's tap slop but under the 60px swipe floor.
  await flick(page, { x: 500, y: 1400 }, { x: 460, y: 1400 });
  await page.waitForTimeout(500);
  await expect(page.getByText(A, { exact: true })).toBeVisible();
});

test('a vertical flick is ignored (reserved for scrolling content)', async ({ page, request }) => {
  await renderOnDisplay(page, request, frozenConfig());
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  await flick(page, { x: 540, y: 1500 }, { x: 540, y: 900 });
  await page.waitForTimeout(500);
  await expect(page.getByText(A, { exact: true })).toBeVisible();
  await expect(page.getByText(B, { exact: true })).toHaveCount(0);
});

test('swipeEnabled:false makes a flick a no-op', async ({ page, request }) => {
  await renderOnDisplay(page, request, frozenConfig({ swipeEnabled: false }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  await flick(page, { x: 800, y: 1400 }, { x: 300, y: 1400 });
  await page.waitForTimeout(500);
  await expect(page.getByText(A, { exact: true })).toBeVisible();
  await expect(page.getByText(B, { exact: true })).toHaveCount(0);
});

test('a flick while paused navigates and resumes rotation', async ({ page, request }) => {
  await renderOnDisplay(page, request, frozenConfig());
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  await page.locator('button[aria-current="true"]').dblclick();
  await expect(page.getByText('PAUSED')).toBeVisible();

  // Navigating away clears pause — same contract as tapping another dot.
  await flick(page, { x: 800, y: 1400 }, { x: 300, y: 1400 });
  await expect(page.getByText(B, { exact: true })).toBeVisible();
  await expect(page.getByText('PAUSED')).toHaveCount(0);
});

test('a flick on a single-screen display is a harmless no-op', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('only', 'Only', [textModule(A)])],
    settings: { rotationIntervalMs: 3_600_000 },
  }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();

  await flick(page, { x: 800, y: 1400 }, { x: 300, y: 1400 });
  await page.waitForTimeout(500);
  await expect(page.getByText(A, { exact: true })).toBeVisible();
});

test('a flick resets the rotation timer (the new screen gets a full dwell)', async ({ page, request }) => {
  // Mirrors the dot-tap timer test in rotator-interactions.spec.ts, with two
  // twists that keep an auto-advance racing the gesture from ever passing
  // silently. First, the clock is synced to the timer: the timer arms at
  // ScreenRotator mount (before renderOnDisplay returns), so instead of
  // timing from "A visible" we wait for the first natural advance to B —
  // B's mount re-arms the timer via the [safeIndex] epoch effect, making
  // "B visible" coincide with a freshly armed 2000ms window. Second, the
  // post-flick assertion uses a TIGHT timeout: if an auto-advance fired
  // mid-gesture (B→C auto, then the flick lands C→A), C is not the visible
  // screen and cannot re-enter within 1s of A's fresh window, so the
  // expectation fails loudly instead of re-satisfying on a later cycle.
  const T = 2000;
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreens(),
    settings: { rotationIntervalMs: T },
  }));
  await expect(page.getByText(A, { exact: true })).toBeVisible();
  await expect(page.getByText(B, { exact: true })).toBeVisible({ timeout: 4000 });

  // Let most (not all) of B's window elapse: 1500 of 2000ms leaves a ~500ms
  // margin for the gesture itself.
  await page.waitForTimeout(1500);
  await flick(page, { x: 800, y: 1400 }, { x: 300, y: 1400 });
  await expect(page.getByText(C, { exact: true })).toBeVisible({ timeout: 1000 });

  // "Did not advance early": B's pre-flick deadline was ~500ms after the
  // flick; a 1000ms hold sails past it with C still up (C's successor A
  // would have mounted if the old schedule had survived).
  await page.waitForTimeout(1000);
  await expect(page.getByText(C, { exact: true })).toBeVisible();
  await expect(page.getByText(A, { exact: true })).toHaveCount(0);

  // "Did advance later": the reset granted C a fresh full interval.
  await expect(page.getByText(A, { exact: true })).toBeVisible({ timeout: 4000 });
});
