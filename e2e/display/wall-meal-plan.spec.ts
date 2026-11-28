import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { seedMeals } from '../helpers/api';
import { localDate } from '../helpers/dates';

/**
 * Planning a meal from the wall, both ways in: "Put on the menu" on a recipe
 * card, and the plus on an empty meal. These drive the whole loop on a real
 * display: tap, see the day fill in, find it in the store, Undo. What the hub
 * holds a wall's token to is unit-tested beside the route
 * (`plan/wall/__tests__/route.test.ts`); the E2E hub runs with no password, so
 * here every caller is let in.
 */

const TODAY = localDate(0);
const TOMORROW = localDate(1);

const ing = (name: string) => ({ name });
const MEALS = {
  savedMeals: [
    { id: 'meal-curry', name: 'Chicken curry', emoji: '🍛', prepTime: 15, ingredients: [ing('Chicken'), ing('Coconut milk')], notes: 'Simmer 25 minutes.' },
    { id: 'meal-tacos', name: 'Chicken tacos', emoji: '🌮', prepTime: 25, ingredients: [ing('Tortillas')] },
    { id: 'meal-brownies', name: 'Brownies', emoji: '🍫', category: 'dessert', ingredients: [ing('Brownie mix')] },
  ],
  // Tomorrow's dinner is taken; today's is free. Both are days the wall may plan whatever day the week starts on.
  plan: [{ slot: 'dinner', mealId: 'meal-tacos', date: TOMORROW, time: '18:30' }],
};

type Entry = { date: string; slot: string; mealId?: string; time?: string; courses?: Array<{ kind: string; mealId?: string }> };

async function dinnerOn(request: APIRequestContext, date: string): Promise<Entry | undefined> {
  const { plan } = (await (await request.get('/api/meals/data')).json()) as { plan: Entry[] };
  return plan.find((p) => p.date === date && p.slot === 'dinner');
}

/**
 * A planning sheet takes no tap for a moment after it opens, asks or lands a
 * change, so the second tap of a double tap never plans something nobody
 * chose. A person reads first; a test has to wait it out.
 */
const settle = (page: Page) => page.waitForTimeout(800);

const changed = (page: Page) => page.waitForResponse((r) => r.url().endsWith('/api/meals/plan/wall') && r.request().method() === 'POST');
const day = (page: Page, date: string) => page.locator(`[data-testid="wall-menu-day"][data-date="${date}"]`);

/** Open a recipe from the full-screen recipe book and then its day sheet. */
async function openDaySheet(page: Page, request: APIRequestContext, recipe: string) {
  await seedMeals(request, MEALS);
  const book = buildModuleInstance('fullscreen-meal-planner', { view: 'recipes', interactive: true, wallPlan: true, tapRecipeAction: 'card' });
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [book])] }));
  await page.getByTestId('recipe-book-tile').filter({ hasText: recipe }).click();
  await page.getByTestId('recipe-card').getByTestId('meal-put-on-menu').click();
  const sheet = page.getByTestId('wall-menu');
  await expect(sheet).toBeVisible();
  await settle(page);
  return sheet;
}

test('recipe card: Put on the menu plans a free day, and Undo frees it again', async ({ page, request }) => {
  const sheet = await openDaySheet(page, request, 'Chicken curry');
  await expect(sheet.getByTestId('wall-menu-meal')).toHaveText('Chicken curry');
  // Two weeks of days, each saying what is on it.
  await expect(sheet.getByTestId('wall-menu-day')).toHaveCount(14);
  await expect(day(page, TODAY)).toHaveAttribute('data-state', 'free');
  await expect(day(page, TOMORROW)).toHaveAttribute('data-state', 'taken');
  await expect(day(page, TOMORROW)).toContainText('Chicken tacos');
  // Done is there from the start, so nothing under a finger moves when a day is planned.
  await expect(sheet.getByTestId('wall-menu-done')).toBeVisible();
  const tuesdayBefore = await day(page, TOMORROW).boundingBox();

  const put = changed(page);
  await day(page, TODAY).click();
  expect((await put).ok()).toBe(true);
  await expect(day(page, TODAY)).toHaveAttribute('data-state', 'mine');
  await expect(sheet.getByTestId('wall-menu-status')).toContainText('dinner is Chicken curry');
  await expect(sheet.getByTestId('wall-menu-status')).toContainText("this week's grocery list");
  expect((await dinnerOn(request, TODAY))?.mealId).toBe('meal-curry');
  expect(await day(page, TOMORROW).boundingBox()).toEqual(tuesdayBefore);

  await settle(page);
  const undone = changed(page);
  await sheet.getByTestId('wall-menu-undo').click();
  expect((await undone).ok()).toBe(true);
  await expect(day(page, TODAY)).toHaveAttribute('data-state', 'free');
  expect(await dinnerOn(request, TODAY)).toBeUndefined();

  await sheet.getByTestId('wall-menu-done').click();
  await expect(sheet).toHaveCount(0);
  // The recipe card it was opened from is still there.
  await expect(page.getByTestId('recipe-card')).toBeVisible();
});

test('a day with another main dish asks first: swap keeps its serving time, and that day then offers to take it off', async ({ page, request }) => {
  const sheet = await openDaySheet(page, request, 'Chicken curry');
  await day(page, TOMORROW).click();
  await settle(page);
  const ask = sheet.getByTestId('wall-menu-ask');
  await expect(ask).toContainText('is Chicken tacos');
  // Nothing was written by asking.
  expect((await dinnerOn(request, TOMORROW))?.mealId).toBe('meal-tacos');
  // Leaving it is one tap and changes nothing.
  await ask.locator('[data-choice="cancel"]').click();
  await expect(ask).toHaveCount(0);
  expect((await dinnerOn(request, TOMORROW))?.mealId).toBe('meal-tacos');

  await settle(page);
  await day(page, TOMORROW).click();
  await settle(page);
  const swapped = changed(page);
  await sheet.getByTestId('wall-menu-ask').locator('[data-choice="swap"]').click();
  expect((await swapped).ok()).toBe(true);
  await expect(day(page, TOMORROW)).toHaveAttribute('data-state', 'mine');
  expect(await dinnerOn(request, TOMORROW)).toMatchObject({ mealId: 'meal-curry', time: '18:30' });

  // The day the recipe is on now offers to take it off.
  await settle(page);
  await day(page, TOMORROW).click();
  await settle(page);
  await expect(sheet.getByTestId('wall-menu-ask')).toContainText('dinner has Chicken curry');
  const off = changed(page);
  await sheet.getByTestId('wall-menu-ask').locator('[data-choice="off"]').click();
  expect((await off).ok()).toBe(true);
  await expect(day(page, TOMORROW)).toHaveAttribute('data-state', 'free');
  expect(await dinnerOn(request, TOMORROW)).toBeUndefined();
});

test('a dessert joins the meal that is already there without asking', async ({ page, request }) => {
  const sheet = await openDaySheet(page, request, 'Brownies');
  const joined = changed(page);
  await day(page, TOMORROW).click();
  expect((await joined).ok()).toBe(true);
  await expect(sheet.getByTestId('wall-menu-ask')).toHaveCount(0);
  await expect(sheet.getByTestId('wall-menu-status')).toContainText('dinner has Brownies too');
  await expect(day(page, TOMORROW)).toContainText('Chicken tacos');
  await expect(day(page, TOMORROW)).toContainText('Brownies');
  expect(await dinnerOn(request, TOMORROW)).toMatchObject({ mealId: 'meal-tacos', courses: [{ kind: 'dessert', mealId: 'meal-brownies' }] });
});

test('full-screen Week: the plus on an empty meal opens the recipe book for it, and a tap on a recipe plans it', async ({ page, request }) => {
  await seedMeals(request, MEALS);
  const week = buildModuleInstance('fullscreen-meal-planner', { view: 'week', interactive: true, wallPlan: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [week])] }));
  const mod = display.module('fullscreen-meal-planner');
  // Only dinner is planned this week, yet every meal the household plans has a plus: a lunch can start here too.
  await expect(mod.getByRole('button', { name: /^Plan .* lunch$/ }).first()).toBeVisible();
  const plus = mod.getByRole('button', { name: /^Plan .* dinner$/ });
  await expect(plus.first()).toBeVisible();
  await plus.first().click();
  const book = page.getByTestId('meal-pick-sheet');
  await expect(book).toBeVisible();
  await settle(page);
  await expect(book.getByTestId('recipe-book-title')).toContainText(/dinner/i);
  // A recipe already on the menu says so; no hearts here.
  await expect(book.getByTestId('recipe-book-tile-badge')).toHaveCount(1);
  await expect(book.getByTestId('recipe-book-heart')).toHaveCount(0);

  const put = changed(page);
  await book.getByTestId('recipe-book-tile').filter({ hasText: 'Chicken curry' }).click();
  const body = (await (await put).json()) as { wall: { outcome: string; changed: boolean } };
  expect(body.wall).toMatchObject({ outcome: 'planned', changed: true });
  await expect(book.getByTestId('wall-menu-status')).toContainText('dinner is Chicken curry');
  // The week behind the sheet draws it at once, from the same answer.
  await expect(mod.getByTestId('fmp-week-name').filter({ hasText: 'Chicken curry' })).toHaveCount(1);
  await book.getByTestId('meal-pick-close').click();
  await expect(book).toHaveCount(0);
});

test('small List card: "Plan a meal" on a day with nothing asks which meal, then plans the pick', async ({ page, request }) => {
  await seedMeals(request, MEALS);
  const list = buildModuleInstance('meal-planner', { view: 'list', interactive: true, wallPlan: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [list])] }));
  const row = display.module('meal-planner').getByTestId('meal-list-plan').first();
  await expect(row).toBeVisible();
  // A full touch row, not a line of small type.
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await row.click();
  const book = page.getByTestId('meal-pick-sheet');
  await settle(page);
  await book.locator('[data-testid="meal-pick-slots"] [data-choice="lunch"]').click();
  await expect(book.getByTestId('recipe-book-title')).toContainText(/lunch/i);
  const put = changed(page);
  await book.getByTestId('recipe-book-tile').filter({ hasText: 'Chicken tacos' }).click();
  expect((await put).ok()).toBe(true);
  const { plan } = (await (await request.get('/api/meals/data')).json()) as { plan: Entry[] };
  expect(plan.filter((p) => p.slot === 'lunch' && p.mealId === 'meal-tacos')).toHaveLength(1);
});

test('taking a meal off from its own card keeps the card, the sheet and its Undo', async ({ page, request }) => {
  // The week on screen always holds today but, on its last day, not tomorrow, so the meal sits on today.
  await seedMeals(request, { ...MEALS, plan: [{ slot: 'dinner', mealId: 'meal-tacos', date: TODAY, time: '18:30' }] });
  const week = buildModuleInstance('fullscreen-meal-planner', { view: 'week', interactive: true, wallPlan: true, tapRecipeAction: 'card' });
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [week])] }));
  await page.getByRole('button', { name: 'Open recipe for Chicken tacos' }).click();
  // On a meal that is on the menu the button is the way to move it or take it off, and says so.
  const button = page.getByTestId('recipe-card').getByTestId('meal-put-on-menu');
  await expect(button).toHaveText('Change the menu');
  await button.click();
  const sheet = page.getByTestId('wall-menu');
  await expect(sheet.getByTestId('wall-menu-title')).toHaveText('Change the menu');
  await settle(page);
  await day(page, TODAY).click();
  await settle(page);
  const off = changed(page);
  await sheet.getByTestId('wall-menu-ask').locator('[data-choice="off"]').click();
  expect((await off).ok()).toBe(true);
  expect(await dinnerOn(request, TODAY)).toBeUndefined();
  // The row that was tapped is gone from the week, and everything opened from it is still here.
  await expect(sheet.getByTestId('wall-menu-status')).toContainText('Chicken tacos came off');
  await expect(sheet.getByTestId('wall-menu-title')).toHaveText('Change the menu');
  await expect(page.getByTestId('recipe-card')).toBeVisible();
  await settle(page);
  const undone = changed(page);
  await sheet.getByTestId('wall-menu-undo').click();
  expect((await undone).ok()).toBe(true);
  expect(await dinnerOn(request, TODAY)).toMatchObject({ mealId: 'meal-tacos', time: '18:30' });
});

test('the second tap of a double tap never plans, picks or answers anything', async ({ page, request }) => {
  const sheet = await openDaySheet(page, request, 'Chicken curry');
  const planned = async () => ((await (await request.get('/api/meals/data')).json()) as { plan: Entry[] }).plan.filter((p) => p.mealId === 'meal-curry').length;
  // On a free day: planned once, and the second tap does not open "take it off".
  await day(page, TODAY).dblclick();
  await expect(day(page, TODAY)).toHaveAttribute('data-state', 'mine');
  await page.waitForTimeout(400);
  await expect(sheet.getByTestId('wall-menu-ask')).toHaveCount(0);
  expect(await planned()).toBe(1);
  // On a taken day: the question opens, and the second tap does not answer it.
  await settle(page);
  await day(page, TOMORROW).dblclick();
  await expect(sheet.getByTestId('wall-menu-ask')).toBeVisible();
  await page.waitForTimeout(400);
  expect((await dinnerOn(request, TOMORROW))?.mealId).toBe('meal-tacos');
  // On the answer: swapped once, and the day that comes back under the finger is left alone.
  await settle(page);
  await sheet.getByTestId('wall-menu-ask').locator('[data-choice="swap"]').dblclick();
  await expect(sheet.getByTestId('wall-menu-status')).toContainText('Chicken curry now');
  await page.waitForTimeout(400);
  expect(await planned()).toBe(2);
});

test('a double tap on a recipe never undoes its own pick, wherever the line with Undo appears', async ({ page, request }) => {
  await seedMeals(request, MEALS);
  const week = buildModuleInstance('fullscreen-meal-planner', { view: 'week', interactive: true, wallPlan: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [week])] }));
  await display.module('fullscreen-meal-planner').getByRole('button', { name: /^Plan .* dinner$/ }).first().click();
  const book = page.getByTestId('meal-pick-sheet');
  await settle(page);
  const put = changed(page);
  await book.getByTestId('recipe-book-tile').filter({ hasText: 'Chicken curry' }).click();
  expect((await put).ok()).toBe(true);
  // The second tap, the moment Undo is drawn: the worst case is a recipe that sat right under it.
  await book.getByTestId('wall-menu-undo').click();
  await page.waitForTimeout(600);
  expect((await dinnerOn(request, TODAY))?.mealId).toBe('meal-curry');
  // A person who means it, a moment later, still can.
  await settle(page);
  const undone = changed(page);
  await book.getByTestId('wall-menu-undo').click();
  expect((await undone).ok()).toBe(true);
  expect(await dinnerOn(request, TODAY)).toBeUndefined();
});

test('a dessert planned on a free day stays a dessert: the main dish picked after it leads the meal', async ({ page, request }) => {
  await seedMeals(request, MEALS);
  const week = buildModuleInstance('fullscreen-meal-planner', { view: 'week', interactive: true, wallPlan: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [week])] }));
  await display.module('fullscreen-meal-planner').getByRole('button', { name: /^Plan .* dinner$/ }).first().click();
  const book = page.getByTestId('meal-pick-sheet');
  await settle(page);
  const tile = (name: string) => book.getByTestId('recipe-book-tile').filter({ hasText: name });
  const first = changed(page);
  await tile('Brownies').click();
  expect((await first).ok()).toBe(true);
  // The line floats over the foot of the book: the recipes stay where they were.
  const before = await tile('Chicken curry').boundingBox();
  await settle(page);
  expect(await tile('Chicken curry').boundingBox()).toEqual(before);
  const second = changed(page);
  await tile('Chicken curry').click();
  expect((await second).ok()).toBe(true);
  await expect(book.getByTestId('meal-pick-ask')).toHaveCount(0);
  expect(await dinnerOn(request, TODAY)).toMatchObject({ mealId: 'meal-curry', courses: [{ kind: 'dessert', mealId: 'meal-brownies' }] });
});

test('with "Plan meals on the wall" off there is no button and no plus', async ({ page, request }) => {
  await seedMeals(request, MEALS);
  const book = buildModuleInstance('fullscreen-meal-planner', { view: 'recipes', interactive: true, wallPlan: false, tapRecipeAction: 'card' });
  const week = buildModuleInstance('meal-planner', { view: 'week', interactive: true, wallPlan: false });
  await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [week]), makeScreen('s2', 'S2', [book])] }), '/display?screen=s2&preview=1');
  await page.getByTestId('recipe-book-tile').filter({ hasText: 'Chicken curry' }).click();
  await expect(page.getByTestId('recipe-card')).toBeVisible();
  await expect(page.getByTestId('meal-put-on-menu')).toHaveCount(0);
  await page.goto('/display?screen=s1&preview=1');
  await expect(page.locator('[data-module-type="meal-planner"]')).toBeVisible();
  await expect(page.getByTestId('meal-week-plan')).toHaveCount(0);
});
