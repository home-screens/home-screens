import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { putConfig, seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, MODULE_FIXTURES, allBuiltinTypes } from '../helpers/module-fixtures';
import { getModuleDefinition } from '@/lib/module-registry';
import type { ModuleInstance } from '@/types/config';
import { SCENARIOS, applyScenario, scenarioSettings } from './scenarios';

/**
 * The pixel gallery: the render matrix with a screenshot where the assertion
 * goes.
 *
 * It exists to answer one question before any settings-pipeline fix lands -
 * "did this repaint a wall someone already built?" - as a checked fact rather
 * than an argument. See `.claude/plans/51-module-settings-fixes-execution.md`.
 *
 * Not part of CI. Pixel snapshots are exactly what 66e4d7cf removed from CI,
 * for good reasons that have not changed; this runs locally, on one machine,
 * against a baseline captured on that same machine minutes earlier.
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
async function pinRandom(page: Page): Promise<void> {
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
const PLACEHOLDER: ModuleInstance = textModule('GALLERY PLACEHOLDER', { id: 'gallery-placeholder' });

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
async function mountClientSide(
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
async function settle(page: Page): Promise<void> {
  // The real face changes every measurement the auto-sizing hooks make. A
  // baseline captured mid-swap is a baseline of the bug this work is about.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Modules that bisect their scale stamp this while the search is running
  // (useFitScale.ts). Absent on modules that don't bisect, so a zero count is
  // the normal case, not a wait.
  await expect(page.locator('[data-fit-settled="false"]')).toHaveCount(0, { timeout: 20_000 });
}

export function runGallery(label: string): void {
  const scenario = SCENARIOS.find((s) => s.label === label);
  if (!scenario) throw new Error(`No gallery scenario "${label}"`);

  test.describe(`gallery: ${scenario.label} (${scenario.who})`, () => {
    for (const type of allBuiltinTypes()) {
      const fx = MODULE_FIXTURES[type];
      const quarantined = QUARANTINE[type];

      test(`${type}`, async ({ page, request }) => {
        test.skip(!!quarantined, `quarantined: ${quarantined}`);

        await page.clock.setFixedTime(galleryInstant());
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await pinRandom(page);

        if (fx.kind === 'networked' || fx.kind === 'network-free') {
          const overrides = fx.stubKey === 'calendar' ? { calendar: todayCalendarEvents() } : undefined;
          await stubModuleData(page, { overrides });
        }
        if (fx.seed === 'chores') await seedChores(request);
        if (fx.seed === 'meals') await seedMeals(request);

        const def = getModuleDefinition(type);
        const mod = applyScenario(
          buildModuleInstance(type, fx.config),
          scenario,
          { fillsCanvas: !!def?.fillsCanvas, displayW: 1080, displayH: 1920 },
        );

        const settings = scenarioSettings(scenario);
        // Phase 1: load the page with a placeholder, so the server render
        // contains no instance of the module under test. Same settings in both
        // phases, so the server-rendered i18n provider is already on the
        // scenario's locale.
        await renderOnDisplay(page, request, baseConfig({
          screens: [makeScreen('s1', 'S1', [PLACEHOLDER])],
          settings,
        }));
        // Phase 2: swap it in, so every text node is client-rendered under the
        // fake clock (see mountClientSide).
        await mountClientSide(page, request, settings, mod);

        const target = page.locator(`[data-module-id="${mod.id}"]`);

        // The fixture's own content assertion, where it still holds: it proves
        // the module painted its data rather than an empty shell, so a
        // screenshot of a blank card can never become the baseline. Skipped
        // under a locale override, where the fixtures' English expectations
        // are not the contract.
        if (!scenario.settings?.locale) await fx.expect(target, page);

        await settle(page);

        await expect(target).toHaveScreenshot([scenario.label, `${type}.png`], {
          animations: 'disabled',
          caret: 'hide',
          // A strict gate on purpose: same machine, same browser, minutes
          // apart. Any tolerance here is a place for a real change to hide.
          threshold: 0,
          maxDiffPixels: 0,
        });
      });
    }
  });
}
