'use client';

import { useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { HubUnreachableError, refusalText } from '@/lib/hub-request';
import { todoListsUrl } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import { useWriteSession } from '@/hooks/useWriteSession';
import { sameId, tempId, type ResolveId } from '@/lib/write-session';
import type { TodoList, TodoListItem } from '@/types/todos';
import type { TodoListAction } from '@/lib/todo-data';
import {
  addItemRequest,
  createListRequest,
  deleteItemRequest,
  deleteListRequest,
  listActionRequest,
  reorderItemsRequest,
  sendTodoWrite,
  updateItemRequest,
  updateListRequest,
  type TodoItemPatch,
  type TodoListPatch,
  type TodoWriteRequest,
} from '@/lib/todo-client';

export type { TodoListAction };
import { showToast } from '../remote-toast';

const LISTS_POLL_MS = 5_000;

export type ListPatch = TodoListPatch;
export type ItemPatch = TodoItemPatch;

interface Options {
  /** The list the tab is showing. Held by the caller so it survives a tab switch. */
  selectedListId: string | null;
  onSelectList: (id: string | null) => void;
}

function patchList(lists: TodoList[], listId: string, resolveId: ResolveId, fn: (list: TodoList) => TodoList): TodoList[] {
  return lists.map((l) => (sameId(l.id, listId, resolveId) ? fn(l) : l));
}

function patchItem(
  lists: TodoList[],
  listId: string,
  itemId: string,
  resolveId: ResolveId,
  fn: (item: TodoListItem) => TodoListItem,
): TodoList[] {
  return patchList(lists, listId, resolveId, (l) => ({
    ...l,
    items: l.items.map((it) => (sameId(it.id, itemId, resolveId) ? fn(it) : it)),
  }));
}

async function loadLists(): Promise<TodoList[] | null> {
  const res = await editorFetch(todoListsUrl());
  if (!res.ok) return null;
  const json = (await res.json()) as { lists?: TodoList[] };
  return Array.isArray(json.lists) ? json.lists : [];
}

/**
 * Data + actions behind the /remote Lists tab: every list, polled while the
 * tab is in view, with each write's local change shown at once and replayed
 * over newer answers until its request lands (`useWriteSession`). A failed
 * write drops its change and shows the hub's refusal in the family's
 * language (`refusals.lists` in the `core` dictionary, shared with the
 * editor's list window).
 */
export function useTodoLists({ selectedListId, onSelectList }: Options) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');

  const { data: lists, loaded, loadError, retry, write, mapId, resolveId } = useWriteSession<TodoList[], TodoWriteRequest, { id: string }>({
    initial: [],
    load: loadLists,
    send: async (request) => {
      const { lists, created } = await sendTodoWrite(editorFetch, request, t('lists.errors.generic'));
      return { data: lists, created };
    },
    pollMs: LISTS_POLL_MS,
    onRefused: (e) => showToast(
      e instanceof HubUnreachableError ? t('hubRequest.saveFailed') : refusalText(e, tCore, 'refusals.lists.failed'),
      'error',
    ),
  });

  // ── Items ──

  const toggleItem = useCallback(
    (listId: string, itemId: string) => {
      const list = lists.find((l) => sameId(l.id, listId, resolveId));
      const item = list?.items.find((it) => sameId(it.id, itemId, resolveId));
      if (!item) return;
      const completed = !item.completed;
      void write(
        (ls, r) => patchItem(ls, listId, itemId, r, (it) => ({
          ...it,
          completed,
          completedAt: completed ? new Date().toISOString() : undefined,
        })),
        (r) => updateItemRequest(r(listId), r(itemId), { completed }),
      );
    },
    [lists, resolveId, write],
  );

  /** Resolves to whether the item was saved, so the add bar can hand back text that was not. */
  const addItem = useCallback(
    (listId: string, text: string): Promise<boolean> => {
      const clean = text.trim();
      if (!clean) return Promise.resolve(true);
      const temp = tempId();
      const item: TodoListItem = { id: temp, text: clean, completed: false, createdAt: new Date().toISOString() };
      return write(
        (ls, r) => patchList(ls, listId, r, (l) => ({ ...l, items: [...l.items, item] })),
        (r) => addItemRequest(r(listId), clean),
        (created) => {
          // The route names the item it made, so the optimistic row's temp
          // id can be pointed at the real one before anything taps it.
          if (created) mapId(temp, created.id);
        },
      ).then((saved) => saved !== null);
    },
    [write, mapId],
  );

  const updateItem = useCallback(
    (listId: string, itemId: string, patch: ItemPatch) => {
      void write(
        (ls, r) => patchItem(ls, listId, itemId, r, (it) => ({
          ...it,
          ...(patch.text !== undefined ? { text: patch.text.trim() || it.text } : {}),
          ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
          ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate || undefined } : {}),
          ...(patch.assigneeIds !== undefined ? { assigneeIds: patch.assigneeIds.length > 0 ? patch.assigneeIds : undefined } : {}),
        })),
        (r) => updateItemRequest(r(listId), r(itemId), patch),
      );
    },
    [write],
  );

  const deleteItem = useCallback(
    (listId: string, itemId: string) => {
      void write(
        (ls, r) => patchList(ls, listId, r, (l) => ({ ...l, items: l.items.filter((it) => !sameId(it.id, itemId, r)) })),
        (r) => deleteItemRequest(r(listId), r(itemId)),
      );
    },
    [write],
  );

  /** `itemOrder` is the full new order of every item id on the list. */
  const reorderItems = useCallback(
    (listId: string, itemOrder: string[]) => {
      void write(
        (ls, r) => patchList(ls, listId, r, (l) => {
          const byId = new Map(l.items.map((it) => [it.id, it]));
          const items = itemOrder.flatMap((id) => {
            const it = byId.get(id) ?? byId.get(r(id));
            return it ? [it] : [];
          });
          return items.length === l.items.length ? { ...l, items } : l;
        }),
        (r) => reorderItemsRequest(r(listId), itemOrder.map(r)),
      );
    },
    [write],
  );

  // ── Lists ──

  const createList = useCallback(
    async (name: string, color?: string): Promise<boolean> => {
      const clean = name.trim();
      if (!clean) return false;
      const temp = tempId();
      const now = new Date().toISOString();
      const list: TodoList = {
        id: temp,
        name: clean,
        slug: clean.toLowerCase(),
        color,
        items: [],
        repeat: 'never',
        createdAt: now,
        updatedAt: now,
      };
      onSelectList(temp);
      const result = await write(
        (ls) => [...ls, list],
        () => createListRequest(clean, color),
        (created) => {
          // The route names the list it made. Diffing the lists instead
          // would pick up one another phone added in the same moment.
          if (created) {
            mapId(temp, created.id);
            onSelectList(created.id);
          }
        },
      );
      return result !== null;
    },
    [write, mapId, onSelectList],
  );

  const updateList = useCallback(
    (listId: string, patch: ListPatch): Promise<TodoList[] | null> =>
      write(
        (ls, r) => patchList(ls, listId, r, (l) => ({
          ...l,
          ...(patch.name !== undefined ? { name: patch.name.trim() || l.name } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.repeat !== undefined ? { repeat: patch.repeat } : {}),
          ...(patch.repeatDay !== undefined ? { repeatDay: patch.repeatDay } : {}),
        })),
        (r) => updateListRequest(r(listId), patch),
      ),
    [write],
  );

  const deleteList = useCallback(
    (listId: string): Promise<TodoList[] | null> =>
      write(
        (ls, r) => ls.filter((l) => !sameId(l.id, listId, r)),
        (r) => deleteListRequest(r(listId)),
      ),
    [write],
  );

  const listAction = useCallback(
    (listId: string, action: TodoListAction): Promise<TodoList[] | null> =>
      write(
        (ls, r) => patchList(ls, listId, r, (l) => ({
          ...l,
          items:
            action === 'uncheck-all'
              ? l.items.map((it) => (it.completed ? { ...it, completed: false, completedAt: undefined } : it))
              : l.items.filter((it) => !it.completed),
        })),
        (r) => listActionRequest(r(listId), action),
      ),
    [write],
  );

  // Selection is derived, never synced: a deleted list falls back to the
  // first one on the next render without an effect racing the poll.
  const selectedList = useMemo(
    () => lists.find((l) => selectedListId !== null && sameId(l.id, selectedListId, resolveId)) ?? lists[0] ?? null,
    [lists, selectedListId, resolveId],
  );

  return {
    lists,
    loaded,
    loadError,
    retry,
    selectedList,
    selectList: onSelectList,
    toggleItem,
    addItem,
    updateItem,
    deleteItem,
    reorderItems,
    createList,
    updateList,
    deleteList,
    listAction,
  };
}

export type TodoListsApi = ReturnType<typeof useTodoLists>;
