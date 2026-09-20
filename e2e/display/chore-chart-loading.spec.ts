import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { CHORE_DATA, putConfig, seedHouseholdChores, seedRedemptions } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * A chore chart with nothing loaded yet is not a family with no members. On a
 * freshly started Pi the roster takes seconds to arrive, and for that whole
 * stretch both charts used to tell a set-up household to go and add people.
 */
const CHARTS = [
  { type: 'chore-chart', config: {} },
  { type: 'fullscreen-chore-chart', config: { view: 'chores' } },
] as const;

for (const chart of CHARTS) {
  test.describe(`${chart.type} before its data arrives`, () => {
    test.beforeEach(async ({ request, sandboxDir }) => {
      await seedHouseholdChores(request, sandboxDir, CHORE_DATA);
      const mod = buildModuleInstance(chart.type, chart.config);
      mod.id = 'chart';
      await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])], settings: matrixSettings() }));
    });

    test('says it is loading, then draws the family', async ({ page }) => {
      let release = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      await page.route('**/api/family', async (route) => {
        await held;
        await route.continue();
      });

      await page.goto('/display');
      const mod = page.locator('[data-module-id="chart"]');
      await expect(mod).toContainText('Loading chores');
      await expect(mod).not.toContainText('No family members yet');

      release();
      await expect(mod).toContainText('Avery');
      await expect(mod).not.toContainText('Loading chores');
    });

    test('a roster that cannot be read is not an empty family', async ({ page }) => {
      await page.route('**/api/family', (route) => route.fulfill({ status: 500, json: { error: 'boom' } }));

      await page.goto('/display');
      const mod = page.locator('[data-module-id="chart"]');
      await expect(mod.getByTestId('module-not-updating')).toBeVisible();
      await expect(mod).not.toContainText('No family members yet');
    });
  });
}

/**
 * The reward history is drawn from the rewards fetch alone, which the other
 * views treat as optional. Until it lands, or when it fails, the card must not
 * tell a family with redemptions that nobody has redeemed anything.
 */
test.describe('chore-chart reward history before its rewards arrive', () => {
  test.beforeEach(async ({ request, sandboxDir }) => {
    await seedHouseholdChores(request, sandboxDir, CHORE_DATA);
    seedRedemptions(sandboxDir);
    const mod = buildModuleInstance('chore-chart', { view: 'reward-history' });
    mod.id = 'chart';
    await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])], settings: matrixSettings() }));
  });

  test('says it is loading, then lists the redemptions', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/rewards', async (route) => {
      await held;
      await route.continue();
    });

    await page.goto('/display');
    const mod = page.locator('[data-module-id="chart"]');
    await expect(mod).toContainText('Loading chores');
    await expect(mod).not.toContainText('No rewards redeemed yet');

    release();
    await expect(mod).toContainText('Movie night');
    await expect(mod).not.toContainText('No rewards redeemed yet');
  });

  test('rewards that cannot be read are not an empty history', async ({ page }) => {
    await page.route('**/api/rewards', (route) => route.fulfill({ status: 500, json: { error: 'boom' } }));

    await page.goto('/display');
    const mod = page.locator('[data-module-id="chart"]');
    await expect(mod.getByTestId('module-not-updating')).toBeVisible();
    await expect(mod).not.toContainText('No rewards redeemed yet');
  });
});
