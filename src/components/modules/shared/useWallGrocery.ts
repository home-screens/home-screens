'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MealSettings, PlannedMeal, SavedMeal } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
import { displayFetch } from '@/lib/display-fetch';
import { filterPlanToWeek, fromISODate, getWeekRange } from '@/lib/meal-constants';
import { weekGroceryList } from '@/lib/grocery-utils';
import { groceryChecksForWeek, type GroceryChecked } from '@/lib/grocery-checks';
import { saveGroceryCheck, tickMealieShoppingItem } from '@/lib/meal-client';
import type { MealieShoppingAnswer } from '@/lib/mealie-shopping';
import type { MealieProblem } from '@/lib/meal-sources';
import {
  todoItemOfGroceryRow,
  wallGroceryFromLocal,
  wallGroceryFromMealie,
  wallGroceryFromTodoList,
  wallGroceryRows,
  type WallGroceryItem,
  type WallGroceryRows,
} from '@/lib/grocery-wall';
import { todoListsUrl } from '@/lib/fetch-keys';
import { sendTodoWrite, updateItemRequest, TODO_LISTS_TTL_MS, type TodoListsPayload } from '@/lib/todo-client';
import { groceryAddListId } from '@/lib/todo-wall';
import { isRepeatTap, type LastTap } from '@/lib/sheet-tap-guard';
import { usePressedKey } from './usePressedKey';

/** The Mealie list every grocery card on the wall reads and an Add on the wall writes back. */
export const WALL_SHOPPING_URL = '/api/mealie/shopping';

/** How often the wall reads the Mealie list again: a tick made at the store shows up within a minute. */
export const WALL_SHOPPING_TTL_MS = 60_000;
/**
 * An item ticked on this wall stays drawn, crossed out, this long, so a wrong
 * tap is undone by tapping it again; then it leaves like every ticked item.
 */
export const WALL_TICK_KEEP_MS = 45_000;

/** The parts of `/api/meals/data` the local list is built from. */
export interface LocalGroceryData {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  groceryChecked?: GroceryChecked;
  settings: MealSettings;
}

/** Where an Add from a grocery card goes. */
export type WallGroceryAddTarget =
  /** The Mealie list the family shops from. */
  | { kind: 'mealie'; listId: string; name: string }
  /** The to-do list picked for the other things to buy, while the plan is kept here; `left` is what is still on it. */
  | { kind: 'todo'; listId: string; name: string; left: number };

export interface WallGrocery {
  state: 'loading' | 'ready' | 'failed';
  /** Why Mealie's list could not be read, while `failed`. */
  problem?: MealieProblem;
  /** Mealie's list name; null for this week's list. */
  listName: string | null;
  /** While the plan lives in Mealie but the household has no list there. */
  noMealieList: boolean;
  rows: WallGroceryRows;
  /** The week this week's list is for (its first day), for the title. */
  week: { start: string; end: string } | null;
  pressed: string | null;
  tick: (item: WallGroceryItem) => void;
  /** Where an Add from this card would go; null with nowhere to add (no Mealie list, no list picked). */
  addTo: WallGroceryAddTarget | null;
}

const EMPTY_ROWS: WallGroceryRows = { groups: [], left: 0, got: 0 };

/**
 * The grocery list a wall shows and ticks: the Mealie list the family shops
 * from while the plan lives in Mealie (`/api/mealie/shopping`, display
 * access), otherwise this week's list built from the planned meals, the same
 * list the phone's Grocery tab shows. A tick goes where the phone's does
 * (`PATCH /api/mealie/shopping/items/<id>`, or `POST /api/meals/grocery` for
 * the week), drawn at once and kept until the list read back agrees.
 * `off` (a view that shows no list) reads nothing.
 *
 * `mealieProblem` is what the meal plan's own read of Mealie last said was
 * wrong, if anything. The list is read from the same Mealie with the same
 * token, so a list that cannot be read is named by it (a refused token, a
 * wrong address); with the plan read fine, the list is just out of reach.
 */
export function useWallGrocery(
  source: 'local' | 'mealie' | 'off',
  local: LocalGroceryData | null,
  todayISO: string,
  mealieProblem: MealieProblem = 'unreachable',
): WallGrocery {
  const [wire, wireError] = useFetchData<MealieShoppingAnswer>(source === 'mealie' ? WALL_SHOPPING_URL : '', WALL_SHOPPING_TTL_MS);

  const week = useMemo(
    () => (local ? getWeekRange(fromISODate(todayISO), local.settings.weekStartDay) : null),
    [local, todayISO],
  );

  // The family's list for the other things to buy rides along at the end of
  // the week's list, read from the to-do lists every list card shares.
  const extrasId = source === 'local' && local ? groceryAddListId(local.settings) : null;
  const [todos] = useFetchData<TodoListsPayload>(extrasId ? todoListsUrl() : '', TODO_LISTS_TTL_MS);
  const extras = useMemo(() => (extrasId ? todos?.lists.find((l) => l.id === extrasId) ?? null : null), [extrasId, todos]);

  const groups = useMemo(() => {
    if (source === 'mealie') return wire?.list ? wallGroceryFromMealie(wire.list) : [];
    if (source === 'off' || !local || !week) return [];
    const weekPlan = filterPlanToWeek(local.plan, week.start, week.end);
    const checked = groceryChecksForWeek(local.groceryChecked ?? {}, week.start);
    const meals = wallGroceryFromLocal(weekGroceryList(weekPlan, local.savedMeals, checked).list);
    return extras ? [...meals, wallGroceryFromTodoList(extras, week.start)] : meals;
  }, [source, wire, local, week, extras]);

  // This wall's ticks over the list last read; an entry goes once the list
  // read back says the same (a read that left before the write keeps it).
  const [ticks, setTicks] = useState<ReadonlyMap<string, boolean>>(new Map());
  const { run, pending } = useOptimisticMutation();
  useEffect(() => {
    setTicks((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const group of groups) {
        for (const item of group.items) {
          if (next.get(item.id) === item.checked && !pending.current.has(item.id)) next.delete(item.id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [groups, pending]);

  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const keepTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = keepTimers.current;
    return () => { for (const t of timers.values()) clearTimeout(t); };
  }, []);
  const keepFor = useCallback((id: string) => {
    setKeep((prev) => new Set(prev).add(id));
    const timers = keepTimers.current;
    const old = timers.get(id);
    if (old) clearTimeout(old);
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      setKeep((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, WALL_TICK_KEEP_MS));
  }, []);

  const [pressed, press] = usePressedKey();
  // A child's double tap is one tap, as on the phone's list: the second half
  // must not take back the tick the first one made.
  const lastTap = useRef<LastTap | null>(null);
  const tick = useCallback((item: WallGroceryItem) => {
    const tap = { id: item.id, at: Date.now() };
    if (isRepeatTap(lastTap.current, tap.id, tap.at)) return;
    lastTap.current = tap;
    const checked = !item.checked;
    const before = item.checked;
    if (checked) keepFor(item.id);
    void press(item.id, () => run(item.id, {
      apply: () => setTicks((prev) => new Map(prev).set(item.id, checked)),
      request: async () => {
        const todoItem = todoItemOfGroceryRow(item.id);
        if (todoItem && extrasId) await sendTodoWrite(displayFetch, updateItemRequest(extrasId, todoItem, { completed: checked }), 'Failed to update the item');
        else if (source === 'mealie') await tickMealieShoppingItem(displayFetch, item.id, checked);
        else await saveGroceryCheck(displayFetch, week?.start ?? todayISO, item.id, checked ? 'check' : 'uncheck');
      },
      rollback: () => setTicks((prev) => new Map(prev).set(item.id, before)),
    }));
  }, [press, run, source, week, todayISO, keepFor, extrasId]);

  const rows = useMemo(() => wallGroceryRows(groups, ticks, keep), [groups, ticks, keep]);

  if (source === 'mealie') {
    const state = wire ? 'ready' : wireError ? 'failed' : 'loading';
    return {
      state, ...(state === 'failed' ? { problem: mealieProblem } : {}),
      listName: wire?.list?.name ?? null, noMealieList: !!wire && !wire.list, rows: wire ? rows : EMPTY_ROWS, week: null, pressed, tick,
      addTo: wire?.list ? { kind: 'mealie', listId: wire.list.id, name: wire.list.name } : null,
    };
  }
  return {
    state: local ? 'ready' : 'loading', listName: null, noMealieList: false, rows, week, pressed, tick,
    addTo: extras ? { kind: 'todo', listId: extras.id, name: extras.name, left: extras.items.filter((it) => !it.completed).length } : null,
  };
}
