import type { ScreenConfiguration } from '@/types/config';

/**
 * The slice of editor state that history snapshots and undo/redo steps
 * operate on. Defined here so the helpers below can take a structural input
 * without coupling to the full Zustand store shape.
 */
export interface HistoryStateSlice {
  config: ScreenConfiguration;
  selectedDisplayId: string | null;
  selectedScreenId: string | null;
  selectedModuleId: string | null;
}

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

/**
 * Capture the current editor state into a `HistoryEntry`. Used by every code
 * path that pushes onto the past stack — `mutateConfig`'s history bookkeeping,
 * `importConfig`'s pre-replace snapshot, and `undo`/`redo`'s "save current
 * state to the opposite stack" step. Centralised so the four-key shape stays
 * consistent.
 */
export function snapshotState(state: HistoryStateSlice): HistoryEntry {
  return {
    config: structuredClone(state.config),
    selectedDisplayId: state.selectedDisplayId,
    selectedScreenId: state.selectedScreenId,
    selectedModuleId: state.selectedModuleId,
  };
}

/**
 * Result of a successful undo or redo step. Includes both the next state to
 * pass to `set()` and the previous selection IDs so the caller can decide
 * whether to sync the URL.
 */
export interface HistoryStepResult {
  next: HistoryEntry & {
    isDirty: true;
    saveError: null;
    _past: HistoryEntry[];
    _future: HistoryEntry[];
    _lastHistoryTime: 0;
    _lastHistoryActionKey: '';
  };
  previousSelectedDisplayId: string | null;
  previousSelectedScreenId: string | null;
}

/**
 * Pop the appropriate stack and produce the next state plus a snapshot of the
 * previous selection. Returns null when the source stack is empty so the
 * caller can early-return without dispatching.
 */
export function applyHistoryStep(
  state: HistoryStateSlice & { _past: HistoryEntry[]; _future: HistoryEntry[] },
  direction: 'undo' | 'redo',
): HistoryStepResult | null {
  const sourceStack = direction === 'undo' ? state._past : state._future;
  if (sourceStack.length === 0) return null;

  const entry = sourceStack[sourceStack.length - 1]!;
  const remainingSource = sourceStack.slice(0, -1);
  const oppositeStack = direction === 'undo' ? state._future : state._past;
  const grownOpposite = [...oppositeStack, snapshotState(state)];
  const trimmedOpposite =
    grownOpposite.length > MAX_HISTORY
      ? grownOpposite.slice(grownOpposite.length - MAX_HISTORY)
      : grownOpposite;

  return {
    next: {
      config: entry.config,
      selectedDisplayId: entry.selectedDisplayId,
      selectedScreenId: entry.selectedScreenId,
      selectedModuleId: entry.selectedModuleId,
      isDirty: true,
      saveError: null,
      _past: direction === 'undo' ? remainingSource : trimmedOpposite,
      _future: direction === 'undo' ? trimmedOpposite : remainingSource,
      _lastHistoryTime: 0,
      _lastHistoryActionKey: '',
    },
    previousSelectedDisplayId: state.selectedDisplayId,
    previousSelectedScreenId: state.selectedScreenId,
  };
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
