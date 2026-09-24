'use client';

import { useEditorStore, type EditorState } from '@/stores/editor-store';
import { useTZClock } from '@/hooks/useTZClock';
import { localISODate } from '@/lib/timezone';

/**
 * The zone the household runs in, and whether it was saved or is the hub's own
 * clock standing in for an unset one. Null until the config has loaded.
 *
 * `saved: false` is the "no time zone set yet" state: the wall, the phone and
 * the hub all run on `timezone` (the hub's zone), and so does every preview
 * here, so a banner can say which zone the screens are on until one is picked.
 */
export function useEditorHouseholdZone(): { timezone: string; saved: boolean } | null {
  const timezone = useEditorStore(selectHouseholdTimezone);
  const saved = useEditorStore((s) => !!s.config?.settings?.timezone);
  return timezone ? { timezone, saved } : null;
}

/**
 * The household's zone for everything the editor evaluates or shows: canvas
 * previews, schedule and condition badges, "today", clocks. The laptop running
 * the editor can be in any zone (a parent travelling, a work machine on UTC),
 * and the wall follows the saved zone, or the hub's while none is saved, so the
 * editor must never fall back to this browser's own zone.
 *
 * Undefined only before the config has loaded.
 */
export function selectHouseholdTimezone(s: EditorState): string | undefined {
  if (!s.config) return undefined;
  return s.config.settings?.timezone || s.hubTimezone || undefined;
}

/** `selectHouseholdTimezone` as a hook. */
export function useEditorHouseholdTimezone(): string | undefined {
  return useEditorStore(selectHouseholdTimezone);
}

/**
 * The household's wall clock, for editor surfaces that ask "what day is it"
 * or "what time is it now". Today and This week have to follow the household,
 * as the wall and the kids' lists do.
 *
 * Returns a shifted Date (see `createTZDate`): read it with local getters or
 * feed it to date-string helpers, never compare it with real instants.
 */
export function useEditorHouseholdNow(intervalMs = 60_000): Date {
  return useTZClock(useEditorHouseholdTimezone(), intervalMs);
}

/** The household's calendar day as `YYYY-MM-DD`, rolling over at its midnight. */
export function useEditorHouseholdToday(): string {
  return localISODate(useEditorHouseholdNow());
}
