// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import { addItem, addItemIfNew, deleteItem, updateItem, updateList, TodoError } from '@/lib/todo-actions';
import type { TodoData } from '@/types/todos';
import { UNDO_WINDOW_MS } from '@/lib/undo-window';
import { refusalBody } from '@/lib/refusal';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));

import TodoListModal from '../TodoListModal';

const NOW = '2026-10-26T15:00:00.000Z';

function seed(): TodoData {
  return {
    migratedFromConfig: true,
    lists: [{
      id: 'groceries', name: 'Groceries', slug: 'groceries', repeat: 'never', createdAt: NOW, updatedAt: NOW,
      items: [
        { id: 'milk', text: 'Milk', completed: false, createdAt: NOW },
        { id: 'eggs', text: 'Eggs', completed: false, createdAt: NOW },
      ],
    }],
  };
}

// A hub in miniature: the real list actions over an in-memory store, so the
// modal is checked against what the routes would actually answer.
let board: TodoData;
let refuseNext: Record<string, unknown> | null;
let writes: Array<{ method: string; url: string; body?: Record<string, unknown> }>;
/** When set, every write waits here until released, in order. */
let held: Array<() => void> | null;

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function answer(url: string, method: string, body: Record<string, unknown> | undefined): Response {
  if (refuseNext) {
    const refusal = refuseNext;
    refuseNext = null;
    return reply(409, refusal);
  }
  try {
    const rest = url.replace('/api/todo/lists', '').split('/').filter(Boolean);
    const [listId, items, itemId] = rest;
    if (items === 'items' && itemId) {
      if (method === 'DELETE') board = deleteItem(board, listId, itemId);
      else board = updateItem(board, listId, itemId, body as never);
    } else if (items === 'items') {
      // The route's rule: one of each, except Undo putting an item back.
      const made = body?.restore ? addItem(board, listId, body as never) : addItemIfNew(board, listId, body as never);
      board = made.data;
      return reply(200, { lists: board.lists, created: made.item });
    } else {
      board = updateList(board, listId, body as never);
    }
    return reply(200, { lists: board.lists });
  } catch (e) {
    return reply(e instanceof TodoError ? e.status : 500, e instanceof TodoError ? refusalBody(e) : { error: (e as Error).message });
  }
}

function fakeHub(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  if (method === 'GET') return Promise.resolve(reply(200, { lists: board.lists }));
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
  writes.push({ method, url, body });
  if (held) return new Promise((resolve) => { held!.push(() => resolve(answer(url, method, body))); });
  return Promise.resolve(answer(url, method, body));
}

function render() {
  return renderUI(<TodoListModal listId="groceries" onClose={() => {}} />, {
    wrapper: ({ children }) => <I18nProvider locale="en-US" blob={{ core, editor }}>{children}</I18nProvider>,
  });
}

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

function itemField(text: string): HTMLInputElement {
  const field = (screen.getAllByLabelText('Item') as HTMLInputElement[]).find((f) => f.value === text);
  if (!field) throw new Error(`no item field reading "${text}"`);
  return field;
}

beforeEach(() => {
  vi.useFakeTimers();
  board = seed();
  refuseNext = null;
  writes = [];
  held = null;
  state.request.mockReset();
  state.request.mockImplementation(fakeHub);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TodoListModal', () => {
  it('does not write the old wording back over a rename when the field blurs before the save is answered', async () => {
    held = [];
    render();
    await settle();

    const field = itemField('Milk');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'Oat milk' } });
    fireEvent.blur(field);
    // Blur sent the rename; the hub has not answered, so the row still
    // holds the server's old copy of the item. Give the debounce every
    // chance to misfire before the answer lands.
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();
    expect(itemField('Oat milk').value).toBe('Oat milk');
    while (held.length) { held.shift()?.(); await settle(); }
    await act(async () => { vi.advanceTimersByTime(1000); });
    await settle();

    expect(writes.map((w) => w.body)).toEqual([{ text: 'Oat milk' }]);
    expect(board.lists[0].items.find((i) => i.id === 'milk')?.text).toBe('Oat milk');
  });

  it('keeps a refusal on screen until a later write goes through', async () => {
    render();
    await settle();

    refuseNext = { error: 'HUB SENTENCE', code: 'lists.tooManyItems', params: { max: 500 } };
    fireEvent.click(screen.getByLabelText('Done: Milk'));
    await settle();
    // The refusal is shown in the dictionary's words, never the hub's, and
    // the board was fetched back from the hub without clearing it.
    expect(screen.getByRole('alert').textContent).toContain('A list can hold up to 500 items');
    expect(screen.getByRole('alert').textContent).not.toContain('HUB SENTENCE');
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('A list can hold up to 500 items');

    fireEvent.click(screen.getByLabelText('Done: Eggs'));
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(board.lists[0].items.find((i) => i.id === 'eggs')?.completed).toBe(true);
  });

  it('sends a tick and an untick in the order they were clicked, even when the hub is slow', async () => {
    // Both clicks land before the first answer; sent at once, a hub that
    // applied them out of order would leave the item ticked.
    held = [];
    render();
    await settle();

    fireEvent.click(screen.getByLabelText('Done: Milk'));
    await settle();
    fireEvent.click(screen.getByLabelText('Done: Milk'));
    await settle();
    // Only the first write has gone out; the second waits its turn.
    expect(writes.map((w) => w.body)).toEqual([{ completed: true }]);
    held.shift()?.();
    await settle();
    expect(writes.map((w) => w.body)).toEqual([{ completed: true }, { completed: false }]);
    held.shift()?.();
    await settle();
    expect(board.lists[0].items.find((i) => i.id === 'milk')?.completed).toBe(false);
    expect((screen.getByLabelText('Done: Milk') as HTMLInputElement).checked).toBe(false);
  });

  it('takes one item off at once, and Undo puts it back where it was', async () => {
    render();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Remove Milk/ }));
    await settle();
    expect(board.lists[0].items.map((i) => i.text)).toEqual(['Eggs']);
    const toast = screen.getByTestId('todo-list-toast');
    expect(toast.textContent).toContain('Took Milk off the list.');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await settle();
    // Made again (never merged), then moved back to the top.
    expect(writes.at(-2)).toMatchObject({ method: 'POST', body: { text: 'Milk', restore: true } });
    expect(board.lists[0].items.map((i) => i.text)).toEqual(['Milk', 'Eggs']);
  });

  it('keeps the Undo only as long as every Undo lasts', async () => {
    render();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Remove Milk/ }));
    await settle();
    act(() => { vi.advanceTimersByTime(UNDO_WINDOW_MS); });
    expect(screen.queryByTestId('todo-list-toast')).toBeNull();
  });

  it('says so when the words are already on the list, and sends nothing', async () => {
    render();
    await settle();
    const before = writes.length;
    fireEvent.change(screen.getByPlaceholderText(editor.todoListModal.addPlaceholder), { target: { value: 'milk ' } });
    fireEvent.click(screen.getByRole('button', { name: core.actions.add }));
    await settle();
    expect(writes.length).toBe(before);
    expect(screen.getByTestId('todo-list-toast').textContent).toContain('Already on the list: Milk');
    expect(board.lists[0].items).toHaveLength(2);
  });
});

