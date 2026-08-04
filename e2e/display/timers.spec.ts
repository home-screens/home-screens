import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { TIMER_VIEWS, type TimerView } from '@/types/timers';

/**
 * Timer takeover sizing across display shapes.
 *
 * The four timer views (and the celebration screen) are authored in mockup
 * pixels on a 1080×1920 portrait canvas and scaled by `s`, the viewport fit
 * of THAT canvas — `min(vw/1080, vh/1920)` — computed in TimerOverlay. The
 * regression this suite pins down: the overlay used to receive the display's
 * configured-canvas scale instead, which is ~1 on any display running at its
 * native resolution. On landscape panels the ~1600px-tall portrait layout
 * then overflowed the flex column, and the dial containers (whose children
 * are all absolutely positioned, so min-content height 0) absorbed the
 * entire squeeze — pancaking the clock faces into ovals while text stayed
 * full size.
 *
 * Every view is asserted on three shapes: the standard portrait kiosk, a
 * full-size landscape display, and the small 1366×768 landscape panel the
 * bug was reported on. Assertions check the dial is circular, matches the
 * mockup-fit diameter exactly, sits fully on screen, and that the view
 * column doesn't overflow the viewport.
 */

const CANVAS_W = 1080;
const CANVAS_H = 1920;

const SHAPES = [
  { name: 'portrait 1080x1920', w: 1080, h: 1920 },
  { name: 'landscape 1920x1080', w: 1920, h: 1080 },
  { name: 'small landscape 1366x768', w: 1366, h: 768 },
] as const;
type Shape = (typeof SHAPES)[number];

/** Mockup-pixel diameter of each view's fixed-aspect circle (`timer-dial`). */
const DIAL_MOCKUP_PX: Record<string, number> = {
  ring: 720,
  face: 780,
  path: 560,
  celebration: 400,
};

const mockupScale = (shape: Shape) => Math.min(shape.w / CANVAS_W, shape.h / CANVAS_H);

/** Point the display at a canvas matching the panel's native resolution — the
 *  photographed setup, and the one where the old canvas-fit scale was ~1. */
async function seedDisplay(page: Page, request: APIRequestContext, shape: Shape) {
  await page.setViewportSize({ width: shape.w, height: shape.h });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s', 'S', [textModule('UNDERNEATH')])],
    settings: { displayWidth: shape.w, displayHeight: shape.h },
  }));
}

async function startQuick(request: APIRequestContext, view: TimerView, durationSec = 240) {
  const res = await request.post('/api/timers/session', {
    data: { action: 'start', kind: 'quick', durationSec, targets: 'all', view, sound: false },
  });
  expect(res.ok()).toBe(true);
}

/** The dial must be circular, at the mockup-fit diameter, and fully on screen. */
async function expectDialProper(page: Page, shape: Shape, view: string) {
  const dial = page.getByTestId('timer-dial');
  await expect(dial).toBeVisible();
  const box = (await dial.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
  const expected = DIAL_MOCKUP_PX[view] * mockupScale(shape);
  expect(Math.abs(box.width - expected)).toBeLessThanOrEqual(3);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(shape.w + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(shape.h + 1);
}

/** The view's flex column must not spill past the viewport (clipped or not). */
async function expectNoOverflow(page: Page) {
  const spill = await page.getByTestId('timer-view').evaluate((el) => ({
    x: el.scrollWidth - el.clientWidth,
    y: el.scrollHeight - el.clientHeight,
  }));
  expect(spill.y).toBeLessThanOrEqual(1);
  expect(spill.x).toBeLessThanOrEqual(1);
}

const countdown = (page: Page) => page.getByText(/^\d+:\d\d$/).first();

// A running session in the worker's shared data/ would take over the display
// for every later spec in this worker — always clear it.
test.afterEach(async ({ request }) => {
  await request.post('/api/timers/session', { data: { action: 'cancel' } }).catch(() => {});
});

for (const shape of SHAPES) {
  for (const view of TIMER_VIEWS) {
    test(`${view} view sizes correctly on ${shape.name}`, async ({ page, request }) => {
      await seedDisplay(page, request, shape);
      await startQuick(request, view);
      await page.goto('/display');

      await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', view);
      await expect(countdown(page)).toBeVisible();

      if (view === 'cascade') {
        // No circle in this view — the countdown numerals are the layout's
        // dominant fixed-size element; they must sit fully inside the viewport.
        const box = (await countdown(page).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(shape.h + 1);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(shape.w + 1);
      } else {
        await expectDialProper(page, shape, view);
      }
      await expectNoOverflow(page);
    });
  }

  test(`celebration screen sizes correctly on ${shape.name}`, async ({ page, request }) => {
    await seedDisplay(page, request, shape);
    await startQuick(request, 'ring', 5); // minimum length — expires into the celebration
    await page.goto('/display');

    // Flips to the celebration when the 5s run out (then lingers ~15s).
    await expect(page.getByTestId('timer-view')).toHaveAttribute(
      'data-timer-view', 'celebration', { timeout: 15_000 },
    );
    await expectDialProper(page, shape, 'celebration');
    await expectNoOverflow(page);
  });
}

/**
 * Routine layouts are the tallest each view gets — step-count line, ring
 * chips row, path trail bubbles. Stress them on the smallest panel, where
 * vertical budget is scarcest.
 */
const ROUTINE = {
  routines: [{
    id: 'r1',
    name: 'Morning list',
    icon: '🌅',
    view: 'ring',
    sound: false,
    steps: [
      { id: 's1', label: 'Get dressed', icon: '👕', durationSec: 60 },
      { id: 's2', label: 'Brush teeth', icon: '🪥', durationSec: 60, waitForTap: true },
      { id: 's3', label: 'Make bed', icon: '🛏️', durationSec: 60 },
      { id: 's4', label: 'Shoes on', icon: '👟', durationSec: 60 },
    ],
  }],
};

async function startRoutine(request: APIRequestContext, view: TimerView) {
  const put = await request.put('/api/timers/routines', { data: ROUTINE });
  expect(put.ok()).toBe(true);
  const res = await request.post('/api/timers/session', {
    data: { action: 'start', kind: 'routine', routineId: 'r1', targets: 'all', view, sound: false },
  });
  expect(res.ok()).toBe(true);
}

const SMALL = SHAPES[2];

for (const view of TIMER_VIEWS) {
  test(`${view} view fits a 4-step routine on ${SMALL.name}`, async ({ page, request }) => {
    await seedDisplay(page, request, SMALL);
    await startRoutine(request, view);
    await page.goto('/display');

    await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', view);
    await expect(page.getByText('Get dressed').first()).toBeVisible();
    if (view !== 'cascade') await expectDialProper(page, SMALL, view);
    await expectNoOverflow(page);
  });
}
