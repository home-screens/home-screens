// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import { addItem, deleteItem, updateItem, updateList, TodoError } from '@/lib/todo-data';
import type { TodoData } from '@/types/todos';

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
let refuseNext: string | null;
let writes: Array<{ method: string; url: string; body?: Record<string, unknown> }>;
/** When set, every write waits here until released, in order. */
let held: Array<() => void> | null;

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function answer(url: string, method: string, body: Record<string, unknown> | undefined): Response {
  if (refuseNext) {
    const error = refuseNext;
    refuseNext = null;
    return reply(409, { error });
  }
  try {
    const rest = url.replace('/api/todo/lists', '').split('/').filter(Boolean);
    const [listId, items, itemId] = rest;
    if (items === 'items' && itemId) {
      if (method === 'DELETE') board = deleteItem(board, listId, itemId);
      else board = updateItem(board, listId, itemId, body as never);
    } else if (items === 'items') {
      board = addItem(board, listId, body as never).data;
    } else {
      board = updateList(board, listId, body as never);
    }
    return reply(200, { lists: board.lists });
  } catch (e) {
    return reply(e instanceof TodoError ? e.status : 500, { error: (e as Error).message });
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

    refuseNext = 'The list is full.';
    fireEvent.click(screen.getByLabelText('Done: Milk'));
    await settle();
    // The refusal is shown, and the board was fetched back from the hub
    // without clearing it.
    expect(screen.getByRole('alert').textContent).toContain('The list is full.');
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('The list is full.');

    fireEvent.click(screen.getByLabelText('Done: Eggs'));
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(board.lists[0].items.find((i) => i.id === 'eggs')?.completed).toBe(true);
  });
});
