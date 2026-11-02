import { test, expect } from '../fixtures';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { dinnerTimeToday } from '../helpers/schedule-windows';
import { DOUBLE_TAP_MS } from '@/lib/sheet-tap-guard';
import { RECIPE_CARD_COOKING_CLOSE_MS, RECIPE_CARD_IDLE_CLOSE_MS, RECIPE_PAGE_TURN_MS } from '@/lib/meal-recipe';
import {
  connectFakeMealie, defaultFakeEntries, disconnectFakeMealie, fakeMealieDay, LONG_STEP_RECIPE, MANY_STEPS_RECIPE, startFakeMealie,
  type FakeMealie, type FakeRecipe,
} from '../helpers/fake-mealie';

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

    // A second tap on the crossed-out row a moment later puts it back (a
    // quicker one is the other half of a double tap, and is ignored).
    await page.waitForTimeout(DOUBLE_TAP_MS + 50);
    await blueberries.click();
    await expect(blueberries).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => {
      const res = await request.get('/api/meals/grocery');
      return ((await res.json()) as { groceryChecked: string[] }).groceryChecked;
    }).not.toContain('blueberries');
  });

  test('the full-screen list steps its type down, then pages, and never runs off the bottom', async ({ page, request }) => {
    // Pages turn on a wall nobody can touch; a touch wall scrolls through them
    // instead (wall-scroll.spec.ts).
    const aisles = ['produce', 'dairy', 'meat', 'bakery', 'pantry', 'frozen', 'beverages', 'other'] as const;
    const ingredients = Array.from({ length: 80 }, (_, i) => ({ name: `Item number ${i + 1}`, amount: `${i + 1} cups`, category: aisles[i % aisles.length] }));
    await seedMeals(request, {
      savedMeals: [{ id: 'meal-big', name: 'Feast', emoji: '🍲', ingredients }],
      plan: [{ slot: 'dinner', mealId: 'meal-big', date: day(0) }],
    });
    await show(request, 'fullscreen-meal-planner', { view: 'grocery', interactive: false });
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
    // The plan has pancakes for breakfast, which the Recipe view shows until
    // breakfast is over: read it at dinner time.
    await page.clock.setFixedTime(dinnerTimeToday());
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner', { view: 'recipe' });
    await page.goto('/display');

    const mod = page.locator('[data-module-id="meals"]');
    await expect(mod.getByTestId('recipe-name')).toHaveText('Harvest Chili');
    await expect(mod.getByTestId('recipe-ingredients')).toContainText('1 lb ground beef');
    await expect(mod.getByTestId('recipe-steps')).toContainText('Brown the beef.');
    // Taps on: Next step marks the first step.
    await mod.getByTestId('recipe-next').click();
    await expect(mod.locator('[data-testid="recipe-step"][data-current]')).toContainText('Brown the beef.');
  });

  test('tapping a Mealie dinner opens its recipe card, with no step buttons for a short recipe', async ({ page, request }) => {
    // The Today view turns to tomorrow's meals once dinner is over.
    await page.clock.setFixedTime(dinnerTimeToday());
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
    await page.clock.setFixedTime(dinnerTimeToday());
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

/** A display showing only a text module, with a landscape panel when asked. */
async function plainWall(page: Page, request: APIRequestContext, landscape = false) {
  if (landscape) await page.setViewportSize({ width: 1920, height: 1080 });
  await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'Hall', [textModule('E2E WALL')])],
    ...(landscape ? { settings: { displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal' } } : {}),
  }));
}

/** Opens a meal on the recipe card the way the phone's "Show on the wall" does. */
async function showOnWall(page: Page, request: APIRequestContext, mealId: string): Promise<Locator> {
  const res = await request.post('/api/display/show-recipe', { data: { mealId } });
  expect(res.ok(), await res.text()).toBe(true);
  const card = page.getByTestId('recipe-card');
  await expect(card.getByTestId('recipe-name')).toBeVisible({ timeout: 10_000 });
  return card;
}

/** The fake Mealie with `recipes` added to its own, and the hub's plan on it. */
async function mealieWith(request: APIRequestContext, recipes: FakeRecipe[], entries = defaultFakeEntries()) {
  mealie = await startFakeMealie(entries);
  mealie.recipes = [...mealie.recipes, ...recipes];
  await connectFakeMealie(request, mealie);
}

/** Every ingredient row can be brought into its box: fits as drawn, or scrolls to the last one. */
async function expectEveryIngredientReachable(card: Locator) {
  const reach = await card.getByTestId('recipe-ingredients').evaluate((grid) => {
    const box = grid.parentElement!;
    box.scrollTop = box.scrollHeight;
    const rows = grid.querySelectorAll('[data-testid="recipe-ingredient"]');
    const last = rows[rows.length - 1].getBoundingClientRect();
    return { lastBottom: last.bottom, boxBottom: box.getBoundingClientRect().bottom, rows: rows.length };
  });
  expect(reach.rows).toBeGreaterThan(0);
  expect(reach.lastBottom).toBeLessThanOrEqual(reach.boxBottom + 1);
}

test.describe('The recipe card, cooking from the wall', () => {
  test.afterEach(async ({ request }) => {
    if (!mealie) return;
    await disconnectFakeMealie(request);
    await mealie.close();
    mealie = null;
  });

  test('untouched, its pages turn by themselves; a dot goes to its page and stops that, and a later page leads back to the ingredients', async ({ page, request }) => {
    await page.clock.install();
    await mealieWith(request, [MANY_STEPS_RECIPE]);
    await plainWall(page, request);
    const card = await showOnWall(page, request, `mealie:${MANY_STEPS_RECIPE.id}`);
    const sheet = card.getByTestId('recipe-sheet');
    await expect(sheet).toHaveAttribute('data-pages', /^[3-9]$/);
    await expect(sheet).toHaveAttribute('data-page', '0');
    await expect(sheet).toHaveAttribute('data-turning');

    await page.clock.fastForward(RECIPE_PAGE_TURN_MS);
    await expect(sheet).toHaveAttribute('data-page', '1');

    await card.getByTestId('recipe-dot').nth(2).click();
    await expect(sheet).toHaveAttribute('data-page', '2');
    await expect(sheet).not.toHaveAttribute('data-turning');
    await page.clock.fastForward(RECIPE_PAGE_TURN_MS);
    await page.clock.fastForward(RECIPE_PAGE_TURN_MS);
    await expect(sheet).toHaveAttribute('data-page', '2');

    // A later page keeps the ingredients one tap away, ticks counted.
    const line = card.getByTestId('recipe-ingredients-line');
    await expect(line).toContainText('6');
    await line.click();
    await expect(sheet).toHaveAttribute('data-page', '0');
    await card.getByTestId('recipe-ingredient').nth(1).click();
    await card.getByTestId('recipe-dot').nth(1).click();
    await expect(line).toContainText('1 of 6 ready');
  });

  test('a tick stops the page turns and starts cooking mode: the card says so and stays an hour', async ({ page, request }) => {
    await page.clock.install();
    await mealieWith(request, [MANY_STEPS_RECIPE]);
    await plainWall(page, request);
    const card = await showOnWall(page, request, `mealie:${MANY_STEPS_RECIPE.id}`);
    const sheet = card.getByTestId('recipe-sheet');
    await expect(card.getByTestId('recipe-card-stays')).toContainText('Closes after 10 minutes');

    await card.getByTestId('recipe-ingredient').first().click();
    await expect(sheet).not.toHaveAttribute('data-turning');
    await expect(card.getByTestId('recipe-card-stays')).toContainText('Closes after an hour');
    await page.clock.fastForward(RECIPE_PAGE_TURN_MS);
    await expect(sheet).toHaveAttribute('data-page', '0');

    // Past the untouched card's ten minutes, still open; an hour after the tick, gone.
    await page.clock.fastForward(RECIPE_CARD_IDLE_CLOSE_MS + 60_000);
    await expect(card).toBeVisible();
    await page.clock.fastForward(RECIPE_CARD_COOKING_CLOSE_MS);
    await expect(card).toHaveCount(0);
  });

  test('an untouched card closes after ten minutes and lets the screen dim meanwhile', async ({ page, request }) => {
    await page.clock.install();
    await seedMeals(request, { savedMeals: [WAFFLES], plan: [] });
    await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'Hall', [textModule('E2E WALL')])],
      settings: { sleep: { enabled: true, idleDimEnabled: true, dimAfterMinutes: 2, sleepAfterMinutes: 600, dimBrightness: 40 } },
    }));
    const card = await showOnWall(page, request, WAFFLES.id);
    // Not cooking: the idle dim comes as it would with no card.
    await page.clock.fastForward(3 * 60_000);
    await page.clock.runFor(15_000);
    await expect(page.locator('div[style*="z-index: 9997"]')).toHaveCount(1);
    await expect(card).toBeAttached();

    await page.clock.fastForward(RECIPE_CARD_IDLE_CLOSE_MS - 4 * 60_000);
    await expect(card).toBeAttached();
    await page.clock.fastForward(2 * 60_000);
    await expect(card).toHaveCount(0);
  });

  test('a step longer than any page gets a page of its own that scrolls with a finger, after every ingredient', async ({ page, request }) => {
    await mealieWith(request, [LONG_STEP_RECIPE]);
    await plainWall(page, request);
    const card = await showOnWall(page, request, `mealie:${LONG_STEP_RECIPE.id}`);
    const sheet = card.getByTestId('recipe-sheet');
    // Page one: all twenty ingredients, and the dots where the steps begin.
    await expect(sheet).toHaveAttribute('data-pages', '2');
    await expect(card.getByTestId('recipe-ingredient')).toHaveCount(20);
    await expectEveryIngredientReachable(card);

    await card.getByTestId('recipe-next').click();
    await expect(sheet).toHaveAttribute('data-page', '1');
    const steps = card.getByTestId('recipe-steps');
    await expect(steps.getByTestId('recipe-step')).toHaveCount(1);
    await expect(steps).toHaveAttribute('data-wall-scroll', 'on');
    const end = await steps.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return { longer: el.scrollHeight > el.clientHeight + 1, atEnd: el.scrollTop + el.clientHeight >= el.scrollHeight - 1 };
    });
    expect(end).toEqual({ longer: true, atEnd: true });
    await expect(steps).toContainText('serve hot.');
  });

  test('in landscape the long step starts on page one, and the ingredients step down to fit beside it', async ({ page, request }) => {
    await mealieWith(request, [LONG_STEP_RECIPE]);
    await plainWall(page, request, true);
    const card = await showOnWall(page, request, `mealie:${LONG_STEP_RECIPE.id}`);
    const sheet = card.getByTestId('recipe-sheet');
    await expect(sheet).toHaveAttribute('data-pages', '1');
    await expect(card.getByTestId('recipe-steps').getByTestId('recipe-step')).toHaveCount(1);
    await expectEveryIngredientReachable(card);
    // The tick boxes shrink with the type (42 px at full size, at 1080 across the short side).
    const box = await card.getByTestId('recipe-ingredient').first().locator('span').first().boundingBox();
    expect(box!.width).toBeLessThan(42);
    expect(box!.width).toBeGreaterThanOrEqual(42 * 0.55 - 1);
  });

  test('on a wall nobody can touch the long step steps its type down until it fits', async ({ page, request }) => {
    await page.clock.setFixedTime(dinnerTimeToday());
    const entries = defaultFakeEntries().map((e) => (e.entryType === 'dinner' && e.date === day(0) ? { ...e, recipeId: LONG_STEP_RECIPE.id } : e));
    await mealieWith(request, [LONG_STEP_RECIPE], entries);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const mod = buildModuleInstance('fullscreen-meal-planner', { view: 'recipe', interactive: false });
    mod.id = 'meals';
    mod.size = { w: 1920, h: 1080 };
    await putConfig(request, baseConfig({
      screens: [makeScreen('s1', 'S1', [mod])],
      settings: { displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal' },
    }));
    await page.goto('/display');

    const steps = page.locator('[data-module-id="meals"]').getByTestId('recipe-steps');
    await expect(steps.getByTestId('recipe-step')).toHaveCount(1);
    await expect.poll(() => steps.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    const size = await steps.getByTestId('recipe-step').evaluate((el) => parseFloat(getComputedStyle(el.lastElementChild!).fontSize));
    expect(size).toBeLessThan(32);
  });

  test("a saved meal's notes sit beside its ingredients in landscape, and a long name keeps clear of the close button", async ({ page, request }) => {
    const pancakes = {
      id: 'meal-pancakes', name: 'Saturday pancakes', emoji: '🥞', prepTime: 10, cookTime: 15, servings: 6,
      ingredients: ['Flour', 'Milk', 'Eggs', 'Sugar', 'Baking powder', 'Butter'].map((name) => ({ name, amount: '1 cup' })),
      notes: 'Heat the griddle to medium. Flip when the bubbles pop.',
    };
    const bread = { id: 'meal-bread', name: 'Bajan Salt Bread', emoji: '🍞', ingredients: [{ name: 'Flour', amount: '4 cups' }] };
    await seedMeals(request, { savedMeals: [pancakes, bread], plan: [] });
    await plainWall(page, request, true);
    let card = await showOnWall(page, request, pancakes.id);
    await expect(card.getByTestId('recipe-ingredient')).toHaveCount(6);
    await expectEveryIngredientReachable(card);
    const ings = await card.getByTestId('recipe-ingredients').boundingBox();
    const notes = await card.getByTestId('recipe-notes').boundingBox();
    expect(notes!.x).toBeGreaterThan(ings!.x + ings!.width);
    await card.getByTestId('recipe-card-close').click();

    await page.setViewportSize({ width: 1080, height: 1920 });
    card = await showOnWall(page, request, bread.id);
    const name = await card.getByTestId('recipe-name').boundingBox();
    const close = await card.getByTestId('recipe-card-close').boundingBox();
    expect(name!.x + name!.width).toBeLessThanOrEqual(close!.x);
  });
});
