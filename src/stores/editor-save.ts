import type { ScreenConfiguration } from '@/types/config';

/**
 * The selection fields history tracks alongside the config, so undo
 * restores "where I was looking" in addition to what the config contained.
 * The single source for this field set — `HistoryStateSlice`,
 * `HistoryEntry`, `MutationBaseState`, and the store's `EditorCoreState`
 * all extend it, so adding a tracked field is one edit, not four.
 */
export interface EditorSelection {
  selectedDisplayId: string | null;
  selectedScreenId: string | null;
  selectedModuleId: string | null;
}

/**
 * The slice of editor state that history snapshots and undo/redo steps
 * operate on. Defined here so the helpers below can take a structural input
 * without coupling to the full Zustand store shape.
 */
export interface HistoryStateSlice extends EditorSelection {
  config: ScreenConfiguration;
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
 * Every coalesce key the store's actions use, in one place so the valid set
 * is discoverable and typo-proof. Two calls that produce the same key within
 * `COALESCE_WINDOW_MS` collapse into a single undo entry; a wrong key
 * silently merges two distinct user actions into one undo step, which no
 * typecheck catches — hence the map.
 *
 * `settings` is deliberately shared by `updateSettings` and
 * `updateDisplaySettings`: a Save that writes both global and per-display
 * overrides lands as a single undo entry rather than two.
 */
declare const coalesceKeyBrand: unique symbol;
/**
 * Branded string so `MutateConfig` only accepts keys minted by
 * `COALESCE_KEYS` — a hand-typed literal (or a typo of one) is a compile
 * error rather than a silently non-coalescing key.
 */
export type CoalesceKey = string & { readonly [coalesceKeyBrand]: true };
const asKey = (key: string) => key as CoalesceKey;

export const COALESCE_KEYS = {
  updateModule: (moduleId: string) => asKey(`updateModule:${moduleId}`),
  moduleStyle: (moduleId: string) => asKey(`style:${moduleId}`),
  moveModule: (moduleId: string) => asKey(`move:${moduleId}`),
  resizeModule: (moduleId: string) => asKey(`resize:${moduleId}`),
  updateScreen: (screenId: string) => asKey(`screen:${screenId}`),
  settings: asKey('settings'),
  updateProfile: (profileId: string) => asKey(`profile:${profileId}`),
  reorderProfiles: asKey('reorderProfiles'),
  activeProfile: asKey('activeProfile'),
  updateRule: (ruleId: string) => asKey(`rule:${ruleId}`),
  reorderRules: asKey('reorderRules'),
  updateDisplay: (displayId: string) => asKey(`display:${displayId}`),
} as const;

/**
 * A snapshot pushed onto the undo/redo stacks. Same shape as
 * `HistoryStateSlice`, aliased to name the semantics: an entry holds a deep
 * copy of the config, not the live object.
 */
export type HistoryEntry = HistoryStateSlice;

/**
 * Capture the current editor state into a `HistoryEntry`. Internal:
 * `appendHistoryEntry` is the one way snapshots reach a stack.
 */
function snapshotState(state: HistoryStateSlice): HistoryEntry {
  return {
    config: structuredClone(state.config),
    selectedDisplayId: state.selectedDisplayId,
    selectedScreenId: state.selectedScreenId,
    selectedModuleId: state.selectedModuleId,
  };
}

/**
 * Append a snapshot of the current state to a past stack, trimming to
 * `MAX_HISTORY` from the head. The one way history entries are pushed —
 * used by `applyMutation` on every config mutation and by `importConfig`'s
 * pre-replace snapshot.
 */
export function appendHistoryEntry(
  past: HistoryEntry[],
  state: HistoryStateSlice,
): HistoryEntry[] {
  const next = [...past, snapshotState(state)];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

/** The state `applyMutation` reads. Structural so it can be tested without a store. */
export interface MutationBaseState extends EditorSelection {
  config: ScreenConfiguration | null;
  _past: HistoryEntry[];
  _future: HistoryEntry[];
  _lastHistoryTime: number;
  _lastHistoryActionKey: string;
}

/** The history/dirty bookkeeping every mutation result carries. */
export interface MutationResultBase {
  isDirty: true;
  saveError: null;
  saveErrorKind: null;
  _past: HistoryEntry[];
  _future: HistoryEntry[];
  _lastHistoryTime: number;
  _lastHistoryActionKey: string;
}

/**
 * The heart of every config-mutating store action, as a pure function:
 * decide whether this mutation coalesces into the previous history entry or
 * pushes a new one, then apply `fn` to the config and fold its partial into
 * the bookkeeping. Returns null when there is no config to mutate (the
 * caller skips the dispatch).
 *
 * Coalescing: a mutation carrying the same non-empty `coalesce` key as the
 * previous one, within `COALESCE_WINDOW_MS` and with history to coalesce
 * into, reuses the existing past stack — so a drag or a slider scrub is one
 * undo step. Keys come from `COALESCE_KEYS`.
 *
 * A mutation whose `fn` returns an empty partial is a legitimate no-op (e.g.
 * a display-scoped update whose target display no longer exists) and also
 * returns null: marking the config dirty, burning an undo slot, and wiping
 * the redo stack for zero change would trigger a pointless save and destroy
 * a pending redo.
 *
 * `now` is injectable for tests; production callers omit it.
 */
export function applyMutation<P extends object>(
  state: MutationBaseState,
  fn: (config: ScreenConfiguration) => P,
  options?: { coalesce?: string },
  now: number = Date.now(),
): (MutationResultBase & P) | null {
  const { config } = state;
  if (!config) return null;

  const partial = fn(config);
  if (Object.keys(partial).length === 0) return null;

  const actionKey = options?.coalesce ?? '';
  const coalesces =
    actionKey !== '' &&
    actionKey === state._lastHistoryActionKey &&
    state._past.length > 0 &&
    now - state._lastHistoryTime < COALESCE_WINDOW_MS;
  const newPast = coalesces
    ? state._past
    : appendHistoryEntry(state._past, { ...state, config });

  return {
    isDirty: true,
    saveError: null,
    saveErrorKind: null,
    _past: newPast,
    _future: [],
    _lastHistoryTime: now,
    _lastHistoryActionKey: actionKey,
    ...partial,
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
    saveErrorKind: null;
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
  const trimmedOpposite = appendHistoryEntry(oppositeStack, state);

  return {
    next: {
      config: entry.config,
      selectedDisplayId: entry.selectedDisplayId,
      selectedScreenId: entry.selectedScreenId,
      selectedModuleId: entry.selectedModuleId,
      isDirty: true,
      saveError: null,
    saveErrorKind: null,
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
