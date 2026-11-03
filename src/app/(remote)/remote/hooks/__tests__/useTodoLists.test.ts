// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { addItem, createList, deleteItem, deleteList, updateItem, updateList, TodoError } from '@/lib/todo-data';
import type { TodoData } from '@/types/todos';
import { refusalBody } from '@/lib/refusal';

// A dictionary in miniature: one refusal in German, everything else its key.
const translate = (key: string, vars?: Record<string, string | number>) =>
  key === 'refusals.lists.tooManyItems' ? `Eine Liste fasst bis zu ${vars?.max} Einträge` : key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));
const showToast = vi.fn();
vi.mock('../../remote-toast', () => ({ showToast: (...args: unknown[]) => showToast(...args) }));

import { useTodoLists } from '../useTodoLists';

const NOW = '2026-11-03T12:00:00.000Z';

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A hub in miniature: the real list actions over an in-memory store. */
let store: TodoData;
let refuseNext: Record<string, unknown> | null;
let writes: Array<{ method: string; url: string; body?: Record<string, unknown> }>;
let held: Array<() => void> | null;

function answer(url: string, method: string, body: Record<string, unknown> | undefined) {
  if (refuseNext) {
    const refusal = refuseNext;
    refuseNext = null;
    return reply(409, refusal);
  }
  try {
    const [listId, items, itemId] = url.replace('/api/todo/lists', '').split('/').filter(Boolean);
    if (!listId) {
      const made = createList(store, body as never);
      store = made.data;
      return reply(200, { lists: store.lists, created: { id: made.list.id } });
    }
    if (items === 'items' && itemId) {
      store = method === 'DELETE' ? deleteItem(store, listId, itemId) : updateItem(store, listId, itemId, body as never);
    } else if (items === 'items') {
      const made = addItem(store, listId, body as never);
      store = made.data;
      return reply(200, { lists: store.lists, created: { id: made.item.id } });
    } else if (method === 'DELETE') {
      store = deleteList(store, listId);
    } else {
      store = updateList(store, listId, body as never);
    }
    return reply(200, { lists: store.lists });
  } catch (e) {
    return reply(e instanceof TodoError ? e.status : 500, e instanceof TodoError ? refusalBody(e) : { error: (e as Error).message });
  }
}

function fakeHub(url: string, init?: RequestInit) {
  const method = init?.method ?? 'GET';
  if (method === 'GET') return Promise.resolve(reply(200, { lists: store.lists }));
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
  writes.push({ method, url, body });
  if (held) return new Promise((resolve) => { held!.push(() => resolve(answer(url, method, body))); });
  return Promise.resolve(answer(url, method, body));
}

async function mounted() {
  let selected: string | null = null;
  const onSelectList = vi.fn((id: string | null) => { selected = id; view.rerender(); });
  const view = renderHook(() => useTodoLists({ selectedListId: selected, onSelectList }));
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return { view, onSelectList };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(fakeHub));
  store = {
    migratedFromConfig: true,
    lists: [{
      id: 'groceries', name: 'Groceries', slug: 'groceries', repeat: 'never', createdAt: NOW, updatedAt: NOW,
      items: [{ id: 'milk', text: 'Milk', completed: false, createdAt: NOW }],
    }],
  };
  refuseNext = null;
  writes = [];
  held = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useTodoLists', () => {
  it('loads the lists and selects the first by default', async () => {
    const { view } = await mounted();
    expect(view.result.current.lists.map((l) => l.id)).toEqual(['groceries']);
    expect(view.result.current.selectedList?.id).toBe('groceries');
  });

  it('shows an added item at once and ticks it under the id the hub gave it', async () => {
    const { view } = await mounted();
    held = [];
    let added!: Promise<boolean>;
    act(() => { added = view.result.current.addItem('groceries', '  Eggs '); });
    const temp = view.result.current.lists[0].items.find((i) => i.text === 'Eggs');
    expect(temp?.id.startsWith('tmp-')).toBe(true);
    // The add goes out on its own; the hub holds it.
    await act(async () => {});

    act(() => { view.result.current.toggleItem('groceries', temp!.id); });
    expect(view.result.current.lists[0].items.find((i) => i.text === 'Eggs')?.completed).toBe(true);
    await act(async () => {});
    expect(writes).toEqual([{ method: 'POST', url: '/api/todo/lists/groceries/items', body: { text: 'Eggs' } }]);

    await act(async () => { held!.shift()?.(); });
    await act(async () => { expect(await added).toBe(true); });
    await waitFor(() => expect(writes).toHaveLength(2));
    const real = store.lists[0].items.find((i) => i.text === 'Eggs')!;
    expect(writes[1]).toEqual({ method: 'PATCH', url: `/api/todo/lists/groceries/items/${real.id}`, body: { completed: true } });
    await act(async () => { held!.shift()?.(); });
    await waitFor(() => expect(store.lists[0].items.find((i) => i.id === real.id)?.completed).toBe(true));
    expect(view.result.current.lists[0].items.map((i) => i.id)).toEqual(['milk', real.id]);
  });

  it('sends a tick and an untick in the order they were tapped, even when the hub is slow', async () => {
    const { view } = await mounted();
    held = [];
    act(() => { view.result.current.toggleItem('groceries', 'milk'); });
    act(() => { view.result.current.toggleItem('groceries', 'milk'); });
    expect(view.result.current.lists[0].items[0].completed).toBe(false);
    await act(async () => {});
    expect(writes.map((w) => w.body)).toEqual([{ completed: true }]);
    await act(async () => { held!.shift()?.(); });
    await waitFor(() => expect(writes.map((w) => w.body)).toEqual([{ completed: true }, { completed: false }]));
    // The first answer says ticked; the untick still on top keeps it unticked.
    expect(view.result.current.lists[0].items[0].completed).toBe(false);
    await act(async () => { held!.shift()?.(); });
    await waitFor(() => expect(store.lists[0].items[0].completed).toBe(false));
    expect(view.result.current.lists[0].items[0].completed).toBe(false);
  });

  it('selects a new list under its temp id and then under the hub\'s', async () => {
    const { view, onSelectList } = await mounted();
    let made!: Promise<boolean>;
    act(() => { made = view.result.current.createList('Chores'); });
    expect(onSelectList).toHaveBeenCalledWith(expect.stringMatching(/^tmp-/));
    expect(view.result.current.selectedList?.name).toBe('Chores');
    await act(async () => { expect(await made).toBe(true); });
    const real = store.lists.find((l) => l.name === 'Chores')!;
    expect(onSelectList).toHaveBeenLastCalledWith(real.id);
    expect(view.result.current.selectedList?.id).toBe(real.id);
    expect(writes).toEqual([{ method: 'POST', url: '/api/todo/lists', body: { name: 'Chores' } }]);
  });

  it('puts a change back, shows the refusal in the family\'s language and reads the lists again when a write is refused', async () => {
    const { view } = await mounted();
    refuseNext = { error: 'A list can hold up to 500 items', code: 'lists.tooManyItems', params: { max: 500 } };
    act(() => { view.result.current.deleteItem('groceries', 'milk'); });
    expect(view.result.current.lists[0].items).toEqual([]);
    // The hub's English never reaches the toast: the code does, phrased here.
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Eine Liste fasst bis zu 500 Einträge', 'error'));
    expect(showToast).not.toHaveBeenCalledWith('A list can hold up to 500 items', 'error');
    await waitFor(() => expect(view.result.current.lists[0].items.map((i) => i.id)).toEqual(['milk']));
    const reads = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => !(init as RequestInit | undefined)?.method);
    expect(reads).toHaveLength(2);
  });

  it('says so and offers a retry when the first load fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => Promise.resolve(reply(500, {})));
    const view = renderHook(() => useTodoLists({ selectedListId: null, onSelectList: () => {} }));
    await waitFor(() => expect(view.result.current.loadError).toBe(true));
    expect(view.result.current.loaded).toBe(false);
    act(() => { view.result.current.retry(); });
    await waitFor(() => expect(view.result.current.loaded).toBe(true));
    expect(view.result.current.loadError).toBe(false);
  });
});
