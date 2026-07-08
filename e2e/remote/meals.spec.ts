import { test, expect } from '../fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';

// The Meals tab only appears when a meal-planner module exists in the config.
test.beforeEach(async ({ request }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])],
  }));
  await seedMeals(request); // one saved meal: "Spaghetti Night"
});

test('the Meals tab library lists a seeded meal', async ({ page }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals' }).click();
  await page.getByRole('button', { name: 'Library' }).click();

  await expect(page.getByText('Spaghetti Night')).toBeVisible();
});

test('favoriting a meal round-trips to meals.json', async ({ page, request }) => {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals' }).click();
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByText('Spaghetti Night')).toBeVisible();

  // exact: the outer meal-card button's accessible name also contains this text.
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/meals/data');
      const meal = (await res.json()).savedMeals.find((m: { id: string }) => m.id === 'meal-1');
      return meal?.isFavorite;
    })
    .toBe(true);
});
