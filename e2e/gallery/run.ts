import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { PLACEHOLDER, QUARANTINE, galleryInstant, mountClientSide, pinRandom, settle } from '../helpers/deterministic-render';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, MODULE_FIXTURES, allBuiltinTypes } from '../helpers/module-fixtures';
import { getModuleDefinition } from '@/lib/module-registry';
import { SCENARIOS, VIEW_VARIANTS, applyScenario, scenarioSettings } from './scenarios';

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

    // Non-default views a fix has touched (see VIEW_VARIANTS).
    for (const variant of VIEW_VARIANTS) {
      const fx = MODULE_FIXTURES[variant.type];
      test(`${variant.type} (${variant.name})`, async ({ page, request }) => {
        await page.clock.setFixedTime(galleryInstant());
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await pinRandom(page);
        // Same stub rules as the matrix above: a calendar-backed module needs
        // events dated against the test clock or its views render empty, and a
        // local-data module needs its API seeded.
        const overrides = {
          ...(fx.stubKey === 'calendar' ? { calendar: todayCalendarEvents() } : {}),
          ...(variant.stubOverrides ?? {}),
        };
        await stubModuleData(page, Object.keys(overrides).length ? { overrides } : {});
        if (fx.seed === 'chores') await seedChores(request);
        if (fx.seed === 'meals') await seedMeals(request);

        const def = getModuleDefinition(variant.type);
        const mod = applyScenario(
          buildModuleInstance(variant.type, { ...fx.config, ...variant.config }),
          scenario,
          { fillsCanvas: !!def?.fillsCanvas, displayW: 1080, displayH: 1920 },
        );
        mod.id = `${variant.type}-${variant.name}`;

        const settings = scenarioSettings(scenario);
        await renderOnDisplay(page, request, baseConfig({
          screens: [makeScreen('s1', 'S1', [PLACEHOLDER])],
          settings,
        }));
        await mountClientSide(page, request, settings, mod);

        const target = page.locator(`[data-module-id="${mod.id}"]`);
        await expect(target).toBeVisible();
        await settle(page);

        await expect(target).toHaveScreenshot([scenario.label, `${variant.type}-${variant.name}.png`], {
          animations: 'disabled',
          caret: 'hide',
          threshold: 0,
          maxDiffPixels: 0,
        });
      });
    }
  });
}
