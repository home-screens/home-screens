import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import type { QuickTimerConfig, ScreenConfiguration } from '@/types/config';
import type { TimerSession } from '@/types/timers';

/**
 * The Quick Timer module's settings, which only a real tap can exercise: the
 * four of them describe the session the module STARTS, not how its own box
 * draws, so none of them can be seen in a render matrix. The module's idle
 * and running layouts are covered by `module-fixtures` and the config
 * variants; here a preset is tapped and the session read back.
 *
 * `fullScreen` is the one with a second half: it decides whether the takeover
 * covers this display, so it is asserted against the rotation content
 * underneath as well as against the session.
 *
 * Isolation: one session exists globally and `start` replaces it, so every
 * test ends by cancelling (see timers-runtime.spec.ts for the full mechanics).
 */

const ROTATION_TEXT = 'QUICK TIMER ROTATION CONTENT';

/** A screen holding the module plus ordinary content any takeover would cover. */
function moduleConfig(
  config: Partial<QuickTimerConfig>,
  displayIds?: string[],
): ScreenConfiguration {
  const mod = buildModuleInstance('quick-timer', config);
  const screens = [makeScreen('s', 'S', [mod, textModule(ROTATION_TEXT)])];
  if (!displayIds) return baseConfig({ screens });
  return baseConfig({
    screens,
    displays: displayIds.map((id) => ({
      id,
      name: id,
      screens: [makeScreen(`${id}-s`, `${id} S`, [
        buildModuleInstance('quick-timer', config),
        textModule(ROTATION_TEXT),
      ])],
    })),
  });
}

/** Tap the module's button for `minutes`. */
async function tapPreset(page: Page, minutes: number): Promise<void> {
  await page.locator(`[data-testid="quick-timer-preset"][data-minutes="${minutes}"]`).click();
}

/** The session the hub is holding, once one is running. */
async function readSession(request: APIRequestContext): Promise<TimerSession> {
  let session: TimerSession | null = null;
  await expect
    .poll(async () => {
      const res = await request.get('/api/timers/session');
      if (!res.ok()) return null;
      ({ session } = (await res.json()) as { session: TimerSession | null });
      return session?.status ?? null;
    }, { message: 'a session to be running' })
    .toBe('running');
  return session!;
}

test.afterEach(async ({ request }) => {
  await request.post('/api/timers/session', { data: { action: 'cancel' } }).catch(() => {});
});

test('a tap starts a timer carrying the module\'s view, sound and length', async ({ page, request }) => {
  await putConfig(request, moduleConfig({ timerView: 'cascade', timerSound: true, presetMinutes: [5, 10] }));
  await page.goto('/display');

  await expect(page.getByTestId('quick-timer')).toHaveAttribute('data-state', 'idle');
  await tapPreset(page, 5);

  const session = await readSession(request);
  expect(session.kind).toBe('quick');
  expect(session.view).toBe('cascade');
  expect(session.sound).toBe(true);
  expect(session.steps[0].durationSec).toBe(300);
  // The configured view is what the takeover actually draws.
  await expect(page.getByTestId('timer-view')).toHaveAttribute('data-timer-view', 'cascade');
});

test('the chimes follow the module\'s own sound setting', async ({ page, request }) => {
  await putConfig(request, moduleConfig({ timerSound: false, presetMinutes: [5] }));
  await page.goto('/display');
  await tapPreset(page, 5);

  expect((await readSession(request)).sound).toBe(false);
});

test('"this display" sends the timer to the display that was tapped, not the others', async ({ page, request }) => {
  await putConfig(request, moduleConfig({ timerTarget: 'this', presetMinutes: [5] }, ['kitchen', 'hall']));
  await page.goto('/display/kitchen');
  await tapPreset(page, 5);

  const session = await readSession(request);
  expect(session.targets).toEqual(['kitchen']);

  // The hall is left to its rotation: the takeover is addressed elsewhere.
  await page.goto('/display/hall');
  await expect(page.getByText(ROTATION_TEXT)).toBeVisible();
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0);
});

test('"all displays" is the default, and every display takes it', async ({ page, request }) => {
  await putConfig(request, moduleConfig({ presetMinutes: [5] }, ['kitchen', 'hall']));
  await page.goto('/display/kitchen');
  await tapPreset(page, 5);

  expect((await readSession(request)).targets).toBe('all');
  await page.goto('/display/hall');
  await expect(page.getByTestId('timer-overlay')).toBeVisible();
});

test('filling the screen covers the rotation content; off leaves it and counts in the box', async ({ page, request }) => {
  // On (the default): the takeover goes over everything on the screen.
  await putConfig(request, moduleConfig({ fullScreen: true, presetMinutes: [5] }));
  await page.goto('/display');
  await tapPreset(page, 5);

  // "Covers" is geometry, not visibility: the rotation content stays in the
  // DOM underneath, so the test is that the overlay is painted over the whole
  // viewport rather than that the text went away.
  const overlay = page.getByTestId('timer-overlay');
  await expect(overlay).toBeVisible();
  const box = (await overlay.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(view.width);
  expect(box.height).toBeGreaterThanOrEqual(view.height);
  await request.post('/api/timers/session', { data: { action: 'cancel' } });

  // Off: no takeover at all, the screen carries on, and the module itself
  // holds the countdown and the buttons for it.
  await putConfig(request, moduleConfig({ fullScreen: false, presetMinutes: [5] }));
  await page.goto('/display');
  await tapPreset(page, 5);

  const session = await readSession(request);
  expect(session.fullScreen).toBe(false);
  await expect(page.getByTestId('quick-timer')).toHaveAttribute('data-state', 'running');
  await expect(page.getByTestId('quick-timer-remaining')).toContainText(/^\d+:\d\d$/);
  await expect(page.getByText(ROTATION_TEXT)).toBeVisible();
  await expect(page.getByTestId('timer-overlay')).toHaveCount(0);
});
