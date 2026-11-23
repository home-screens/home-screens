/**
 * What a wall added in the last few minutes, so its Undo can take it off
 * again. The display token may only add (`todo-wall.ts`); removing stays with
 * the phone, except for an item the hub itself added for a wall moments ago.
 * Memory only: a restart forgets, which leaves the item on the list for the
 * phone to remove, the safe way round.
 *
 * Kept on `globalThis` because separate routes can hold separate copies of
 * this module (the add and the remove are different route files).
 */

import { WALL_UNDO_MS } from '@/lib/undo-window';

export { WALL_UNDO_MS };

type Ledger = Map<string, number>;

const key = Symbol.for('home-screens.wall-added.v1');
const globals = globalThis as typeof globalThis & { [key]?: Ledger };
const ledger: Ledger = globals[key] ??= new Map();

function sweep(now: number): void {
  for (const [id, at] of ledger) if (now - at > WALL_UNDO_MS) ledger.delete(id);
}

/** Remember that the hub just added `id` (a to-do item or a Mealie shopping item) for a wall. */
export function noteWallAdded(id: string, now = Date.now()): void {
  sweep(now);
  ledger.set(id, now);
}

/** Whether a wall may still take `id` off: the hub added it for a wall within `WALL_UNDO_MS`. */
export function wallMayUndo(id: string, now = Date.now()): boolean {
  sweep(now);
  return ledger.has(id);
}

/** The wall took it off (or it is gone): it can't be undone twice. */
export function forgetWallAdded(id: string): void {
  ledger.delete(id);
}

/** Tests only. */
export function resetWallAdded(): void {
  ledger.clear();
}
