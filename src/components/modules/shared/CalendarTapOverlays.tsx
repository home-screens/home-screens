'use client';

import { useState } from 'react';
import { localISODate } from '@/lib/timezone';
import { useTranslate } from '@/i18n';
import type { EventOwner } from '@/lib/calendar-people';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { CalendarEvent, EventTapStyle, TimeFormat } from '@/types/config';
import { DaySheetOverlay } from './DaySheetOverlay';
import { EventDetailOverlay } from './EventDetailOverlay';
import type { useDaySheet } from './useDaySheet';
import type { WallCalendarAdding } from './useWallCalendarAdding';
import { WallEventForm } from './WallEventForm';

/**
 * What a tap on a calendar opens: the day sheet (a day number, "+N more", or
 * any day while events can be added here) and an event's detail on top of
 * it. One component for every calendar module, so the calendar, the
 * full-screen calendar and multi-month draw the same sheets and offer the
 * same Add, Change and Remove.
 */
export function CalendarTapOverlays({
  daySheet, tapDetails, detailEvent, openDetail, closeDetail, owners, variant, theme, accentColor, colorFor, detailAccentFor,
  timeFormat, timezone, now, adding,
}: {
  daySheet: ReturnType<typeof useDaySheet>;
  /** "Tap an event for details" is on. */
  tapDetails: boolean;
  detailEvent: CalendarEvent | null;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  owners?: ReadonlyMap<string, EventOwner>;
  variant: EventTapStyle;
  theme: FullscreenThemeTokens;
  /** The module's accent, for the day sheet's stripe and its Add button. */
  accentColor: string;
  /** An event's colour on a day sheet row. */
  colorFor: (event: CalendarEvent) => string;
  /** An event's colour on its detail. */
  detailAccentFor: (event: CalendarEvent) => string;
  timeFormat: TimeFormat;
  timezone?: string;
  now: Date;
  /** Adding events on this wall, or null while it is not offered here. */
  adding: WallCalendarAdding | null;
}) {
  // The add or change form, opened from the day sheet's Add event or an event's Change.
  const tCore = useTranslate('core');
  const [form, setForm] = useState<{ mode: 'new'; date: string } | { mode: 'change'; event: CalendarEvent } | null>(null);
  return (
    <>
      {/* Before the event detail, so a detail opened from one of its rows
          portals in after it and draws on top. */}
      {daySheet.day && (
        <DaySheetOverlay
          date={daySheet.day.date}
          events={daySheet.day.events}
          notes={daySheet.day.notes}
          owners={owners}
          variant={variant}
          theme={theme}
          accentColor={accentColor}
          colorFor={colorFor}
          timeFormat={timeFormat}
          timezone={timezone}
          paused={detailEvent != null || form !== null}
          onOpenEvent={openDetail}
          {...(adding ? { onAdd: () => setForm({ mode: 'new', date: localISODate(daySheet.day!.date) }) } : {})}
          onClose={daySheet.close}
        />
      )}
      {tapDetails && detailEvent && (
        <EventDetailOverlay
          event={detailEvent}
          variant={variant}
          theme={theme}
          accentColor={detailAccentFor(detailEvent)}
          timeFormat={timeFormat}
          timezone={timezone}
          now={now}
          {...(adding && detailEvent.canEdit
            ? {
              actions: {
                onChange: () => {
                  setForm({ mode: 'change', event: detailEvent });
                  closeDetail();
                },
                onRemove: (scope: 'instance' | 'series') => adding.remove(detailEvent, scope, tCore('grownUp.why.calendarRemove', { title: detailEvent.title })),
              },
            }
            : {})}
          onClose={closeDetail}
        />
      )}
      {adding && form && (
        <WallEventForm
          mode={form.mode}
          date={form.mode === 'new' ? form.date : form.event.start.slice(0, 10)}
          {...(form.mode === 'change' ? { event: form.event } : {})}
          entry={adding.entry}
          theme={theme}
          accent={accentColor}
          timeFormat={timeFormat}
          onDone={() => {
            // Saved: back to the calendar, where the event shows up in a few seconds.
            setForm(null);
            daySheet.close();
            closeDetail();
          }}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}
