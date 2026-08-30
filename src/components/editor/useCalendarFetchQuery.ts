'use client';

import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { getCalendarFetchWindow } from '@/lib/calendar-window';
import { DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { createTZDate } from '@/lib/timezone';
import type { ScreenConfiguration, Screen } from '@/types/config';

/**
 * Which screens the window has to cover.
 *
 * - `active` — the display being previewed. The preview must fetch exactly
 *   what that display fetches, or it stops being WYSIWYG.
 * - `all` — every display on the hub. Used by fetches whose side effects are
 *   hub-wide rather than per-display (see `useCalendarFetchQuery`).
 */
export type CalendarWindowScope = 'active' | 'all';

function screensForScope(config: ScreenConfiguration, scope: CalendarWindowScope, activeDisplayId: string | null): Screen[] {
  if (scope === 'active') return getActiveScreens(config, activeDisplayId);
  // Legacy single-display configs keep their screens at the top level; once
  // the registry exists it owns every screen (`main` included).
  return config.displays?.length
    ? config.displays.flatMap((d) => d.screens ?? [])
    : config.screens;
}

/**
 * The `/api/calendar` query string a display would use, derived from the
 * screens in scope — the same computation the kiosk runs, so an editor fetch
 * can never ask for a narrower window than the display it stands in for.
 *
 * That matters beyond the preview: every successful fetch records its rows as
 * that source's saved events, and a failing source can only fall back to the
 * windows that have already succeeded *in this process*. A bare, upcoming-only
 * fetch therefore seeds a cold server with coverage that holds no past days at
 * all, so a source failing before the first display fetch leaves every grid's
 * past days empty while its future weeks still render. Asking with the display's
 * own window keeps the seed display-shaped.
 *
 * Returns `''` when no module needs more than the server defaults. Selecting a
 * *string* rather than the window object keeps subscribers from re-running on
 * unrelated store changes (module drags, style edits).
 */
export function useCalendarFetchQuery(scope: CalendarWindowScope = 'active'): string {
  return useEditorStore((s) => {
    if (!s.config) return '';
    const win = getCalendarFetchWindow(
      screensForScope(s.config, scope, s.selectedDisplayId),
      createTZDate(s.config.settings.timezone),
      s.config.settings.calendar?.daysAhead ?? DEFAULT_CALENDAR_DAYS_AHEAD,
    );
    if (!win) return '';
    return `timeMin=${encodeURIComponent(win.timeMin)}`
      + (win.timeMax ? `&timeMax=${encodeURIComponent(win.timeMax)}` : '');
  });
}
