import { test, expect } from '../fixtures';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedMeals } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';
import { formatDayRange } from '@/i18n/formatters';

/**
 * Look-ahead arrows on the meal planners: on a touch wall with taps on, the
 * small Week and List views and the full-screen Week step a week forward or
 * back (a plan in Mealie only through the weeks the hub reads for walls, one back and three ahead),
 * "This week" comes straight back, and a minute untouched slides back by
 * itself. With taps off, and on views about today, nothing changes.
 */

/**
 * Wednesday of this week (the household's week starts on Sunday) at 9:41,
 * local time: today sits inside its week whatever day the suite runs.
 */
function wednesday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 3);
  d.setHours(9, 41, 0, 0);
  return d;
}
const NOW = wednesday();

/** A day of the week `weeks` from this one (`dow` 0 is its Sunday), as the plan keys it. */
function day(weeks: number, dow: number): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 3 + weeks * 7 + dow, 12);
}
function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** What the heading row says for a week's dates: "November 1 – 7". */
function range(weeks: number, year = false): string {
  return formatDayRange(day(weeks, 0), day(weeks, 6), 'en-US', { year });
}

/**
 * A dinner (or two) in every week the arrows reach except the one two weeks
 * on, and one past the reach that must never show.
 */
async function seedWeeks(request: APIRequestContext) {
  await seedMeals(request, {
    savedMeals: [
      { id: 'last', name: 'Last Week Lasagne', emoji: '🍝', ingredients: [{ name: 'Ricotta', amount: '1 cup', category: 'dairy' }] },
      { id: 'taco', name: 'Taco Night', emoji: '🌮', ingredients: [{ name: 'Tortillas', amount: '8', category: 'bakery' }] },
      { id: 'kung', name: 'Kung Pao Chicken', emoji: '🥡', ingredients: [{ name: 'Peanuts', amount: '1 cup', category: 'pantry' }] },
      { id: 'jigg', name: 'Jiggs Dinner', emoji: '🥘' },
      { id: 'far', name: 'Far Ahead Fajitas', emoji: '🫑' },
      { id: 'tofar', name: 'Too Far Feast', emoji: '🍗' },
    ],
    plan: [
      { slot: 'dinner', mealId: 'last', date: iso(day(-1, 3)) },
      { slot: 'dinner', mealId: 'taco', date: iso(day(0, 3)) },
      { slot: 'dinner', mealId: 'kung', date: iso(day(1, 1)) },
      { slot: 'dinner', mealId: 'jigg', date: iso(day(1, 3)) },
      { slot: 'dinner', mealId: 'far', date: iso(day(3, 3)) },
      { slot: 'dinner', mealId: 'tofar', date: iso(day(4, 3)) },
    ],
  });
}

async function show(
  page: Page,
  request: APIRequestContext,
  type: 'meal-planner' | 'fullscreen-meal-planner',
  config: Record<string, unknown>,
): Promise<Locator> {
  const mod = buildModuleInstance(type, config);
  mod.id = 'meals';
  if (type === 'fullscreen-meal-planner') {
    mod.size = { w: 1080, h: 1920 };
    mod.position = { x: 0, y: 0 };
  } else {
    mod.size = { w: 640, h: 720 };
    mod.position = { x: 60, y: 120 };
  }
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])] }));
  await page.goto('/display');
  const root = page.locator('[data-module-id="meals"]');
  await expect(root).toBeVisible();
  return root;
}

test.describe('Meal Planner Week', () => {
  test('rests on this week, steps to next week\'s meals, and This week comes straight back', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await seedWeeks(request);
    const mod = await show(page, request, 'meal-planner', { view: 'week', interactive: true });

    const bar = mod.getByTestId('look-ahead-bar');
    await expect(bar).toHaveAttribute('data-offset', '0');
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('This week');
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(range(0));
    await expect(mod.getByText('Taco Night')).toBeVisible();
    await expect(mod.getByTestId('look-ahead-home')).toHaveCount(0);
    // The heading row sits above the slot labels.
    const [barBox, dinnerBox] = await Promise.all([bar.boundingBox(), mod.getByText('Dinner', { exact: true }).boundingBox()]);
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(dinnerBox!.y);

    await mod.getByTestId('look-ahead-forward').click();
    await expect(bar).toHaveAttribute('data-offset', '1');
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(range(1));
    await expect(mod.getByText('Kung Pao Chicken')).toBeVisible();
    await expect(mod.getByText('Jiggs Dinner')).toBeVisible();
    await expect(mod.getByText('Taco Night')).toHaveCount(0);
    await expect(mod.getByTestId('look-ahead-home')).toHaveText('Back to this week');

    await mod.getByTestId('look-ahead-home').click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('This week');
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(range(0));
    await expect(mod.getByText('Taco Night')).toBeVisible();
    await expect(mod.getByTestId('look-ahead-home')).toHaveCount(0);
  });

  test('slides back to this week a minute after the last touch', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await seedWeeks(request);
    const mod = await show(page, request, 'meal-planner', { view: 'week', interactive: true });

    await mod.getByTestId('look-ahead-forward').click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    await page.clock.fastForward(WALL_SCROLL_IDLE_MS - 5_000);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    // A touch on the module means someone is reading: the minute starts again.
    await mod.getByTestId('look-ahead-dates').click();
    await page.clock.fastForward(10_000);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
    await page.clock.fastForward(WALL_SCROLL_IDLE_MS);
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('This week');
    await expect(mod.getByText('Taco Night')).toBeVisible();
    await expect(mod.getByTestId('look-ahead-home')).toHaveCount(0);
  });

  test('a Home Screens plan reaches eight weeks either way; an empty week just says so, and the end says how far', async ({ page, request }) => {
    await page.clock.install({ time: NOW });
    await seedWeeks(request);
    const mod = await show(page, request, 'meal-planner', { view: 'week', interactive: true });
    const back = mod.getByTestId('look-ahead-back');
    const forward = mod.getByTestId('look-ahead-forward');

    await back.click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('Last week');
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(range(-1));
    await expect(mod.getByText('Last Week Lasagne')).toBeVisible();
    // Only a plan in Mealie stops at one week back.
    await back.click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('2 weeks ago');

    await mod.getByTestId('look-ahead-home').click();
    await forward.click();
    await forward.click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 2 weeks');
    await expect(mod.getByTestId('look-ahead-dates')).toHaveText(range(2));
    // Another week with nothing planned is not a wall waiting to be set up.
    await expect(mod.getByText('Nothing planned for that week yet')).toBeVisible();
    await expect(mod.getByText(/Plan meals from a phone/)).toHaveCount(0);

    await forward.click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 3 weeks');
    await expect(mod.getByText('Far Ahead Fajitas')).toBeVisible();
    await forward.click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 4 weeks');
    await expect(mod.getByText('Too Far Feast')).toBeVisible();
    for (let i = 0; i < 4; i++) await forward.click();
    await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 8 weeks');
    await expect(forward).toHaveAttribute('aria-disabled', 'true');
    // Greyed, it still answers a finger (Playwright waits on aria-disabled unless forced).
    await forward.click({ force: true });
    await expect(mod.getByTestId('look-ahead-limit')).toHaveText('Up to 8 weeks ahead');
  });
});

test('Meal Planner List steps a week, and today is only marked in this week', async ({ page, request }) => {
  await page.clock.install({ time: NOW });
  await seedWeeks(request);
  const mod = await show(page, request, 'meal-planner', { view: 'list', interactive: true });

  await expect(mod.getByTestId('look-ahead-words')).toHaveText('This week');
  await expect(mod.getByTestId('look-ahead-dates')).toHaveText(range(0));
  await expect(mod.getByText('Today', { exact: true })).toBeVisible();
  await expect(mod.getByText('Taco Night')).toBeVisible();

  await mod.getByTestId('look-ahead-forward').click();
  await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
  await expect(mod.getByTestId('look-ahead-dates')).toHaveText(range(1));
  await expect(mod.getByText('Kung Pao Chicken')).toBeVisible();
  await expect(mod.getByText('Taco Night')).toHaveCount(0);
  await expect(mod.getByText('Today', { exact: true })).toHaveCount(0);
  // Another week starts at its first day.
  await expect.poll(() => mod.getByTestId('meal-list-scroll').evaluate((el) => el.scrollTop)).toBe(0);

  await mod.getByTestId('look-ahead-home').click();
  await expect(mod.getByText('Today', { exact: true })).toBeVisible();
  await expect(mod.getByText('Taco Night')).toBeVisible();
});

test('Full-Screen Meal Planner Week steps, with the week tagged beside its title', async ({ page, request }) => {
  await page.clock.install({ time: NOW });
  await seedWeeks(request);
  const mod = await show(page, request, 'fullscreen-meal-planner', { view: 'week', interactive: true });

  await expect(mod.getByTestId('fmp-week-title')).toHaveText('This Week\'s Meals');
  await expect(mod.getByTestId('fmp-week-dates')).toHaveText(range(0, true));
  await expect(mod.getByTestId('look-ahead-words')).toHaveCount(0);
  await expect(mod.getByText('Taco Night')).toBeVisible();

  await mod.getByTestId('look-ahead-forward').click();
  await expect(mod.getByTestId('look-ahead-bar')).toHaveAttribute('data-offset', '1');
  await expect(mod.getByTestId('fmp-week-title')).toHaveText(range(1));
  await expect(mod.getByTestId('look-ahead-words')).toHaveText('Next week');
  await expect(mod.getByTestId('look-ahead-home')).toHaveText('Back to this week');
  await expect(mod.getByText('Kung Pao Chicken')).toBeVisible();
  await expect(mod.getByText('Taco Night')).toHaveCount(0);
  // No day of another week is today.
  await expect(mod.getByText('Today', { exact: true })).toHaveCount(0);

  // A week with nothing planned says so without calling it this week.
  await mod.getByTestId('look-ahead-forward').click();
  await expect(mod.getByTestId('look-ahead-words')).toHaveText('In 2 weeks');
  await expect(mod.getByTestId('fmp-week-empty')).toContainText('Nothing planned for that week yet');

  await mod.getByTestId('look-ahead-home').click();
  await expect(mod.getByTestId('fmp-week-title')).toHaveText('This Week\'s Meals');
  await expect(mod.getByText('Taco Night')).toBeVisible();
  await expect(mod.getByTestId('look-ahead-home')).toHaveCount(0);
});

test.describe('with taps off', () => {
  for (const [type, view] of [['meal-planner', 'week'], ['meal-planner', 'list'], ['fullscreen-meal-planner', 'week']] as const) {
    test(`${type} ${view} draws no arrows`, async ({ page, request }) => {
      await page.clock.install({ time: NOW });
      await seedWeeks(request);
      const mod = await show(page, request, type, { view, interactive: false });
      await expect(mod.getByText('Taco Night')).toBeVisible();
      await expect(mod.getByTestId('look-ahead-bar')).toHaveCount(0);
      await expect(mod.getByTestId('look-ahead-forward')).toHaveCount(0);
      if (type === 'fullscreen-meal-planner') {
        await expect(mod.getByText('This Week\'s Meals')).toBeVisible();
        await expect(mod.getByText(range(0, true))).toBeVisible();
      }
    });
  }
});

test('the editor preview draws no arrows, taps on or not', async ({ page, request }) => {
  await seedWeeks(request);
  const small = buildModuleInstance('meal-planner', { view: 'week', interactive: true });
  small.id = 'small-week';
  small.size = { w: 640, h: 720 };
  small.position = { x: 40, y: 40 };
  const list = buildModuleInstance('meal-planner', { view: 'list', interactive: true });
  list.id = 'small-list';
  list.size = { w: 640, h: 720 };
  list.position = { x: 40, y: 800 };
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [small, list])] }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/editor');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  for (const id of ['small-week', 'small-list']) {
    const preview = page.locator(`[data-module-id="${id}"]`);
    await expect(preview).toContainText('Taco Night');
    await expect(preview.getByTestId('look-ahead-bar')).toHaveCount(0);
  }

  const full = buildModuleInstance('fullscreen-meal-planner', { view: 'week', interactive: true });
  full.id = 'full-week';
  full.size = { w: 1080, h: 1920 };
  full.position = { x: 0, y: 0 };
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [full])] }));
  await page.goto('/editor');
  const preview = page.locator('[data-module-id="full-week"]');
  await expect(preview).toContainText('This Week\'s Meals');
  await expect(preview.getByTestId('look-ahead-bar')).toHaveCount(0);
});

test('the Grocery List has no arrows and keeps this week\'s list', async ({ page, request }) => {
  await page.clock.install({ time: NOW });
  await seedWeeks(request);
  const mod = await show(page, request, 'meal-planner', { view: 'grocery', interactive: true });

  await expect(mod.getByRole('checkbox', { name: /Tortillas/ })).toBeVisible();
  await expect(mod.getByTestId('meal-grocery-left')).toHaveText('1 to get');
  await expect(mod.getByText('Peanuts')).toHaveCount(0);
  await expect(mod.getByText('Ricotta')).toHaveCount(0);
  await expect(mod.getByTestId('look-ahead-bar')).toHaveCount(0);
});
