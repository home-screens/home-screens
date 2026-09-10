'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { todoListsUrl } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
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
const TEMP_PREFIX = 'tmp-';

export type ListPatch = TodoListPatch;
export type ItemPatch = TodoItemPatch;

interface Options {
  /** The list the tab is showing. Held by the caller so it survives a tab switch. */
  selectedListId: string | null;
  onSelectList: (id: string | null) => void;
}

type ResolveId = (id: string) => string;
/** A local change replayed over server truth until its request lands. */
type Mutation = (lists: TodoList[], resolveId: ResolveId) => TodoList[];

function tempId(): string {
  return `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sameId(candidate: string, wanted: string, resolveId: ResolveId): boolean {
  return candidate === wanted || candidate === resolveId(wanted);
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

/**
 * Data + actions behind the /remote Lists tab.
 *
 * Polls every list while the tab is mounted. Writes go out one at a time,
 * in the order they were asked for, so a run of items typed into the add
 * bar lands on the list in typing order. Each write's local change is kept
 * as a pending mutation and replayed over the newest server answer until
 * its own request lands, so a tap on an item whose add has not come back
 * yet is neither lost nor flashed away by the add's response. Temp ids are
 * mapped to the server's ids as the answers arrive, and every request
 * resolves its ids when it is sent, not when it was queued.
 *
 * Polls are held off for one period after a write and ignored while one is
 * in flight (the same guard `useTimersData` uses). A failed write drops its
 * mutation, shows the server's message and refetches.
 */
export function useTodoLists({ selectedListId, onSelectList }: Options) {
  const t = useTranslate('remote');
  const [lists, setLists] = useState<TodoList[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Set when a load fails before anything has loaded, so the tab can say so
  // and offer a retry instead of a blank page (the timers tab's pattern).
  const [loadError, setLoadError] = useState(false);

  const serverRef = useRef<TodoList[]>([]);
  const pendingRef = useRef<Array<{ apply: Mutation }>>([]);
  const idMapRef = useRef(new Map<string, string>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const holdUntilRef = useRef(0);
  const inFlightRef = useRef(0);

  const resolveId = useCallback<ResolveId>((id) => idMapRef.current.get(id) ?? id, []);

  const render = useCallback(() => {
    setLists(pendingRef.current.reduce((ls, p) => p.apply(ls, resolveId), serverRef.current));
  }, [resolveId]);

  const refresh = useCallback(async (force = false) => {
    try {
      const res = await editorFetch(todoListsUrl());
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const json = (await res.json()) as { lists?: TodoList[] };
      if (!force && (Date.now() < holdUntilRef.current || inFlightRef.current > 0)) return;
      serverRef.current = Array.isArray(json.lists) ? json.lists : [];
      render();
      setLoaded(true);
      setLoadError(false);
    } catch (e) {
      if (isSessionExpired(e)) return;
      setLoadError(true);
    }
  }, [render]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), LISTS_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);


  /**
   * Queue one write. `apply` shows the change at once; `request` is built
   * when the write's turn comes, with ids resolved; `onSuccess` sees the
   * server's lists and the server truth from before this write.
   */
  const write = useCallback(
    (
      apply: Mutation,
      request: (resolveId: ResolveId) => TodoWriteRequest,
      onSuccess?: (created?: { id: string }) => void,
    ): Promise<TodoList[] | null> => {
      const entry = { apply };
      pendingRef.current.push(entry);
      render();
      inFlightRef.current += 1;

      const run = async (): Promise<TodoList[] | null> => {
        try {
          const { lists, created } = await sendTodoWrite(
            editorFetch,
            request(resolveId),
            t('lists.errors.generic'),
          );
          holdUntilRef.current = Date.now() + LISTS_POLL_MS;
          serverRef.current = lists;
          pendingRef.current = pendingRef.current.filter((p) => p !== entry);
          onSuccess?.(created);
          render();
          return lists;
        } catch (e) {
          pendingRef.current = pendingRef.current.filter((p) => p !== entry);
          if (isSessionExpired(e)) return null;
          render();
          showToast(e instanceof Error ? e.message : t('lists.errors.generic'), 'error');
          void refresh(true);
          return null;
        } finally {
          inFlightRef.current -= 1;
        }
      };

      const result = queueRef.current.then(run, run);
      queueRef.current = result;
      return result;
    },
    [render, resolveId, refresh, t],
  );

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

  const addItem = useCallback(
    (listId: string, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const temp = tempId();
      const item: TodoListItem = { id: temp, text: clean, completed: false, createdAt: new Date().toISOString() };
      void write(
        (ls, r) => patchList(ls, listId, r, (l) => ({ ...l, items: [...l.items, item] })),
        (r) => addItemRequest(r(listId), clean),
        (created) => {
          // The route names the item it made, so the optimistic row's temp
          // id can be pointed at the real one before anything taps it.
          if (created) idMapRef.current.set(temp, created.id);
        },
      );
    },
    [write],
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
            idMapRef.current.set(temp, created.id);
            onSelectList(created.id);
          }
        },
      );
      return result !== null;
    },
    [write, onSelectList],
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
    retry: () => refresh(true),
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
