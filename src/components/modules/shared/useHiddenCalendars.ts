'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** The calendars this wall has hidden from its calendar screens. */
const HIDDEN_KEY = 'hs.calendar.hiddenSources';
const EMPTY: ReadonlySet<string> = new Set();

let cache: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

function read(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) && ids.length > 0 ? new Set(ids.filter((id): id is string => typeof id === 'string')) : EMPTY;
  } catch {
    // Unreadable storage just means nothing is hidden.
    return EMPTY;
  }
}

function snapshot(): ReadonlySet<string> {
  cache ??= read();
  return cache;
}

function write(next: ReadonlySet<string>) {
  cache = next.size > 0 ? next : EMPTY;
  try {
    if (next.size > 0) localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    else localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // A full or blocked store just means it will not survive a restart.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab of the same wall changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== HIDDEN_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** For tests: forget what was read, so the next read comes from storage. */
export function resetHiddenCalendarsForTest() {
  cache = null;
}

export interface HiddenCalendars {
  /** Source ids hidden here; empty wherever `active` is false. */
  hidden: ReadonlySet<string>;
  /** Hide or show every calendar a key row stands for. */
  setShown: (sourceIds: readonly string[], shown: boolean) => void;
  /** Drop hidden calendars from a list. Call AFTER building the key. */
  filter: <T extends { sourceId?: string }>(events: T[]) => T[];
}

/**
 * The calendars a wall has hidden through the Calendars sheet, shared by the
 * small and the full-screen calendar.
 *
 * Kept in the wall's own browser, so it survives rotation and a restart, and
 * deliberately not in `config.json`: hiding is one wall's choice, and a tap
 * on a display must never rewrite the layout.
 *
 * One list for every calendar on the wall, held in one store, so two
 * calendar cards on a screen change together.
 *
 * `active` is whether this calendar draws the key that opens the sheet. Where
 * it does not (the key is off or shows people, the editor, a preview),
 * nothing is hidden: a calendar must never be missing from a screen that has
 * no way to bring it back.
 *
 * Callers build their key from the unfiltered events and apply `filter`
 * afterwards, so a hidden calendar keeps its row.
 */
export function useHiddenCalendars(active: boolean): HiddenCalendars {
  const stored = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const hidden = active ? stored : EMPTY;

  const setShown = useCallback((sourceIds: readonly string[], shown: boolean) => {
    const next = new Set(snapshot());
    for (const id of sourceIds) {
      if (shown) next.delete(id);
      else next.add(id);
    }
    write(next);
  }, []);

  const filter = useCallback(
    <T extends { sourceId?: string }>(events: T[]): T[] =>
      hidden.size === 0 ? events : events.filter((ev) => !(ev.sourceId !== undefined && hidden.has(ev.sourceId))),
    [hidden],
  );

  return useMemo(() => ({ hidden, setShown, filter }), [hidden, setShown, filter]);
}
