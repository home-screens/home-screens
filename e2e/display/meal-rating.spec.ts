import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedFamily, seedMeals } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * Rate Dinner on the wall: the dialog has to put the stars in front of a
 * family without anyone hunting for them, on a wall that hangs upright and on
 * one on its side, and it must never hide a dish in silence.
 */

const FAMILY = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus'].map((name, i) => ({
  id: `p${i}`, name, emoji: '', color: ['#60a5fa', '#a78bfa', '#4ade80', '#22d3ee', '#f472b6', '#f87171', '#2563eb'][i],
}));
const DISHES = [
  { id: 'd-pie', name: 'Chicken Pie', emoji: '🥧' },
  { id: 'd-rice', name: 'Rice', category: 'side' },
  { id: 'd-salad', name: 'Green Salad', category: 'side' },
  { id: 'd-cake', name: 'Lemon Cake', category: 'dessert' },
];

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The same dinner last night and tonight, so the dialog opens on it whatever time the test runs. */
function dinners(dishes: typeof DISHES) {
  const [main, ...rest] = dishes;
  const dinner = (date: string) => ({
    date, slot: 'dinner', mealId: main.id,
    courses: rest.map((dish) => ({ kind: dish.category ?? 'side', mealId: dish.id })),
  });
  return { savedMeals: dishes, plan: [dinner(isoDate(-1)), dinner(isoDate(0))] };
}

async function openRateDinner(page: Page, request: APIRequestContext, sandboxDir: string, dishes: typeof DISHES, landscape: boolean) {
  seedFamily(sandboxDir, FAMILY);
  await seedMeals(request, dinners(dishes));
  const mod = buildModuleInstance('fullscreen-meal-planner', { view: 'today' });
  mod.size = landscape ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
  await putConfig(request, baseConfig({
    settings: landscape ? { displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal' } : {},
    screens: [makeScreen('s1', 'S1', [mod])],
  }));
  await page.setViewportSize(landscape ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 });
  await page.goto('/display');
  await page.getByTestId('meal-rate-dinner').first().click();
  const dialog = page.getByTestId('meal-rating');
  await expect(dialog.getByTestId('meal-rating-member')).toHaveCount(FAMILY.length);
  return dialog;
}

for (const landscape of [false, true]) {
  const wall = landscape ? 'a wall on its side' : 'an upright wall';

  test(`${wall}: seven people and a two-dish dinner all show without scrolling`, async ({ page, request, sandboxDir }) => {
    const dialog = await openRateDinner(page, request, sandboxDir, DISHES.slice(0, 2), landscape);
    const height = page.viewportSize()!.height;
    for (const part of [dialog.getByTestId('meal-rating-member').last(), dialog.getByTestId('meal-rating-star').last()]) {
      const box = (await part.boundingBox())!;
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThan(height);
    }
    await expect(dialog.getByTestId('meal-rating-more')).toHaveCount(0);

    // And it works: pick a person, give the second dish four stars.
    await dialog.getByTestId('meal-rating-member').nth(2).click();
    await dialog.getByTestId('meal-rating-dish').nth(1).getByTestId('meal-rating-star').nth(3).click();
    await expect(dialog.getByTestId('meal-rating-dish').nth(1)).toContainText('Your rating: 4 / 5');
    await expect.poll(async () => (await (await request.get('/api/meals/data')).json()).familyRatings)
      .toEqual([expect.objectContaining({ mealId: 'd-rice', memberId: 'p2', rating: 4 })]);
  });

  test(`${wall}: a four-dish dinner says how many dishes are below, until they are scrolled to`, async ({ page, request, sandboxDir }) => {
    const dialog = await openRateDinner(page, request, sandboxDir, DISHES, landscape);
    // The first dish's stars are on screen as the dialog opens.
    const firstStars = (await dialog.getByTestId('meal-rating-star').nth(4).boundingBox())!;
    expect(firstStars.y + firstStars.height).toBeLessThan(page.viewportSize()!.height);
    await expect(dialog.getByTestId('meal-rating-more')).toHaveText(landscape ? '2 more below' : '1 more below');

    await dialog.getByTestId('meal-rating-dish').last().scrollIntoViewIfNeeded();
    await expect(dialog.getByTestId('meal-rating-more')).toHaveCount(0);
  });
}

/**
 * Rate Dinner means the last dinner the family sat down to, whatever meal a
 * view is leading with, so it stands at the view's bottom edge and never
 * inside the meal on show, where it read as a button for that meal.
 */
for (const view of ['today', 'next-meal'] as const) {
  for (const landscape of [false, true]) {
    test(`${view} on ${landscape ? 'a wall on its side' : 'an upright wall'}: Rate Dinner sits under the meals, apart from them`, async ({ page, request, sandboxDir }) => {
      seedFamily(sandboxDir, FAMILY);
      await seedMeals(request, dinners(DISHES));
      const mod = buildModuleInstance('fullscreen-meal-planner', { view });
      mod.size = landscape ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
      await putConfig(request, baseConfig({
        settings: landscape ? { displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal' } : {},
        screens: [makeScreen('s1', 'S1', [mod])],
      }));
      const size = landscape ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
      await page.setViewportSize(size);
      await page.goto('/display');
      const button = page.getByTestId('meal-rate-dinner');
      await expect(button).toHaveCount(1);
      await expect(page.locator('[data-fit-settled="true"]').first()).toBeVisible();

      const box = (await button.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      // Every card of the view ends above the button.
      const cards = await page.locator('[data-fit-measure]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
      expect(cards.length).toBeGreaterThan(0);
      for (const bottom of cards) expect(bottom).toBeLessThanOrEqual(box.y + 1);

      await button.click();
      await expect(page.getByTestId('meal-rating').getByTestId('meal-rating-dish')).toHaveCount(DISHES.length);
    });
  }
}
