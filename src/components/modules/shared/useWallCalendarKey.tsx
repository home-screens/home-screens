'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslate } from '@/i18n';
import { sourceEventCounts, type LegendRow } from '@/lib/calendar-legend';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { CalendarEvent } from '@/types/config';
import { useModuleSurface } from '../module-surface';
import type { useCalendarRecolor } from './useCalendarRecolor';
import { useHiddenCalendars } from './useHiddenCalendars';
import { WallCalendarsSheet, type CalendarKeyRow } from './WallCalendarsSheet';

/**
 * The colour key as the wall's way to hide and recolour calendars, shared by
 * the small and the full-screen calendar so the two cannot drift.
 *
 * The key opens the Calendars sheet only where that makes sense: on a real
 * wall (not the editor or its preview), and when its rows are calendars
 * (a key of people or groups stands for the family, not for calendars).
 * Anywhere else the key is plain words and nothing is hidden.
 *
 * The caller builds `legend` from `recolor.events`, the unfiltered events
 * with any colour being tried, then draws its view from `visible(...)`.
 */
export function useWallCalendarKey({ legend, recolor, window, timezone, swatches, calendarOrder, theme, accentColor }: {
  /** The key's rows, built from `recolor.events`. Empty when the key is off. */
  legend: readonly LegendRow[];
  recolor: ReturnType<typeof useCalendarRecolor>;
  /** The days the view draws, for each calendar's event count; null for a list with no day bound. */
  window: { start: Date; end: Date } | null;
  timezone?: string;
  /** The household's own colours; absent means the built-in ones. */
  swatches?: string[];
  /** The household's calendar order; absent with none set. */
  calendarOrder?: string[];
  theme: FullscreenThemeTokens;
  accentColor: string;
}) {
  const t = useTranslate('modules');
  const surface = useModuleSurface();
  const rows = useMemo(
    () => legend.filter((row): row is CalendarKeyRow => row.kind === 'source'),
    [legend],
  );
  const active = surface === 'display' && rows.length > 0 && rows.length === legend.length;
  // The sheet is a list to find one calendar in, so it must not reshuffle
  // with the week: the calendars the household ordered come first, as the
  // key has them, and the rest follow by name. (The key itself lists
  // calendars as their events come up.)
  const sheetRows = useMemo(() => {
    const ordered = new Set(calendarOrder ?? []);
    const isOrdered = (row: CalendarKeyRow) => row.sourceIds.some((id) => ordered.has(id));
    return [...rows.filter(isOrdered), ...rows.filter((row) => !isOrdered(row)).sort((a, b) => a.name.localeCompare(b.name))];
  }, [rows, calendarOrder]);
  const { hidden, setShown, filter } = useHiddenCalendars(active);
  const [open, setOpen] = useState(false);

  const { paint, save, events } = recolor;
  const close = useCallback(() => {
    setOpen(false);
    void save();
  }, [save]);
  const onOpen = useCallback(() => setOpen(true), []);
  const counts = useMemo(
    () => (open ? sourceEventCounts(events, window, timezone) : new Map<string, number>()),
    [open, events, window, timezone],
  );

  return {
    /** Spread onto `CalendarLegend`. */
    keyProps: active
      ? { hiddenIds: hidden, onOpen, openLabel: t('calendar.calendarsSheet.title') }
      : {},
    /** Whether the key is a button here (it needs a finger-sized strip). */
    active,
    /** Drops the calendars hidden on this wall. */
    visible: filter as <T extends CalendarEvent>(list: T[]) => T[],
    /** Render this; null unless the sheet is open. */
    sheet: active && open ? (
      <WallCalendarsSheet
        rows={sheetRows}
        hidden={hidden}
        counts={counts}
        swatches={swatches}
        theme={theme}
        accentColor={accentColor}
        onShow={(row, shown) => setShown(row.sourceIds, shown)}
        onColor={(row, color) => paint(row.sourceIds, color)}
        onClose={close}
      />
    ) : null,
  };
}
