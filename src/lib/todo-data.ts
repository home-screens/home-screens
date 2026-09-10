import { promises as fs } from 'fs';
import path from 'path';
import { createJsonStore } from './json-store';
import { withDataTransaction } from './data-transaction';
import { readConfig, updateConfigAtomic } from './config';
import { readConfigCached } from './config-cache';
import { toTZWallTime } from './timezone';
import { isValidISODate } from './api-utils';
import { mapConfigModules } from './migrations/module-walk';
import { uuid } from './uuid';
import { logger } from './logger';
import {
  TODO_LIMITS,
  type TodoData,
  type TodoList,
  type TodoListItem,
  type TodoRepeat,
} from '@/types/todos';
import type { ScreenConfiguration } from '@/types/config';

const log = logger('todo-data');

/**
 * Shared to-do lists: `data/todos.json`.
 *
 * Lists are family data the way chores and meals are. The phone remote, the
 * wall and the editor all read and write this one store, a To-Do module only
 * points at a list by id, and a check-off from any surface never touches
 * `config.json` (which the editor loads whole and PUTs back whole, so any
 * other writer to it races an open editor).
 *
 * Before lists were shared, items lived inline on each module instance and
 * wall taps were kept in a side store (`todo-state.json`) purely to stay out
 * of `config.json`. The first read after upgrade folds both into this store
 * (`runFold`), then strips the inline items off the modules.
 */

const EMPTY: TodoData = { lists: [] };

const store = createJsonStore<TodoData>({
  path: 'data/todos.json',
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

/** Whole-file write, for a backup restore. Everything else goes through `updateTodoData`. */
export const writeTodoData = store.write;

/** Thrown by the pure operations below; routes map it to a JSON error response. */
export class TodoError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'TodoError';
  }
}

// ── Reads and writes ──

/**
 * Read every list, folding in pre-v2 inline items on first use and firing
 * any due repeat schedule. Both are persisted, so they happen once rather
 * than on every poll.
 */
async function readTodoDataUnlocked(): Promise<TodoData> {
  const current = await store.read();
  if (current.migratedFromConfig) {
    foldDone = true;
    if (!anyRepeatDue(current.lists, new Date(), await householdTimezone())) return current;
  }
  return updateTodoData((data) => data);
}

/**
 * The household's timezone from Settings, the fallback for a list whose
 * repeat carries no zone of its own. Read through the 1.5s config cache:
 * every display polls this store every 5s and parsing the whole config for
 * one field on each read is not worth it. Unset or unreadable means the
 * hub's own clock.
 */
async function householdTimezone(): Promise<string | undefined> {
  try {
    return (await readConfigCached()).settings?.timezone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * True once the one-time fold has been seen to be done, so the common path
 * (every poll, every write) does not re-read the store just to check a flag
 * that never goes back to false within a process.
 */
let foldDone = false;

/**
 * Atomic read-modify-write. The fold-in and due repeats are applied to the
 * mutator's input, so every writer sees current data. Returning the input
 * unchanged skips the disk write unless a fold-in or repeat ran.
 */
async function updateTodoDataUnlocked(
  mutator: (current: TodoData) => TodoData | Promise<TodoData>,
): Promise<TodoData> {
  // The upgrade fold-in runs on its own, ahead of the queue: it has to write
  // this store, then config.json, then this store again, so it cannot live
  // inside one atomic pass of either file.
  if (!foldDone) {
    if ((await store.read()).migratedFromConfig) foldDone = true;
    else await foldLegacyItemsOnce();
  }
  return store.updateAtomic(async (current) => {
    let data = current;
    let forced = false;
    const reset = applyDueRepeats(data, new Date(), await householdTimezone());
    if (reset !== data) { data = reset; forced = true; }
    const result = await mutator(data);
    if (result === data && !forced) return current;
    return result;
  });
}

// ── Restore validation ──

const IANA_ZONE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

const REPEATS: ReadonlySet<TodoRepeat> = new Set(['never', 'daily', 'weekly']);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Whether `raw` is a `TodoData` the store can serve. A backup restore writes
 * the file whole, so a malformed bundle would otherwise land on disk and
 * crash every read after it. Returns a plain-language reason, or null when
 * the shape is sound.
 */
export function validateTodoData(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'To-do lists must be an object with a lists array';
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.lists)) return 'To-do lists must be an object with a lists array';
  if (data.migratedFromConfig !== undefined && typeof data.migratedFromConfig !== 'boolean') {
    return 'To-do lists: migratedFromConfig must be true or false';
  }
  if (data.lists.length > TODO_LIMITS.maxLists) return `To-do lists: at most ${TODO_LIMITS.maxLists} lists`;
  const listIds = new Set<string>();
  for (const [i, entry] of (data.lists as unknown[]).entries()) {
    const where = `To-do list ${i + 1}`;
    if (!entry || typeof entry !== 'object') return `${where} must be an object`;
    const list = entry as Record<string, unknown>;
    if (typeof list.id !== 'string' || !list.id) return `${where} is missing its id`;
    if (listIds.has(list.id)) return `${where} repeats the id of another list`;
    listIds.add(list.id);
    if (typeof list.name !== 'string' || !list.name.trim()) return `${where} is missing its name`;
    if (typeof list.slug !== 'string' || !list.slug) return `${where} is missing its slug`;
    if (!REPEATS.has(list.repeat as TodoRepeat)) return `${where}: repeat must be never, daily or weekly`;
    if (list.repeatDay !== undefined && (typeof list.repeatDay !== 'number' || !Number.isInteger(list.repeatDay) || list.repeatDay < 0 || list.repeatDay > 6)) {
      return `${where}: repeatDay must be 0 (Sunday) to 6 (Saturday)`;
    }
    if (list.repeatTimezone !== undefined && (typeof list.repeatTimezone !== 'string' || !IANA_ZONE.test(list.repeatTimezone))) {
      return `${where}: repeatTimezone must be a time zone name`;
    }
    if (list.color !== undefined && (typeof list.color !== 'string' || !HEX_COLOR.test(list.color))) return `${where}: color must be a hex colour`;
    for (const key of ['createdAt', 'updatedAt'] as const) {
      if (typeof list[key] !== 'string') return `${where} is missing ${key}`;
    }
    if (list.lastResetAt !== undefined && typeof list.lastResetAt !== 'string') return `${where}: lastResetAt must be a timestamp`;
    if (!Array.isArray(list.items)) return `${where} must have an items array`;
    if (list.items.length > TODO_LIMITS.maxItemsPerList) return `${where}: at most ${TODO_LIMITS.maxItemsPerList} items`;
    const itemIds = new Set<string>();
    for (const [j, it] of (list.items as unknown[]).entries()) {
      const at = `${where}, item ${j + 1}`;
      if (!it || typeof it !== 'object') return `${at} must be an object`;
      const item = it as Record<string, unknown>;
      if (typeof item.id !== 'string' || !item.id) return `${at} is missing its id`;
      if (itemIds.has(item.id)) return `${at} repeats the id of another item`;
      itemIds.add(item.id);
      if (typeof item.text !== 'string') return `${at} is missing its text`;
      if (typeof item.completed !== 'boolean') return `${at}: completed must be true or false`;
      if (typeof item.createdAt !== 'string') return `${at} is missing createdAt`;
      if (item.completedAt !== undefined && typeof item.completedAt !== 'string') return `${at}: completedAt must be a timestamp`;
      if (item.dueDate !== undefined && (typeof item.dueDate !== 'string' || !isValidISODate(item.dueDate))) return `${at}: dueDate must be YYYY-MM-DD`;
      if (item.assigneeIds !== undefined && (!Array.isArray(item.assigneeIds) || item.assigneeIds.some((a) => typeof a !== 'string'))) {
        return `${at}: assigneeIds must be a list of ids`;
      }
    }
  }
  return null;
}

// ── Repeat schedules ──

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * The most recent moment this list's repeat should have fired, or null when
 * it never repeats. Daily lists reset at midnight; weekly lists at midnight
 * on `repeatDay`. With a `timezone` the result is a wall-clock Date in that
 * zone (the `toTZWallTime` convention), so compare it only against values
 * shifted the same way.
 */
export function lastRepeatBoundary(
  list: Pick<TodoList, 'repeat' | 'repeatDay' | 'repeatTimezone'>,
  now: Date,
  fallbackTimezone?: string,
): Date | null {
  if (list.repeat !== 'daily' && list.repeat !== 'weekly') return null;
  // The zone the person was standing in when they set the repeat wins over
  // the household default, which in turn wins over the hub's own clock.
  const timezone = list.repeatTimezone || fallbackTimezone;
  const boundary = startOfLocalDay(toTZWallTime(now, timezone));
  if (list.repeat === 'weekly') {
    const day = typeof list.repeatDay === 'number' ? ((list.repeatDay % 7) + 7) % 7 : 0;
    boundary.setDate(boundary.getDate() - ((boundary.getDay() - day + 7) % 7));
  }
  return boundary;
}

function repeatIsDue(list: TodoList, now: Date, fallbackTimezone?: string): boolean {
  const boundary = lastRepeatBoundary(list, now, fallbackTimezone);
  if (!boundary) return false;
  const zone = list.repeatTimezone || fallbackTimezone;
  const last = toTZWallTime(new Date(list.lastResetAt ?? list.createdAt), zone);
  return last < boundary;
}

function anyRepeatDue(lists: TodoList[], now: Date, timezone?: string): boolean {
  return lists.some((l) => repeatIsDue(l, now, timezone));
}

/** Uncheck every item on each list whose repeat boundary has passed since its last reset. */
export function applyDueRepeats(data: TodoData, now: Date, timezone?: string): TodoData {
  if (!anyRepeatDue(data.lists, now, timezone)) return data;
  const iso = now.toISOString();
  return {
    ...data,
    lists: data.lists.map((list) => {
      if (!repeatIsDue(list, now, timezone)) return list;
      return {
        ...list,
        items: list.items.map((it) => (it.completed ? { ...it, completed: false, completedAt: undefined } : it)),
        lastResetAt: iso,
        updatedAt: iso,
      };
    }),
  };
}

// ── Pure operations (used by the API routes) ──

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'list';
}

function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new TodoError(400, 'Give the list a name');
  const name = raw.trim();
  if (!name) throw new TodoError(400, 'Give the list a name');
  if (name.length > TODO_LIMITS.maxListNameLength) {
    throw new TodoError(400, `List names can be up to ${TODO_LIMITS.maxListNameLength} characters`);
  }
  return name;
}

function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') throw new TodoError(400, 'Type something first');
  const text = raw.trim();
  if (!text) throw new TodoError(400, 'Type something first');
  if (text.length > TODO_LIMITS.maxItemTextLength) {
    throw new TodoError(400, `Items can be up to ${TODO_LIMITS.maxItemTextLength} characters`);
  }
  return text;
}

function cleanDueDate(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !isValidISODate(raw)) {
    throw new TodoError(400, 'That is not a day we recognise');
  }
  return raw;
}

/**
 * Family member ids for an item. Unknown ids are kept: the roster is another
 * store, and a person removed later is stripped by the family cascade.
 */
function cleanAssignees(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string')) {
    throw new TodoError(400, 'People must be a list of ids');
  }
  const ids = Array.from(new Set(raw as string[])).slice(0, 32);
  return ids.length > 0 ? ids : undefined;
}

function cleanColor(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !HEX_COLOR.test(raw)) throw new TodoError(400, 'Pick a colour from the list');
  return raw.toLowerCase();
}


function findList(data: TodoData, listId: string): TodoList {
  const list = data.lists.find((l) => l.id === listId);
  if (!list) throw new TodoError(404, 'That list is gone');
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
  /** IANA zone of the device setting the repeat; see `TodoList.repeatTimezone`. */
  timezone?: unknown;
}

export function createList(data: TodoData, input: CreateListInput, now = new Date()): { data: TodoData; list: TodoList } {
  if (data.lists.length >= TODO_LIMITS.maxLists) {
    throw new TodoError(400, `You can have up to ${TODO_LIMITS.maxLists} lists`);
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

function cleanTimezone(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 64 || !IANA_ZONE.test(raw)) {
    throw new TodoError(400, 'That is not a time zone we recognise');
  }
  try {
    // Intl is the only real check that the zone exists on this runtime.
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
  } catch {
    throw new TodoError(400, 'That is not a time zone we recognise');
  }
  return raw;
}

function applyRepeatInput(
  list: TodoList,
  input: { repeat?: unknown; repeatDay?: unknown; timezone?: unknown },
  now = new Date(),
): TodoList {
  let next = list;
  if (input.repeat !== undefined) {
    if (typeof input.repeat !== 'string' || !REPEATS.has(input.repeat as TodoRepeat)) {
      throw new TodoError(400, 'Repeat must be never, daily or weekly');
    }
    next = { ...next, repeat: input.repeat as TodoRepeat };
  }
  if (input.repeatDay !== undefined) {
    if (typeof input.repeatDay !== 'number' || !Number.isInteger(input.repeatDay) || input.repeatDay < 0 || input.repeatDay > 6) {
      throw new TodoError(400, 'Repeat day must be 0 (Sunday) to 6 (Saturday)');
    }
    next = { ...next, repeatDay: input.repeatDay };
  }
  if (next.repeat === 'weekly' && typeof next.repeatDay !== 'number') next = { ...next, repeatDay: 0 };
  if (input.timezone !== undefined) {
    const zone = cleanTimezone(input.timezone);
    next = zone ? { ...next, repeatTimezone: zone } : { ...next, repeatTimezone: undefined };
  }
  // A list that no longer repeats has no midnight to mean.
  if (next.repeat === 'never' && next.repeatTimezone !== undefined) {
    next = { ...next, repeatTimezone: undefined };
  }
  // A changed schedule starts counting from now. Without this the next read
  // would measure from `createdAt` and uncheck a list the moment it gained
  // a repeat, or the moment its day moved.
  if (next.repeat !== list.repeat || next.repeatDay !== list.repeatDay) {
    next = { ...next, lastResetAt: now.toISOString() };
  }
  return next;
}

export type TodoListAction = 'uncheck-all' | 'clear-completed';

export interface UpdateListInput {
  name?: unknown;
  color?: unknown;
  repeat?: unknown;
  repeatDay?: unknown;
  /** IANA zone of the device setting the repeat; see `TodoList.repeatTimezone`. */
  timezone?: unknown;
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
      throw new TodoError(400, 'itemOrder must be a list of item ids');
    }
    const byId = new Map(list.items.map((it) => [it.id, it]));
    if (order.length !== byId.size || new Set(order).size !== order.length || order.some((id) => !byId.has(id))) {
      throw new TodoError(409, 'The list changed while you were moving things. Try again.');
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
      throw new TodoError(400, 'Unknown action');
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
    throw new TodoError(400, `A list can hold up to ${TODO_LIMITS.maxItemsPerList} items`);
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
  if (idx === -1) throw new TodoError(404, 'That item is gone');
  let item = list.items[idx];
  const iso = now.toISOString();
  if (input.text !== undefined) item = { ...item, text: cleanText(input.text) };
  if (input.completed !== undefined) {
    if (typeof input.completed !== 'boolean') throw new TodoError(400, 'completed must be true or false');
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
  if (!list.items.some((it) => it.id === itemId)) throw new TodoError(404, 'That item is gone');
  return replaceList(data, {
    ...list,
    items: list.items.filter((it) => it.id !== itemId),
    updatedAt: now.toISOString(),
  });
}

// ── Fold-in of pre-v2 inline module items ──

interface LegacyItem {
  id: string;
  text: string;
  completed: boolean;
}

function isLegacyItem(v: unknown): v is LegacyItem {
  return !!v && typeof v === 'object' && typeof (v as LegacyItem).id === 'string' && typeof (v as LegacyItem).text === 'string';
}

async function readLegacyTapState(): Promise<Record<string, boolean>> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data', 'todo-state.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { completed?: Record<string, boolean> };
    return parsed && typeof parsed.completed === 'object' && parsed.completed ? parsed.completed : {};
  } catch {
    return {};
  }
}

async function removeLegacyTapState(): Promise<void> {
  for (const name of ['todo-state.json', 'todo-state.json.bak']) {
    try {
      await fs.unlink(path.join(process.cwd(), 'data', name));
    } catch { /* already gone */ }
  }
}

export interface FoldResult {
  config: ScreenConfiguration;
  /** Lists minted by this pass, to append to the store. */
  created: TodoList[];
  /** True when any module lost its inline `items` (the config must be written). */
  touched: boolean;
}

/**
 * What makes two inline lists "the same list": the same name with the same
 * items saying the same things in the same order. Item ids are left out on
 * purpose: a divergent copy shares ids but not words (and must stay its own
 * list), while a list minted from a copy carries fresh ids and must still
 * match its source the next time round.
 */
function fingerprintOf(name: string, items: Array<{ text: string }>): string {
  return [name, ...items.map((it) => it.text)].join('\u0001');
}

/**
 * The stricter match used between lists folded in the same pass: words AND
 * ticks. Two copies of a list with the same words but different boxes
 * ticked are two lists (merging them would throw one module's ticks away);
 * a list that already lives in the store matches on words alone, since its
 * ticks have moved on since it was folded.
 */
function exactFingerprintOf(name: string, items: Array<{ text: string; completed: boolean }>): string {
  return [fingerprintOf(name, items), ...items.map((it) => (it.completed ? '1' : '0'))].join('\u0002');
}

/**
 * Pure: move every To-Do module's inline `items` into a shared list and
 * point the module at it.
 *
 * - Items that match a list already in `existing` (or one minted earlier in
 *   this pass) by name and text share that list, so the same layout arriving
 *   twice (a re-import, a "keep mine" after a save conflict, a restored
 *   backup) never mints a twin.
 * - A module that was duplicated in the editor and then edited keeps the
 *   original's item ids but says something else. It becomes its own list,
 *   and its items get fresh ids so nothing keyed by item id (the wall's
 *   optimistic taps) can cross between the two.
 * - An empty `items` array, the registry default every never-edited module
 *   carried, is just stripped; nobody wants an unnamed empty list in the
 *   picker for each placeholder.
 * - `taps` (the old wall tap store) wins over the authored default for
 *   completion, matching what the wall was showing.
 */
export function foldConfigTodos(
  config: ScreenConfiguration,
  existing: TodoList[],
  taps: Record<string, boolean> = {},
  now = new Date(),
): FoldResult {
  const iso = now.toISOString();
  const created: TodoList[] = [];
  const taken = new Set(existing.map((l) => l.slug));
  // Words-only matches for lists already in the store; words-and-ticks
  // matches for everything (so a pass that folds the same layout twice, or
  // retries after a failure, lands each module back on its own list).
  const byWords = new Map<string, string>();
  const byExact = new Map<string, string>();
  const knownItemIds = new Set<string>();
  for (const list of existing) {
    if (list.items.length > 0) {
      const words = fingerprintOf(list.name, list.items);
      if (!byWords.has(words)) byWords.set(words, list.id);
      const exact = exactFingerprintOf(list.name, list.items);
      if (!byExact.has(exact)) byExact.set(exact, list.id);
    }
    for (const it of list.items) knownItemIds.add(it.id);
  }
  let touched = false;

  const walked = mapConfigModules(config, (mod, site) => {
    if (mod.type !== 'todo') return mod;
    const cfg = mod.config as Record<string, unknown>;
    if (!Array.isArray(cfg.items)) return mod;
    touched = true;
    const { items: _items, ...rest } = cfg;
    const legacy = (cfg.items as unknown[]).filter(isLegacyItem);
    // Nothing to keep, or nothing renders this module: in multi-display mode
    // the top-level `screens` array is a frozen snapshot whose stale copies
    // would otherwise mint a second list for every real one. Strip and move on.
    if (legacy.length === 0 || !site.live) {
      return { ...mod, config: rest as typeof mod.config };
    }
    const name = typeof cfg.title === 'string' && cfg.title.trim() ? cfg.title.trim() : 'To Do';
    const effective = legacy.map((it) => ({ text: it.text, completed: it.id in taps ? taps[it.id] : !!it.completed }));
    const exact = exactFingerprintOf(name, effective);
    let listId = byExact.get(exact) ?? byWords.get(fingerprintOf(name, legacy));
    if (!listId) {
      const slug = uniqueSlug(name, taken);
      taken.add(slug);
      const list: TodoList = {
        id: uuid(),
        name,
        slug,
        items: legacy.map((it) => {
          const completed = it.id in taps ? taps[it.id] : !!it.completed;
          const id = knownItemIds.has(it.id) ? uuid() : it.id;
          knownItemIds.add(id);
          return { id, text: it.text, completed, completedAt: completed ? iso : undefined, createdAt: iso };
        }),
        repeat: 'never',
        createdAt: iso,
        updatedAt: iso,
      };
      created.push(list);
      listId = list.id;
      // Only the exact key: a second copy with the same words but other
      // ticks must not fold onto this one.
      byExact.set(exact, listId);
    }
    return { ...mod, config: { ...rest, listId } as typeof mod.config };
  });

  return { config: touched ? { ...config, ...walked } : config, created, touched };
}

/** Append lists minted by a fold that ran outside this store (the config PUT). */
export function appendFoldedLists(lists: TodoList[]): Promise<TodoData> {
  if (lists.length === 0) return store.read();
  return store.updateAtomic((current) => {
    const have = new Set(current.lists.map((l) => l.id));
    const fresh = lists.filter((l) => !have.has(l.id));
    return fresh.length === 0 ? current : { ...current, lists: [...current.lists, ...fresh] };
  });
}

/** After a failed fold-in, how long the polls leave config.json alone. */
const FOLD_RETRY_MS = 60_000;
let foldRetryAfter = 0;
let foldInFlight: Promise<void> | null = null;

/**
 * The upgrade pass: move inline module items (and the old tap store) into
 * shared lists. Runs at most once at a time; every poll that lands while it
 * is running waits on the same promise.
 *
 * Order matters, because any step can fail and nothing may be lost:
 *   1. read config.json and todo-state.json, work out the lists;
 *   2. write the lists to todos.json (the flag stays unset);
 *   3. strip the inline items off config.json and point the modules at the
 *      lists (idempotent: the same items fold onto the lists from step 2);
 *   4. remove todo-state.json;
 *   5. set `migratedFromConfig`.
 * A failure leaves the flag unset and the sources in place, and the next
 * read retries after a minute. `force` scans config even after the flag is
 * set (a restored pre-lists backup).
 */
async function foldLegacyItemsOnce(force = false): Promise<void> {
  if (!force) {
    if (Date.now() < foldRetryAfter) return;
    if (!foldInFlight) {
      foldInFlight = runFold(false).finally(() => { foldInFlight = null; });
    }
    // Ordinary reads carry on with whatever is on disk and let the retry
    // handle it.
    await foldInFlight.catch(() => {});
    return;
  }
  // A forced caller (a backup restore) wants the config as it is NOW
  // scanned, so a run that started earlier does not count: wait for it,
  // then run again, and let the failure through so the restore can roll
  // back and say so.
  if (foldInFlight) await foldInFlight.catch(() => {});
  const run = runFold(true).finally(() => { if (foldInFlight === run) foldInFlight = null; });
  foldInFlight = run;
  await run;
}

async function runFold(force: boolean): Promise<void> {
  try {
    const before = await store.read();
    if (before.migratedFromConfig && !force) { foldDone = true; return; }
    const config = await readConfig();
    const taps = await readLegacyTapState();
    const planned = foldConfigTodos(config, before.lists, taps);
    if (!planned.touched && before.migratedFromConfig) return;

    // 2. The lists land first, so a failure anywhere after this can only
    //    leave inline items that fold onto them again.
    await appendFoldedLists(planned.created);

    // 3. Now the config. Folded against the lists as persisted, so modules
    //    point at what is on disk; anything minted here is appended too.
    const persisted = (await store.read()).lists;
    let lateCreated: TodoList[] = [];
    await updateConfigAtomic((current) => {
      const result = foldConfigTodos(current, persisted, taps);
      lateCreated = result.created;
      return result.touched ? result.config : current;
    });
    await appendFoldedLists(lateCreated);

    // 4 and 5.
    await removeLegacyTapState();
    await store.updateAtomic((current) => (current.migratedFromConfig ? current : { ...current, migratedFromConfig: true }));
    foldDone = true;
    const moved = planned.created.length + lateCreated.length;
    if (moved > 0) log.info(`Moved ${moved} to-do list(s) out of config.json into data/todos.json`);
  } catch (err) {
    foldRetryAfter = Date.now() + FOLD_RETRY_MS;
    log.warn('Could not fold inline to-do items into shared lists; will retry in a minute:', err);
    throw err;
  }
}

/**
 * Settle the one-time upgrade fold before something reads or writes
 * `config.json` on its own account.
 *
 * The fold rewrites config, so anything that hands out a config revision
 * (the editor's GET, a backup) has to let it finish first or it serves a
 * revision that is stale seconds later, and the editor's next save is
 * refused with a conflict nobody caused. Free after the first call in a
 * process.
 */
async function settleTodoMigrationUnlocked(): Promise<void> {
  if (foldDone) return;
  await foldLegacyItemsOnce();
}

/**
 * Re-run the fold-in for modules that arrived with inline items after the
 * one-time upgrade pass (a restored pre-lists backup, say). Cheap when
 * nothing needs moving.
 */
async function foldInLegacyTodoItemsNowUnlocked(): Promise<TodoData> {
  foldRetryAfter = 0;
  await foldLegacyItemsOnce(true);
  return store.read();
}

// A fold spans config and lists; acquire before either file's queue.
export function readTodoData(): Promise<TodoData> {
  return withDataTransaction(readTodoDataUnlocked);
}
export function updateTodoData(mutator: (current: TodoData) => TodoData | Promise<TodoData>): Promise<TodoData> {
  return withDataTransaction(() => updateTodoDataUnlocked(mutator));
}
export function settleTodoMigration(): Promise<void> {
  return withDataTransaction(settleTodoMigrationUnlocked);
}
export function foldInLegacyTodoItemsNow(): Promise<TodoData> {
  return withDataTransaction(foldInLegacyTodoItemsNowUnlocked);
}
