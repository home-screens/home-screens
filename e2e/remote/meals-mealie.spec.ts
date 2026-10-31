import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { connectFakeMealie, defaultFakeEntries, disconnectFakeMealie, FAKE_RECIPES, fakeMealieDay, startFakeMealie, type FakeMealie } from '../helpers/fake-mealie';

/**
 * Planning on the phone with sides, desserts and drinks: against the plan in
 * Mealie (every change lands in Mealie, the in-process fake in
 * helpers/fake-mealie.ts), and against the family's own plan.
 */

let mealie: FakeMealie | null = null;

async function openMeals(page: Page) {
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
}

test.beforeEach(async ({ request }) => {
  // A meal-planner module in config is what surfaces the Meals tab on /remote.
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])] }));
});

test.afterEach(async ({ request }) => {
  await disconnectFakeMealie(request);
  await mealie?.close();
  mealie = null;
});

test('the week from Mealie shows its courses, and a typed dessert lands in Mealie as a note', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await page.goto('/remote');
  await openMeals(page);

  // A plain label, not a link to Mealie (a child would land on its sign-in).
  await expect(page.getByTestId('meals-source-pill')).toHaveText('From Mealie');
  await expect(page.getByTestId('meals-source-pill').getByRole('link')).toHaveCount(0);
  await expect(page.getByText('Harvest Chili').first()).toBeVisible();
  await expect(page.getByText('Skillet Cornbread').first()).toBeVisible();

  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: /Change Harvest Chili/ }).first().click();
  await page.getByRole('button', { name: 'Add a dessert' }).click();
  await page.getByRole('searchbox', { name: "Search Mealie's recipes" }).or(page.getByRole('textbox', { name: "Search Mealie's recipes" })).fill('Ice cream sundae');
  await page.getByRole('button', { name: /Type .Ice cream sundae. instead/ }).click();

  await expect
    .poll(() => mealie!.entries.filter((e) => e.date === fakeMealieDay(0) && e.entryType === 'dessert').map((e) => e.title))
    .toContain('Ice cream sundae');
});

test('Suggest asks first, fills only the empty dinners in Mealie, and Undo takes them back', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Harvest Chili').first()).toBeVisible();

  const before = mealie.entries.map((e) => e.id);
  const plannedDinners = new Set(defaultFakeEntries().filter((e) => e.entryType === 'dinner').map((e) => e.date));
  await page.getByRole('button', { name: 'Fill the empty dinners with recipes from Mealie' }).click();
  await expect(page.getByText('Fill the empty dinners?')).toBeVisible();
  // Nothing goes to Mealie before the answer.
  expect(mealie.entries.map((e) => e.id)).toEqual(before);
  await page.getByRole('button', { name: 'Fill dinners' }).click();
  await expect(page.getByText(/Planned (a dinner|dinners) for /)).toBeVisible();

  const added = mealie.entries.filter((e) => !before.includes(e.id));
  expect(added.length).toBeGreaterThan(0);
  expect(added.every((e) => e.entryType === 'dinner' && !plannedDinners.has(e.date))).toBe(true);
  // Picked from the household's Dinner category: never the Apple Crumble dessert.
  const dinners = FAKE_RECIPES.filter((r) => r.categories?.includes('dinner')).map((r) => r.id);
  expect(added.every((e) => e.recipeId !== null && dinners.includes(e.recipeId))).toBe(true);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => mealie!.entries.map((e) => e.id).sort()).toEqual([...before].sort());
});

test('Undo after Suggest leaves alone a dinner that took over the number of one it added', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('Harvest Chili').first()).toBeVisible();

  const before = mealie.entries.map((e) => e.id);
  await page.getByRole('button', { name: 'Fill the empty dinners with recipes from Mealie' }).click();
  await page.getByRole('button', { name: 'Fill dinners' }).click();
  await expect(page.getByText(/Planned (a dinner|dinners) for /)).toBeVisible();

  // Meanwhile, on another hub: the newest suggestion is deleted and a family
  // dinner is planned that day, and Mealie gives it the same number.
  const newest = mealie.entries.reduce((a, b) => (b.id > a.id ? b : a));
  mealie.entries.splice(mealie.entries.indexOf(newest), 1);
  mealie.entries.push({ id: newest.id, date: newest.date, entryType: 'dinner', title: 'Samlar Kari', text: '', recipeId: null });

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  // Every other suggestion is taken back; the family's dinner stays.
  await expect.poll(() => mealie!.entries.map((e) => e.id).sort()).toEqual([...before, newest.id].sort());
  expect(mealie.entries.find((e) => e.id === newest.id)?.title).toBe('Samlar Kari');
});

test('a family without Mealie adds a side from its own meals', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [
      { id: 'tacos', name: 'Tacos', emoji: '🌮', category: 'main' },
      { id: 'rice', name: 'Mexican Rice', emoji: '🍚', category: 'side' },
    ],
    plan: [{ date: fakeMealieDay(0), slot: 'dinner', mealId: 'tacos' }],
  });
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: /Change Tacos/ }).first().click();
  await page.getByRole('button', { name: 'Add a side' }).click();
  await page.getByRole('button', { name: /Mexican Rice/ }).first().click();

  await expect
    .poll(async () => {
      const res = await request.get('/api/meals/data');
      const data = await res.json();
      return data.plan.find((p: { slot: string }) => p.slot === 'dinner')?.courses;
    })
    .toEqual([{ kind: 'side', mealId: 'rice' }]);
});
