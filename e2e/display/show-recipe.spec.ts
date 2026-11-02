import { test, expect } from '../fixtures';
import { seedMeals } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import {
  connectFakeMealie,
  disconnectFakeMealie,
  FAKE_RECIPES,
  startFakeMealie,
  type FakeMealie,
} from '../helpers/fake-mealie';

/**
 * A recipe sent from a phone ("Show on the wall" in Meals) opens on the
 * recipe card over whatever the wall shows, in the display's full-screen
 * theme. The hub looks the meal up itself: a Mealie recipe through the hub's
 * Mealie, or one of the family's saved meals. The phone's side is
 * e2e/remote/meals-show-recipe.spec.ts.
 */

const CHILI = FAKE_RECIPES.find((r) => r.slug === 'harvest-chili')!;
const MAC = FAKE_RECIPES.find((r) => r.slug === 'mac-and-cheese')!;
const SOUP = {
  id: 'meal-soup',
  name: 'Tomato Soup',
  emoji: '🍅',
  prepTime: 10,
  cookTime: 25,
  servings: 4,
  ingredients: [{ name: 'Tomatoes', amount: '2 cans' }, { name: 'Basil', amount: '1 bunch' }],
  notes: 'Simmer for twenty minutes.',
};

let mealie: FakeMealie | null = null;

test.afterEach(async ({ request }) => {
  if (mealie) {
    await disconnectFakeMealie(request);
    await mealie.close();
    mealie = null;
  }
});

test('a Mealie recipe opens on the card over the screen in the display\'s theme, a second replaces it, and Close takes it down', async ({ page, request }) => {
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await renderOnDisplay(page, request, baseConfig({
    settings: { fullscreenTheme: 'charcoal' },
    screens: [makeScreen('s1', 'Hall', [textModule('E2E WALL')])],
  }));

  // Gone from Mealie since the phone listed it.
  const missing = await request.post('/api/display/show-recipe', { data: { mealId: 'mealie:99999999-9999-4999-8999-999999999999' } });
  expect(missing.status()).toBe(404);

  expect((await request.post('/api/display/show-recipe', { data: { mealId: `mealie:${CHILI.id}` } })).ok()).toBe(true);
  const card = page.getByTestId('recipe-card');
  await expect(card.getByTestId('recipe-name')).toHaveText(CHILI.name, { timeout: 10_000 });
  // The steps come from Mealie through the hub, as for a tapped meal.
  await expect(card.getByTestId('recipe-ingredients')).toContainText('1 lb ground beef');
  await expect(card.getByTestId('recipe-steps')).toContainText('Brown the beef.');
  // Not tapped in a plan: no meal badge, no courses. A Mealie recipe has a code for a phone.
  await expect(card.getByTestId('recipe-serving')).toHaveCount(0);
  await expect(card.getByTestId('recipe-courses')).toHaveCount(0);
  await expect(card.getByTestId('recipe-card-qr')).toBeVisible();
  // Drawn in the display's full-screen theme (Charcoal), over the screen that was up.
  await expect(card.locator('.fmp-root')).toHaveCSS('background-color', 'rgb(28, 25, 23)');
  await expect(page.getByText('E2E WALL')).toBeAttached();

  // A second recipe replaces the open one rather than stacking.
  expect((await request.post('/api/display/show-recipe', { data: { mealId: `mealie:${MAC.id}` } })).ok()).toBe(true);
  await expect(card.getByTestId('recipe-name')).toHaveText(MAC.name, { timeout: 10_000 });
  await expect(card).toHaveCount(1);

  await card.getByTestId('recipe-card-close').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText('E2E WALL')).toBeVisible();
});

test("a saved meal's recipe opens from the family's library, and ids that are not a recipe are refused", async ({ page, request }) => {
  await seedMeals(request, { savedMeals: [SOUP, { id: 'meal-toast', name: 'Toast', emoji: '🍞' }], plan: [] });
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'Hall', [textModule('E2E WALL')])] }));

  // Not a meal id, a meal that is gone, and a meal with nothing to cook from.
  expect((await request.post('/api/display/show-recipe', { data: { mealId: 'mealie:not-a-recipe' } })).status()).toBe(400);
  expect((await request.post('/api/display/show-recipe', { data: {} })).status()).toBe(400);
  expect((await request.post('/api/display/show-recipe', { data: { mealId: 'meal-gone' } })).status()).toBe(404);
  expect((await request.post('/api/display/show-recipe', { data: { mealId: 'meal-toast' } })).status()).toBe(400);
  await expect(page.getByTestId('recipe-card')).toHaveCount(0);

  const res = await request.post('/api/display/show-recipe', { data: { mealId: SOUP.id } });
  expect(await res.json()).toEqual({ ok: true, command: 'show-recipe', mealId: SOUP.id });
  const card = page.getByTestId('recipe-card');
  await expect(card.getByTestId('recipe-name')).toHaveText(SOUP.name, { timeout: 10_000 });
  await expect(card.getByTestId('recipe-ingredients')).toContainText('Tomatoes');
  await expect(card.getByTestId('recipe-ingredients')).toContainText('2 cans');
  await expect(card.getByTestId('recipe-notes')).toContainText('Simmer for twenty minutes.');
  // No link saved: nothing for a phone to scan.
  await expect(card.getByTestId('recipe-card-qr')).toHaveCount(0);
  // The default theme (Linen) when the display names none.
  await expect(card.locator('.fmp-root')).toHaveCSS('background-color', 'rgb(245, 241, 234)');

  // A tap on the dimmed screen around the card closes it too.
  await card.click({ position: { x: 5, y: 5 } });
  await expect(card).toHaveCount(0);
});

test('hide-recipe takes the recipe a phone sent down, and leaves one someone sent since', async ({ page, request }) => {
  await seedMeals(request, { savedMeals: [SOUP, { ...SOUP, id: 'meal-stew', name: 'Beef Stew' }], plan: [] });
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'Hall', [textModule('E2E WALL')])] }));
  const card = page.getByTestId('recipe-card');

  expect((await request.post('/api/display/show-recipe', { data: { mealId: SOUP.id } })).ok()).toBe(true);
  await expect(card.getByTestId('recipe-name')).toHaveText(SOUP.name, { timeout: 10_000 });

  // A take-down for another recipe (one sent earlier, replaced since) leaves this one up.
  const drained = page.waitForResponse(async (r) => r.url().includes('/api/display/commands') && (await r.text()).includes('hide-recipe'));
  const other = await request.post('/api/display/hide-recipe', { data: { mealId: 'meal-stew' } });
  expect(await other.json()).toEqual({ ok: true, command: 'hide-recipe' });
  await drained;
  await page.waitForTimeout(300);
  await expect(card.getByTestId('recipe-name')).toHaveText(SOUP.name);

  expect((await request.post('/api/display/hide-recipe', { data: { mealId: SOUP.id } })).ok()).toBe(true);
  await expect(card).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('E2E WALL')).toBeVisible();

  // No meal named: whatever a phone put up comes down.
  expect((await request.post('/api/display/show-recipe', { data: { mealId: 'meal-stew' } })).ok()).toBe(true);
  await expect(card.getByTestId('recipe-name')).toHaveText('Beef Stew', { timeout: 10_000 });
  expect((await request.post('/api/display/hide-recipe')).ok()).toBe(true);
  await expect(card).toHaveCount(0, { timeout: 10_000 });

  expect((await request.post('/api/display/hide-recipe', { data: { mealId: '' } })).status()).toBe(400);
});
