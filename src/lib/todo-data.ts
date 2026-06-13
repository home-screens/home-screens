import { createJsonStore } from './json-store';

/**
 * Runtime completion state for interactive todo modules.
 *
 * Authored todo items (text, accent, and their *initial* completed value) live
 * inline on the module instance in `config.json` — that's editor-owned data.
 * But once a kiosk user starts tapping items, their per-tap completion must NOT
 * be written back into `config.json`: the editor loads the whole config into an
 * in-memory store on mount and PUTs it back wholesale on every save, so a save
 * that overlaps with kiosk taps would silently revert every tap since the
 * editor opened. (Same write-contention the meal-planner and chore stores were
 * split out to avoid — see `meal-data.ts` / `chore-data.ts`.)
 *
 * So completion lives here instead, in its own tiny store keyed by item UUID.
 * Because item ids are globally-unique UUIDs, a flat `itemId → completed` map
 * gives genuine cross-display sync for free: the same item rendered on two
 * displays resolves to the same key, so a tap on one surfaces on the other via
 * the `/api/todo/state` poll.
 *
 * An item absent from the map has never been toggled at runtime — callers fall
 * back to its authored `completed` default from config. (Entries for items the
 * user later deletes in the editor simply go stale and are ignored; they're a
 * few bytes each, so we don't actively prune them.)
 */
export interface TodoState {
  /** itemId → completed. Absent key means "use the item's authored default". */
  completed: Record<string, boolean>;
}

const EMPTY: TodoState = { completed: {} };

const store = createJsonStore<TodoState>({
  path: 'data/todo-state.json',
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

export const readTodoState = store.read;

/**
 * Atomic read-modify-write for todo completion. Serializes through the store's
 * write queue so concurrent taps (multiple kiosk users / displays) can't
 * interleave and clobber each other's flips.
 */
export const updateTodoState = store.updateAtomic;
