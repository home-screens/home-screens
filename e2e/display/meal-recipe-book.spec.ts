import { test, expect } from '../fixtures';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { connectFakeMealie, disconnectFakeMealie, startFakeMealie, type FakeMealie } from '../helpers/fake-mealie';

/**
 * The recipe book on the wall (Full-Screen Meal Planner `recipes`, Meal
 * Planner `recipes`): a family's recipes to browse by chip, search with the
 * wall's own keyboard, scroll with a finger, and open on the recipe card to
 * cook from. From the saved meals, and from Mealie whenever it is connected.
 */

const LOCAL = [
  { id: 'meal-w', name: 'Waffles', emoji: '🧇', prepTime: 10, cookTime: 15, ingredients: [{ name: 'Flour', amount: '2 cups' }, { name: 'Blueberries', amount: '1 cup' }] },
  { id: 'meal-t', name: 'Tacos', emoji: '🌮', prepTime: 30, isFavorite: true, tags: ['quick'], ingredients: [{ name: 'Tortillas' }] },
  { id: 'meal-e', name: 'Eating out' },
  { id: 'meal-b', name: 'banana bread', emoji: '🍌', notes: 'Bake at 350 for an hour.' },
];

async function show(request: APIRequestContext, type: 'meal-planner' | 'fullscreen-meal-planner', config: Record<string, unknown> = {}) {
  const mod = buildModuleInstance(type, { view: 'recipes', ...config });
  mod.id = 'book';
  mod.size = type === 'fullscreen-meal-planner' ? { w: 1080, h: 1920 } : { w: 520, h: 640 };
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
}

async function open(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto('/display');
  return page.locator('[data-module-id="book"]');
}

const tileNames = (scope: Locator) => scope.getByTestId('recipe-book-tile-name').allInnerTexts()
  .then((texts) => texts.map((t) => t.trim()));
/** The fake Mealie answers in its own order, where the real one sorts by name. */
const sortedTileNames = (scope: Locator) => tileNames(scope).then((names) => names.sort());

async function type(page: Page, letters: string) {
  const keyboard = page.getByTestId('wall-keyboard');
  for (const key of letters) await keyboard.locator(`[data-key="${key === ' ' ? 'space' : key}"]`).click();
}

test.describe('Recipe book, a family without Mealie', () => {
  test('lists the saved meals that have a recipe, A to Z, and filters by chip', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);

    await expect(mod.getByTestId('recipe-book')).toHaveAttribute('data-source', 'local');
    await expect.poll(() => tileNames(mod)).toEqual(['banana bread', 'Tacos', 'Waffles']);
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('3 recipes, A to Z');
    // The heading counts the whole book on All; the title does not say it again.
    await expect(mod.getByTestId('recipe-book-count')).toHaveCount(0);
    // Prep and cook together, as every meal view shows it.
    await expect(mod.getByTestId('recipe-book-tile').filter({ hasText: 'Waffles' })).toContainText('25 min');

    await mod.getByTestId('recipe-book-chip-local:favorites').click();
    await expect.poll(() => tileNames(mod)).toEqual(['Tacos']);
    // Only chips with a recipe behind them are offered: no desserts here.
    await expect(mod.getByTestId('recipe-book-chip-local:dessert')).toHaveCount(0);
    // Quick is tagged quick or ready in half an hour: Tacos (tag) and Waffles (25 min).
    await mod.getByTestId('recipe-book-chip-local:quick').click();
    await expect.poll(() => tileNames(mod)).toEqual(['Tacos', 'Waffles']);
    // On a narrowing chip the count names the whole book.
    await expect(mod.getByTestId('recipe-book-count')).toHaveText('3 in the book');
  });

  test('a meal saved from a phone shows in seconds, not at the next minute', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toEqual(['banana bread', 'Tacos', 'Waffles']);
    // The wall's heartbeat names the meals revision; a change is read within a couple of beats.
    await seedMeals(request, { savedMeals: [...LOCAL, { id: 'meal-c', name: 'Chili', notes: 'Simmer an hour.' }], plan: [] });
    await expect.poll(() => tileNames(mod), { timeout: 15_000 }).toEqual(['banana bread', 'Chili', 'Tacos', 'Waffles']);
  });

  test('searches with the wall keyboard and opens a recipe to cook from', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(3);

    await mod.getByTestId('recipe-book-search').click();
    await expect(page.getByTestId('wall-keyboard')).toBeVisible();
    // The chips step aside while typing.
    await expect(mod.getByTestId('recipe-book-chips')).toHaveCount(0);
    await type(page, 'wax');
    await expect(mod.getByTestId('recipe-book-words')).toHaveText('wax');
    await expect(mod.getByTestId('recipe-book-empty')).toContainText('No recipes called “wax”');
    await page.getByTestId('wall-keyboard').locator('[data-key="delete"]').click();
    await type(page, 'f');
    await expect.poll(() => tileNames(mod)).toEqual(['Waffles']);
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('Recipes with “waf”');
    await page.getByTestId('wall-keyboard').locator('[data-key="done"]').click();
    await expect(page.getByTestId('wall-keyboard')).toHaveCount(0);

    await mod.getByTestId('recipe-book-tile').filter({ hasText: 'Waffles' }).click();
    const card = page.getByTestId('recipe-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('recipe-name')).toHaveText('Waffles');
    await expect(card).toContainText('Stays open while you cook');

    // Cooking mode: an ingredient ticks off and the count follows.
    const flour = card.getByTestId('recipe-ingredient').filter({ hasText: 'Flour' });
    await flour.click();
    await expect(flour).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toContainText('1 of 2 ready');
    await card.getByTestId('recipe-card-close').click();
    await expect(card).toHaveCount(0);

    // Clearing the words brings the chips and every recipe back.
    await mod.getByTestId('recipe-book-clear').click();
    await expect.poll(() => tileNames(mod)).toHaveLength(3);
    await expect(mod.getByTestId('recipe-book-chips')).toBeVisible();
  });

  test('scrolls with a finger, and Back to the top goes home', async ({ page, request }) => {
    const many = Array.from({ length: 24 }, (_, i) => ({ id: `meal-${i}`, name: `Recipe ${String(i + 1).padStart(2, '0')}`, emoji: '🍲', ingredients: [{ name: 'Salt' }] }));
    await seedMeals(request, { savedMeals: many, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    const scroller = mod.getByTestId('recipe-book-scroll');
    await expect(scroller).toHaveAttribute('data-wall-scroll', 'on');
    await expect.poll(() => tileNames(mod)).toHaveLength(24);

    await scroller.hover();
    await page.mouse.wheel(0, 1600);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(400);
    await mod.getByTestId('recipe-book-scroll-home').click();
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(mod.getByTestId('recipe-book-scroll-home')).toHaveCount(0);
  });

  test('with taps off it is a picture: nothing opens and nothing scrolls', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner', { interactive: false });
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(3);
    await expect(mod.getByTestId('recipe-book-scroll')).toHaveAttribute('data-wall-scroll', 'off');
    await mod.getByTestId('recipe-book-search').click();
    await mod.getByTestId('recipe-book-tile').first().click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('wall-keyboard')).toHaveCount(0);
    await expect(page.getByTestId('recipe-card')).toHaveCount(0);
  });

  // The book scrolls, so it is never shrunk to fit: its hidden chip-measuring row once walked the fit loop to its floor.
  test('is drawn at full size, never shrunk to fit', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(3);
    await expect(mod.getByTestId('fmp-stack')).toHaveAttribute('data-fit-settled', 'true');
    await expect(mod.getByTestId('fmp-stack')).toHaveAttribute('data-fit-factor', '1');
    await expect(mod.getByTestId('recipe-book-tile-name').first()).toHaveCSS('font-size', '31px');
  });

  test("says why a meal is missing, and forgives a child's spelling", async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(3);
    await mod.getByTestId('recipe-book-search').click();

    await type(page, 'eating');
    await expect(mod.getByTestId('recipe-book-empty')).toContainText('“Eating out” has no recipe yet');
    for (let i = 0; i < 6; i++) await page.getByTestId('wall-keyboard').locator('[data-key="delete"]').click();

    await type(page, 'wafles');
    await expect.poll(() => tileNames(mod)).toEqual(['Waffles']);
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('Nothing called “wafles”. Here are recipes with “waf”.');
  });

  test('the small module lists recipes and opens the whole book to search', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'meal-planner');
    const mod = await open(page);
    const rows = mod.getByTestId('recipe-list-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('banana bread');

    await mod.getByTestId('recipe-list-search').click();
    const sheet = page.getByTestId('recipe-book-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('wall-keyboard')).toBeVisible();
    await type(page, 'ta');
    await expect.poll(() => tileNames(sheet)).toEqual(['Tacos']);
    await sheet.getByTestId('recipe-book-tile').first().click();
    await expect(page.getByTestId('recipe-card').getByTestId('recipe-name')).toHaveText('Tacos');
  });

  test('a recipe opened from the search sheet stays while cooking, and closing the sheet clears the words', async ({ page, request }) => {
    await page.clock.install();
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'meal-planner');
    const mod = await open(page);
    const rows = mod.getByTestId('recipe-list-row');
    await expect(rows).toHaveCount(3);
    // Touch-sized on a wall, whatever the module's text size.
    for (const target of [mod.getByTestId('recipe-list-search'), mod.getByTestId('recipe-book-chips').locator('button').first()]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await mod.getByTestId('recipe-list-search').click();
    const sheet = page.getByTestId('recipe-book-sheet');
    await type(page, 'ta');
    await expect.poll(() => tileNames(sheet)).toEqual(['Tacos']);
    await sheet.getByTestId('recipe-book-tile').first().click();
    const card = page.getByTestId('recipe-card');
    await expect(card).toBeVisible();
    // The sheet closes itself after two minutes untouched, but not from under an open recipe.
    await page.clock.fastForward(3 * 60_000);
    await expect(card).toBeVisible();
    await card.getByTestId('recipe-card-close').click();

    await sheet.click({ position: { x: 540, y: 20 } });
    await expect(sheet).toHaveCount(0);
    // Back to its chip: every recipe, not the search.
    await expect(rows).toHaveCount(3);
    await mod.getByTestId('recipe-list-search').click();
    await expect(page.getByTestId('recipe-book-sheet').getByTestId('recipe-book-words')).toHaveText('');
  });

  test("a recipe opened from the search sheet before typing outlasts the keyboard's minute", async ({ page, request }) => {
    await page.clock.install();
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'meal-planner');
    const mod = await open(page);
    await expect(mod.getByTestId('recipe-list-row')).toHaveCount(3);

    await mod.getByTestId('recipe-list-search').click();
    const sheet = page.getByTestId('recipe-book-sheet');
    const keyboard = sheet.getByTestId('wall-keyboard');
    await expect(keyboard).toBeVisible();
    await sheet.getByTestId('recipe-book-tile').first().click();
    const card = page.getByTestId('recipe-card');
    await expect(card).toBeVisible();
    // An untouched, empty search sheet closes with its keyboard after a minute, but not under a recipe.
    await page.clock.fastForward(3 * 60_000);
    await expect(card).toBeVisible();

    await card.getByTestId('recipe-card-close').click();
    await expect(keyboard).toBeVisible();
    // The minute starts again in full once the recipe is closed.
    await page.clock.fastForward(50_000);
    await expect(keyboard).toBeVisible();
    await page.clock.fastForward(15_000);
    await expect(sheet).toHaveCount(0);
  });
});

let mealie: FakeMealie | null = null;

test.describe('Recipe book from Mealie', () => {
  test.afterEach(async ({ request }) => {
    await disconnectFakeMealie(request);
    await mealie?.close();
    mealie = null;
  });

  test('opens on Favorites, puts cookbooks before categories, and searches Mealie through the hub', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);

    await expect(mod.getByTestId('recipe-book')).toHaveAttribute('data-source', 'mealie');
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Apple Crumble', 'Harvest Chili']);
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('2 favorites, A to Z');
    await expect(mod.getByTestId('recipe-book-count')).toHaveText('6 in the book');
    const chipIds = await mod.getByTestId('recipe-book-chips').locator('[data-testid^="recipe-book-chip-"]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('data-testid')!.replace('recipe-book-chip-', '')),
    );
    expect(chipIds.slice(0, 5)).toEqual(['favorites', 'recent', 'all', 'cookbook:weeknight-dinners', 'cookbook:kids-like-it']);

    await mod.getByTestId('recipe-book-chip-cookbook:kids-like-it').click();
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Blueberry Pancakes', 'Mac and Cheese']);

    await mod.getByTestId('recipe-book-search').click();
    await type(page, 'mac');
    // Only Mealie's own search narrows Mealie's recipes: the wall asked it through the hub.
    await expect.poll(() => tileNames(mod)).toEqual(['Mac and Cheese']);
    // One word comes back A to Z, not best first.
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('Recipes with “mac”');
    await expect(mod.getByText('Best matches first')).toHaveCount(0);

    await mod.getByTestId('recipe-book-tile').first().click();
    const card = page.getByTestId('recipe-card');
    await expect(card.getByTestId('recipe-name')).toHaveText('Mac and Cheese');
    await expect(card.getByTestId('recipe-ingredients')).toBeVisible();
  });

  test("tries a shorter spelling when Mealie finds nothing, and says best matches come first only for several words", async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(2);
    await mod.getByTestId('recipe-book-search').click();

    await type(page, 'blubery');
    await expect.poll(() => tileNames(mod)).toEqual(['Blueberry Pancakes']);
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('Nothing called “blubery”. Here are recipes with “blu”.');
    for (let i = 0; i < 7; i++) await page.getByTestId('wall-keyboard').locator('[data-key="delete"]').click();

    await type(page, 'mac cheese');
    await expect.poll(() => tileNames(mod)).toContain('Mac and Cheese');
    await expect(mod.getByText('Best matches first')).toBeVisible();
  });

  test('chips that do not fit go behind "+ N more", and the lit one stays in view', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    // Big type leaves room for fewer chips than the household has.
    await show(request, 'fullscreen-meal-planner', { typographySize: '4x-large' });
    const mod = await open(page);
    const more = mod.getByTestId('recipe-book-chip-more');
    await expect(more).toBeVisible();
    // Never more than two rows of chips.
    const tops = await mod.getByTestId('recipe-book-chips').locator('button').evaluateAll(
      (els) => [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top)))],
    );
    expect(tops.length).toBeLessThanOrEqual(2);

    await more.click();
    const sheet = mod.getByTestId('recipe-book-chip-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('recipe-book-sheet-chip-cookbook:kids-like-it').click();
    await expect(sheet).toHaveCount(0);
    await expect(mod.getByTestId('recipe-book-chip-cookbook:kids-like-it')).toHaveAttribute('data-on', '');
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Blueberry Pancakes', 'Mac and Cheese']);
  });

  test('reads Mealie again when the lit chip is tapped: a recipe added there shows, and both counts agree', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await mod.getByTestId('recipe-book-chip-all').click();
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('6 recipes, A to Z');
    await expect(mod.getByTestId('recipe-book-count')).toHaveText('6 recipes');

    mealie.recipes = [...mealie.recipes, { id: '9a9a9a9a-0000-4000-8000-000000000001', slug: 'zucchini-bread', name: 'Zucchini Bread', photo: false, prepMinutes: 15 }];
    await mod.getByTestId('recipe-book-chip-all').click();
    await expect.poll(() => sortedTileNames(mod)).toContain('Zucchini Bread');
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('7 recipes, A to Z');
    await expect(mod.getByTestId('recipe-book-count')).toHaveText('7 recipes');
  });

  test('a recipe deleted in Mealie says so on its card, and leaves the book', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await mod.getByTestId('recipe-book-chip-all').click();
    await expect.poll(() => sortedTileNames(mod)).toContain('Mac and Cheese');

    mealie.recipes = mealie.recipes.filter((r) => r.name !== 'Mac and Cheese');
    await mod.getByTestId('recipe-book-tile').filter({ hasText: 'Mac and Cheese' }).click();
    const card = page.getByTestId('recipe-card');
    await expect(card.getByTestId('recipe-gone')).toHaveText("This recipe isn't in Mealie anymore");
    // Nothing to scan, heart or cook from.
    await expect(card.getByTestId('recipe-card-qr')).toHaveCount(0);
    await expect(card.getByTestId('recipe-card-stays')).toHaveCount(0);
    await card.getByTestId('recipe-card-close').click();
    await expect.poll(() => sortedTileNames(mod)).not.toContain('Mac and Cheese');
  });

  test('while a search is on its way, the last tiles read as old and the heading says what is coming', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner');
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(/\/api\/mealie\/recipes\?.*search=/, async (route) => {
      await held;
      await route.continue();
    });
    const mod = await open(page);
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Apple Crumble', 'Harvest Chili']);
    await mod.getByTestId('recipe-book-search').click();
    await type(page, 'mac');
    await expect(mod.getByTestId('recipe-book-grid')).toHaveAttribute('data-outdated', '');
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('Looking for “mac”…');
    release();
    await expect.poll(() => tileNames(mod)).toEqual(['Mac and Cheese']);
    await expect(mod.getByTestId('recipe-book-grid')).not.toHaveAttribute('data-outdated');
    await expect(mod.getByTestId('recipe-book-heading')).toHaveText('Recipes with “mac”');
  });

  test('says so when Mealie is not answering', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await mealie.close();
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect(mod.getByTestId('recipe-book-problem')).toContainText("Can't reach Mealie right now");
  });

  test('asks for each next page once, however long a finger keeps scrolling near the end', async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'meal-planner');
    // Three pages of favorites, each slow enough that the list keeps scrolling while it is out.
    const asked: number[] = [];
    await page.route(/\/api\/mealie\/recipes(\?|$)/, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('filter') !== 'favorites') return route.continue();
      const n = Number(url.searchParams.get('page') ?? '1');
      asked.push(n);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const items = Array.from({ length: 30 }, (_, i) => ({ id: `mealie:p${n}-${i}`, name: `Recipe ${n}.${i + 1}` }));
      await route.fulfill({ json: { items, page: n, totalPages: 3, total: 90 } });
    });
    const mod = await open(page);
    const rows = mod.getByTestId('recipe-list-row');
    await expect(rows).toHaveCount(30);

    // Ten scroll events near the end, a frame apart, while the next page is on its way.
    const nudgeNearEnd = () => mod.getByTestId('recipe-list-scroll').evaluate(async (box) => {
      for (let k = 0; k < 10; k++) {
        box.scrollTop = box.scrollHeight - box.clientHeight - k * 6;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });
    await nudgeNearEnd();
    await expect(rows).toHaveCount(60);
    await nudgeNearEnd();
    await expect(rows).toHaveCount(90);
    await nudgeNearEnd();
    expect(asked).toEqual([1, 2, 3]);
  });

  test('the small module comes back by itself once Mealie answers again', async ({ page, request }) => {
    await page.clock.install();
    const down = await startFakeMealie();
    await connectFakeMealie(request, down);
    await down.close();
    await show(request, 'meal-planner');
    const mod = await open(page);
    await expect(mod.getByTestId('recipe-list-problem')).toContainText('come back by themselves');
    await expect(mod.getByTestId('recipe-list-search')).toHaveText('Search recipes');

    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    // Nobody touches the wall: it asks again within the minute.
    await page.clock.fastForward(61_000);
    await expect.poll(() => mod.getByTestId('recipe-list-row').allInnerTexts().then((rows) => rows.length)).toBe(2);
    await expect(mod.getByTestId('recipe-list-problem')).toHaveCount(0);
    // The count, asked beside the recipes, comes back with them.
    await expect(mod.getByTestId('recipe-list-search')).toHaveText('Search 6 recipes');
  });

  test('the full-screen book gets its cookbook and category chips back after an outage', async ({ page, request }) => {
    await page.clock.install();
    const down = await startFakeMealie();
    await connectFakeMealie(request, down);
    await down.close();
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect(mod.getByTestId('recipe-book-problem')).toBeVisible();
    const chipIds = () => mod.getByTestId('recipe-book-chips').locator('[data-testid^="recipe-book-chip-"]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('data-testid')!.replace('recipe-book-chip-', '')),
    );
    expect(await chipIds()).toEqual(['favorites', 'recent', 'all']);

    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await page.clock.fastForward(61_000);
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Apple Crumble', 'Harvest Chili']);
    await expect.poll(chipIds).toEqual(expect.arrayContaining(['cookbook:weeknight-dinners', 'cookbook:kids-like-it']));
    await expect(mod.getByTestId('recipe-book-count')).toHaveText('6 in the book');
    // The categories are back too, behind "+ N more" when two rows are full.
    await mod.getByTestId('recipe-book-chip-more').click();
    const sheet = mod.getByTestId('recipe-book-chip-sheet');
    await expect(sheet.getByTestId('recipe-book-sheet-chip-category:dinner')).toBeVisible();
    await expect(sheet.getByTestId('recipe-book-sheet-chip-category:dessert')).toBeVisible();
  });
});

test.describe('Hearts on the Recipe book', () => {
  test.afterEach(async ({ request }) => {
    await disconnectFakeMealie(request);
    await mealie?.close();
    mealie = null;
  });

  const heartOf = (scope: Locator, name: string) =>
    scope.getByTestId('recipe-book-item').filter({ has: scope.page().getByTestId('recipe-book-tile-name').getByText(name, { exact: true }) }).getByTestId('recipe-book-heart');

  test("hearts the family's own recipes on a tile and on the card, saved where the phone's Library reads them", async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(3);
    const favorite = async (id: string) => ((await (await request.get('/api/meals/data')).json()).savedMeals as { id: string; isFavorite?: boolean }[])
      .find((m) => m.id === id)?.isFavorite ?? false;

    await expect(heartOf(mod, 'Tacos')).toHaveAttribute('aria-pressed', 'true');
    await expect(heartOf(mod, 'Waffles')).toHaveAttribute('aria-pressed', 'false');
    await heartOf(mod, 'Waffles').click();
    await expect(heartOf(mod, 'Waffles')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => favorite('meal-w')).toBe(true);
    // Tapping the heart does not open the recipe.
    await expect(page.getByTestId('recipe-card')).toHaveCount(0);

    await mod.getByTestId('recipe-book-tile').filter({ hasText: 'Waffles' }).click();
    const card = page.getByTestId('recipe-card');
    await expect(card.getByTestId('recipe-card-heart')).toHaveAttribute('aria-pressed', 'true');
    await card.getByTestId('recipe-card-heart').click();
    await expect(card.getByTestId('recipe-card-heart')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => favorite('meal-w')).toBe(false);
    await card.getByTestId('recipe-card-close').click();
    await expect(heartOf(mod, 'Waffles')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Favorites counts a heart changed on the wall at once, and keeps a tile un-hearted there until it is chosen again', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(3);

    // Hearted on All: on Favorites straight away, not a minute later.
    await heartOf(mod, 'Waffles').click();
    await mod.getByTestId('recipe-book-chip-local:favorites').click();
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Tacos', 'Waffles']);

    // Taken off on Favorites: the tile stays, drawn empty, rather than jumping away.
    await heartOf(mod, 'Waffles').click();
    await expect(heartOf(mod, 'Waffles')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Tacos', 'Waffles']);

    // Choosing the chip again leaves it out.
    await mod.getByTestId('recipe-book-chip-local:all').click();
    await heartOf(mod, 'Tacos').click();
    await mod.getByTestId('recipe-book-chip-local:favorites').click();
    await expect(mod.getByTestId('recipe-book-item')).toHaveCount(0);
  });

  test("hearts a Mealie recipe in Mealie, and the recipe card agrees", async ({ page, request }) => {
    mealie = await startFakeMealie();
    await connectFakeMealie(request, mealie);
    await show(request, 'fullscreen-meal-planner');
    const mod = await open(page);
    await expect.poll(() => sortedTileNames(mod)).toEqual(['Apple Crumble', 'Harvest Chili']);
    await expect(heartOf(mod, 'Harvest Chili')).toHaveAttribute('aria-pressed', 'true');

    await mod.getByTestId('recipe-book-chip-all').click();
    await expect.poll(() => tileNames(mod)).toHaveLength(6);
    await expect(heartOf(mod, 'Skillet Cornbread')).toHaveAttribute('aria-pressed', 'false');
    await heartOf(mod, 'Skillet Cornbread').click();
    await expect.poll(() => mealie!.recipes.find((r) => r.slug === 'skillet-cornbread')?.favorite).toBe(true);
    expect(mealie.requests).toContain('POST /api/users/u1/favorites/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');

    await mod.getByTestId('recipe-book-tile').filter({ hasText: 'Harvest Chili' }).click();
    const card = page.getByTestId('recipe-card');
    await expect(card.getByTestId('recipe-card-heart')).toHaveAttribute('aria-pressed', 'true');
    await card.getByTestId('recipe-card-heart').click();
    await expect.poll(() => mealie!.recipes.find((r) => r.slug === 'harvest-chili')?.favorite).toBe(false);
  });

  test('a wall without touch shows only the red hearts of favorites', async ({ page, request }) => {
    await seedMeals(request, { savedMeals: LOCAL, plan: [] });
    await show(request, 'fullscreen-meal-planner', { interactive: false });
    const mod = await open(page);
    await expect.poll(() => tileNames(mod)).toHaveLength(3);
    await expect(mod.getByTestId('recipe-book-heart')).toHaveCount(1);
    await expect(heartOf(mod, 'Tacos')).toBeVisible();
    await expect(mod.getByRole('button', { name: /favorites/ })).toHaveCount(0);
  });
});
