import type { ScreenConfiguration } from '@/types/config';

/**
 * Maximum number of entries retained in the undo/redo stacks. Older
 * history entries beyond this are dropped from the head of the stack.
 */
export const MAX_HISTORY = 50;

/**
 * Window during which successive mutations sharing the same `coalesce` key
 * collapse into a single history entry. Picked to let a drag-through-slider
 * interaction register as one undo step without making distinct edits merge.
 */
export const COALESCE_WINDOW_MS = 500;

/**
 * A snapshot pushed onto the undo/redo stacks. Captures both the config and
 * the editor's selection state so undo restores "where I was looking" in
 * addition to what the config contained.
 */
export interface HistoryEntry {
  config: ScreenConfiguration;
  selectedDisplayId: string | null;
  selectedScreenId: string | null;
  selectedModuleId: string | null;
}

/** Deferred promise wired to the next save run. See `EditorState._pendingResave`. */
export interface PendingResave {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * Build a fresh deferred promise for the `_pendingResave` slot. The in-flight
 * save's `finally` block recursively invokes `saveConfig()` and chains the
 * result to `resolve` / `reject`, so every coalesced caller's `await
 * saveConfig()` settles only after the save run that actually includes its
 * mutation has landed on disk.
 */
export function createPendingResave(): PendingResave {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
