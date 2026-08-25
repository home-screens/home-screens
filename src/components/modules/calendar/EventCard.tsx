'use client';

import { memo } from 'react';
import {
  parseEventWallTime, formatEventTime, isAllDayEvent, eventKindLabel, eventRowTimeLabel, withSavedSuffix,
  type EventDaySegment,
} from '@/lib/calendar-utils';
import { sanitizeEventDescription } from '@/lib/event-description';
import { pickPillTextColor } from '@/lib/calendar-color';
import { eventGlyph, eventOpacity } from '@/lib/calendar-rules';
import { TEXT_OPACITY } from '@/lib/constants';
import { MetadataText } from '../shared/MetadataText';
import { ContentCard } from '../shared/ContentCard';
import type { TranslateFn } from '@/i18n';
import type { CalendarEvent } from '@/types/config';
import type { EventDisplayStyle } from './support';

// Memoized: grid views mount hundreds of these and the module re-renders
// every minute on the timezone clock tick with the same event object refs,
// so the shallow compare skips re-parsing/re-formatting every pill per tick.
export const EventCard = memo(function EventCard({ event, textColor: _textColor, showTime, showLocation, showDescription, compact, accentColor, eventStyle, t, locale, segment, countdown, progress, dimmed, live }: {
  event: CalendarEvent;
  textColor: string;
  showTime: boolean;
  showLocation: boolean;
  showDescription?: boolean;
  compact?: boolean;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  t: TranslateFn;
  locale: string;
  /** Day-relative part of a multi-day event (list views pass the row's day). */
  segment?: EventDaySegment;
  /** Status slot: countdown text before start / progress fraction while running. */
  countdown?: string | null;
  progress?: number | null;
  /** Daily view only: already-ended today, faded via dimPastEvents. */
  dimmed?: boolean;
  /** Daily view only: currently running, ringed via showNowRule. */
  live?: boolean;
}) {
  const { timeFormat, gridStyle, pillBackground, timezone } = eventStyle;
  const isAllDay = isAllDayEvent(event);
  // Classic compact pills render only the dot and title — return before
  // parsing dates, since grid views mount hundreds of these per render.
  // (Colored timed pills parse the start below for their time prefix.)
  if (compact) {
    const eventColor = event.calendarColor ?? accentColor;
    const glyph = eventGlyph(event);
    if (gridStyle === 'colored') {
      if (isAllDay) {
        return (
          <div data-event-id={event.id} className="flex items-center gap-1 rounded truncate px-1 py-0.5" style={{ backgroundColor: eventColor, color: pickPillTextColor(eventColor), opacity: event.opacity }}>
            {glyph && <span aria-hidden="true" style={{ fontSize: '0.7em' }}>{glyph}</span>}
            <span className="truncate font-semibold" style={{ fontSize: '0.7em' }}>{event.title}</span>
          </div>
        );
      }
      const start = parseEventWallTime(event.start, timezone);
      return (
        <div
          data-event-id={event.id}
          className="flex items-baseline gap-1 px-1 py-0.5 rounded"
          style={{ backgroundColor: pillBackground ? 'rgba(255,255,255,0.10)' : undefined, opacity: event.opacity }}
        >
          <span className="shrink-0 font-semibold tabular-nums" style={{ fontSize: '0.7em', color: eventColor }}>
            {formatEventTime(start, timeFormat, locale, true)}
          </span>
          <span className="truncate" style={{ fontSize: '0.7em', color: eventColor }}>{event.title}</span>
        </div>
      );
    }
    return (
      <div data-event-id={event.id} className="flex items-center gap-1 px-1 py-0.5 rounded truncate" style={{ backgroundColor: 'rgba(255,255,255,0.10)', opacity: event.opacity }}>
        {glyph ? (
          <span aria-hidden="true" className="shrink-0" style={{ fontSize: '0.7em' }}>{glyph}</span>
        ) : (
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: event.calendarColor ?? accentColor }}
          />
        )}
        <span className="truncate" style={{ fontSize: '0.7em' }}>{event.title}</span>
      </div>
    );
  }

  const start = parseEventWallTime(event.start, timezone);
  const end = parseEventWallTime(event.end, timezone);
  const description = showDescription ? sanitizeEventDescription(event.description) : '';
  const glyph = eventGlyph(event);
  const kindLabel = eventKindLabel(event, start.getFullYear(), t, 'calendar');
  // Middle days of split multi-day events promote to an all-day label.
  const timeContent = withSavedSuffix(
    kindLabel ?? (isAllDay || segment === 'middle' ? t('calendar.allDay')
      : eventRowTimeLabel({
          segment,
          startLabel: formatEventTime(start, timeFormat, locale),
          endLabel: formatEventTime(end, timeFormat, locale),
          t, ns: 'calendar', single: 'duration', start, end,
        })),
    event, eventStyle.failingSourceIds, t,
  );

  return (
    <ContentCard
      data-event-id={event.id}
      className="flex gap-2"
      style={{
        padding: '6px 10px',
        opacity: eventOpacity(event, dimmed ? 0.4 : 1),
        boxShadow: live ? `inset 0 0 0 1px ${accentColor}aa` : undefined,
      }}
    >
      {glyph ? (
        <span aria-hidden="true" className="shrink-0 text-center" style={{ width: 9, fontSize: '0.8em', lineHeight: 1, marginTop: 3 }}>{glyph}</span>
      ) : (
        <div
          className="w-0.5 rounded-full shrink-0 self-stretch"
          style={{ backgroundColor: event.calendarColor ?? accentColor }}
        />
      )}
      <div className="min-w-0 flex-1">
        {showTime && (
          <div className="flex items-center gap-1.5">
            <MetadataText size="sm">{timeContent}</MetadataText>
            {countdown && (
              <span
                className="shrink-0 rounded-full font-semibold whitespace-nowrap"
                style={{
                  fontSize: '0.6em',
                  color: accentColor,
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  padding: '1px 7px',
                }}
              >
                {countdown}
              </span>
            )}
          </div>
        )}
        <p className="font-medium leading-tight line-clamp-2" style={{ fontSize: '0.85em' }}>{event.title}</p>
        {progress != null && (
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="rounded-full overflow-hidden"
            style={{ height: 3, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: accentColor }} />
          </div>
        )}
        {showLocation && event.location && (
          <MetadataText size="xs" className="leading-tight">
            {event.location}
          </MetadataText>
        )}
        {description && (
          <p
            className="leading-snug whitespace-pre-line break-words"
            style={{ fontSize: '0.72em', opacity: TEXT_OPACITY.secondary, marginTop: '2px' }}
          >
            {description}
          </p>
        )}
      </div>
    </ContentCard>
  );
});
