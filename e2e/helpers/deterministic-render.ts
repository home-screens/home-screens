import { expect, type Page } from '@playwright/test';
import type { ModuleInstance } from '@/types/config';
import { baseConfig, makeScreen, textModule } from './config-fixtures';
import { putConfig } from './api';

/**
 * Everything it takes to render a module so that two shots of it can be
 * compared pixel for pixel.
 *
 * Shared by the local pixel gallery (e2e/gallery) and the style matrix
 * (e2e/display/module-style.spec.ts). The gallery compares against a baseline
 * on disk; the matrix compares two shots taken minutes apart in one run. Both
 * need the same four things: a clock that does not tick, no motion, a pinned
 * `Math.random`, and every text node client-rendered under that fake clock.
 */

/**
 * Modules whose render cannot be made deterministic, with the reason.
 *
 * Keep this list short and specific. A module parked here is verified by eye,
 * and "it was flaky" is not a reason - the reason has to name the source of
 * the nondeterminism, so the entry can be retired when that source is fixed.
 */
export const QUARANTINE: Partial<Record<string, string>> = {
  // Decodes and paints real video frames; frame timing is not ours to pin.
  video: 'renders decoded video frames',
  'rain-map': 'paints radar tiles the stub serves as opaque binary',
};

/**
 * Pin `Math.random` before any page script runs.
 *
 * Some modules shuffle their content by design - affirmations runs a
 * Fisher-Yates over its pool, slideshows shuffle their sources - so which item
 * is on screen is genuinely random and would flip on every comparison run.
 * Seeding it keeps those modules inside the gate instead of quarantined.
 *
 * This does hide a change in *which* item gets picked. That is the point:
 * the pick is random by contract, so there is nothing there to regress. What
 * the gate still watches is how the picked item is laid out, sized, coloured
 * and typed, which is what every fix in plan 51 touches.
 */
export async function pinRandom(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // mulberry32, fixed seed.
    let a = 0x9e3779b9;
    Math.random = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

/** Phase-1 stand-in, with an id no module fixture can collide with. */
export const PLACEHOLDER: ModuleInstance = textModule('GALLERY PLACEHOLDER', { id: 'gallery-placeholder' });

/**
 * The instant every module renders at.
 *
 * Today's date at a fixed time of day, deliberately not a fixed calendar date:
 * the calendar fixtures build their events relative to the real "today", so a
 * pinned date would render every calendar view empty and the gallery would
 * stop covering them. The cost is that a baseline is only valid for the day it
 * was captured, which is fine - baseline and comparison run minutes apart.
 */
export function galleryInstant(): Date {
  const d = new Date();
  d.setHours(9, 41, 0, 0);
  return d;
}

/**
 * Why the module is mounted by swapping the config instead of being in the
 * config the page loads with.
 *
 * `/display` is server-rendered, so a module in the initial config has its
 * text painted by the *server*, whose clock is real and cannot be faked from
 * the browser. Hydration does not repair it: the clock views carry
 * `suppressHydrationWarning`, so React keeps the server's text, and thereafter
 * it only rewrites a text node whose value changed between two client renders.
 * Under a frozen clock every client render is identical, so it never writes,
 * and the server's wall-clock time stays on screen for the life of the page.
 *
 * Measured, not assumed: with the module in the initial config, the clock
 * rendered `3:04:35 PM` (real time) and never moved, and nudging the fake clock
 * by one second produced `3:04:01 PM` - the server's hours and minutes with the
 * fake clock's seconds, because only the seconds node had changed. Mounting it
 * after load instead renders `9:41:00 AM` and holds.
 *
 * The cost is one config poll per shot (~3s). Worth it: without this the
 * gallery silently bakes real wall-clock time into a third of its baseline.
 */
export async function mountClientSide(
  page: Page,
  request: Parameters<typeof putConfig>[0],
  settings: Record<string, unknown>,
  mod: ModuleInstance,
): Promise<void> {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [mod])],
    settings,
  }));
  await expect(page.locator(`[data-module-id="${mod.id}"]`)).toBeVisible({ timeout: 20_000 });
}

/** Everything that has to be true before a screenshot is worth taking. */
export async function settle(page: Page): Promise<void> {
  // The real face changes every measurement the auto-sizing hooks make. A
  // baseline captured mid-swap is a baseline of the bug this work is about.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Modules that bisect their scale stamp this while the search is running
  // (useFitScale.ts). Absent on modules that don't bisect, so a zero count is
  // the normal case, not a wait.
  await expect(page.locator('[data-fit-settled="false"]')).toHaveCount(0, { timeout: 20_000 });
}
