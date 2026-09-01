import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import type { Screen, ScreenConfiguration } from '@/types/config';

/**
 * AlertOverlay sizing and behavior across display shapes.
 *
 * Alerts scale with the VIEWPORT (fit = min(vw/1080, vh/540), times the
 * `alerts.scale` knob) so a banner holds a constant fraction of any panel:
 * 86% wide with 30px titles at the reference 1080 width — sizes for a wall,
 * not a phone. An urgent alert is one full-width bar at the top edge, and the
 * canvas is pushed down under it so it never covers the clock.
 * The regressions pinned here, measured before the fix:
 * - the overlay used the configured-canvas fit as a CSS transform, so a
 *   canvas/viewport mismatch shrank banners to 8px text (192px wide on a
 *   1366×768 window), and native landscape panels got desktop-sized toasts;
 * - the dismiss button was a 20×20px tap target on touch kiosks;
 * - an inherited global displayTransform '90' flipped a display node's own
 *   landscape dimensions to portrait, letterboxing all content.
 *
 * Functional alert behavior (render, clear-alerts, auto-dismiss) lives in
 * commands-runtime.spec.ts; this file owns geometry.
 */

const fit = (w: number, h: number) => Math.min(w / 1080, h / 540);
/** Banner width as a fraction of the viewport (AlertOverlay.BANNER_WIDTH_FRACTION). */
const BANNER_FRACTION = 0.86;
/** Banner title size at scale 1 (AlertOverlay). */
const TITLE_PX = 30;
const MIN_TAP = 44;

function displayConfig(
  id: string,
  screens: Screen[],
  settings: Record<string, unknown> = {},
  displayFields: Record<string, unknown> = {},
): ScreenConfiguration {
  return baseConfig({ settings, displays: [{ id, name: id, screens, ...displayFields }] });
}

async function openDisplay(
  page: Page,
  request: APIRequestContext,
  config: ScreenConfiguration,
  id: string,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);
  await putConfig(request, config);
  await page.goto(`/display/${id}`);
  await expect(page.locator('[data-module-type]').first()).toBeVisible();
}

async function sendAlert(request: APIRequestContext, id: string, body: Record<string, unknown>): Promise<void> {
  const res = await request.post(`/api/display/alert?display=${encodeURIComponent(id)}`, { data: body });
  expect(res.ok()).toBe(true);
}

const item = (page: Page) => page.getByTestId('alert-item').first();
const urgentBar = (page: Page) => page.getByTestId('alert-urgent');
const dismiss = (page: Page) => page.getByTestId('alert-dismiss').first();

/**
 * Wait out the 0.3s `alert-slide-in` before measuring.
 *
 * While it runs the banner carries a live transform matrix, and
 * getBoundingClientRect() resolves through that matrix in float32 — so the
 * 44px dismiss target reads 44 ± 4e-6 depending on the frame. Sampling every
 * frame of one animation showed 5 of 181 readings just under 44, which is
 * exactly the rate at which the `>= MIN_TAP` assertion used to fail. These
 * assertions are about the settled layout, so wait for it rather than papering
 * over the boundary with a tolerance.
 */
async function settled(page: Page) {
  await page.evaluate(async () => {
    const banners = Array.from(document.querySelectorAll('[data-testid="alert-item"], [data-testid="alert-urgent"], [data-testid="display-canvas"]'));
    await Promise.all(
      banners.flatMap((el) => el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
    );
  });
}

async function expectBannerGeometry(page: Page, viewportW: number, viewportH: number, knob = 1) {
  await expect(item(page)).toBeVisible({ timeout: 8000 });
  await settled(page);
  const s = fit(viewportW, viewportH) * knob;
  const box = (await item(page).boundingBox())!;
  // Banner width is a fraction of the viewport, centered; the knob scales the
  // type and padding, not the width.
  expect(Math.abs(box.width - viewportW * BANNER_FRACTION)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.x - (viewportW - box.width) / 2)).toBeLessThanOrEqual(2);
  const titlePx = await page.getByTestId('alert-title').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(Math.abs(titlePx - TITLE_PX * s)).toBeLessThanOrEqual(0.5);
  // The dismiss tap target never drops below the touch minimum, at any scale.
  const d = (await dismiss(page).boundingBox())!;
  expect(d.width).toBeGreaterThanOrEqual(MIN_TAP);
  expect(d.height).toBeGreaterThanOrEqual(MIN_TAP);
}

test('alerts render at reference size on the standard portrait kiosk', async ({ page, request }) => {
  const id = 'alert-portrait';
  await openDisplay(page, request, displayConfig(id, [makeScreen('s', 'S', [textModule('P')])],
    { displayWidth: 1080, displayHeight: 1920 }), id, { width: 1080, height: 1920 });
  await sendAlert(request, id, { type: 'warning', title: 'GEOM TITLE', message: 'Geometry body', duration: 0 });
  await expectBannerGeometry(page, 1080, 1920);
});

test('an urgent alert is a full-width bar at the top and pushes the canvas down under it', async ({ page, request }) => {
  const id = 'alert-urgent';
  await openDisplay(page, request, displayConfig(id, [makeScreen('s', 'S', [textModule('UNDER THE BAR')])],
    { displayWidth: 1080, displayHeight: 1920 }), id, { width: 1080, height: 1920 });
  const firstModule = page.locator('[data-module-type]').first();
  const before = (await firstModule.boundingBox())!;

  await sendAlert(request, id, { type: 'urgent', title: 'TORNADO WARNING', message: 'Head to the basement.' });
  await expect(urgentBar(page)).toBeVisible({ timeout: 8000 });
  await settled(page);
  const bar = (await urgentBar(page).boundingBox())!;
  expect(bar.x).toBeLessThanOrEqual(1);
  expect(bar.y).toBeLessThanOrEqual(1);
  expect(Math.abs(bar.width - 1080)).toBeLessThanOrEqual(2);
  // The bar is authored for a wall: at the reference width the title is 46px.
  const titlePx = await page.getByTestId('alert-title').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(Math.abs(titlePx - 46)).toBeLessThanOrEqual(0.5);
  // The dismiss control is a labelled pill, still a real fingertip target.
  const d = (await dismiss(page).boundingBox())!;
  expect(d.height).toBeGreaterThanOrEqual(MIN_TAP);

  // The canvas moved down by the bar's height (and shrank to what is left),
  // so the module that sat at the top edge is now fully below the bar.
  const after = (await firstModule.boundingBox())!;
  expect(after.y).toBeGreaterThanOrEqual(bar.y + bar.height - 2);
  expect(after.y - before.y).toBeGreaterThanOrEqual(bar.height * 0.9);

  // Dismissing the bar restores the canvas.
  await dismiss(page).click();
  await expect(urgentBar(page)).toHaveCount(0);
  await settled(page);
  const restored = (await firstModule.boundingBox())!;
  expect(Math.abs(restored.y - before.y)).toBeLessThanOrEqual(2);
});

test('alerts scale up on a landscape panel and the dismiss target stays tappable', async ({ page, request }) => {
  const id = 'alert-small';
  await openDisplay(page, request, displayConfig(id, [makeScreen('s', 'S', [textModule('S')])],
    { displayWidth: 1366, displayHeight: 768, displayTransform: 'normal' }), id, { width: 1366, height: 768 });
  await sendAlert(request, id, { type: 'warning', title: 'GEOM TITLE', message: 'Geometry body', duration: 0 });
  await expectBannerGeometry(page, 1366, 768);

  // Dismissing by tap works and removes the banner.
  await dismiss(page).click();
  await expect(page.getByTestId('alert-item')).toHaveCount(0);
});

test('a canvas/viewport mismatch no longer shrinks alerts', async ({ page, request }) => {
  // Portrait canvas opened in a landscape window (e.g. a desktop browser).
  // Pre-fix the canvas-fit transform rendered the banner 192px wide with 8px
  // text; alerts must size from the real viewport instead.
  const id = 'alert-mismatch';
  await openDisplay(page, request, displayConfig(id, [makeScreen('s', 'S', [textModule('M')])],
    { displayWidth: 1080, displayHeight: 1920, displayTransform: '90' }), id, { width: 1366, height: 768 });
  await sendAlert(request, id, { type: 'warning', title: 'GEOM TITLE', message: 'Geometry body', duration: 0 });
  await expectBannerGeometry(page, 1366, 768);
});

test('the alerts.scale knob multiplies the viewport fit', async ({ page, request }) => {
  const id = 'alert-knob';
  await openDisplay(page, request, displayConfig(id, [makeScreen('s', 'S', [textModule('K')])], {
    displayWidth: 1080, displayHeight: 1920,
    alerts: { enabled: true, position: 'top', maxVisible: 3, defaultDuration: 0, scale: 2 },
  }), id, { width: 1080, height: 1920 });
  await sendAlert(request, id, { type: 'warning', title: 'GEOM TITLE', message: 'Geometry body', duration: 0 });
  await expectBannerGeometry(page, 1080, 1920, 2);
});

test('bottom-position alerts anchor to the bottom edge and maxVisible caps the stack', async ({ page, request }) => {
  const id = 'alert-stack';
  await openDisplay(page, request, displayConfig(id, [makeScreen('s', 'S', [textModule('B')])], {
    displayWidth: 1366, displayHeight: 768, displayTransform: 'normal',
    alerts: { enabled: true, position: 'bottom', maxVisible: 3, defaultDuration: 0 },
  }), id, { width: 1366, height: 768 });
  for (const n of [1, 2, 3, 4]) {
    await sendAlert(request, id, { type: 'warning', title: `STACK ${n}`, message: 'body', duration: 0 });
  }
  await expect(page.getByText('STACK 4')).toBeVisible({ timeout: 8000 });
  // Four sent, three visible: the oldest fell off the capped stack.
  await expect(page.getByTestId('alert-item')).toHaveCount(3);
  await expect(page.getByText('STACK 1')).toHaveCount(0);

  // The slide-in translates each banner by up to 12 × s px, which dwarfs the
  // 2px tolerance below, so measure only once the stack has come to rest.
  await settled(page);
  const boxes = [];
  for (let i = 0; i < 3; i++) boxes.push((await page.getByTestId('alert-item').nth(i).boundingBox())!);
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  const s = fit(1366, 768);
  // Stack sits against the bottom padding (28 × s).
  expect(Math.abs(768 - 28 * s - bottom)).toBeLessThanOrEqual(2);
});

test('an inherited global transform does not flip a display\'s own landscape dimensions', async ({ page, request }) => {
  // The display node enters 1366×768 but declares no rotation; the global
  // default transform is '90' (the hub panel's rotation). Pre-fix the canvas
  // was force-oriented to 768×1366, letterboxing content (first module at
  // x≈523 instead of its authored x=100).
  const id = 'alert-canvas';
  await openDisplay(page, request, displayConfig(
    id,
    [makeScreen('s', 'S', [textModule('CANVAS TRUTH')])],
    {}, // globals keep the baseConfig seed: 1080×1920 + transform '90'
    { displayWidth: 1366, displayHeight: 768 },
  ), id, { width: 1366, height: 768 });

  const firstModule = page.locator('[data-module-type]').first();
  await expect(firstModule).toBeVisible();
  const box = (await firstModule.boundingBox())!;
  // Canvas 1366×768 on a 1366×768 window → scale 1, no letterbox: the module
  // renders at its authored position.
  expect(box.x).toBeGreaterThanOrEqual(90);
  expect(box.x).toBeLessThanOrEqual(120);
});
