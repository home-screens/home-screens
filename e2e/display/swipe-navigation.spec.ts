import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { seedChores } from '../helpers/api';
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
 * Mouse input is NOT sufficient coverage on its own: it skips Chromium's
 * touch gesture recognizer, which claims horizontal touch pans as viewport
 * scroll gestures and kills the flick with pointercancel unless html/body
 * carry touch-action: pan-y (ScreenRotator's root-style effect). The
 * real-touch group at the bottom dispatches genuine touch sequences over CDP
 * to pin that path.
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

/**
 * Real-touch gestures, dispatched as raw CDP touch sequences so they run
 * through Chromium's gesture recognizer — the path a physical touchscreen
 * takes and page.mouse never does. Regression for the spoke-touchscreen bug
 * where every flick died in pointercancel: with default touch-action the
 * browser claimed the horizontal pan as a (pointless — nothing scrolls)
 * viewport scroll gesture. touch-action: pan-y on html/body is the fix.
 */
test.describe('real touch input', () => {
  test.use({ hasTouch: true });

  /** Same shape as flick(), but a genuine touch sequence. */
  async function touchFlick(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    const client = await page.context().newCDPSession(page);
    const step = (to.x - from.x) / 5;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }],
    });
    for (let i = 1; i <= 5; i++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: from.x + step * i, y: from.y }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /**
   * The touch-action root style lands in ScreenRotator's mount effect, after
   * hydration — a touch dispatched before it commits would race the fix.
   */
  async function waitForTouchAction(page: Page) {
    await page.waitForFunction(() => document.body.style.touchAction === 'pan-y');
  }

  test('a real-touch leftward flick advances to the next screen', async ({ page, request }) => {
    await renderOnDisplay(page, request, frozenConfig());
    await expect(page.getByText(A, { exact: true })).toBeVisible();
    await waitForTouchAction(page);

    await touchFlick(page, { x: 800, y: 1400 }, { x: 300, y: 1400 });
    await expect(page.getByText(B, { exact: true })).toBeVisible();
  });

  test('a real-touch rightward flick goes to the previous screen', async ({ page, request }) => {
    await renderOnDisplay(page, request, frozenConfig());
    await expect(page.getByText(A, { exact: true })).toBeVisible();
    await waitForTouchAction(page);

    await touchFlick(page, { x: 300, y: 1400 }, { x: 800, y: 1400 });
    await expect(page.getByText(C, { exact: true })).toBeVisible();
  });

  test('a real-touch flick starting on a chore list scroll region still navigates', async ({ page, request }) => {
    // Regression: the fullscreen chore chart's vertical scroll containers
    // carried touch-action: manipulation, which permits horizontal pan
    // claiming — a flick starting on the list died in pointercancel on real
    // touchscreens while the rest of the screen navigated fine. The
    // containers now declare pan-y (vertical scroll keeps working; sideways
    // flicks stay with the swipe hook).
    await seedChores(request);
    const chart: ModuleInstance = {
      ...buildModuleInstance('fullscreen-chore-chart'),
      position: { x: 0, y: 0 },
      size: { w: 1080, h: 1920 },
    };
    const screens = threeScreens();
    screens[0].modules.push(chart);
    const display = await renderOnDisplay(page, request, baseConfig({
      screens,
      settings: { rotationIntervalMs: 3_600_000 },
    }));
    const chartEl = display.module('fullscreen-chore-chart');
    await expect(chartEl).toBeVisible();
    await waitForTouchAction(page);

    // Start the flick dead-center — inside the chore list, the exact spot
    // that used to cancel.
    await touchFlick(page, { x: 800, y: 960 }, { x: 300, y: 960 });
    await expect(page.getByText(B, { exact: true })).toBeVisible();
  });
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

/**
 * `[data-swipe-ignore]` opt-out (useSwipeNavigation): surfaces that scroll
 * sideways own the horizontal drag, so a gesture STARTING on one must never
 * navigate. One host surface carries the attribute — the display-control
 * target-picker chips (the chore board's member columns used to, until the
 * board started wrapping into rows instead of scrolling) — and it is reachable
 * on a real display, so it is exercised through the rendered kiosk rather
 * than a synthetic DOM.
 *
 * The case pairs the negative claim with a positive control flick on the
 * background afterwards: without it, a broken selector or a mis-seeded config
 * would let the test pass by rendering nothing swipeable at all.
 */
test.describe('data-swipe-ignore surfaces', () => {
  /**
   * The chips row only renders in multi-display mode with retargeting on
   * (PanelLayout: `allowRetargeting && !isLegacyMode`), so this needs a
   * displays registry and a per-display route. Screen A of the `swipectl`
   * display carries the widget at y 700-1080, leaving y≈1500 clear for the
   * control flicks.
   */
  function chipDisplays() {
    const control: ModuleInstance = {
      ...buildModuleInstance('display-control', { layout: 'panel', defaultTarget: 'self', allowRetargeting: true }),
      position: { x: 140, y: 700 },
      size: { w: 680, h: 380 },
    };
    const controller = {
      id: 'swipectl',
      name: 'Swipe Ctl',
      screens: [
        makeScreen('swipectl-a', 'A', [textModule(A), control]),
        makeScreen('swipectl-b', 'B', [textModule(B)]),
      ],
    };
    const sibling = {
      id: 'swipesib',
      name: 'Swipe Sib',
      screens: [makeScreen('swipesib-s', 'Sib', [textModule('SWIPE SIBLING')])],
    };
    return [controller, sibling];
  }

  test('a drag starting on the display-control target chips does not navigate', async ({ page, request }) => {
    const display = await renderOnDisplay(page, request, baseConfig({
      displays: chipDisplays(),
      settings: { rotationIntervalMs: 3_600_000 },
    }), '/display/swipectl');
    await expect(page.getByText(A, { exact: true })).toBeVisible();

    const chips = display.module('display-control').locator('[data-swipe-ignore]');
    await expect(chips.getByRole('button', { name: 'Swipe Sib', exact: true })).toBeVisible();
    const box = (await chips.boundingBox())!;
    const y = box.y + box.height / 2;
    await flick(page, { x: box.x + box.width * 0.9, y }, { x: box.x + box.width * 0.9 - 400, y });
    await page.waitForTimeout(500);
    await expect(page.getByText(A, { exact: true })).toBeVisible();
    await expect(page.getByText(B, { exact: true })).toHaveCount(0);

    // Control: same display, same flick, started below the widget.
    await flick(page, { x: 800, y: 1500 }, { x: 300, y: 1500 });
    await expect(page.getByText(B, { exact: true })).toBeVisible();
  });

  /**
   * Regression for the stale-origin half of the fix: a pointerdown the hook
   * DECLINES must also clear whatever origin is pending, or an abandoned
   * gesture start (a press whose pointerup never arrived — released outside
   * the window, or a touch the OS took over) would pair with the next
   * pointerup and navigate from coordinates the user never swiped between.
   *
   * Synthesized in-page rather than driven with page.mouse for two reasons:
   * Chromium never emits a second pointerdown while a mouse button is held
   * (chorded presses arrive as pointermove), so a real mouse cannot produce
   * "down, down, up" at all; and dispatching the whole sequence inside one
   * evaluate keeps it far inside the 500ms flick window no matter how loaded
   * the machine is. The hook doesn't inspect isTrusted or pointerType, and the
   * events go through the real window-level capture listeners on the real
   * display page — only the input source is synthetic.
   */
  async function dispatchPointerSequence(
    page: Page,
    steps: Array<{ type: 'pointerdown' | 'pointerup'; x: number; y: number }>,
  ) {
    await page.evaluate((seq) => {
      for (const { type, x, y } of seq) {
        // elementFromPoint so `e.target.closest('[data-swipe-ignore]')` sees
        // the same element a finger at those coordinates would hit.
        const el = document.elementFromPoint(x, y) ?? document.body;
        el.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          isPrimary: true,
          pointerType: 'touch',
        }));
      }
    }, steps);
  }

  test('a declined pointerdown clears the pending origin instead of leaving it to pair', async ({ page, request }) => {
    const display = await renderOnDisplay(page, request, baseConfig({
      displays: chipDisplays(),
      settings: { rotationIntervalMs: 3_600_000 },
    }), '/display/swipectl');
    await expect(page.getByText(A, { exact: true })).toBeVisible();

    const chips = display.module('display-control').locator('[data-swipe-ignore]');
    await expect(chips.getByRole('button', { name: 'Swipe Sib', exact: true })).toBeVisible();
    const box = (await chips.boundingBox())!;
    const ignored = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // The guard: an origin at x=900 is pending when the pointerdown on the
    // ignored surface is declined. Before the fix the decline returned without
    // clearing, so the x=300 pointerup paired with the stale x=900 origin and
    // read as a 600px leftward flick.
    await dispatchPointerSequence(page, [
      { type: 'pointerdown', x: 900, y: 1500 },
      { type: 'pointerdown', x: ignored.x, y: ignored.y },
      { type: 'pointerup', x: 300, y: 1500 },
    ]);
    await page.waitForTimeout(500);
    await expect(page.getByText(A, { exact: true })).toBeVisible();
    await expect(page.getByText(B, { exact: true })).toHaveCount(0);

    // Harness check LAST: dispatched this way a plain down→up pair really is a
    // flick, so the null result above is the guard and not a dead pipeline. It
    // has to come second — it leaves screen A, taking the board (and with it
    // the ignored surface at those coordinates) off the display.
    await dispatchPointerSequence(page, [
      { type: 'pointerdown', x: 900, y: 1500 },
      { type: 'pointerup', x: 300, y: 1500 },
    ]);
    await expect(page.getByText(B, { exact: true })).toBeVisible();
  });
});
