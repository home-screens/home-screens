'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyCalendarOverrides } from '@/lib/calendar-overrides';
import { displayFetch } from '@/lib/display-fetch';
import { logger } from '@/lib/logger';
import type { CalendarEvent, CalendarOverride } from '@/types/config';
import type { LegendRow } from '@/lib/calendar-legend';
import { LegendColorPopover } from './LegendColorPopover';

const log = logger('useLegendColorPicker');

type SourceRow = Extract<LegendRow, { kind: 'source' }>;

/**
 * Tap a legend dot to recolour that calendar, from the wall itself.
 *
 * Shared by both calendar modules, which build their legends the same way;
 * writing it twice is how the legend filter and the legend once drifted apart.
 * The caller renders `popover` and draws from `events`, which carry the local
 * paint, so dots and event bars move together the instant a swatch is tapped.
 *
 * Saving happens when the sheet is dismissed, not on each swatch, so running
 * a finger down the palette costs one write. The saved colour takes a few
 * seconds to come back round (config revision, then a calendar refetch), so
 * the local paint is held until the fetched events actually carry it rather
 * than for a guessed interval. Without that the dot flicks back to the old
 * colour and then forward again, which reads as the save having failed.
 *
 * A failed save drops the paint, so the wall shows what is really stored
 * rather than a colour that exists only in this tab.
 */
export function useLegendColorPicker({ enabled, events, label, swatches }: {
  /** False in the editor preview, where tapping must not repaint the real wall. */
  enabled: boolean;
  /** Everything fetched, before the legend filter. */
  events: CalendarEvent[];
  /** Accessible name for the sheet, e.g. name => `Colour for ${name}`. */
  label: (name: string) => string;
  /** The household's own colours; absent means the ones the app ships with. */
  swatches?: string[];
}) {
  const [picking, setPicking] = useState<{ row: SourceRow; rect: DOMRect } | null>(null);
  const [preview, setPreview] = useState<Record<string, CalendarOverride>>({});

  const drop = useCallback((ids: readonly string[]) => {
    setPreview((current) => {
      if (!ids.some((id) => id in current)) return current;
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });
  }, []);

  // Hand over to the saved value the moment it arrives, with no visible step.
  useEffect(() => {
    const landed = Object.entries(preview)
      .filter(([id, override]) => {
        const mine = events.filter((e) => e.sourceId === id);
        return mine.length > 0 && mine.every((e) => e.calendarColor === override.color);
      })
      .map(([id]) => id);
    if (landed.length) drop(landed);
  }, [events, preview, drop]);

  const open = useMemo(
    () => (enabled
      ? (row: LegendRow, rect: DOMRect) => { if (row.kind === 'source') setPicking({ row, rect }); }
      : undefined),
    [enabled],
  );

  const previewColor = useCallback((color: string) => {
    const row = picking?.row;
    if (!row) return;
    setPreview((current) => {
      const next = { ...current };
      for (const id of row.sourceIds) next[id] = { ...(next[id] ?? {}), color };
      return next;
    });
  }, [picking]);

  const commit = useCallback(async (color: string | null) => {
    const row = picking?.row;
    setPicking(null);
    if (!row) return;
    if (!color) {
      drop(row.sourceIds);
      return;
    }
    try {
      const res = await displayFetch('/api/calendar/appearance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceIds: row.sourceIds, color }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      log.warn('Could not save the calendar colour', err);
      drop(row.sourceIds);
    }
  }, [picking, drop]);

  const painted = useMemo(() => applyCalendarOverrides(events, preview), [events, preview]);

  return {
    /** Pass to `CalendarLegend`. Undefined off the wall, which leaves dots inert. */
    open,
    /** Draw from these: the fetched events with any local paint applied. */
    events: painted,
    /** Render this; null unless a sheet is open. */
    popover: picking ? (
      <LegendColorPopover
        swatches={swatches}
        anchor={picking.rect}
        value={picking.row.color}
        label={label(picking.row.name)}
        onPreview={previewColor}
        onCommit={commit}
      />
    ) : null,
  };
}
