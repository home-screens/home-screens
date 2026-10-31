import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import {
  connectFakeMealie,
  defaultFakeEntries,
  disconnectFakeMealie,
  FAKE_COSTCO_ID,
  FAKE_GROCERIES_ID,
  FAKE_RECIPES,
  fakeMealieDay,
  startFakeMealie,
  type FakeMealie,
} from '../helpers/fake-mealie';

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

async function openGrocery(page: Page) {
  await page.goto('/remote');
  await openMeals(page);
  await page.getByRole('button', { name: 'Grocery', exact: true }).click();
}

const groceryItem = (page: Page, text: string) => page.getByTestId('mealie-grocery-item').filter({ hasText: text });

test("the Grocery tab is Mealie's list: a tick lands in Mealie with the item whole, and ticked items fold away", async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await openGrocery(page);

  // Typed items read as typed (not "1 Paper towels"); a recipe's item says what it is for.
  await expect(groceryItem(page, 'Paper towels')).toHaveText(/^Paper towels$/);
  await expect(groceryItem(page, '2 onions')).toContainText('for Harvest Chili');
  await expect(page.getByTestId('mealie-grocery-count')).toHaveText('1 of 4 items');
  // Bread was ticked in Mealie already: folded away until asked for.
  await expect(groceryItem(page, 'Bread')).toHaveCount(0);
  await page.getByTestId('mealie-grocery-cart').click();
  await expect(groceryItem(page, 'Bread')).toHaveAttribute('data-checked', 'true');

  await groceryItem(page, 'Paper towels').click();
  const towels = () => mealie!.shoppingLists.find((l) => l.id === FAKE_GROCERIES_ID)!.items.find((i) => i.position === 2)!;
  await expect.poll(() => towels().checked).toBe(true);
  // Mealie replaces the whole item on an update: the name must survive the tick.
  expect(towels().note).toBe('Paper towels');
  // Still in place, ticked, so a wrong tap is one tap to undo.
  await expect(groceryItem(page, 'Paper towels')).toHaveAttribute('data-checked', 'true');
  await expect(page.getByTestId('mealie-grocery-count')).toHaveText('2 of 4 items');
  await groceryItem(page, 'Paper towels').click();
  await expect.poll(() => towels().checked).toBe(false);
});

test('adding to the list, and picking another list for everyone, voice included', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await openGrocery(page);

  const box = page.getByRole('textbox', { name: 'Add to Groceries' });
  await box.fill('Lemons');
  await box.press('Enter');
  await expect(page.getByText('Lemons is on Groceries')).toBeVisible();
  await expect(box).toHaveValue('');
  const groceries = () => mealie!.shoppingLists.find((l) => l.id === FAKE_GROCERIES_ID)!.items;
  // The way Mealie's own box adds it: the words as the note, quantity 0.
  expect(groceries().find((i) => i.note === 'Lemons')).toMatchObject({ quantity: 0, checked: false });
  await expect(groceryItem(page, 'Lemons')).toBeVisible();

  await page.getByTestId('mealie-grocery-lists').getByRole('button', { name: /^Costco run/ }).click();
  await expect(groceryItem(page, 'Coffee beans')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Add to Costco run' })).toBeVisible();
  // One list for the whole family, and the tab says so.
  await expect(page.getByTestId('mealie-grocery-notice')).toContainText('Everyone sees Costco run now.');

  // The voice answer follows the pick, and "check off coffee beans" ticks it in Mealie.
  await expect.poll(async () => (await (await request.get('/api/meals/grocery/list')).json()).list?.id).toBe(FAKE_COSTCO_ID);
  const res = await request.post('/api/meals/grocery', { data: { item: 'coffee beans', direction: 'check' } });
  expect(await res.json()).toEqual({ changed: true, matched: 1, source: 'mealie' });
  expect(mealie.shoppingLists.find((l) => l.id === FAKE_COSTCO_ID)!.items[0]).toMatchObject({ note: 'Coffee beans', checked: true });
});

test("a tick Mealie doesn't take springs back and says why", async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await openGrocery(page);
  await expect(groceryItem(page, 'Paper towels')).toBeVisible();

  await page.route('**/api/mealie/shopping/items/**', (route) => route.fulfill({
    status: 502, contentType: 'application/json', body: JSON.stringify({ error: "We couldn't reach Mealie.", failure: 'unreachable' }),
  }));
  await groceryItem(page, 'Paper towels').click();
  // Not Next's own route announcer, which is an alert too.
  await expect(page.getByRole('alert').filter({ hasText: "Mealie isn't answering" })).toBeVisible();
  await expect(groceryItem(page, 'Paper towels')).toHaveAttribute('data-checked', 'false');
});

test('words typed while an add is on its way are kept, and Undo takes an add back off the list', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await openGrocery(page);
  await page.route('**/api/mealie/shopping/items', async (route) => {
    if (route.request().method() === 'POST') await new Promise((done) => setTimeout(done, 800));
    await route.continue();
  });

  const box = page.getByRole('textbox', { name: 'Add to Groceries' });
  await box.fill('pears');
  await box.press('Enter');
  // The box empties at once, so the next thing goes in clean.
  await expect(box).toHaveValue('');
  await box.pressSequentially('string cheese');
  await expect(page.getByText('pears is on Groceries')).toBeVisible();
  await expect(box).toHaveValue('string cheese');

  const groceries = () => mealie!.shoppingLists.find((l) => l.id === FAKE_GROCERIES_ID)!.items.map((i) => i.note);
  expect(groceries()).toContain('pears');
  await page.getByTestId('mealie-grocery-added').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(groceries).not.toContain('pears');
  await expect(groceryItem(page, 'pears')).toHaveCount(0);
});

test('something put back on the list elsewhere comes out of the fold, and a pick can be undone', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await openGrocery(page);
  await expect(page.getByTestId('mealie-grocery-cart')).toHaveText(/\(1\)/);

  // Somebody says "we still need bread"; the tab reads again when it comes back into view.
  await request.post('/api/meals/grocery', { data: { item: 'bread', direction: 'uncheck' } });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(groceryItem(page, 'Bread')).toHaveAttribute('data-checked', 'false');
  await expect(page.getByTestId('mealie-grocery-cart')).toHaveCount(0);

  await page.getByTestId('mealie-grocery-lists').getByRole('button', { name: /^Costco run/ }).click();
  const notice = page.getByTestId('mealie-grocery-notice');
  await expect(notice).toContainText('Everyone sees Costco run now.');
  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('textbox', { name: 'Add to Groceries' })).toBeVisible();
  expect((await (await request.get('/api/mealie/shopping')).json()).list.id).toBe(FAKE_GROCERIES_ID);
});

test.describe('on a touch phone', () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const delay of [0, 300]) {
    test(`a double tap on a dish's remove button takes off only that dish (Mealie answers in ${delay} ms)`, async ({ page, request }) => {
      mealie = await startFakeMealie();
      await connectFakeMealie(request, mealie);
      // A real Mealie takes a moment to answer, and the list moves only then.
      await page.route('**/api/mealie/plan**', async (route) => {
        if (route.request().method() !== 'GET') await new Promise((done) => setTimeout(done, delay));
        await route.continue();
      });
      await page.goto('/remote');
      await page.getByRole('button', { name: 'Meals', exact: true }).tap();
      await page.getByRole('button', { name: 'Plan', exact: true }).tap();
      await page.getByRole('button', { name: /Change Harvest Chili/ }).first().tap();

      // The middle dish, as a child would: the one under it slides up into the finger's way.
      const box = (await page.getByRole('button', { name: 'Remove Apple Crumble' }).boundingBox())!;
      const spot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.touchscreen.tap(spot.x, spot.y);
      await page.waitForTimeout(170);
      await page.touchscreen.tap(spot.x, spot.y);

      const today = () => mealie!.entries.filter((e) => e.date === fakeMealieDay(0)).map((e) => e.entryType).sort();
      await expect.poll(today).toEqual(['breakfast', 'dinner', 'drink', 'lunch', 'side']);
      await page.waitForTimeout(1500);
      expect(today()).toEqual(['breakfast', 'dinner', 'drink', 'lunch', 'side']);
    });
  }
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
