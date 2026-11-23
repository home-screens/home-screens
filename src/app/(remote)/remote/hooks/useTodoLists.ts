'use client';

import { useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { refusalText } from '@/lib/hub-request';
import { todoListsUrl } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import { useWriteSession } from '@/hooks/useWriteSession';
import { sameId, tempId, type ResolveId } from '@/lib/write-session';
import type { TodoList, TodoListItem } from '@/types/todos';
import {
  TodoError,
  addItem as addItemTo,
  addItemIfNew,
  createList as createListIn,
  deleteItem as deleteItemFrom,
  deleteList as deleteListFrom,
  sameItemText,
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
  const tRemote = useTranslate('remote');

  const { data: lists, loaded, loadError, retry, write, mapId, resolveId, session } = useWriteSession<TodoList[], TodoWriteRequest, { id: string }>({
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
   * that was not. A list keeps one of each thing, as on the wall
   * (`addItemIfNew`): the same words as an item still to do add nothing and
   * say so, and the same words as a ticked one put it back. The optimistic
   * row is the store's own result, a new item under a temp id, pointed at the
   * hub's id when the answer names it.
   */
  const addItem = useCallback(
    (listId: string, text: string): Promise<boolean> => {
      const clean = text.trim();
      if (!clean) return Promise.resolve(true);
      const items = lists.find((l) => sameId(l.id, listId, resolveId))?.items ?? [];
      const open = items.find((it) => !it.completed && sameItemText(it.text, clean));
      if (open) {
        showToast(tRemote('lists.alreadyOnList', { item: open.text }), 'info');
        return Promise.resolve(true);
      }
      const ticked = items.find((it) => it.completed && sameItemText(it.text, clean));
      const temp = tempId();
      const at = new Date();
      return write(
        (ls, r) => {
          const { data, item, outcome } = addItemIfNew({ lists: ls }, r(listId), { text: clean }, at);
          if (outcome !== 'added') return data.lists;
          return data.lists.map((l) => (l.items.includes(item) ? { ...l, items: l.items.map((it) => (it === item ? { ...item, id: temp } : it)) } : l));
        },
        (r) => addItemRequest(r(listId), clean, { ifNew: true }),
        (created) => {
          // The route names the item it made, so the optimistic row's temp
          // id can be pointed at the real one before anything taps it.
          if (created && !ticked) mapId(temp, created.id);
        },
      ).then((saved) => {
        if (saved !== null && ticked) showToast(tRemote('lists.putBack', { item: ticked.text }), 'info');
        return saved !== null;
      });
    },
    [lists, resolveId, write, mapId, tRemote],
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

  /**
   * Puts back an item that was just deleted, for the toast's Undo: the same
   * words, due day and people, at the place it was, and ticked if it was. The
   * hub makes it a new item; the add, the move back into place and the tick
   * are queued one after another, each naming it by the same stand-in id
   * until the hub's answer names it.
   *
   * The toast's Undo holds this from the render before the delete, so the
   * list it sees may still hold the item, and another phone may have changed
   * the list since. The move is worked out from the copy at hand when it
   * runs, never from that list.
   */
  const restoreItem = useCallback(
    (listId: string, item: TodoListItem, index: number) => {
      const list = lists.find((l) => sameId(l.id, listId, resolveId));
      if (!list) return;
      const temp = tempId();
      const at = new Date();
      const fields = { dueDate: item.dueDate, assigneeIds: item.assigneeIds };
      const others = list.items.filter((it) => !sameId(it.id, item.id, resolveId)).length;
      /** Every item id on the list in `ls`, with the put-back one moved to `index`. */
      const backInPlace = (ls: TodoList[], r: ResolveId): string[] => {
        const ids = ls.find((l) => sameId(l.id, listId, r))?.items.map((it) => it.id) ?? [];
        const restored = ids.find((id) => sameId(id, temp, r));
        if (restored === undefined) return ids;
        const rest = ids.filter((id) => id !== restored);
        return [...rest.slice(0, index), restored, ...rest.slice(index)];
      };
      void write(
        (ls, r) => {
          const { data, item: added } = addItemTo({ lists: ls }, r(listId), { text: item.text, ...fields }, at);
          return data.lists.map((l) => (l.items.includes(added) ? { ...l, items: l.items.map((it) => (it === added ? { ...added, id: temp } : it)) } : l));
        },
        (r) => addItemRequest(r(listId), item.text, fields),
        (created) => {
          if (created) mapId(temp, created.id);
        },
      );
      if (index < others) {
        void write(
          (ls, r) => updateListIn({ lists: ls }, r(listId), { itemOrder: backInPlace(ls, r) }, at).lists,
          // Sent once the add has landed, so the hub's copy names the new item.
          (r) => reorderItemsRequest(r(listId), backInPlace(session.current, r)),
        );
      }
      if (item.completed) {
        void write(
          (ls, r) => updateItemIn({ lists: ls }, r(listId), r(temp), { completed: true }, at).lists,
          (r) => updateItemRequest(r(listId), r(temp), { completed: true }),
        );
      }
    },
    [lists, resolveId, write, mapId, session],
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
    restoreItem,
    reorderItems,
    createList,
    updateList,
    deleteList,
    listAction,
  };
}
