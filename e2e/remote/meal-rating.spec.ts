import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig, seedFamily, seedMeals } from '../helpers/api';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * Rate Dinner on the phone: a button in the Meals header, not a fifth tab,
 * so the four tabs fit a phone in every language, and a sheet that opens
 * over whichever tab is up.
 */

const FAMILY = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus'].map((name, i) => ({
  id: `p${i}`, name, emoji: '', color: ['#60a5fa', '#a78bfa', '#4ade80', '#22d3ee', '#f472b6', '#f87171', '#2563eb'][i],
}));
const DISHES = [
  { id: 'd-pie', name: 'Chicken Pie', emoji: '🥧' },
  { id: 'd-rice', name: 'Rice', category: 'side' },
];

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The same dinner last night and tonight, so the sheet opens on it whatever time and weekday the test runs. */
async function openMeals(page: Page, request: APIRequestContext, sandboxDir: string, locale?: string) {
  seedFamily(sandboxDir, FAMILY);
  const dinner = (date: string) => ({ date, slot: 'dinner', mealId: 'd-pie', courses: [{ kind: 'side', mealId: 'd-rice' }] });
  await seedMeals(request, { savedMeals: DISHES, plan: [dinner(isoDate(-1)), dinner(isoDate(0))] });
  await putConfig(request, baseConfig({
    settings: locale ? { locale } : {},
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('meal-planner')])],
  }));
  await page.goto('/remote?tab=meals');
  await expect(page.getByTestId('meals-rate-dinner')).toBeVisible();
}

/** The tab strip is the Week tab's parent. Nothing in it may be wider than it. */
async function expectTabsFit(page: Page, week: string, count = 4) {
  const strip = page.getByRole('button', { name: week, exact: true }).locator('..');
  await expect(strip.getByRole('button')).toHaveCount(count);
  expect(await strip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

test('Rate Dinner is a button beside the gear and the four tabs fit', async ({ page, request, sandboxDir }) => {
  await openMeals(page, request, sandboxDir);
  await expectTabsFit(page, 'Week');

  const rate = page.getByTestId('meals-rate-dinner');
  await expect(rate).toHaveText('Rate Dinner');
  const [button, gear] = [await rate.boundingBox(), await page.getByRole('button', { name: 'Open meal settings' }).boundingBox()];
  expect(button!.y).toBe(gear!.y);
  expect(button!.height).toBe(gear!.height);
  expect(gear!.x - (button!.x + button!.width)).toBe(8);
});

test('the sheet opens over the tab that is up, saves a vote and closes back onto it', async ({ page, request, sandboxDir }) => {
  await openMeals(page, request, sandboxDir);
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page).toHaveURL(/meals=library/);

  await page.getByTestId('meals-rate-dinner').click();
  const sheet = page.getByRole('dialog', { name: 'Rate Dinner' });
  await expect(sheet.getByRole('group', { name: 'Who is rating?' }).getByRole('button')).toHaveCount(FAMILY.length);
  await expect(sheet.getByTestId('meal-rating-dish')).toHaveCount(2);

  await sheet.getByRole('button', { name: 'Cleo' }).click();
  const rice = sheet.getByTestId('meal-rating-dish').nth(1);
  await rice.getByRole('button', { name: '4 stars' }).click();
  await expect(rice).toContainText('Your rating: 4 / 5');
  await expect.poll(async () => (await (await request.get('/api/meals/data')).json()).familyRatings)
    .toEqual([expect.objectContaining({ mealId: 'd-rice', memberId: 'p2', rating: 4 })]);

  await sheet.getByTestId('sheet-close').click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/meals=library/);
  await expect(page.getByText('Chicken Pie').first()).toBeVisible();
  // The Library card shows the vote that was just cast.
  await expect(page.getByText('★ 4.0').first()).toBeVisible();
});

test('clearing a vote keeps the keyboard inside the sheet', async ({ page, request, sandboxDir }) => {
  await openMeals(page, request, sandboxDir);
  await page.getByTestId('meals-rate-dinner').click();
  const sheet = page.getByRole('dialog', { name: 'Rate Dinner' });
  await sheet.getByRole('button', { name: 'Ada' }).click();
  const pie = sheet.getByTestId('meal-rating-dish').first();
  await pie.getByRole('button', { name: '5 stars' }).click();
  await pie.getByRole('button', { name: 'Clear my rating' }).click();
  await expect(pie).toContainText('You have not rated this recipe yet.');
  await expect.poll(async () => (await (await request.get('/api/meals/data')).json()).familyRatings).toEqual([]);

  // The button that was pressed is gone; focus must not have gone with it.
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('a day with no dinner says so in the sheet', async ({ page, request, sandboxDir }) => {
  await openMeals(page, request, sandboxDir);
  await page.getByTestId('meals-rate-dinner').click();
  const sheet = page.getByRole('dialog', { name: 'Rate Dinner' });
  const days = sheet.getByRole('combobox');
  const planned = new Set([isoDate(-1), isoDate(0)]);
  const empty = await days.locator('option').evaluateAll((options, taken) =>
    options.map((o) => (o as HTMLOptionElement).value).find((value) => !taken.includes(value)), [...planned]);
  await days.selectOption(empty!);
  await expect(sheet.getByTestId('meal-rating-dish')).toHaveCount(0);
  await expect(sheet).toContainText('No dinner is planned');
});

test('a dish that was typed in is named as the reason it has no stars', async ({ page, request, sandboxDir }) => {
  await openMeals(page, request, sandboxDir);
  const dinner = (date: string) => ({ date, slot: 'dinner', mealId: 'd-pie', courses: [{ kind: 'side', customText: 'Garlic bread' }, { kind: 'dessert', customText: 'Ice cream' }] });
  await seedMeals(request, { savedMeals: DISHES, plan: [dinner(isoDate(-1)), dinner(isoDate(0))] });
  await page.reload();
  await page.getByTestId('meals-rate-dinner').click();
  const sheet = page.getByRole('dialog', { name: 'Rate Dinner' });
  await expect(sheet.getByTestId('meal-rating-dish')).toHaveCount(1);
  await expect(sheet).toContainText('There are no recipes to rate for Garlic bread and Ice cream, because they were only typed in.');
});

test('German keeps the words at 390px and falls back to the star on a narrower phone', async ({ page, request, sandboxDir }) => {
  await openMeals(page, request, sandboxDir, 'de-DE');
  const rate = page.getByTestId('meals-rate-dinner');
  await expect(rate).toHaveAccessibleName('Abendessen bewerten');
  await expect(rate.getByText('Abendessen bewerten')).toBeVisible();
  await expectTabsFit(page, 'Woche');

  await page.setViewportSize({ width: 360, height: 780 });
  await expect(rate.getByText('Abendessen bewerten')).toBeHidden();
  await expect(rate).toHaveAccessibleName('Abendessen bewerten');
  expect((await rate.boundingBox())!.width).toBe(40);
  await expectTabsFit(page, 'Woche');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rate.getByText('Abendessen bewerten')).toBeVisible();
});
