import { test, expect } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { connectFakeMealie, defaultFakeEntries, disconnectFakeMealie, fakeMealieDay, startFakeMealie, type FakeMealie } from '../helpers/fake-mealie';

/**
 * The Recipe view (Full-Screen Meal Planner) and the Grocery List view (both
 * Meal Planner modules), from the family's own meals and from Mealie: what
 * they draw, and that a tick on the wall lands where the phone's would.
 */

/** Local `YYYY-MM-DD`, `offset` days from today. */
function day(offset = 0): string {
  return fakeMealieDay(offset);
}

const WAFFLES = {
  id: 'meal-w', name: 'Waffles', emoji: '🧇', prepTime: 10, cookTime: 15, servings: 4,
  ingredients: [{ name: 'Flour', amount: '2 cups', category: 'pantry' }, { name: 'Blueberries', amount: '1 cup', category: 'produce' }],
  notes: 'Heat the iron on 4.\nLeftovers freeze well.',
};

/** Waffles for dinner today and tomorrow, so the Recipe view has one whatever the hour. */
async function seedWaffles(request: APIRequestContext) {
  await seedMeals(request, {
    savedMeals: [WAFFLES],
    plan: [
      { slot: 'lunch', customText: 'Eating out', date: day(0) },
      { slot: 'dinner', mealId: 'meal-w', date: day(0) },
      { slot: 'dinner', mealId: 'meal-w', date: day(1) },
    ],
  });
}

async function show(request: APIRequestContext, type: 'meal-planner' | 'fullscreen-meal-planner', config: Record<string, unknown>) {
  const mod = buildModuleInstance(type, config);
  mod.id = 'meals';
  mod.size = type === 'fullscreen-meal-planner' ? { w: 1080, h: 1920 } : { w: 520, h: 640 };
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
}

test.describe('Recipe view', () => {
  test('draws a saved meal\'s ingredients with their amounts and its notes', async ({ page, request }) => {
    await seedWaffles(request);
    await show(request, 'fullscreen-meal-planner', { view: 'recipe' });
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    await expect(mod.getByTestId('recipe-name')).toHaveText('Waffles');
    await expect(mod.getByTestId('recipe-ingredients')).toContainText('Flour');
    await expect(mod.getByTestId('recipe-ingredients')).toContainText('2 cups');
    await expect(mod.getByTestId('recipe-notes')).toContainText('Leftovers freeze well.');
    // Prep, Cook and Serves.
    await expect(mod).toContainText('10 min');
    await expect(mod).toContainText('15 min');
  });

  test('says so when nothing still to come has a recipe', async ({ page, request }) => {
    await seedMeals(request, {
      savedMeals: [{ id: 'meal-p', name: 'Pizza Night', emoji: '🍕' }],
      plan: [0, 1].map((d) => ({ slot: 'dinner', mealId: 'meal-p', date: day(d) })),
    });
    await show(request, 'fullscreen-meal-planner', { view: 'recipe' });
    await page.goto('/display');
    await expect(page.locator('[data-module-id="meals"]').getByTestId('fmp-recipe-none')).toContainText(/No recipe for (today|tomorrow)/);
  });
});

test.describe('Grocery List view, plan in Home Screens', () => {
  test('lists this week\'s ingredients by aisle and ticks one off for the week', async ({ page, request }) => {
    await seedWaffles(request);
    await show(request, 'meal-planner', { view: 'grocery' });
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    const blueberries = mod.getByRole('checkbox', { name: /Blueberries/ });
    await expect(blueberries).toBeVisible();
    await expect(mod.getByTestId('meal-grocery-left')).toHaveText('2 to get');
    await expect(mod).toContainText('Produce');

    await blueberries.click();
    // Crossed out where it is, and counted.
    await expect(blueberries).toHaveAttribute('aria-checked', 'true');
    await expect(mod.getByTestId('meal-grocery-left')).toHaveText('1 to get');
    await expect.poll(async () => {
      const res = await request.get('/api/meals/grocery');
      return ((await res.json()) as { groceryChecked: string[] }).groceryChecked;
    }).toContain('blueberries');

    // A second tap on the crossed-out row puts it back.
    await blueberries.click();
    await expect(blueberries).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => {
      const res = await request.get('/api/meals/grocery');
      return ((await res.json()) as { groceryChecked: string[] }).groceryChecked;
    }).not.toContain('blueberries');
  });

  test('the full-screen list steps its type down, then pages, and never runs off the bottom', async ({ page, request }) => {
    const aisles = ['produce', 'dairy', 'meat', 'bakery', 'pantry', 'frozen', 'beverages', 'other'] as const;
    const ingredients = Array.from({ length: 80 }, (_, i) => ({ name: `Item number ${i + 1}`, amount: `${i + 1} cups`, category: aisles[i % aisles.length] }));
    await seedMeals(request, {
      savedMeals: [{ id: 'meal-big', name: 'Feast', emoji: '🍲', ingredients }],
      plan: [{ slot: 'dinner', mealId: 'meal-big', date: day(0) }],
    });
    await show(request, 'fullscreen-meal-planner', { view: 'grocery' });
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    await expect(mod.getByTestId('fmp-grocery-counts')).toContainText('80 to get');
    await expect(mod.getByTestId('fmp-grocery-page')).toHaveText(/^1 of [2-9]$/);
    // Nothing drawn below the list's own box.
    const listBottom = await mod.getByTestId('fmp-grocery').evaluate((el) => el.getBoundingClientRect().bottom);
    const lowest = await mod.getByTestId('fmp-grocery-item').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
    expect(lowest).toBeLessThanOrEqual(listBottom + 1);
    // Small enough to page, never smaller than seven tenths of the Medium size.
    const size = await mod.getByTestId('fmp-grocery-item').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const scale = await mod.locator('.fmp-root').evaluate((el) => el.getBoundingClientRect().width / 1080);
    expect(size / scale).toBeGreaterThanOrEqual(27 * 0.7 - 0.5);
  });

  test('draws rows with no boxes when taps are off', async ({ page, request }) => {
    await seedWaffles(request);
    await show(request, 'meal-planner', { view: 'grocery', interactive: false });
    await page.goto('/display');
    const mod = page.locator('[data-module-id="meals"]');
    await expect(mod.getByTestId('meal-grocery-item').first()).toBeVisible();
    await expect(mod.getByRole('checkbox')).toHaveCount(0);
  });
});

let mealie: FakeMealie | null = null;

test.describe('Recipe and Grocery List with the plan in Mealie', () => {
  test.afterEach(async ({ request }) => {
    await disconnectFakeMealie(request);
    await mealie?.close();
    mealie = null;
  });

  test('the Recipe view reads the steps from Mealie', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner', { view: 'recipe' });
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    // Chili tonight, mac and cheese tomorrow: one of them, whatever the hour.
    await expect(mod.getByTestId('recipe-name')).toHaveText(/Harvest Chili|Mac and Cheese/);
    await expect(mod.getByTestId('recipe-ingredients')).toContainText('1 lb ground beef');
    await expect(mod.getByTestId('recipe-steps')).toContainText('Brown the beef.');
    // Taps on: Next step marks the first step.
    await mod.getByTestId('recipe-next').click();
    await expect(mod.locator('[data-testid="recipe-step"][data-current]')).toContainText('Brown the beef.');
  });

  test('tapping a Mealie dinner opens its recipe card, with no step buttons for a short recipe', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'meal-planner', { view: 'today', tapRecipeAction: 'card' });
    await page.goto('/display');

    await page.locator('[data-module-id="meals"]').getByRole('button', { name: /Harvest Chili/ }).click();
    const card = page.getByTestId('recipe-card');
    await expect(card.getByTestId('recipe-name')).toHaveText('Harvest Chili');
    await expect(card.getByTestId('recipe-steps')).toContainText('Simmer with the beans.');
    // Its courses, and a code for a phone.
    await expect(card.getByTestId('recipe-courses')).toContainText('Skillet Cornbread');
    await expect(card.getByTestId('recipe-card-qr')).toBeVisible();
    // Two steps fit on one page: read at a glance, no Back and Next.
    await expect(card.getByTestId('recipe-next')).toHaveCount(0);
  });

  test('a double batch planned in Mealie doubles the amounts and servings, and a save keeps it', async ({ page, request }) => {
    const entries = defaultFakeEntries().map((e) => (e.entryType === 'dinner' ? { ...e, recipeScale: 2 } : e));
    mealie = await startFakeMealie(entries);
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner', { view: 'recipe' });
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    await expect(mod.getByTestId('recipe-batch')).toHaveText('Double');
    // Four servings in Mealie, eight for a double batch.
    await expect(mod.getByTestId('recipe-name').locator('xpath=..')).toContainText(/Serves\s*8/i);
    // Mealie's parsed line doubles; a line it never parsed stays as written.
    await expect(mod.getByTestId('recipe-ingredients')).toContainText('2 cups rice');
    await expect(mod.getByTestId('recipe-ingredients')).toContainText('1 lb ground beef');

    // A save that changes tonight's dinner, sent the way an older copy of the
    // plan would (no batch size), leaves the double batch in Mealie.
    const chili = mealie.entries.find((e) => e.date === day(0) && e.entryType === 'dinner')!;
    type Cell = { date: string; slot: string; sourceId?: string; scale?: number; courses?: { sourceId?: string }[] };
    const { mealie: block } = await (await request.get('/api/meals/data')).json() as { mealie: { plan: Cell[] } };
    const { scale, ...tonight } = block.plan.find((p) => p.date === day(0) && p.slot === 'dinner')!;
    expect(scale).toBe(2);
    const before = [tonight.sourceId, ...(tonight.courses ?? []).map((c) => c.sourceId)];
    const res = await request.put('/api/mealie/plan', {
      data: { cells: [{ date: day(0), slot: 'dinner', before, after: { ...tonight, notes: 'Make extra for lunch' } }] },
    });
    expect(res.ok(), await res.text()).toBe(true);
    const saved = mealie.entries.find((e) => e.id === chili.id)!;
    expect(saved.text).toBe('Make extra for lunch');
    expect(saved.recipeScale).toBe(2);
  });

  test('the full-screen Grocery List shows the family\'s Mealie list and ticks in Mealie', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner', { view: 'grocery' });
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    // The list made first, with what is still to get; Bread is ticked already.
    await expect(mod.getByTestId('fmp-grocery')).toContainText('Groceries');
    await expect(mod.getByTestId('fmp-grocery-counts')).toContainText('3 to get');
    await expect(mod).not.toContainText('Bread');
    const towels = mod.getByRole('checkbox', { name: /Paper towels/ });
    await towels.click();
    await expect(towels).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => mealie!.shoppingLists.find((l) => l.name === 'Groceries')!.items.find((i) => i.note === 'Paper towels')!.checked).toBe(true);
    expect(mealie.requests.some((r) => r.startsWith('PUT /api/households/shopping/items/'))).toBe(true);
  });
});
