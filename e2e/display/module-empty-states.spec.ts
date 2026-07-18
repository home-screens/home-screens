import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedChores, seedMeals } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { EMPTY_STATE_FIXTURES, type EmptyStateFixture } from '../helpers/empty-state-fixtures';

/**
 * Empty/error-state coverage. Each EMPTY_STATE_FIXTURES row drives a module
 * into its empty state (empty config, unseeded sandbox, or missing location)
 * and asserts the expected user-facing copy renders — the copy itself is part
 * of the contract (kid-friendly plain language, per project convention). The
 * meta ratchet in e2e/meta/coverage.spec.ts keeps this registry in sync with
 * the components that can actually render an empty state.
 *
 * `local-data` rows deliberately do NOT seed the sandbox — the empty store IS
 * the fixture. Each screen carries an anchor text module so the page has a
 * visible module to wait on before asserting the empty render.
 */
async function renderEmptyState(page: Page, fixture: EmptyStateFixture, request: Parameters<typeof putConfig>[0]): Promise<void> {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const stub = await stubModuleData(page, {
    overrides: fixture.stubKey && fixture.stubBody !== undefined ? { [fixture.stubKey]: fixture.stubBody } : {},
  });

  // The worker's sandbox persists across tests, so an earlier spec may have
  // seeded chores/meals. Empty stores are this suite's fixture — seed them
  // explicitly rather than assuming a virgin sandbox.
  if (fixture.kind === 'local-data') {
    await seedChores(request, { members: [], chores: [] });
    await seedMeals(request, { savedMeals: [], plan: [] });
  }

  const mod = buildModuleInstance(fixture.type, fixture.config ?? {});
  mod.id = `${fixture.type}-empty`;
  const anchor = buildModuleInstance('text', { content: 'E2E ANCHOR' });
  anchor.id = 'anchor';

  // noLocation rows serialize latitude/longitude away entirely — the modules
  // gate on `== null`, and baseConfig's default of 0 is a valid coordinate.
  const settings = fixture.noLocation
    ? { latitude: undefined, longitude: undefined }
    : matrixSettings();

  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [anchor, mod])],
    settings,
  }));
  await page.goto('/display');

  await expect(page.locator('[data-module-id="anchor"]')).toBeVisible();
  await fixture.expect(page.locator(`[data-module-id="${fixture.type}-empty"]`), page);

  expect(pageErrors, `${fixture.type}/${fixture.name} threw an uncaught error`).toEqual([]);
  expect(stub.externalHits, `${fixture.type}/${fixture.name} must not call any external host`).toEqual([]);
}

test.describe('module empty states', () => {
  for (const fixture of EMPTY_STATE_FIXTURES) {
    test(`${fixture.type} · ${fixture.name}`, async ({ page, request }) => {
      await renderEmptyState(page, fixture, request);
    });
  }
});
