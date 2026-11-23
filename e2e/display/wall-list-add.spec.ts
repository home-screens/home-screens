import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { renderOnDisplay } from '../helpers/display';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { mealData, seedMeals, seedTodos, E2E_TODO_LIST_ID } from '../helpers/api';

/**
 * Adding to a list from the wall: the Add row under a to-do card or a grocery
 * card opens a sheet with the wall's own keyboard. These drive the whole loop
 * on a real display: type, Add, see it land on the card and in the store,
 * Undo. The rules the hub holds a wall's token to are unit-tested beside the
 * routes (`items/__tests__/route.test.ts`); the E2E hub runs with no password,
 * so here every caller is let in.
 */

/** The seeded list's items, read back through the route every surface reads. */
async function items(request: APIRequestContext): Promise<Array<{ id: string; text: string; completed: boolean }>> {
  const res = await request.get('/api/todo/lists');
  const { lists } = (await res.json()) as { lists: Array<{ id: string; items: Array<{ id: string; text: string; completed: boolean }> }> };
  return lists.find((l) => l.id === E2E_TODO_LIST_ID)?.items ?? [];
}

/** Type on the sheet's keyboard as a person would: Shift lights up by itself for the first letter. */
async function typeOnWall(page: Page, words: string): Promise<void> {
  const keyboard = page.getByTestId('wall-keyboard');
  for (const ch of words) {
    await keyboard.locator(`[data-key="${ch === ' ' ? 'space' : ch}"]`).click();
  }
}

const added = (page: Page) => page.waitForResponse(
  (r) => r.url().endsWith(`/api/todo/lists/${E2E_TODO_LIST_ID}/items`) && r.request().method() === 'POST' && r.ok(),
);

async function openSheet(row: Locator, page: Page): Promise<Locator> {
  await row.click();
  const sheet = page.getByTestId('wall-add-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

// The list picked for other things to buy is a shared meal setting that
// outlives the test. Put it back so a later grocery card on this worker
// shows only its own meals, and the no-list case below starts with none.
test.afterEach(async ({ request }) => {
  const current = (await (await request.get('/api/meals/data')).json()) as { settings: Record<string, unknown> };
  if (current.settings.groceryExtrasListId === undefined) return;
  const settings = { ...current.settings };
  delete settings.groceryExtrasListId;
  expect((await request.put('/api/meals/data', { data: { settings } })).ok()).toBe(true);
});

test('to-do card: type on the wall, Add, see it land, and Undo takes it off', async ({ page, request, sandboxDir }) => {
  seedTodos(sandboxDir);
  const todo = buildModuleInstance('todo', { listId: E2E_TODO_LIST_ID, interactive: true, wallAdd: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [todo])] }));

  const sheet = await openSheet(display.module('todo').getByTestId(`todo-add-${E2E_TODO_LIST_ID}`), page);
  // Nothing typed: the action key does nothing yet.
  await expect(sheet.locator('[data-key="action"]')).toHaveAttribute('aria-disabled', 'true');
  await typeOnWall(page, 'Paper towels');
  await expect(sheet.getByTestId('wall-text-field-words')).toHaveText('Paper towels');

  const posted = added(page);
  await sheet.locator('[data-key="action"]').click();
  await posted;
  await expect(sheet.getByTestId('wall-add-chip')).toContainText('Paper towels');
  // The box is empty for the next one, and the card behind shows the new row.
  await expect(sheet.getByTestId('wall-text-field-words')).not.toContainText('Paper towels');
  await expect(display.module('todo')).toContainText('Paper towels');
  await expect.poll(async () => (await items(request)).map((it) => it.text)).toContain('Paper towels');

  await sheet.getByTestId('wall-add-undo').click();
  await expect(sheet.getByTestId('wall-add-chip')).toHaveCount(0);
  await expect.poll(async () => (await items(request)).map((it) => it.text)).not.toContain('Paper towels');

  await sheet.getByTestId('wall-add-sheet-close').click();
  await expect(page.getByTestId('wall-add-sheet')).toHaveCount(0);
});

test('to-do card: something already on the list is not added twice; a ticked one comes back', async ({ page, request, sandboxDir }) => {
  seedTodos(sandboxDir);
  const todo = buildModuleInstance('todo', { listId: E2E_TODO_LIST_ID, interactive: true, wallAdd: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [todo])] }));
  const sheet = await openSheet(display.module('todo').getByTestId(`todo-add-${E2E_TODO_LIST_ID}`), page);

  // Shift lights up for the first letter; tap it off to type the item as small letters.
  await sheet.locator('[data-key="shift"]').click();
  await typeOnWall(page, 'active item');
  let posted = added(page);
  await sheet.locator('[data-key="action"]').click();
  await posted;
  await expect(sheet.getByTestId('wall-add-chip').first()).toHaveAttribute('data-outcome', 'already');

  await sheet.locator('[data-key="shift"]').click();
  await typeOnWall(page, 'done item');
  posted = added(page);
  await sheet.locator('[data-key="action"]').click();
  await posted;
  await expect(sheet.getByTestId('wall-add-chip').first()).toHaveAttribute('data-outcome', 'putBack');

  const now = await items(request);
  expect(now).toHaveLength(2);
  expect(now.find((it) => it.id === 'b')?.completed).toBe(false);
});

test('grocery card: adds to the list picked for other things to buy, shown as Also on', async ({ page, request, sandboxDir }) => {
  seedTodos(sandboxDir);
  await seedMeals(request, mealData());
  // The pick is a shared meal setting, saved the way Settings > Meals saves it.
  const current = (await (await request.get('/api/meals/data')).json()) as { settings: Record<string, unknown> };
  expect((await request.put('/api/meals/data', { data: { settings: { ...current.settings, groceryExtrasListId: E2E_TODO_LIST_ID } } })).ok()).toBe(true);

  const grocery = buildModuleInstance('meal-planner', { view: 'grocery', interactive: true, wallAdd: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [grocery])] }));
  const card = display.module('meal-planner');
  await expect(card).toContainText('Also on E2E TODO');
  await expect(card).toContainText('ACTIVE ITEM');

  const sheet = await openSheet(card.getByTestId('meal-grocery-add'), page);
  await expect(sheet).toContainText('E2E TODO');
  await typeOnWall(page, 'Dog food');
  const posted = added(page);
  await sheet.locator('[data-key="action"]').click();
  await posted;
  await expect(sheet.getByTestId('wall-add-chip')).toContainText('Dog food');
  await expect.poll(async () => (await items(request)).map((it) => it.text)).toContain('Dog food');
  await sheet.getByTestId('wall-add-sheet-close').click();

  // A tick on the grocery card ticks the to-do item behind it.
  await card.getByRole('checkbox', { name: /ACTIVE ITEM/ }).click();
  await expect.poll(async () => (await items(request)).find((it) => it.id === 'a')?.completed).toBe(true);
});

test('full-screen meal planner: the grocery view adds the same way, from a button by the name', async ({ page, request, sandboxDir }) => {
  seedTodos(sandboxDir);
  await seedMeals(request, mealData());
  const current = (await (await request.get('/api/meals/data')).json()) as { settings: Record<string, unknown> };
  expect((await request.put('/api/meals/data', { data: { settings: { ...current.settings, groceryExtrasListId: E2E_TODO_LIST_ID } } })).ok()).toBe(true);

  const fullscreen = buildModuleInstance('fullscreen-meal-planner', { view: 'grocery', interactive: true, wallAdd: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [fullscreen])] }));
  const card = display.module('fullscreen-meal-planner');
  await expect(card).toContainText('Also on E2E TODO');

  const sheet = await openSheet(card.getByTestId('fmp-grocery-add'), page);
  await typeOnWall(page, 'Dish soap');
  const posted = added(page);
  await sheet.locator('[data-key="action"]').click();
  await posted;
  await expect(sheet.getByTestId('wall-add-chip')).toContainText('Dish soap');
  await expect.poll(async () => (await items(request)).map((it) => it.text)).toContain('Dish soap');
});

test('grocery card: no Add row while no list is picked for other things to buy', async ({ page, request, sandboxDir }) => {
  seedTodos(sandboxDir);
  await seedMeals(request, mealData());
  const grocery = buildModuleInstance('meal-planner', { view: 'grocery', interactive: true, wallAdd: true });
  const display = await renderOnDisplay(page, request, baseConfig({ screens: [makeScreen('s1', 'S1', [grocery])] }));
  await expect(display.module('meal-planner')).toBeVisible();
  await expect(display.module('meal-planner').getByTestId('meal-grocery-add')).toHaveCount(0);
});
