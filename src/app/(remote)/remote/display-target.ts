'use client';

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { TimerTargets } from '@/types/timers';
import type { DisplayApiEntry } from '@/lib/displays-api-types';

/**
 * What the hub last heard from one display, shaped for the remote's cards.
 * Single-display installs get exactly one entry with `id: undefined` (the
 * legacy `__default__` heartbeat slot); multi-display installs get one per
 * registered display, refreshed by the status polls in RemoteClient.
 */
export interface DisplayLiveEntry {
  /** Registry id; undefined for the legacy single display. */
  id: string | undefined;
  name: string;
  status: NonNullable<DisplayApiEntry['status']> | null;
  lastSeen: number | null;
  /** The hub has never received a heartbeat from this display. */
  neverConnected: boolean;
  /** Last heartbeat is older than REMOTE_OFFLINE_AFTER_MS (see `@/lib/display-liveness`). */
  offline: boolean;
}

/**
 * Selected display target for the remote control.
 *
 * - `undefined` → legacy single-display install (no displays array configured)
 * - `'all'`     → broadcast commands to every connected display
 * - `<id>`      → target one specific display by ID
 *
 * Components read this via `useDisplayTarget()` and pass it through to fetch
 * URLs/bodies. The picker at the top of `RemoteClient` writes to it.
 */
export type DisplayTargetValue = string | undefined;

export interface DisplayTargetContextType {
  target: DisplayTargetValue;
  setTarget: (value: DisplayTargetValue) => void;
  /** All displays the hub knows about (registered + heartbeat). Empty in single-display mode. */
  displays: Array<{ id: string; name: string }>;
  /**
   * The Timers tab's "Show on" chip selection (empty = All, the default).
   * Deliberately separate from `target`, and held at the provider so a
   * selection survives tab switches — RemoteClient unmounts TimersTab
   * whenever another tab is active.
   */
  timerTargetIds: string[];
  setTimerTargetIds: Dispatch<SetStateAction<string[]>>;
  /** Live heartbeat per display (see DisplayLiveEntry); read by the Timers tab to confirm pickup. */
  live: DisplayLiveEntry[];
}

export const DisplayTargetContext = createContext<DisplayTargetContextType>({
  target: undefined,
  setTarget: () => {},
  displays: [],
  timerTargetIds: [],
  setTimerTargetIds: () => {},
  live: [],
});

export function useDisplayTarget(): DisplayTargetContextType {
  return useContext(DisplayTargetContext);
}

/**
 * Append `?display=<id>` (or `&display=<id>`) to a URL when targeting a
 * specific display or broadcasting. Single-display mode passes the URL
 * through unchanged so existing fetches work without modification.
 */
export function withDisplayTarget(url: string, target: DisplayTargetValue): string {
  if (!target) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}display=${encodeURIComponent(target)}`;
}

/**
 * Convert the Timers tab's chip selection to session targets. Empty
 * selection means All, the default. Selecting every chip also collapses to
 * 'all': `displays` is a page-load snapshot, so the broadcast keyword keeps
 * displays adopted after load covered, and the running card shows the
 * translated "On all displays" label instead of an id list. Ids are NOT
 * checked against the live registry — a display deleted after page load can
 * still be addressed, in which case the session simply matches no display.
 */
export function resolveTimerTargets(
  targetIds: string[],
  displays: Array<{ id: string; name: string }>,
): TimerTargets {
  if (targetIds.length === 0 || targetIds.length >= displays.length) return 'all';
  return targetIds;
}
