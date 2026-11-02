import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, seedMeals } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import {
  connectFakeMealie,
  disconnectFakeMealie,
  FAKE_RECIPES,
  fakeMealieDay,
  startFakeMealie,
  type FakeMealie,
} from '../helpers/fake-mealie';

/**
 * "Show on the wall" in the phone's Meals: a recipe from the Library (Mealie's
 * or the family's own) or the planned meal's sheet goes to the wall picked at
 * the top of the remote, and the Meals tab's notice says where. The hub's side, a card on
 * the wall, is e2e/display/show-recipe.spec.ts.
 */

const SOUP = {
  id: 'meal-soup',
  name: 'Tomato Soup',
  emoji: '🍅',
  ingredients: [{ name: 'Tomatoes', amount: '2 cans' }],
  notes: 'Simmer for twenty minutes.',
};
// No ingredients and no notes: nothing for a card to show.
const TOAST = { id: 'meal-toast', name: 'Toast', emoji: '🍞' };
const CHILI = FAKE_RECIPES.find((r) => r.slug === 'harvest-chili')!;

let mealie: FakeMealie | null = null;

test.afterEach(async ({ request }) => {
  if (mealie) {
    await disconnectFakeMealie(request);
    await mealie.close();
    mealie = null;
  }
});

async function openLibrary(page: Page) {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
}

/** The Meals tab's own notice, which sits over its sheets and above the Library's add button. */
function notice(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text }).getByText(text, { exact: true });
}

/** Everything the hub queued for one display (or the single wall), drained so the next look starts empty. */
async function drainCommands(request: APIRequestContext, display?: string): Promise<Array<{ type: string; payload?: Record<string, unknown> }>> {
  const res = await request.get(display ? `/api/display/commands?display=${display}` : '/api/display/commands');
  return (await res.json() as { commands: Array<{ type: string; payload?: Record<string, unknown> }> }).commands;
}

/** The recipes the hub queued for one display (or the single wall), drained so the next look starts empty. */
async function drainRecipes(request: APIRequestContext, display?: string): Promise<Array<{ meal: { id: string; name: string; photoUrl?: string } }>> {
  const commands = await drainCommands(request, display);
  return commands.filter((c) => c.type === 'show-recipe').map((c) => c.payload as { meal: { id: string; name: string } });
}

/** Two walls, the remote on its default pick of All. */
const TWO_WALLS = () => baseConfig({
  displays: [
    { id: 'main', name: 'Living Room', screens: [makeScreen('m1', 'M1', [buildModuleInstance('meal-planner')])] },
    { id: 'kitchen', name: 'Kitchen', screens: [makeScreen('k1', 'K1', [textModule('KITCHEN')])] },
  ],
});

test('a Mealie recipe goes to the wall from its Library card, and the card still opens it in Mealie', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])] }));
  mealie = await startFakeMealie();
  await connectFakeMealie(request, mealie);
  await drainRecipes(request);
  await openLibrary(page);

  // The line above the list names both things a card does.
  await expect(page.getByText('Recipes live in Mealie. Tap one to open it there, or the screen button to show it on the wall.')).toBeVisible();
  // The Library opens on Favorites: the chili is one.
  const card = page.getByTestId('mealie-library-card').filter({ hasText: CHILI.name });
  await expect(card).toHaveCount(1);
  const wall = card.getByRole('button', { name: `Show ${CHILI.name} on the wall` });
  await expect(wall).toBeVisible();

  const sent = page.waitForRequest((r) => r.url().endsWith('/api/display/show-recipe') && r.method() === 'POST');
  await wall.click();
  expect((await sent).postDataJSON()).toEqual({ mealId: `mealie:${CHILI.id}` });
  await expect(notice(page, `Showing ${CHILI.name} on the wall.`)).toBeVisible();
  // A tick for a moment, then the button is ready again.
  await expect(wall).toHaveAttribute('data-sent', 'true');
  await expect(wall).not.toHaveAttribute('data-sent', 'true', { timeout: 5_000 });

  // The hub looked the recipe up in Mealie itself.
  const queued = await drainRecipes(request);
  expect(queued).toHaveLength(1);
  expect(queued[0].meal).toMatchObject({ id: `mealie:${CHILI.id}`, name: CHILI.name, prepTime: 20 });
  expect(queued[0].meal.photoUrl).toMatch(new RegExp(`^/api/mealie/image/${CHILI.id}`));

  // The rest of the card is still the way into Mealie: a tap on the photo, at
  // the card's left edge, lands on the card's own button. (The browser here
  // may not reach the fake Mealie, so catch the link rather than follow it.)
  await page.evaluate(() => {
    window.open = (url?: string | URL) => {
      (window as unknown as { opened: string }).opened = String(url);
      return null;
    };
  });
  await card.click({ position: { x: 30, y: 30 } });
  await expect.poll(() => page.evaluate(() => (window as unknown as { opened?: string }).opened)).toContain(`/r/${CHILI.slug}`);
  expect(await drainRecipes(request)).toHaveLength(0);
});

test('saved meals with a recipe get the wall button, and a wall picked at the top of the remote is used as it is', async ({ page, request }) => {
  await putConfig(request, TWO_WALLS());
  await seedMeals(request, { savedMeals: [SOUP, TOAST], plan: [] });
  await drainRecipes(request, 'kitchen');
  await openLibrary(page);

  const soup = page.getByTestId('library-card').filter({ hasText: SOUP.name });
  const toast = page.getByTestId('library-card').filter({ hasText: TOAST.name });
  await expect(soup.getByRole('button', { name: `Show ${SOUP.name} on the wall` })).toBeVisible();
  // Nothing to cook from: no wall button, and the heart and the meal itself still answer.
  await expect(toast.getByTestId('recipe-wall-button')).toHaveCount(0);
  await expect(toast.getByRole('button', { name: 'Add to favorites', exact: true })).toBeVisible();
  // The icon says nothing by itself: the line above the list does.
  await expect(page.getByText('Tap a meal to change it, or the screen button to show it on the wall.')).toBeVisible();

  // Pick the kitchen at the top of the remote, then send it: no question asked.
  await page.getByRole('button', { name: 'Control', exact: true }).click();
  await page.getByRole('button', { name: 'Kitchen', exact: true }).click();
  await page.getByRole('button', { name: 'Meals', exact: true }).click();
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/display/show-recipe') && r.method() === 'POST');
  await page.getByTestId('library-card').filter({ hasText: SOUP.name }).getByRole('button', { name: `Show ${SOUP.name} on the wall` }).click();
  expect((await sent).postDataJSON()).toEqual({ mealId: SOUP.id, displayId: 'kitchen' });
  await expect(page.getByTestId('recipe-wall-picker')).toHaveCount(0);
  await expect(notice(page, `Showing ${SOUP.name} on Kitchen.`)).toBeVisible();
  const queued = await drainRecipes(request, 'kitchen');
  expect(queued.at(-1)?.meal).toMatchObject(SOUP);

  // Tapping the meal still opens it to edit.
  await page.getByTestId('library-card').filter({ hasText: SOUP.name }).getByText(SOUP.name).click();
  await expect(page.getByText('Edit Meal')).toBeVisible();
});

test('with All picked and two walls, the phone asks which wall once, remembers it for recipes, and can take the recipe down', async ({ page, request }) => {
  await putConfig(request, TWO_WALLS());
  await seedMeals(request, { savedMeals: [SOUP], plan: [] });
  await drainCommands(request, 'kitchen');
  await drainCommands(request, 'main');
  await openLibrary(page);

  const wall = page.getByTestId('library-card').filter({ hasText: SOUP.name }).getByRole('button', { name: `Show ${SOUP.name} on the wall` });
  // All is the remote's pick: nothing goes anywhere until the phone knows which wall.
  let posted = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/display/show-recipe')) posted++; });
  await wall.click();
  const picker = page.getByTestId('recipe-wall-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByText('This phone will remember your pick for recipes.', { exact: false })).toBeVisible();
  await expect(picker.getByTestId('recipe-wall-choice')).toHaveText(['Living Room', 'Kitchen']);
  expect(posted).toBe(0);

  // Closing it sends nothing.
  await picker.getByTestId('sheet-close').click();
  await expect(picker).toHaveCount(0);
  expect(posted).toBe(0);

  await wall.click();
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/display/show-recipe') && r.method() === 'POST');
  await picker.getByTestId('recipe-wall-choice').filter({ hasText: 'Kitchen' }).click();
  expect((await sent).postDataJSON()).toEqual({ mealId: SOUP.id, displayId: 'kitchen' });
  await expect(picker).toHaveCount(0);
  await expect(notice(page, `Showing ${SOUP.name} on Kitchen.`)).toBeVisible();
  expect((await drainRecipes(request, 'kitchen')).map((c) => c.meal.id)).toEqual([SOUP.id]);
  expect(await drainRecipes(request, 'main')).toEqual([]);

  // "Take it down" closes it on the wall it went to, and only that recipe.
  const hidden = page.waitForRequest((r) => r.url().endsWith('/api/display/hide-recipe') && r.method() === 'POST');
  await page.getByRole('status').getByRole('button', { name: 'Take it down', exact: true }).click();
  expect((await hidden).postDataJSON()).toEqual({ mealId: SOUP.id, displayId: 'kitchen' });
  await expect(notice(page, `Took ${SOUP.name} off Kitchen.`)).toBeVisible();
  expect(await drainCommands(request, 'kitchen')).toEqual([expect.objectContaining({ type: 'hide-recipe', payload: { mealId: SOUP.id } })]);

  // Remembered, across a reload: the next send goes straight to the kitchen.
  await openLibrary(page);
  const again = page.waitForRequest((r) => r.url().endsWith('/api/display/show-recipe') && r.method() === 'POST');
  await page.getByTestId('library-card').filter({ hasText: SOUP.name }).getByRole('button', { name: `Show ${SOUP.name} on the wall` }).click();
  expect((await again).postDataJSON()).toEqual({ mealId: SOUP.id, displayId: 'kitchen' });
  await expect(page.getByTestId('recipe-wall-picker')).toHaveCount(0);
  await expect(notice(page, `Showing ${SOUP.name} on Kitchen.`)).toBeVisible();
});

test("the planned meal's sheet sends its main dish's recipe", async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])] }));
  await seedMeals(request, {
    savedMeals: [SOUP, TOAST],
    plan: [
      { date: fakeMealieDay(0), slot: 'dinner', mealId: SOUP.id },
      { date: fakeMealieDay(0), slot: 'breakfast', mealId: TOAST.id },
    ],
  });
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Meals', exact: true }).click();

  // Toast has no recipe: its sheet has no wall button.
  await page.getByTestId('meals-week-row').filter({ hasText: TOAST.name }).first().click();
  const sheet = page.getByTestId('meal-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('recipe-wall-button')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(sheet).toHaveCount(0);

  await page.getByTestId('meals-week-row').filter({ hasText: SOUP.name }).first().click();
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/display/show-recipe') && r.method() === 'POST');
  await sheet.getByRole('button', { name: 'Show on the wall', exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({ mealId: SOUP.id });
  // Said over the sheet, not under it: a trial tap lands on the notice itself.
  const said = notice(page, `Showing ${SOUP.name} on the wall.`);
  await expect(said).toBeVisible();
  await said.click({ trial: true });
  await expect(sheet.getByTestId('recipe-wall-button')).toHaveAttribute('data-sent', 'true');
});

test('a recipe gone from the hub, Mealie not answering, or the hub failing each say so, and a send that works clears it', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])] }));
  await seedMeals(request, { savedMeals: [SOUP], plan: [] });
  const answers = [
    { status: 404, json: { error: 'That meal is not saved anymore', reason: 'gone' }, toast: "That recipe isn't here anymore." },
    { status: 502, json: { error: "We couldn't reach Mealie.", failure: 'unreachable' }, toast: "Couldn't get that recipe from Mealie. Try again." },
    { status: 500, json: { error: 'Display command failed' }, toast: "Couldn't reach the wall. Try again." },
    { status: 200, json: { ok: true, command: 'show-recipe', mealId: SOUP.id }, toast: null },
  ];
  let next = 0;
  await page.route('**/api/display/show-recipe', (route) => {
    const answer = answers[next++];
    return route.fulfill({ status: answer.status, json: answer.json });
  });
  await openLibrary(page);

  const wall = page.getByTestId('library-card').filter({ hasText: SOUP.name }).getByTestId('recipe-wall-button');
  // The Meals tab's error line (Next's empty route announcer is an alert too).
  const error = page.getByRole('alert').filter({ hasText: /\S/ });
  for (const answer of answers.slice(0, -1)) {
    await wall.click();
    await expect(error).toHaveText(answer.toast!);
    // No tick for a recipe that did not go.
    await expect(wall).not.toHaveAttribute('data-sent', 'true');
  }
  // It went this time: the error is taken back and the notice says where.
  await wall.click();
  await expect(notice(page, `Showing ${SOUP.name} on the wall.`)).toBeVisible();
  await expect(error).toHaveCount(0);
  await expect(wall).toHaveAttribute('data-sent', 'true');
});
