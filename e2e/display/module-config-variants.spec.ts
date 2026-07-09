import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { CONFIG_VARIANTS, type ConfigVariant } from '../helpers/config-variants';

/**
 * Config-variant coverage. The render matrices (modules-static/data.spec.ts)
 * exercise each module's defaultConfig; the view matrix (module-views.spec.ts)
 * mutates only the view key. This matrix flips every OTHER rendering-affecting
 * config field (data in ../helpers/config-variants.ts) and asserts a
 * content-level marker proving the flip changed what renders — plus that no
 * uncaught error fired and (unless the row loads tiles) no external host was hit.
 *
 * Each screen carries an anchor text module (distinct id) alongside the variant
 * module (id `<type>-v`). The anchor guarantees the page has a visible module to
 * wait on even when the variant itself renders nothing (e.g. a hidden weather
 * module), and the id keeps the variant addressable without colliding with the
 * anchor's `data-module-type="text"`.
 */
async function renderVariant(page: Page, request: APIRequestContext, variant: ConfigVariant): Promise<void> {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const overrides: Record<string, unknown> = {};
  if (variant.stubKey) {
    if (variant.stubBody !== undefined) {
      overrides[variant.stubKey] = variant.stubBody;
    } else if (variant.stubKey === 'calendar') {
      // Calendar views only surface events within a few days of the test clock.
      overrides.calendar = todayCalendarEvents();
    }
  }
  const stub = await stubModuleData(page, { overrides }); // also blocks external hosts

  if (variant.seed === 'chores') await seedChores(request, variant.seedData ?? undefined);
  if (variant.seed === 'meals') await seedMeals(request, variant.seedData ?? undefined);

  const variantModule = buildModuleInstance(variant.type, variant.config);
  variantModule.id = `${variant.type}-v`;
  const anchor = buildModuleInstance('text', { content: 'E2E ANCHOR' });
  anchor.id = 'anchor';
  const companions = (variant.companions ?? []).map((c, i) => {
    const mod = buildModuleInstance(c.type, c.config ?? {});
    mod.id = `companion-${i}`;
    return mod;
  });

  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [anchor, variantModule, ...companions])],
    settings: { ...matrixSettings(), ...(variant.settings ?? {}) },
  }));
  await page.goto('/display');

  await expect(page.locator('[data-module-id="anchor"]')).toBeVisible();

  const mod = page.locator(`[data-module-id="${variant.type}-v"]`);
  await variant.expect(mod, page);

  expect(pageErrors, `${variant.type}/${variant.name} threw an uncaught error`).toEqual([]);
  if (!variant.allowsExternal) {
    expect(stub.externalHits, `${variant.type}/${variant.name} must not call any external host`).toEqual([]);
  }
}

for (const kind of ['network-free', 'networked', 'local-data'] as const) {
  test.describe(`config variants · ${kind}`, () => {
    for (const variant of CONFIG_VARIANTS.filter((v) => v.kind === kind)) {
      test(`${variant.type} · ${variant.name}`, async ({ page, request }) => {
        await renderVariant(page, request, variant);
      });
    }
  });
}
