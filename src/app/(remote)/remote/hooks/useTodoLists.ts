'use client';

import { useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { refusalText } from '@/lib/hub-request';
import { todoListsUrl } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import { useWriteSession } from '@/hooks/useWriteSession';
import { sameId, tempId } from '@/lib/write-session';
import type { TodoList } from '@/types/todos';
import {
  TodoError,
  addItem as addItemTo,
  createList as createListIn,
  deleteItem as deleteItemFrom,
  deleteList as deleteListFrom,
  updateItem as updateItemIn,
  updateList as updateListIn,
  type TodoListAction,
} from '@/lib/todo-actions';
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

/** The hub's own refusal, raised by the list rules on what the phone shows now. */
const tolerated = (e: unknown) => e instanceof TodoError;

async function loadLists(): Promise<TodoList[] | null> {
  const res = await editorFetch(todoListsUrl());
  if (!res.ok) return null;
  const json = (await res.json()) as { lists?: TodoList[] };
  return Array.isArray(json.lists) ? json.lists : [];
}

/**
 * Data + actions behind the /remote Lists tab: every list, polled while the
 * tab is in view, with each write's local change shown at once and replayed
 * over newer answers until its request lands (`useWriteSession`).
 *
 * Each local change is the store's own action from `lib/todo-actions.ts`, so
 * what the phone shows before the answer is what the store will hold after
 * it. A change the rules refuse on what the phone shows now (a full list, a
 * blank name) is not sent: its code goes straight to the toast. A failed
 * write drops its change and shows the hub's refusal the same way, in the
 * family's language (`refusals.lists` in the `core` dictionary, shared with
 * the editor's list window).
 */
export function useTodoLists({ selectedListId, onSelectList }: Options) {
  const tCore = useTranslate('core');

  const { data: lists, loaded, loadError, retry, write, mapId, resolveId } = useWriteSession<TodoList[], TodoWriteRequest, { id: string }>({
    initial: [],
    load: loadLists,
    send: async (request) => {
      const { lists, created } = await sendTodoWrite(editorFetch, request, tCore('refusals.failed'));
      return { data: lists, created };
    },
    pollMs: LISTS_POLL_MS,
    tolerates: tolerated,
    onRefused: (e) => showToast(
      refusalText(e, tCore, 'refusals.failed', 'refusals.hubUnreachable'),
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
      const at = new Date();
      void write(
        (ls, r) => updateItemIn({ lists: ls }, r(listId), r(itemId), { completed }, at).lists,
        (r) => updateItemRequest(r(listId), r(itemId), { completed }),
      );
    },
    [lists, resolveId, write],
  );

  /**
   * Resolves to whether the item was saved, so the add bar can hand back text
   * that was not. The optimistic row is the store's own `addItem` result
   * under a temp id, pointed at the hub's id when the answer names it.
   */
  const addItem = useCallback(
    (listId: string, text: string): Promise<boolean> => {
      const clean = text.trim();
      if (!clean) return Promise.resolve(true);
      const temp = tempId();
      const at = new Date();
      return write(
        (ls, r) => {
          const { data, item } = addItemTo({ lists: ls }, r(listId), { text: clean }, at);
          return data.lists.map((l) => (l.items.includes(item) ? { ...l, items: l.items.map((it) => (it === item ? { ...item, id: temp } : it)) } : l));
        },
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
      const at = new Date();
      void write(
        (ls, r) => updateItemIn({ lists: ls }, r(listId), r(itemId), patch, at).lists,
        (r) => updateItemRequest(r(listId), r(itemId), patch),
      );
    },
    [write],
  );

  const deleteItem = useCallback(
    (listId: string, itemId: string) => {
      const at = new Date();
      void write(
        (ls, r) => deleteItemFrom({ lists: ls }, r(listId), r(itemId), at).lists,
        (r) => deleteItemRequest(r(listId), r(itemId)),
      );
    },
    [write],
  );

  /** `itemOrder` is the full new order of every item id on the list. */
  const reorderItems = useCallback(
    (listId: string, itemOrder: string[]) => {
      const at = new Date();
      void write(
        (ls, r) => updateListIn({ lists: ls }, r(listId), { itemOrder: itemOrder.map(r) }, at).lists,
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
      const at = new Date();
      onSelectList(temp);
      const result = await write(
        (ls) => {
          const { data, list } = createListIn({ lists: ls }, { name: clean, color }, at);
          return data.lists.map((l) => (l === list ? { ...list, id: temp } : l));
        },
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
    (listId: string, patch: ListPatch): Promise<TodoList[] | null> => {
      const at = new Date();
      return write(
        (ls, r) => updateListIn({ lists: ls }, r(listId), patch, at).lists,
        (r) => updateListRequest(r(listId), patch),
      );
    },
    [write],
  );

  const deleteList = useCallback(
    (listId: string): Promise<TodoList[] | null> =>
      write(
        (ls, r) => deleteListFrom({ lists: ls }, r(listId)).lists,
        (r) => deleteListRequest(r(listId)),
      ),
    [write],
  );

  const listAction = useCallback(
    (listId: string, action: TodoListAction): Promise<TodoList[] | null> => {
      const at = new Date();
      return write(
        (ls, r) => updateListIn({ lists: ls }, r(listId), { action }, at).lists,
        (r) => listActionRequest(r(listId), action),
      );
    },
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
