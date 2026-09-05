import { test, expect } from '../fixtures';
import type { Locator, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings, MODULE_FIXTURES, type ModuleFixture } from '../helpers/module-fixtures';
import { PLACEHOLDER, QUARANTINE, galleryInstant, mountClientSide, pinRandom, settle } from '../helpers/deterministic-render';
import { STYLE_EXEMPTIONS, probesFor, styleMatrixTypes } from '../helpers/style-matrix';
import { seedFixturePlugin, FIXTURE_PLUGIN_TYPE } from '../helpers/fixture-plugin';
import { DEFAULT_MODULE_STYLE, type ModuleInstance } from '@/types/config';

/**
 * Every Style control the editor offers has to reach the module.
 *
 * For each module the Property Panel shows a Style section for, mount it under
 * a frozen clock, take a shot, change exactly one control through the config
 * poll, and take another. If the two are byte-identical the control is inert
 * for that module and the test says which one. This is the ratchet plan 50
 * asked for (item 14): it fails for a module that hardcodes white, sizes its
 * type in px, or paints its own opaque background, on the day that lands.
 *
 * Two shots in one run, never a baseline on disk, so it is CI-safe where the
 * pixel gallery (e2e/gallery) deliberately is not.
 *
 * The guard that keeps it honest is the first comparison: two shots of the
 * untouched module a moment apart have to be identical. A module that repaints
 * on its own (a ticking clock, a marquee, a crossfade) would pass every probe
 * for the wrong reason, so it fails here instead, before any probe runs.
 */

/** Same-instance shot; motion finished, caret hidden. */
const shoot = (target: Locator) => target.screenshot({ animations: 'disabled', caret: 'hide' });

async function prepare(page: Page, request: Parameters<typeof putConfig>[0], fx: ModuleFixture | undefined) {
  await page.clock.setFixedTime(galleryInstant());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pinRandom(page);
  // Same stub rules as the gallery: a calendar-backed module needs events dated
  // against the test clock or it renders empty, and a local-data module needs
  // its API seeded. A plugin has no fixture row and needs neither.
  if (fx?.kind === 'networked' || fx?.kind === 'network-free') {
    const overrides = fx.stubKey === 'calendar' ? { calendar: todayCalendarEvents() } : undefined;
    await stubModuleData(page, { overrides });
  }
  if (fx?.seed === 'chores') await seedChores(request);
  if (fx?.seed === 'meals') await seedMeals(request);
}

async function probeEveryControl(
  page: Page,
  request: Parameters<typeof putConfig>[0],
  mod: ModuleInstance,
  assertContent: (target: Locator) => Promise<void>,
) {
  const settings = matrixSettings();
  // Two-phase mount so every text node is client-rendered under the fake
  // clock (see mountClientSide for why the server's clock cannot be faked).
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [PLACEHOLDER])],
    settings,
  }));
  await mountClientSide(page, request, settings, mod);
  const target = page.locator(`[data-module-id="${mod.id}"]`);
  await assertContent(target);
  await settle(page);

  const base = await shoot(target);
  // The determinism guard. Nothing about the config changed between these
  // two, so any difference is the module repainting on its own, and every
  // probe below would pass for the wrong reason.
  await page.waitForTimeout(1_000);
  const again = await shoot(target);
  expect(
    again.equals(base),
    `${mod.type} repaints on its own with nothing changed, so a probe cannot tell a live control from a moving picture. ` +
    'Find the motion and pin it (see deterministic-render.ts), or quarantine the module there with the reason.',
  ).toBe(true);

  for (const [i, probe] of probesFor(mod.type).entries()) {
    const exempt = STYLE_EXEMPTIONS[mod.type]?.[probe.field];
    if (exempt) continue;
    // One field off the default at a time, so a failure names the control.
    // The z-index bump is the "config applied" signal: the wrapper carries it
    // inline, it is polled for below, and on its own it cannot move a pixel
    // inside the module's box.
    const zIndex = i + 2;
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [{ ...mod, zIndex, style: { ...mod.style, [probe.field]: probe.value } }])],
      settings,
    }));
    await expect(target).toHaveCSS('z-index', String(zIndex), { timeout: 20_000 });
    await settle(page);
    const probed = await shoot(target);
    expect(
      probed.equals(base),
      `${mod.type}: Style > ${probe.field} changed from ${JSON.stringify(mod.style[probe.field])} to ${JSON.stringify(probe.value)} ` +
      'and the module painted exactly the same pixels, so the control is inert for it. ' +
      'Make the module honour it, or add a reasoned STYLE_EXEMPTIONS entry in e2e/helpers/style-matrix.ts.',
    ).toBe(false);
  }
}

for (const type of styleMatrixTypes()) {
  const fx = MODULE_FIXTURES[type];
  const quarantined = QUARANTINE[type];

  test(`${type} honours every Style control`, async ({ page, request }) => {
    test.skip(!!quarantined, `quarantined: ${quarantined}`);
    await prepare(page, request, fx);
    const mod = buildModuleInstance(type, fx.config);
    // The fixture's own assertion is the wait for real content: probing a
    // loading state would compare the wrong tree entirely.
    await probeEveryControl(page, request, mod, (target) => fx.expect(target, page));
  });
}

/**
 * Plugins render bare, outside ModuleWrapper, and paint their own card from
 * `style`. This is the test that settles whether the host still hands it to
 * them: a grep once said plugins ignored ModuleStyle and nearly cost every
 * plugin its Style section (plan 50, item 2).
 */
test(`${FIXTURE_PLUGIN_TYPE} honours every Style control`, async ({ page, request, sandboxDir }) => {
  seedFixturePlugin(sandboxDir, { styled: true });
  await prepare(page, request, undefined);
  const mod = {
    id: 'plugin-style-1',
    type: FIXTURE_PLUGIN_TYPE,
    position: { x: 0, y: 0 },
    size: { w: 320, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    config: { label: 'E2E PLUGIN' },
  } as ModuleInstance;
  await probeEveryControl(page, request, mod, (target) => expect(target).toContainText('E2E PLUGIN'));
});
