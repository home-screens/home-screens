import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedChores, seedMeals, todayCalendarEvents } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { VIEW_MATRIX, type ViewSpec } from '../helpers/view-matrix';

/**
 * Multi-view coverage. Each high-view module (data in ../helpers/view-matrix.ts)
 * renders in every one of its views without throwing.
 *
 * The assertion is deliberately shallow: the module wrapper mounts and no
 * uncaught exception fires (a `pageerror` is how a React render crash surfaces).
 * Pinning per-view markers across ~95 view combos would be brittle; the render
 * matrix already pins happy-path content for the default view of each module.
 * The `*View` unions in src/types/config.ts are held in lockstep with VIEW_MATRIX
 * by the ratchet in e2e/meta/coverage.spec.ts.
 */
async function renderView(page: Page, request: APIRequestContext, spec: ViewSpec, view: string): Promise<void> {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const overrides = spec.stubKey === 'calendar' ? { calendar: todayCalendarEvents() } : undefined;
  await stubModuleData(page, { overrides }); // also blocks external hosts

  if (spec.seed === 'chores') await seedChores(request);
  if (spec.seed === 'meals') await seedMeals(request);

  const instance = buildModuleInstance(spec.type, { ...(spec.config ?? {}), [spec.key]: view });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [instance])],
    settings: matrixSettings(),
  }));
  await page.goto('/display');

  await expect(page.locator(`[data-module-type="${spec.type}"]`).first()).toBeVisible();
  expect(pageErrors, `${spec.type}/${view} threw an uncaught error`).toEqual([]);
}

for (const spec of VIEW_MATRIX) {
  test.describe(`${spec.type} views`, () => {
    for (const view of spec.views) {
      test(`${spec.type} · ${view}`, async ({ page, request }) => {
        await renderView(page, request, spec, view);
      });
    }
  });
}
