'use client';

import { displayCache } from '@/lib/display-cache';
import { todoListsUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { TodoList, TodoRepeat } from '@/types/todos';
import type { TodoListAction } from '@/lib/todo-data';

/**
 * The client half of the shared to-do store.
 *
 * `todo-api.ts` is the server's single writer; this is its counterpart on the
 * other side of the wire. Four surfaces write to `/api/todo/lists*` (the wall,
 * the editor's list modal, the editor's config section and the phone's Lists
 * tab) and they used to build the URLs, methods and bodies themselves, so a
 * new field meant four edits and a missed one was silent.
 *
 * Everything about the shape of a write lives here. What each surface keeps is
 * its own optimistic overlay and its own reconciliation, which genuinely
 * differ: the phone replays pending mutations over server truth, the modal
 * drops out-of-order responses, the wall holds a per-item override.
 */

/** Poll interval for the shared lists, from the registry so prefetch, the
 *  display hook and the post-write cache prime all use one number. */
export const TODO_LISTS_TTL_MS = FETCH_KEY_REGISTRY['todo']?.ttlMs ?? 5_000;

/** The payload every list read and every list write answers with. */
export interface TodoListsPayload {
  lists: TodoList[];
}

export interface TodoListPatch {
  name?: string;
  color?: string;
  repeat?: TodoRepeat;
  repeatDay?: number;
  /**
   * IANA zone of the device making the change, sent whenever a repeat is set.
   * The hub's own clock is UTC on the shipped image, so without it a daily
   * list would start fresh in the early evening. See `TodoList.repeatTimezone`.
   */
  timezone?: string;
}

export interface TodoItemPatch {
  text?: string;
  completed?: boolean;
  /** Empty string clears the due date. */
  dueDate?: string;
  /** Family member ids; an empty array clears. */
  assigneeIds?: string[];
}

export interface TodoWriteRequest {
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
}

// ── Request builders ──────────────────────────────────────────────
//
// Pure, so a caller that queues writes can build the request when the write's
// turn comes (with ids resolved) rather than when it was queued.

const listUrl = (listId: string) => `${todoListsUrl()}/${encodeURIComponent(listId)}`;
const itemsUrl = (listId: string) => `${listUrl(listId)}/items`;
const itemUrl = (listId: string, itemId: string) =>
  `${itemsUrl(listId)}/${encodeURIComponent(itemId)}`;

export function createListRequest(name: string, color?: string): TodoWriteRequest {
  return { url: todoListsUrl(), method: 'POST', body: color ? { name, color } : { name } };
}

export function updateListRequest(listId: string, patch: TodoListPatch): TodoWriteRequest {
  return { url: listUrl(listId), method: 'PATCH', body: { ...patch } };
}

/** The two bulk actions: uncheck everything, or drop what is done. */
export function listActionRequest(listId: string, action: TodoListAction): TodoWriteRequest {
  return { url: listUrl(listId), method: 'PATCH', body: { action } };
}

/** `itemOrder` is the full new order of every item id on the list. */
export function reorderItemsRequest(listId: string, itemOrder: string[]): TodoWriteRequest {
  return { url: listUrl(listId), method: 'PATCH', body: { itemOrder } };
}

export function deleteListRequest(listId: string): TodoWriteRequest {
  return { url: listUrl(listId), method: 'DELETE' };
}

export function addItemRequest(listId: string, text: string): TodoWriteRequest {
  return { url: itemsUrl(listId), method: 'POST', body: { text } };
}

export function updateItemRequest(listId: string, itemId: string, patch: TodoItemPatch): TodoWriteRequest {
  return { url: itemUrl(listId, itemId), method: 'PATCH', body: { ...patch } };
}

export function deleteItemRequest(listId: string, itemId: string): TodoWriteRequest {
  return { url: itemUrl(listId, itemId), method: 'DELETE' };
}

// ── Transport ─────────────────────────────────────────────────────

/**
 * `editorFetch` on the editor and phone (a 401 goes to the sign-in page),
 * `displayFetch` on the wall (the display token). The caller passes whichever
 * one its surface uses; nothing else about a write differs between them.
 */
export type TodoFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface TodoWriteResult extends TodoListsPayload {
  /** Set by the create routes, naming what they made. */
  created?: { id: string };
}

/**
 * Hand the lists a write just answered with to everything showing them.
 *
 * Every write returns every list, so there is nothing to go and re-ask for.
 * The four surfaces used to disagree about this: the wall seeded the cache
 * (sibling cards waited for their own poll to notice), the editor invalidated
 * it (an immediate re-fetch that asks for what the response already carried).
 * `replace` is both halves and neither cost, and it is the one behaviour all
 * four now share.
 */
export function primeTodoCache(lists: TodoList[]): void {
  displayCache.replace(todoListsUrl(), { lists } satisfies TodoListsPayload, TODO_LISTS_TTL_MS);
}

/**
 * Send one write and hand back the lists it answers with.
 *
 * A 4xx carries `{ error }` in plain language from the store's validation and
 * becomes that message; anything else becomes `fallbackMessage`. Transport
 * failures propagate untouched so callers can still recognise an expired
 * session. Rejects rather than returning a flag, so an optimistic caller can
 * leave its local change alone until it knows the write was refused.
 */
export async function sendTodoWrite(
  fetcher: TodoFetch,
  req: TodoWriteRequest,
  fallbackMessage: string,
): Promise<TodoWriteResult> {
  const res = await fetcher(req.url, {
    method: req.method,
    headers: req.body ? { 'Content-Type': 'application/json' } : undefined,
    body: req.body ? JSON.stringify(req.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as
    | (Partial<TodoWriteResult> & { error?: string })
    | null;
  if (!res.ok || !Array.isArray(json?.lists)) {
    throw new Error(typeof json?.error === 'string' && json.error ? json.error : fallbackMessage);
  }
  primeTodoCache(json.lists);
  const created = json.created && typeof json.created.id === 'string' ? json.created : undefined;
  return { lists: json.lists, created };
}
