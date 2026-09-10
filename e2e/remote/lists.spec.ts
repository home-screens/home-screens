import { test, expect } from '../fixtures';
import type { APIRequestContext, Page } from '@playwright/test';
import { putConfig, seedTodos, E2E_TODO_LIST_ID } from '../helpers/api';
import { confirmSheet } from '../helpers/remote';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';

/**
 * /remote Lists tab: the shared to-do lists in data/todos.json, driven
 * through the real ListsTab UI. Store semantics (validation, repeat
 * schedules, the fold-in) are covered in src/lib/__tests__/todo-data.test.ts;
 * these specs prove each phone gesture reaches the store the wall reads.
 *
 * The tab is gated on a `todo` module existing on some screen, the way
 * Chores gates on a chore chart.
 */

interface ListShape {
  id: string;
  name: string;
  color?: string;
  repeat: string;
  items: Array<{ id: string; text: string; completed: boolean; dueDate?: string; assigneeIds?: string[] }>;
}

async function getLists(request: APIRequestContext): Promise<ListShape[]> {
  const res = await request.get('/api/todo/lists');
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { lists: ListShape[] }).lists;
}

async function seededList(request: APIRequestContext): Promise<ListShape> {
  const list = (await getLists(request)).find((l) => l.id === E2E_TODO_LIST_ID);
  expect(list).toBeTruthy();
  return list!;
}

async function openLists(page: Page) {
  await page.goto('/remote');
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
}

const item = (page: Page, text: string) => page.getByTestId('todo-item').filter({ hasText: text });

test.beforeEach(async ({ request, sandboxDir }) => {
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [buildModuleInstance('todo', { listId: E2E_TODO_LIST_ID })])],
  }));
  seedTodos(sandboxDir);
});

test('the tab shows the seeded list with its open and done items', async ({ page }) => {
  await openLists(page);
  await expect(page.getByTestId('todo-list-chip').filter({ hasText: 'E2E TODO' })).toBeVisible();
  await expect(page.getByTestId('todo-summary')).toContainText('1 of 2 done');
  await expect(item(page, 'ACTIVE ITEM').getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  // Done items fold into their own group.
  await expect(page.getByTestId('todo-done-group')).toContainText('Done (1)');
});

test('typing in the add bar adds an item and keeps focus for the next one', async ({ page, request }) => {
  await openLists(page);
  const input = page.getByTestId('todo-add-input');
  await input.fill('Oat milk');
  await input.press('Enter');
  await expect(item(page, 'Oat milk')).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');

  await input.fill('Bananas');
  await input.press('Enter');
  await expect.poll(async () => (await seededList(request)).items.map((i) => i.text))
    .toEqual(['ACTIVE ITEM', 'DONE ITEM', 'Oat milk', 'Bananas']);
});

test('tapping a row checks it off and persists', async ({ page, request }) => {
  await openLists(page);
  await item(page, 'ACTIVE ITEM').getByRole('checkbox').click();
  await expect.poll(async () => (await seededList(request)).items.find((i) => i.id === 'a')?.completed).toBe(true);
  await expect(page.getByTestId('todo-summary')).toContainText('2 of 2 done');
  await expect(page.getByTestId('todo-all-done')).toBeVisible();
});

test('the item sheet edits the text, sets a due day, and deletes', async ({ page, request }) => {
  await openLists(page);
  await page.getByRole('button', { name: 'Edit ACTIVE ITEM' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Item').fill('RENAMED ITEM');
  await sheet.getByRole('button', { name: 'Today', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(item(page, 'RENAMED ITEM')).toBeVisible();
  await expect(item(page, 'RENAMED ITEM').getByTestId('todo-due-chip')).toHaveText('Today');
  await expect.poll(async () => (await seededList(request)).items.find((i) => i.id === 'a'))
    .toMatchObject({ text: 'RENAMED ITEM', dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });

  await page.getByRole('button', { name: 'Edit RENAMED ITEM' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete item' }).click();
  await expect(item(page, 'RENAMED ITEM')).toHaveCount(0);
  await expect.poll(async () => (await seededList(request)).items.map((i) => i.id)).toEqual(['b']);
});

test('the Who row assigns a family member', async ({ page, request, sandboxDir }) => {
  seedTodos(sandboxDir, {
    members: [{ id: 'm1', name: 'Zed' }],
    lists: [{ id: E2E_TODO_LIST_ID, name: 'E2E TODO', items: [{ id: 'a', text: 'ACTIVE ITEM' }] }],
  });
  await openLists(page);
  await page.getByRole('button', { name: 'Edit ACTIVE ITEM' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Zed' }).click();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await seededList(request)).items[0].assigneeIds).toEqual(['m1']);
  await expect(item(page, 'ACTIVE ITEM').getByTestId('todo-assignees')).toHaveText('Z');
  await expect(item(page, 'ACTIVE ITEM').getByTestId('todo-assignees')).toHaveAttribute('title', 'Zed');

  // Tapping the chip again takes the person off, and the bubble goes.
  await page.getByRole('button', { name: 'Edit ACTIVE ITEM' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Zed' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await seededList(request)).items[0].assigneeIds).toBeUndefined();
  await expect(item(page, 'ACTIVE ITEM').getByTestId('todo-assignees')).toHaveCount(0);
});

test('an empty roster says so in the Who row and opens Family to add someone', async ({ page, request }) => {
  // The default seed writes no family.json, so the household has no one yet.
  await openLists(page);
  await page.getByRole('button', { name: 'Edit ACTIVE ITEM' }).click();
  const sheet = page.getByTestId('todo-item-sheet');
  await expect(sheet.getByTestId('todo-who-empty')).toContainText('No one here yet');
  await sheet.getByRole('button', { name: 'Add someone' }).click();

  const family = page.getByRole('dialog', { name: 'Family', exact: true });
  await expect(family).toBeVisible();
  await family.getByRole('button', { name: 'Add person' }).click();
  await family.getByLabel('Name', { exact: true }).fill('Casey');
  await family.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(family.getByRole('status')).toHaveText('Family saved.');
  await family.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(family).toHaveCount(0);

  // The sheet stayed underneath, and the new person is already a chip.
  await sheet.getByRole('button', { name: 'Casey' }).click();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  const casey = (await (await request.get('/api/family')).json()).members[0].id as string;
  await expect.poll(async () => (await seededList(request)).items[0].assigneeIds).toEqual([casey]);
  await expect(item(page, 'ACTIVE ITEM').getByTestId('todo-assignees')).toHaveText('C');
});

test('a new list is made from the chips row and becomes the selected one', async ({ page, request }) => {
  await openLists(page);
  await page.getByRole('button', { name: 'New list' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('List name').fill('Cabin trip');
  await sheet.getByRole('button', { name: 'Make list' }).click();

  await expect(page.getByTestId('todo-list-chip').filter({ hasText: 'Cabin trip' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('todo-add-input')).toHaveAttribute('placeholder', 'Add to Cabin trip');
  await expect.poll(async () => (await getLists(request)).map((l) => l.name)).toContain('Cabin trip');
});

test('the list sheet renames, sets a daily repeat, tidies up, and deletes', async ({ page, request }) => {
  await openLists(page);
  await page.getByRole('button', { name: 'List settings' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('List name').fill('Shopping');
  await sheet.getByRole('button', { name: 'Every day', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('todo-list-chip').filter({ hasText: 'Shopping' })).toBeVisible();
  await expect.poll(async () => (await seededList(request)))
    .toMatchObject({ name: 'Shopping', repeat: 'daily' });

  // Uncheck all keeps the sheet open (Share and Delete sit next to it); the
  // done item comes back to the open group.
  await page.getByRole('button', { name: 'List settings' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Uncheck all' }).click();
  await expect.poll(async () => (await seededList(request)).items.every((i) => !i.completed)).toBe(true);

  // Delete from the same sheet, through the confirm sheet.
  await page.getByRole('dialog').getByRole('button', { name: 'Delete list' }).click();
  await confirmSheet(page).getByRole('button', { name: 'Delete list' }).click();
  await expect.poll(async () => (await getLists(request)).map((l) => l.id)).not.toContain(E2E_TODO_LIST_ID);
  // With no lists left the tab offers to make the first one.
  await expect(page.getByTestId('todo-first-list')).toBeVisible();
});

test('dragging a row reorders the open items and persists the order', async ({ page, request, sandboxDir }) => {
  seedTodos(sandboxDir, { lists: [{ id: E2E_TODO_LIST_ID, name: 'E2E TODO', items: [
    { id: 'a', text: 'FIRST' }, { id: 'b', text: 'SECOND' }, { id: 'c', text: 'THIRD' },
  ] }] });
  await openLists(page);
  const handle = page.getByRole('button', { name: 'Move THIRD' });
  const target = page.getByRole('button', { name: 'Move FIRST' });
  await handle.hover();
  await page.mouse.down();
  // dnd-kit's pointer sensor needs movement past its activation distance
  // before it starts tracking, then a settle over the target.
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2, box.y + 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await seededList(request)).items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
});

test('without a todo module the tab explains what to add', async ({ page, request }) => {
  await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [])] }));
  await openLists(page);
  await expect(page.getByText('No to-do list yet')).toBeVisible();
});
