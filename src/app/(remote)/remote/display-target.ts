'use client';

import { createContext, useContext } from 'react';

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
}

export const DisplayTargetContext = createContext<DisplayTargetContextType>({
  target: undefined,
  setTarget: () => {},
  displays: [],
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
