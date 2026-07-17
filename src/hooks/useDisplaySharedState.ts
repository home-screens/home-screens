'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { snapshotStates } from '@/lib/condition-verdicts';
import { stableStringify } from '@/lib/stable-stringify';
import type { SharedStateEntry } from '@/lib/shared-state-types';

/**
 * Last shared-state snapshot a display reported to the hub — the editor's
 * window into what the real display sees. Best-effort: values lag the
 * display by up to the heartbeat throttle (~5s). Editor surfaces should
 * usually consume `useEditorSharedState` instead, which falls back to the
 * editor tab's own bus (fed by EditorStateProviderLayer) when no display
 * has reported recently.
 */
export interface DisplaySharedState {
  entries: Record<string, SharedStateEntry>;
  /** Server clock when the display last reported, or null if never. */
  reportedAt: number | null;
  /**
   * The entries as the `ReadonlyMap` the visibility evaluators take, or null
   * when the snapshot is missing or stale (see `snapshotStates`). Owned by
   * the poll loop — freshness is re-evaluated every tick, so an offline
   * display flips consumers to neutral within one poll of the cutoff — and
   * identity-stable while the entries are unchanged, so memoized consumers
   * don't recompute on every poll.
   */
  states: ReadonlyMap<string, SharedStateEntry> | null;
}

const POLL_MS = 5_000;
const EMPTY: DisplaySharedState = { entries: {}, reportedAt: null, states: null };
const EMPTY_ENTRIES_JSON = stableStringify(EMPTY.entries);

/**
 * One poll loop per display, shared by every mounted consumer (canvas,
 * property panel, rules list, inspector page) so co-mounted panels don't
 * multiply the 5s GET — the request doubles as the "an editor is watching"
 * interest signal, and one watcher is enough to arm fast re-reporting.
 * The slot is torn down when the last consumer unsubscribes, so a fresh
 * mount (or display switch) always starts from EMPTY and refetches.
 */
interface Slot {
  state: DisplaySharedState;
  /** Dedupe key for the last accepted entries payload. */
  entriesJson: string;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval>;
  inFlight: boolean;
}

// Keyed by displayId, '' for the legacy single-display slot.
const slots = new Map<string, Slot>();

/**
 * Fold a poll result into the slot, preserving object identity when nothing
 * meaningful changed: a byte-identical response is dropped entirely, and a
 * heartbeat that only advanced `reportedAt` reuses the previous `entries` /
 * `states` references so downstream memos don't churn every 5 seconds.
 */
function publish(slot: Slot, entries: Record<string, SharedStateEntry>, reportedAt: number | null): void {
  const prev = slot.state;
  const entriesJson = stableStringify(entries);
  const entriesChanged = entriesJson !== slot.entriesJson;
  const nextStates = snapshotStates({ entries, reportedAt }, Date.now());
  const freshChanged = (nextStates !== null) !== (prev.states !== null);
  if (!entriesChanged && !freshChanged && reportedAt === prev.reportedAt) return;
  slot.entriesJson = entriesJson;
  slot.state = {
    entries: entriesChanged ? entries : prev.entries,
    reportedAt,
    states:
      nextStates === null || entriesChanged || prev.states === null ? nextStates : prev.states,
  };
  for (const listener of slot.listeners) listener();
}

async function pollSlot(key: string): Promise<void> {
  const slot = slots.get(key);
  if (!slot || slot.inFlight) return;
  slot.inFlight = true;
  try {
    const url = key
      ? `/api/display/shared-state?display=${encodeURIComponent(key)}`
      : '/api/display/shared-state';
    const res = await editorFetch(url);
    if (!res.ok) return;
    const data = await res.json();
    // Slot torn down (last consumer left) while the request was in flight.
    if (slots.get(key) !== slot) return;
    if (data && typeof data === 'object' && data.entries && typeof data.entries === 'object') {
      publish(
        slot,
        data.entries as Record<string, SharedStateEntry>,
        typeof data.reportedAt === 'number' ? data.reportedAt : null,
      );
    }
  } catch {
    // Best-effort hint — keep showing the last snapshot on a failed poll.
  } finally {
    slot.inFlight = false;
  }
}

function acquireSlot(displayId: string | null, listener: () => void): () => void {
  const key = displayId ?? '';
  let slot = slots.get(key);
  if (!slot) {
    slot = {
      state: EMPTY,
      entriesJson: EMPTY_ENTRIES_JSON,
      listeners: new Set(),
      timer: setInterval(() => void pollSlot(key), POLL_MS),
      inFlight: false,
    };
    slots.set(key, slot);
    void pollSlot(key);
  }
  slot.listeners.add(listener);
  return () => {
    slot.listeners.delete(listener);
    if (slot.listeners.size === 0) {
      clearInterval(slot.timer);
      slots.delete(key);
    }
  };
}

function readSlot(displayId: string | null): DisplaySharedState {
  return slots.get(displayId ?? '')?.state ?? EMPTY;
}

const serverSnapshot = () => EMPTY;

/**
 * Poll the hub for a display's last-reported shared-state snapshot.
 * `displayId: null` targets the legacy single-display slot.
 *
 * Pass `enabled: false` to skip polling entirely (returns the EMPTY
 * snapshot). The GET marks per-display "an editor is watching" interest on
 * the hub, which arms the display's fast re-reporting — so callers that only
 * sometimes need live values (e.g. the canvas, when a module is gated)
 * should disable the poll rather than ignore its result.
 */
export function useDisplaySharedState(displayId: string | null, enabled = true): DisplaySharedState {
  const subscribe = useCallback(
    (onStoreChange: () => void) => (enabled ? acquireSlot(displayId, onStoreChange) : () => {}),
    [displayId, enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? readSlot(displayId) : EMPTY),
    [displayId, enabled],
  );
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}
