import { isIsoDate } from './iso-date';
import { isFullHexColor } from './hex-color';
import { RefusalError, requiredText, type RefusalParams } from './refusal';
import { oneLineText } from './text-length';
import { uuid } from './uuid';
import { TODO_LIMITS, type TodoData, type TodoList, type TodoListItem, type TodoRepeat } from '@/types/todos';

/**
 * What each action does to the shared to-do lists, as pure functions over
 * `TodoData`. The routes run them inside the store's write (`todo-api.ts`);
 * the phone's Lists tab and the editor's list window run the same ones as
 * the change they show before the hub answers, so a tick stamps the same
 * time, a weekly list gets the same day and a full list refuses the same way
 * on every surface. No server imports: `todo-data.ts` holds the file.
 */

/**
 * Why a list write was turned down. Each one has a sentence in the `core`
 * dictionary under `refusals.lists`, shown on the phone and in the editor.
 * `lists.badRequest` covers a body the app itself never sends; its English
 * `error` still says exactly what was wrong.
 */
export type TodoRefusalCode =
  | 'lists.nameRequired'
  | 'lists.nameTooLong'
  | 'lists.textRequired'
  | 'lists.textTooLong'
  | 'lists.badDate'
  | 'lists.badColor'
  | 'lists.listGone'
  | 'lists.itemGone'
  | 'lists.tooManyLists'
  | 'lists.tooManyItems'
  | 'lists.orderChanged'
  | 'lists.wallAddOff'
  | 'lists.badRequest';

/** Thrown by the pure operations below; the route wrapper answers with its code. */
export class TodoError extends RefusalError {
  constructor(status: number, code: TodoRefusalCode, message: string, params?: RefusalParams) {
    super(status, code, message, params ? { params } : {});
    this.name = 'TodoError';
  }
}

export const REPEATS: ReadonlySet<TodoRepeat> = new Set(['never', 'daily', 'weekly']);

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'list';
}

export function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function cleanName(raw: unknown): string {
  const max = TODO_LIMITS.maxListNameLength;
  return requiredText(
    raw,
    max,
    () => new TodoError(400, 'lists.nameRequired', 'Give the list a name'),
    () => new TodoError(400, 'lists.nameTooLong', `List names can be up to ${max} characters`, { max }),
  );
}

function cleanText(raw: unknown): string {
  const max = TODO_LIMITS.maxItemTextLength;
  return requiredText(
    raw,
    max,
    () => new TodoError(400, 'lists.textRequired', 'Type something first'),
    () => new TodoError(400, 'lists.textTooLong', `Items can be up to ${max} characters`, { max }),
  );
}

function cleanDueDate(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !isIsoDate(raw)) {
    throw new TodoError(400, 'lists.badDate', 'That is not a day we recognise');
  }
  return raw;
}

/**
 * Family member ids for an item. Whether each id is someone in the family is
 * `todoWrite`'s check, made against the roster inside the write's transaction.
 */
function cleanAssignees(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) {
    throw new TodoError(400, 'lists.badRequest', 'People must be a list of ids');
  }
  const ids = Array.from(new Set(raw as string[])).slice(0, 32);
  return ids.length > 0 ? ids : undefined;
}

function cleanColor(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (!isFullHexColor(raw)) throw new TodoError(400, 'lists.badColor', 'Pick a colour from the list');
  return raw.toLowerCase();
}


function findList(data: TodoData, listId: string): TodoList {
  const list = data.lists.find((l) => l.id === listId);
  if (!list) throw new TodoError(404, 'lists.listGone', 'That list is gone');
  return list;
}

function replaceList(data: TodoData, next: TodoList): TodoData {
  return { ...data, lists: data.lists.map((l) => (l.id === next.id ? next : l)) };
}

export interface CreateListInput {
  name: unknown;
  color?: unknown;
  repeat?: unknown;
  repeatDay?: unknown;
}

export function createList(data: TodoData, input: CreateListInput, now = new Date()): { data: TodoData; list: TodoList } {
  if (data.lists.length >= TODO_LIMITS.maxLists) {
    throw new TodoError(400, 'lists.tooManyLists', `You can have up to ${TODO_LIMITS.maxLists} lists`, { max: TODO_LIMITS.maxLists });
  }
  const name = cleanName(input.name);
  const iso = now.toISOString();
  const list: TodoList = {
    id: uuid(),
    name,
    slug: uniqueSlug(name, new Set(data.lists.map((l) => l.slug))),
    color: cleanColor(input.color),
    items: [],
    repeat: 'never',
    createdAt: iso,
    updatedAt: iso,
  };
  const withRepeat = applyRepeatInput(list, input, now);
  return { data: { ...data, lists: [...data.lists, withRepeat] }, list: withRepeat };
}

function applyRepeatInput(
  list: TodoList,
  input: { repeat?: unknown; repeatDay?: unknown },
  now = new Date(),
): TodoList {
  let next = list;
  if (input.repeat !== undefined) {
    if (typeof input.repeat !== 'string' || !REPEATS.has(input.repeat as TodoRepeat)) {
      throw new TodoError(400, 'lists.badRequest', 'Repeat must be never, daily or weekly');
    }
    next = { ...next, repeat: input.repeat as TodoRepeat };
  }
  if (input.repeatDay !== undefined) {
    if (typeof input.repeatDay !== 'number' || !Number.isInteger(input.repeatDay) || input.repeatDay < 0 || input.repeatDay > 6) {
      throw new TodoError(400, 'lists.badRequest', 'Repeat day must be 0 (Sunday) to 6 (Saturday)');
    }
    next = { ...next, repeatDay: input.repeatDay };
  }
  if (next.repeat === 'weekly' && typeof next.repeatDay !== 'number') next = { ...next, repeatDay: 0 };
  // A changed schedule starts counting from now. Without this the next read
  // would measure from `createdAt` and uncheck a list the moment it gained
  // a repeat, or the moment its day moved.
  if (next.repeat !== list.repeat || next.repeatDay !== list.repeatDay) {
    next = { ...next, lastResetAt: now.toISOString() };
  }
  return next;
}

export type TodoListAction = 'uncheck-all' | 'clear-completed';

/**
 * Whether a list's tidy-up action asks before it runs, on the phone and in the
 * editor alike. Dropping the done items takes them off for good, so it asks;
 * unticking everything can be ticked back, so it does not.
 */
export function confirmsBefore(action: TodoListAction): boolean {
  return action === 'clear-completed';
}

export interface UpdateListInput {
  name?: unknown;
  color?: unknown;
  repeat?: unknown;
  repeatDay?: unknown;
  /** Full new order of item ids. Must be a permutation of the current items. */
  itemOrder?: unknown;
  action?: unknown;
}

export function updateList(data: TodoData, listId: string, input: UpdateListInput, now = new Date()): TodoData {
  let list = findList(data, listId);
  if (input.name !== undefined) list = { ...list, name: cleanName(input.name) };
  if (input.color !== undefined) list = { ...list, color: cleanColor(input.color) };
  list = applyRepeatInput(list, input, now);
  if (input.itemOrder !== undefined) {
    const order = input.itemOrder;
    if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) {
      throw new TodoError(400, 'lists.badRequest', 'itemOrder must be a list of item ids');
    }
    const byId = new Map(list.items.map((it) => [it.id, it]));
    if (order.length !== byId.size || new Set(order).size !== order.length || order.some((id) => !byId.has(id))) {
      throw new TodoError(409, 'lists.orderChanged', 'The list changed while you were moving things. Try again.');
    }
    list = { ...list, items: (order as string[]).map((id) => byId.get(id)!) };
  }
  if (input.action !== undefined) {
    const iso = now.toISOString();
    if (input.action === 'uncheck-all') {
      list = { ...list, items: list.items.map((it) => (it.completed ? { ...it, completed: false, completedAt: undefined } : it)) };
      if (list.repeat !== 'never') list = { ...list, lastResetAt: iso };
    } else if (input.action === 'clear-completed') {
      list = { ...list, items: list.items.filter((it) => !it.completed) };
    } else {
      throw new TodoError(400, 'lists.badRequest', 'Unknown action');
    }
  }
  const before = findList(data, listId);
  if (list === before) return data;
  return replaceList(data, { ...list, updatedAt: now.toISOString() });
}

export function deleteList(data: TodoData, listId: string): TodoData {
  findList(data, listId);
  return { ...data, lists: data.lists.filter((l) => l.id !== listId) };
}

export interface AddItemInput {
  text: unknown;
  dueDate?: unknown;
  assigneeIds?: unknown;
  /** Insert at the top instead of the end. */
  position?: unknown;
}

export function addItem(data: TodoData, listId: string, input: AddItemInput, now = new Date()): { data: TodoData; item: TodoListItem } {
  const list = findList(data, listId);
  if (list.items.length >= TODO_LIMITS.maxItemsPerList) {
    throw new TodoError(400, 'lists.tooManyItems', `A list can hold up to ${TODO_LIMITS.maxItemsPerList} items`, { max: TODO_LIMITS.maxItemsPerList });
  }
  const iso = now.toISOString();
  const item: TodoListItem = {
    id: uuid(),
    text: cleanText(input.text),
    completed: false,
    createdAt: iso,
    dueDate: cleanDueDate(input.dueDate),
    assigneeIds: cleanAssignees(input.assigneeIds),
  };
  const items = input.position === 'top' ? [item, ...list.items] : [...list.items, item];
  return { data: replaceList(data, { ...list, items, updatedAt: iso }), item };
}

/**
 * Two items the family would call the same thing: the same words, whatever
 * their capitals and spacing. "Milk" and "milk " are one thing; "Milk" and
 * "2% milk" are two.
 */
export function sameItemText(a: string, b: string): boolean {
  return oneLineText(a).toLocaleLowerCase() === oneLineText(b).toLocaleLowerCase();
}

/**
 * What an add did: made a new item, found it `already` there and not ticked
 * (nothing changed), or found it ticked off and put it back on the list.
 */
export type AddOutcome = 'added' | 'already' | 'putBack';

/**
 * Add, unless the list already has it. The same words on an item still to do
 * change nothing; on a ticked one they untick it (the most recently ticked,
 * if there are several), so typing "milk" again puts milk back on the list
 * rather than making a second one. `item` is the item the add landed on.
 */
export function addItemIfNew(
  data: TodoData,
  listId: string,
  input: AddItemInput,
  now = new Date(),
): { data: TodoData; item: TodoListItem; outcome: AddOutcome } {
  const list = findList(data, listId);
  const text = cleanText(input.text);
  const open = list.items.find((it) => !it.completed && sameItemText(it.text, text));
  if (open) return { data, item: open, outcome: 'already' };
  const ticked = list.items
    .filter((it) => it.completed && sameItemText(it.text, text))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
  if (ticked) {
    const next = updateItem(data, listId, ticked.id, { completed: false }, now);
    const item = findList(next, listId).items.find((it) => it.id === ticked.id) as TodoListItem;
    return { data: next, item, outcome: 'putBack' };
  }
  return { ...addItem(data, listId, input, now), outcome: 'added' };
}

export interface UpdateItemInput {
  text?: unknown;
  completed?: unknown;
  dueDate?: unknown;
  /** An empty array clears. */
  assigneeIds?: unknown;
}

export function updateItem(data: TodoData, listId: string, itemId: string, input: UpdateItemInput, now = new Date()): TodoData {
  const list = findList(data, listId);
  const idx = list.items.findIndex((it) => it.id === itemId);
  if (idx === -1) throw new TodoError(404, 'lists.itemGone', 'That item is gone');
  let item = list.items[idx];
  const iso = now.toISOString();
  if (input.text !== undefined) item = { ...item, text: cleanText(input.text) };
  if (input.completed !== undefined) {
    if (typeof input.completed !== 'boolean') throw new TodoError(400, 'lists.badRequest', 'completed must be true or false');
    if (input.completed !== item.completed) {
      item = { ...item, completed: input.completed, completedAt: input.completed ? iso : undefined };
    }
  }
  if (input.dueDate !== undefined) item = { ...item, dueDate: cleanDueDate(input.dueDate) };
  if (input.assigneeIds !== undefined) item = { ...item, assigneeIds: cleanAssignees(input.assigneeIds) };
  if (item === list.items[idx]) return data;
  const items = list.items.slice();
  items[idx] = item;
  return replaceList(data, { ...list, items, updatedAt: iso });
}

export function deleteItem(data: TodoData, listId: string, itemId: string, now = new Date()): TodoData {
  const list = findList(data, listId);
  if (!list.items.some((it) => it.id === itemId)) throw new TodoError(404, 'lists.itemGone', 'That item is gone');
  return replaceList(data, {
    ...list,
    items: list.items.filter((it) => it.id !== itemId),
    updatedAt: now.toISOString(),
  });
}
