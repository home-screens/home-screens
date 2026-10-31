import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, seedMeals } from '../helpers/api';
import { confirmSheet } from '../helpers/remote';
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
    groceryChecked: Record<string, string[]>;
    settings: { weekStartDay: 'sunday' | 'monday' };
  }>;
}

/**
 * The key a week's grocery ticks live under: the day that week starts on, by
 * the household's week start setting (an earlier test may have changed it).
 * `offsetDays` picks the week holding that day.
 */
async function groceryWeekKey(request: APIRequestContext, offsetDays = 0): Promise<string> {
  const { settings } = await getMealData(request);
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dow = d.getDay();
  d.setDate(d.getDate() - (settings.weekStartDay === 'monday' ? (dow + 6) % 7 : dow));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function groceryTicks(request: APIRequestContext, week: string): Promise<string[]> {
  return (await getMealData(request)).groceryChecked[week] ?? [];
}

async function openMeals(page: Page) {
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
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
  await seedMeals(request, { ...mealWithIngredients(), groceryChecked: {} });
  const week = await groceryWeekKey(request);
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Grocery' }).click();

  // The list is auto-derived from this week's planned meals' ingredients.
  const item = page.getByRole('button', { name: /Tortillas/ });
  await expect(item).toBeVisible();
  await item.click();

  // Check-off posts to /api/meals/grocery, persisting the lowercased name
  // on this week's list.
  await expect
    .poll(async () => groceryTicks(request, week))
    .toContain('tortillas');
});

test('a grocery tick stays on the week it was made on', async ({ page, request }) => {
  // The same meal this week and next: tortillas bought this week are still to
  // buy next week.
  await seedMeals(request, {
    savedMeals: mealWithIngredients().savedMeals,
    plan: [
      { slot: 'dinner', mealId: 'meal-1', date: isoDate(0) },
      { slot: 'dinner', mealId: 'meal-1', date: isoDate(7) },
    ],
    groceryChecked: {},
  });
  const thisWeek = await groceryWeekKey(request);
  const nextWeek = await groceryWeekKey(request, 7);
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Grocery' }).click();

  await page.getByRole('button', { name: /Tortillas/ }).click();
  await expect.poll(async () => groceryTicks(request, thisWeek)).toContain('tortillas');
  await expect(page.getByText('1 of 2 items')).toBeVisible();

  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByText('0 of 2 items')).toBeVisible();
  expect(await groceryTicks(request, nextWeek)).toEqual([]);

  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.getByText('1 of 2 items')).toBeVisible();
});

test('unchecking a grocery item round-trips', async ({ page, request }) => {
  // Seed the same planned meal but with Tortillas already checked off this week.
  const week = await groceryWeekKey(request);
  await seedMeals(request, { ...mealWithIngredients(), groceryChecked: { [week]: ['tortillas'] } });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Grocery' }).click();

  // Tapping an already-checked item clears it — POST /api/meals/grocery toggles.
  await page.getByRole('button', { name: /Tortillas/ }).click();

  await expect
    .poll(async () => groceryTicks(request, week))
    .not.toContain('tortillas');
});

test('the grocery list groups items by ingredient category', async ({ page, request }) => {
  // Each ingredient carries its own category (Tortillas → bakery, Ground Beef →
  // meat), and generateGroceryList buckets by that field, so two labelled groups
  // render. Reset groceryChecked so a prior test's checks don't leak in.
  await seedMeals(request, { ...mealWithIngredients(), groceryChecked: {} });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Grocery' }).click();

  // Category headers come from core.meal.grocery.categoryLabels.*.
  await expect(page.getByText('Bakery')).toBeVisible();
  await expect(page.getByText('Meat & Seafood')).toBeVisible();
  // Items land under their category. Names are re-cased to leading-caps only,
  // so "Ground Beef" renders as "Ground beef".
  await expect(page.getByRole('button', { name: /Tortillas/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ground beef/ })).toBeVisible();
});

// ── Saved meals: edit + delete ────────────────────────────────────────

test('editing a saved meal round-trips to meals.json', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-edit', name: 'Taco Tuesday', emoji: '🌮' }],
    plan: [],
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Library' }).click();

  // Tapping a library card reopens the same MealFormOverlay in edit mode.
  await page.getByRole('button', { name: /Taco Tuesday/ }).click();
  await expect(page.getByText('Edit Meal')).toBeVisible();

  await page.getByPlaceholder('e.g. Chicken Stir Fry').fill('Taco Wednesday');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect
    .poll(async () => (await getMealData(request)).savedMeals.map((m) => m.name))
    .toEqual(['Taco Wednesday']);
});

test('deleting a saved meal removes it and clears its planned slots', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [
      { id: 'meal-keep', name: 'Pancake Morning', emoji: '🥞' },
      { id: 'meal-del', name: 'Sloppy Joes', emoji: '🍔' },
    ],
    plan: [{ slot: 'dinner', mealId: 'meal-del', date: isoDate(0) }],
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Library' }).click();

  await page.getByRole('button', { name: /Sloppy Joes/ }).click();
  await expect(page.getByText('Edit Meal')).toBeVisible();

  // The overlay footer's "Delete Meal" opens a confirm sheet whose confirm
  // button carries the same label; scope to the sheet to tell them apart.
  await page.getByRole('button', { name: 'Delete Meal', exact: true }).click();
  await expect(page.getByText('Delete "Sloppy Joes"?')).toBeVisible();
  await confirmSheet(page).getByRole('button', { name: 'Delete Meal', exact: true }).click();

  await expect
    .poll(async () => {
      const data = await getMealData(request);
      return {
        names: data.savedMeals.map((m) => m.name),
        // deleteMeal also strips plan entries pointing at the removed meal.
        planForDeleted: data.plan.filter((p) => p.mealId === 'meal-del').length,
      };
    })
    .toEqual({ names: ['Pancake Morning'], planForDeleted: 0 });
});

// ── Planning: remove + week navigation ────────────────────────────────

test('removing a planned meal from a slot round-trips', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-1', name: 'Spaghetti Night', emoji: '🍝' }],
    plan: [{ slot: 'dinner', mealId: 'meal-1', date: isoDate(0) }],
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();

  // A filled slot is a button labelled "Change <meal> for <slot>". Tapping it
  // opens the meal sheet (the dish, its courses and the serving time), whose
  // Clear takes the meal off; a lone dish goes without asking.
  await page.getByRole('button', { name: /Change Spaghetti Night/ }).click();
  await page.getByRole('button', { name: 'Clear this dinner' }).click();

  await expect
    .poll(async () => (await getMealData(request)).plan.filter((p) => p.slot === 'dinner' && p.mealId === 'meal-1').length)
    .toBe(0);
});

test('week navigation shows the plan slice for the viewed week', async ({ page, request }) => {
  // One meal planned this week, one exactly a week out. A week is 7 days, so
  // whatever weekStartDay is in effect, today sits in the current window and
  // today+7 sits in the next — the two never share a window. Pin sunday anyway
  // so the fixture is self-describing.
  await seedMeals(request, {
    savedMeals: [
      { id: 'm-this', name: 'This Week Supper', emoji: '🍲' },
      { id: 'm-next', name: 'Next Week Supper', emoji: '🥘' },
    ],
    plan: [
      { slot: 'dinner', mealId: 'm-this', date: isoDate(0) },
      { slot: 'dinner', mealId: 'm-next', date: isoDate(7) },
    ],
    settings: { weekStartDay: 'sunday' },
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();

  // Current week: only this week's meal is in the visible slice.
  await expect(page.getByText('This Week Supper')).toBeVisible();
  await expect(page.getByText('Next Week Supper')).toHaveCount(0);

  // Advance one week — the slice swaps to next week's entry.
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.getByText('Next Week Supper')).toBeVisible();
  await expect(page.getByText('This Week Supper')).toHaveCount(0);

  // Back to the current week restores the original slice.
  await page.getByRole('button', { name: 'Previous week' }).click();
  await expect(page.getByText('This Week Supper')).toBeVisible();
  await expect(page.getByText('Next Week Supper')).toHaveCount(0);
});

// ── Cross-surface writes ──────────────────────────────────────────────
//
// The Meals tab fetches once on mount and never polls, so anything another
// surface writes afterwards is invisible to it. It used to PUT its whole
// `savedMeals` and `plan` on every change regardless, so whichever request
// landed second won the half it had never touched and the loser was never
// told. Each action now sends only the half it changed.

test('a plan edit leaves a meal added elsewhere alone', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-1', name: 'Spaghetti Night', emoji: '🍝' }],
    plan: [],
    force: true,
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();

  // Another surface (the editor modal, a second phone) adds a meal after this
  // page loaded. Its copy of the library is now one meal short.
  await seedMeals(request, {
    savedMeals: [
      { id: 'meal-1', name: 'Spaghetti Night', emoji: '🍝' },
      { id: 'meal-2', name: 'Late Addition', emoji: '🥗' },
    ],
  });

  await page.getByRole('button', { name: /Plan Dinner for/ }).first().click();
  await page.getByRole('button', { name: /Spaghetti Night/ }).click();

  await expect
    .poll(async () => {
      const data = await getMealData(request);
      return {
        names: data.savedMeals.map((m) => m.name).sort(),
        dinners: data.plan.filter((p) => p.slot === 'dinner' && p.mealId === 'meal-1').length,
      };
    })
    .toEqual({ names: ['Late Addition', 'Spaghetti Night'], dinners: 1 });
});

/* Two phones planning the same week. Both loaded an empty plan; the other
 * planned lunch first. This phone's dinner is built from its older copy, so
 * the hub refuses it with the current plan, and the phone re-applies the
 * dinner on top of that: both slots survive, nobody re-does anything. */
test('a slot planned from an older copy lands next to what another phone planned since', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-1', name: 'Spaghetti Night', emoji: '🍝' }],
    plan: [],
    force: true,
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();

  // The other phone saves first; its write moves the revision this page holds.
  await seedMeals(request, { plan: [{ slot: 'lunch', mealId: 'meal-1', date: isoDate(0) }] });

  await page.getByRole('button', { name: /Plan Dinner for/ }).first().click();
  await page.getByRole('button', { name: /Spaghetti Night/ }).click();

  await expect
    .poll(async () => {
      const plan = (await getMealData(request)).plan.filter((p) => p.mealId === 'meal-1');
      return plan.map((p) => p.slot).sort();
    })
    .toEqual(['dinner', 'lunch']);
  await expect(page.getByText(/Failed to save|Network error/)).toHaveCount(0);
});

test('a library edit leaves a meal planned elsewhere alone', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-edit', name: 'Taco Tuesday', emoji: '🌮' }],
    plan: [],
    force: true,
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Library' }).click();

  // Another surface plans that meal for tonight while this page sits on the
  // Library tab holding an empty plan.
  await seedMeals(request, {
    plan: [{ slot: 'dinner', mealId: 'meal-edit', date: isoDate(0) }],
  });

  await page.getByRole('button', { name: /Taco Tuesday/ }).click();
  await expect(page.getByText('Edit Meal')).toBeVisible();
  await page.getByPlaceholder('e.g. Chicken Stir Fry').fill('Taco Wednesday');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect
    .poll(async () => {
      const data = await getMealData(request);
      return { names: data.savedMeals.map((m) => m.name), planned: data.plan.length };
    })
    .toEqual({ names: ['Taco Wednesday'], planned: 1 });
});
