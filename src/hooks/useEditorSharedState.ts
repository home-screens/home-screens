'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { sharedStateStore } from '@/lib/shared-state-store';
import { useDisplaySharedState, type DisplaySharedState } from '@/hooks/useDisplaySharedState';
import type { SharedStateEntry } from '@/lib/shared-state-types';

/** Where the live values came from — drives source-aware copy (the bus
 *  inspector's banner) and nothing else; verdict math is source-agnostic. */
export type SharedStateSource = 'display' | 'editor';

export interface EditorSharedState extends DisplaySharedState {
  /** null when neither source has anything trustworthy (neutral verdicts). */
  source: SharedStateSource | null;
}

/**
 * Live shared-state values for the editor's verdict chips, value hints, and
 * bus inspector: the selected display's last-reported snapshot when it is
 * fresh, otherwise the editor tab's OWN bus.
 *
 * The local fallback exists because `EditorStateProviderLayer` mounts every
 * plugin's `stateProvider` in the editor itself — so with zero displays
 * running (a dev server, or a fresh install being configured), authoring a
 * condition still produces live values in-tab and the whole loop is visible
 * immediately. A fresh display snapshot wins because the wall display is
 * ground truth for "why is my module hidden right now"; the editor bus is a
 * stand-in, not a second authority.
 *
 * The local view mirrors what display heartbeats report: tombstoned entries
 * (`staleAt` set) are filtered out. And an EMPTY local bus never counts as a
 * source — `states` stays null so an offline display keeps rendering neutral
 * verdicts, never a confident "unmet" conjured from a bus nothing publishes
 * to (the phase-4 never-stale-green invariant).
 */
export function useEditorSharedState(
  displayId: string | null,
  enabled = true,
): EditorSharedState {
  const display = useDisplaySharedState(displayId, enabled);

  const subscribe = useCallback(
    (onStoreChange: () => void) => (enabled ? sharedStateStore.subscribe(onStoreChange) : () => {}),
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? sharedStateStore.snapshot() : EMPTY_BUS),
    [enabled],
  );
  const localRaw = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  // `snapshot()` is referentially stable between bus changes, so this memo
  // recomputes only when something actually published/cleared.
  const local = useMemo(() => {
    const entries: Record<string, SharedStateEntry> = {};
    const states = new Map<string, SharedStateEntry>();
    let reportedAt: number | null = null;
    for (const [key, entry] of localRaw) {
      if (entry.staleAt !== undefined) continue;
      entries[key] = entry;
      states.set(key, entry);
      if (reportedAt === null || entry.updatedAt > reportedAt) reportedAt = entry.updatedAt;
    }
    return states.size > 0 ? { entries, reportedAt, states } : null;
  }, [localRaw]);

  return useMemo<EditorSharedState>(() => {
    if (display.states !== null) return { ...display, source: 'display' };
    if (local) return { ...local, source: 'editor' };
    return { ...display, source: null };
  }, [display, local]);
}

const EMPTY_BUS: ReadonlyMap<string, SharedStateEntry> = new Map();
const serverSnapshot = () => EMPTY_BUS;
