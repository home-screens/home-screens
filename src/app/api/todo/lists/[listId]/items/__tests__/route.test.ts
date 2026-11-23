import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  hasEditorSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/config', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/config')>()),
  readConfig: vi.fn(),
}));
vi.mock('@/lib/meal-data', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/meal-data')>()),
  readMealData: vi.fn(),
}));

import { hasEditorSession, requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { readMealData, type MealData } from '@/lib/meal-data';
import { readTodoData, updateTodoData } from '@/lib/todo-data';
import { resetWallAdded, wallMayUndo } from '@/lib/wall-added';
import type { ScreenConfiguration } from '@/types/config';
import type { TodoList } from '@/types/todos';
const { POST } = await import('../route');

const NOW = '2026-11-20T12:00:00.000Z';
const list = (id: string, items: Array<{ id: string; text: string; completed?: boolean; completedAt?: string }>): TodoList => ({
  id, name: id, slug: id, repeat: 'never', createdAt: NOW, updatedAt: NOW,
  items: items.map((it) => ({ completed: false, createdAt: NOW, ...it })),
});

function configWith(...modules: Array<{ type: string; config: Record<string, unknown>; enabled?: boolean }>): ScreenConfiguration {
  return {
    version: 21,
    settings: {},
    screens: [{ id: 's', name: 'S', modules: modules.map((m, i) => ({ id: `m${i}`, position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, ...m })) }],
  } as unknown as ScreenConfiguration;
}
const shoppingCard = (extra: Record<string, unknown> = {}) => ({ type: 'todo', config: { view: 'list', listId: 'shop', interactive: true, wallAdd: true, ...extra } });

function add(listId: string, body: unknown): Promise<Response> {
  return POST(
    new NextRequest(`http://localhost/api/todo/lists/${listId}/items`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    { params: Promise.resolve({ listId }) },
  );
}
const unauthorized = () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
const itemsOf = async (listId: string) => (await readTodoData()).lists.find((l) => l.id === listId)!.items;

beforeEach(async () => {
  vi.clearAllMocks();
  resetWallAdded();
  vi.mocked(hasEditorSession).mockResolvedValue(false);
  vi.mocked(readConfig).mockResolvedValue(configWith(shoppingCard()));
  vi.mocked(readMealData).mockResolvedValue({ settings: {} } as unknown as MealData);
  await updateTodoData(() => ({
    migratedFromConfig: true,
    lists: [
      list('shop', [{ id: 'milk', text: 'Milk' }, { id: 'eggs', text: 'Eggs', completed: true, completedAt: NOW }]),
      list('jobs', [{ id: 'leaves', text: 'Rake the leaves' }]),
    ],
  }));
});

describe('POST /api/todo/lists/[listId]/items from a wall', () => {
  it('adds the words to a list a card offers, and remembers it for Undo', async () => {
    const res = await add('shop', { text: 'Paper towels' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('added');
    expect(body.created.text).toBe('Paper towels');
    expect((await itemsOf('shop')).map((it) => it.text)).toEqual(['Milk', 'Eggs', 'Paper towels']);
    expect(wallMayUndo(body.created.id)).toBe(true);
  });

  it('never makes a second one: an item still to do is already there, a ticked one is put back', async () => {
    const already = await (await add('shop', { text: ' milk ' })).json();
    expect(already.outcome).toBe('already');
    expect(already.created.id).toBe('milk');
    const back = await (await add('shop', { text: 'EGGS' })).json();
    expect(back.outcome).toBe('putBack');
    expect(back.created).toMatchObject({ id: 'eggs', completed: false });
    expect(await itemsOf('shop')).toHaveLength(2);
    // Neither is the wall's to take off: they were there before.
    expect(wallMayUndo('milk')).toBe(false);
    expect(wallMayUndo('eggs')).toBe(false);
  });

  it('refuses a list no card offers an Add row for', async () => {
    const res = await add('jobs', { text: 'Clean the gutters' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('lists.wallAddOff');
    expect(await itemsOf('jobs')).toHaveLength(1);
  });

  it('takes a Board card as offering every list, and a switched-off card as offering none', async () => {
    vi.mocked(readConfig).mockResolvedValue(configWith({ type: 'todo', config: { view: 'board', interactive: true, wallAdd: true } }));
    expect((await add('jobs', { text: 'Clean the gutters' })).status).toBe(200);
    vi.mocked(readConfig).mockResolvedValue(configWith({ ...shoppingCard(), enabled: false }));
    expect((await add('shop', { text: 'Bread' })).status).toBe(403);
    vi.mocked(readConfig).mockResolvedValue(configWith(shoppingCard({ interactive: false })));
    expect((await add('shop', { text: 'Bread' })).status).toBe(403);
  });

  it('lets a grocery card add to the list picked for the other things to buy', async () => {
    vi.mocked(readConfig).mockResolvedValue(configWith({ type: 'meal-planner', config: { view: 'grocery', wallAdd: true } }));
    vi.mocked(readMealData).mockResolvedValue({ settings: { groceryExtrasListId: 'shop' } } as unknown as MealData);
    expect((await add('shop', { text: 'Dog food' })).status).toBe(200);
    expect((await add('jobs', { text: 'Dog food' })).status).toBe(403);
    vi.mocked(readMealData).mockResolvedValue({ settings: { groceryExtrasListId: 'shop', planSource: 'mealie' } } as unknown as MealData);
    expect((await add('shop', { text: 'Bread' })).status).toBe(403);
  });

  it('takes no more than a wall item may say', async () => {
    expect((await add('shop', { text: 'x'.repeat(81) })).status).toBe(400);
    expect((await add('shop', { text: 'x'.repeat(80) })).status).toBe(200);
  });

  it('takes nothing but words from the display token', async () => {
    vi.mocked(requireSession).mockRejectedValue(unauthorized());
    expect((await add('shop', { text: 'Bread', dueDate: '2026-11-21' })).status).toBe(401);
    expect((await add('shop', { text: 'Bread', assigneeIds: ['m-1'] })).status).toBe(401);
    // Undo's "make it again" is a session's: a wall always keeps one of each.
    expect((await add('shop', { text: 'milk', restore: true })).status).toBe(401);
    expect(await itemsOf('shop')).toHaveLength(2);
  });
});

describe('POST /api/todo/lists/[listId]/items with a session', () => {
  beforeEach(() => {
    vi.mocked(hasEditorSession).mockResolvedValue(true);
  });

  it('adds to any list', async () => {
    const res = await add('jobs', { text: 'Sweep the porch' });
    expect((await res.json()).outcome).toBe('added');
    expect(await itemsOf('jobs')).toHaveLength(2);
    expect(readConfig).not.toHaveBeenCalled();
  });

  it('keeps to one copy whoever adds, so no surface can forget it', async () => {
    const res = await add('shop', { text: 'milk' });
    expect((await res.json()).outcome).toBe('already');
    expect(await itemsOf('shop')).toHaveLength(2);
  });

  it('makes the item again for Undo, beside a copy that was added meanwhile', async () => {
    const res = await add('shop', { text: 'milk', restore: true });
    expect((await res.json()).outcome).toBe('added');
    expect(await itemsOf('shop')).toHaveLength(3);
  });

  it('remembers nothing for a wall', async () => {
    const res = await add('shop', { text: 'Bread' });
    expect(wallMayUndo((await res.json()).created.id)).toBe(false);
  });
});
