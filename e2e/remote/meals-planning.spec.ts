import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, seedMeals } from '../helpers/api';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * /remote meal-planning — UI-CRUD + persistence round-trip against meals.json.
 * Shape/normalization/prune semantics are covered at the lib level
 * (src/lib/__tests__/meal-data.test.ts, meal-constants.test.ts); these specs
 * drive the real MealsTab views and assert the writes reach disk the way the
 * display reads them back.
 */

/** Local YYYY-MM-DD offset from today — matches how the planner keys entries. */
function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A saved meal carrying ingredients, planned for today, so the auto-derived
// grocery list has items to check off within the current viewing week.
function mealWithIngredients() {
  return {
    savedMeals: [{
      id: 'meal-1',
      name: 'Taco Tuesday',
      emoji: '🌮',
      ingredients: [
        { name: 'Tortillas', amount: '8', category: 'bakery' },
        { name: 'Ground Beef', amount: '1 lb', category: 'meat' },
      ],
    }],
    plan: [{ slot: 'dinner', mealId: 'meal-1', date: isoDate(0) }],
  };
}

async function getMealData(request: APIRequestContext) {
  const res = await request.get('/api/meals/data');
  expect(res.ok()).toBe(true);
  return res.json() as Promise<{
    savedMeals: Array<{ id: string; name: string }>;
    plan: Array<{ slot: string; mealId?: string; date: string }>;
    groceryChecked: string[];
    settings: { weekStartDay: 'sunday' | 'monday' };
  }>;
}

async function openMeals(page: Page) {
  await page.getByRole('button', { name: 'Meals' }).click();
}

test.beforeEach(async ({ request }) => {
  // A meal-planner module in config is what surfaces the Meals tab on /remote.
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])],
  }));
});

// ── Saved meals ───────────────────────────────────────────────────────

test('adding a saved meal round-trips to meals.json', async ({ page, request }) => {
  // force: clears any library a prior test in this worker left, so the round-trip
  // assertion sees only what this test adds. (The empty-overwrite guard blocks an
  // empty payload over existing data otherwise.)
  await seedMeals(request, { savedMeals: [], plan: [], force: true });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Library' }).click();

  await page.getByRole('button', { name: 'Add new meal' }).click();
  await page.getByPlaceholder('e.g. Chicken Stir Fry').fill('Sunday Roast');
  await page.getByRole('button', { name: 'Save Meal' }).click();

  await expect
    .poll(async () => (await getMealData(request)).savedMeals.map((m) => m.name))
    .toContain('Sunday Roast');
});

// ── Planning ──────────────────────────────────────────────────────────

test('assigning a saved meal to a dinner slot round-trips', async ({ page, request }) => {
  // One saved meal ("Spaghetti Night") and an empty plan.
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-1', name: 'Spaghetti Night', emoji: '🍝', prepTime: 25 }],
    plan: [],
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();

  // Pick the first empty dinner slot of the visible week, then choose the meal.
  await page.getByRole('button', { name: /Plan Dinner for/ }).first().click();
  await expect(page.getByText('Choose a Meal')).toBeVisible();
  await page.getByRole('button', { name: /Spaghetti Night/ }).click();

  await expect
    .poll(async () => {
      const plan = (await getMealData(request)).plan;
      return plan.filter((p) => p.slot === 'dinner' && p.mealId === 'meal-1').length;
    })
    .toBeGreaterThan(0);
});

// ── Settings (week start) ─────────────────────────────────────────────

test('changing the week start day round-trips', async ({ page, request }) => {
  await seedMeals(request, { savedMeals: [], plan: [], force: true }); // defaults to sunday
  await page.goto('/remote');
  await openMeals(page);

  await page.getByRole('button', { name: 'Open meal settings' }).click();
  await page.getByRole('button', { name: 'Monday', exact: true }).click();
  await page.getByRole('button', { name: 'Save Settings' }).click();

  await expect
    .poll(async () => (await getMealData(request)).settings.weekStartDay)
    .toBe('monday');
});

// ── Grocery ───────────────────────────────────────────────────────────

test('the grocery list is generated from planned meals and check-off round-trips', async ({ page, request }) => {
  await seedMeals(request, mealWithIngredients());
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Grocery' }).click();

  // The list is auto-derived from this week's planned meals' ingredients.
  const item = page.getByRole('button', { name: /Tortillas/ });
  await expect(item).toBeVisible();
  await item.click();

  // Check-off posts to /api/meals/grocery, persisting the lowercased name.
  await expect
    .poll(async () => (await getMealData(request)).groceryChecked)
    .toContain('tortillas');
});
