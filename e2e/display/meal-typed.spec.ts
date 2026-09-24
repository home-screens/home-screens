import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { seedMeals } from '../helpers/api';
import type { MealPlannerView } from '@/types/config';

/**
 * A meal typed straight into a day on the phone is stored as `customText` with
 * no `mealId` behind it. Every wall view used to read `meal.name` off the
 * library entry, so the phone showed tonight's dinner and the wall showed an
 * empty slot for the same day.
 */

/** Local YYYY-MM-DD, matching how the meal planner keys plan entries. */
function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 18:00 today, inside the dinner window, on the same local day as `isoToday()`. */
function dinnerTimeToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 0, 0);
}

/** A week with nothing in the library at all, the way it arrives from the phone. */
const typedOnly = () => ({
  savedMeals: [],
  plan: [{ slot: 'dinner', customText: 'Tacos', date: isoToday() }],
});

const VIEWS: MealPlannerView[] = ['today', 'week', 'list', 'compact', 'next-meal'];

for (const view of VIEWS) {
  test(`meal-planner ${view} shows a meal typed straight into the day`, async ({ page, request }) => {
    // next-meal drops tonight's dinner once dinner is over, so on the real
    // clock this failed every evening. Every view renders at dinner time.
    await page.clock.setFixedTime(dinnerTimeToday());
    await seedMeals(request, typedOnly());
    const meals = buildModuleInstance('meal-planner', { view });
    const display = await renderOnDisplay(page, request, baseConfig({
      screens: [makeScreen('s1', 'S1', [meals])],
    }));
    await expect(display.module('meal-planner').getByText('Tacos')).toBeVisible();
  });
}

test('fullscreen meal planner shows one too', async ({ page, request }) => {
  await seedMeals(request, typedOnly());
  const meals = buildModuleInstance('fullscreen-meal-planner', { view: 'today' });
  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [meals])],
  }));
  await expect(display.module('fullscreen-meal-planner').getByText('Tacos')).toBeVisible();
});

test('a saved meal and a typed one sit side by side', async ({ page, request }) => {
  await seedMeals(request, {
    savedMeals: [{ id: 'meal-1', name: 'Spaghetti Night', emoji: '🍝' }],
    plan: [
      { slot: 'lunch', customText: 'Leftovers', date: isoToday() },
      { slot: 'dinner', mealId: 'meal-1', date: isoToday() },
    ],
  });
  const meals = buildModuleInstance('meal-planner', { view: 'today' });
  const display = await renderOnDisplay(page, request, baseConfig({
    screens: [makeScreen('s1', 'S1', [meals])],
  }));
  await expect(display.module('meal-planner').getByText('Leftovers')).toBeVisible();
  await expect(display.module('meal-planner').getByText('Spaghetti Night')).toBeVisible();
});
