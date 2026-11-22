'use client';

import type { CSSProperties } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { eventKindLabel, formatEventTime, isZeroLengthEvent } from '@/lib/calendar-utils';
import { eventOwner, type EventOwner } from '@/lib/calendar-people';
import { daySheetHeading, daySheetRows, type DaySheetRow } from '@/lib/calendar-day-sheet';
import { eventGlyph } from '@/lib/calendar-rules';
import { GlyphPrefix } from '@/components/ui/Glyph';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { CalendarEvent, EventTapStyle, TimeFormat } from '@/types/config';
import { DayNoteLines, dayNoteColors } from './DayNoteLine';
import { EVENT_DETAIL_AUTO_DISMISS_MS } from './EventDetailOverlay';
import { EventMarker } from './EventMarker';
import { WallOverlay, WallSheetPanel } from './WallOverlay';
import { wallPressProps } from './wallPress';

/**
 * A length drawn at `px` on a portrait 1080-wide wall and scaled with the
 * screen from there: the unit (`--ds-u`, set on the overlay) is 1vw on a
 * portrait wall and 0.7vh on a landscape one, where a busy day's rows would
 * otherwise run past the bottom. Never below `min` px so a small screen stays
 * readable, never above `px` so a big one keeps the event detail's size.
 */
function len(px: number, min: number): string {
  return `clamp(${min}px, calc(var(--ds-u) * ${Math.round((px / 10.8) * 1000) / 1000}), ${px}px)`;
}

interface DaySheetOverlayProps {
  date: Date;
  /** The events the tapped cell had; the sheet orders them itself. */
  events: readonly CalendarEvent[];
  /** The family's notes for the day, whole: a grid cell cuts each to one line. */
  notes?: readonly string[];
  /** Name tags (the module's `owners`): the owner's initials stand in for a row's calendar dot. */
  owners?: ReadonlyMap<string, EventOwner>;
  variant: EventTapStyle;
  theme: FullscreenThemeTokens;
  /** The module's accent, for the stripe across the top. */
  accentColor: string;
  /** An event's colour as the module's event detail draws it. */
  colorFor: (event: CalendarEvent) => string;
  timeFormat: TimeFormat;
  timezone?: string;
  /** An event detail is open on top: the sheet waits under it without counting down. */
  paused: boolean;
  onOpenEvent: (id: string) => void;
  /** Shown while events can be added from this wall: "Add event" beside Close. */
  onAdd?: () => void;
  onClose: () => void;
}

/**
 * Everything on one day, opened from a calendar grid's "+N more" or day
 * number: the family's notes for it, then every event. It copies the event detail's look (grabber, accent stripe, small
 * capitals over a serif heading, a full-width Close) and its behaviour
 * (`WallOverlay`): viewport-relative sizes, and the same 45 seconds, counted
 * from the last touch and not while an event's detail is open over it. A
 * row opens that event's detail on top; closing the detail comes back here.
 */
export function DaySheetOverlay({ date, events, notes = [], owners, variant, theme, accentColor, colorFor, timeFormat, timezone, paused, onOpenEvent, onAdd, onClose }: DaySheetOverlayProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  const rows = daySheetRows(events, date, timezone);
  const heading = daySheetHeading(date, locale);
  const time = (d: Date, otherDay: boolean) => {
    const clock = formatEventTime(d, timeFormat, locale);
    return otherDay ? `${formatDateSync(d, 'EEE', { locale })} ${clock}` : clock;
  };
  // A soft step off the panel for each row: half way to the theme's second
  // surface on a light theme. A dark theme's second surface is darker than its
  // panel and the rows sank into it, so there they lift toward the text colour.
  const rowBackground = theme.isDark
    ? `color-mix(in srgb, ${theme.text} 5%, ${theme.surface})`
    : `color-mix(in srgb, ${theme.surfaceAlt} 50%, ${theme.surface})`;
  const rowBorder = theme.isDark ? `color-mix(in srgb, ${theme.text} 10%, ${theme.surface})` : theme.borderSubtle;
  const muted = theme.textMuted;

  const row = ({ event, allDay, start, end, startsEarlier, endsLater }: DaySheetRow<CalendarEvent>) => {
    const color = colorFor(event);
    return (
      <button
        key={event.id}
        type="button"
        {...wallPressProps}
        data-day-sheet-row={event.id}
        onClick={() => onOpenEvent(event.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: len(22, 10),
          width: '100%',
          padding: `${len(16, 8)} ${len(20, 10)}`,
          borderRadius: len(20, 10),
          background: rowBackground,
          border: `1px solid ${rowBorder}`,
          color: theme.text,
          font: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ width: len(150, 70), flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ display: 'block', fontSize: len(27, 13), fontWeight: 600, lineHeight: 1.25, color: theme.text }}>
            {allDay
              // "Holiday" or "Birthday · turns 8", as the lists say it.
              ? (event.allDay ? eventKindLabel(event, date.getFullYear(), t, 'calendar') : null) ?? t('calendar.allDay')
              : time(start, startsEarlier)}
          </span>
          {!allDay && !isZeroLengthEvent(start, end) && (
            <span style={{ display: 'block', fontSize: len(21, 11), lineHeight: 1.3, marginTop: 2, color: muted }}>
              {t('calendar.daySheet.toTime', { time: time(end, endsLater) })}
            </span>
          )}
        </span>
        <span aria-hidden="true" style={{ width: len(7, 4), alignSelf: 'stretch', borderRadius: 4, background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: len(31, 15), fontWeight: 600, lineHeight: 1.2, color: theme.text, overflowWrap: 'anywhere' }}>
            <GlyphPrefix value={eventGlyph(event)} />{event.title}
          </span>
          {event.sourceName && (
            <span style={{ display: 'flex', alignItems: 'center', gap: len(8, 5), fontSize: len(21, 11), marginTop: len(4, 2), color: muted }}>
              <EventMarker owner={eventOwner(event, owners)} color={color} size={len(12, 7)} tagSize={len(30, 16)} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.sourceName}</span>
            </span>
          )}
        </span>
        <ChevronRight aria-hidden="true" strokeWidth={2.4} style={{ width: len(34, 18), height: len(34, 18), color: muted, flexShrink: 0 }} />
      </button>
    );
  };

  const body = (
    <div style={{ padding: `${len(36, 18)} ${len(56, 20)} ${len(44, 22)}`, borderTop: `12px solid ${accentColor}` }}>
      <div style={{ fontSize: len(22, 12), letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, marginBottom: len(10, 6) }}>
        {rows.length > 0 ? <>{heading.weekday} · {t('calendar.daySheet.eventCount', { count: rows.length })}</> : heading.weekday}
      </div>
      <div style={{
        fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
        fontSize: len(56, 26),
        lineHeight: 1.1,
        fontWeight: 400,
        color: theme.text,
        marginBottom: len(26, 14),
      }}>
        {heading.date}
      </div>
      {notes.length > 0 && (
        // The note colours are the full-screen calendar's, worked out here for
        // the sheet's own theme: it is drawn outside the module, and the small
        // calendar opens it in Charcoal.
        <div
          data-day-sheet-notes=""
          style={{
            display: 'flex', flexDirection: 'column', gap: len(8, 4), marginBottom: rows.length > 0 ? len(18, 10) : 0,
            '--cal-text-primary': theme.text,
            ...dayNoteColors(theme.isDark),
          } as CSSProperties}
        >
          <DayNoteLines
            notes={notes}
            tone="fullscreen"
            lines={3}
            style={{ fontSize: len(28, 14), padding: `${len(12, 6)} ${len(18, 9)}`, borderRadius: len(12, 6), borderLeftWidth: 4 }}
          />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: len(12, 6) }}>
        {rows.map(row)}
      </div>
      {rows.length === 0 && notes.length === 0 && (
        // Only opens empty while events can be added here.
        <div data-day-sheet-empty="" style={{ fontSize: len(30, 15), color: theme.textSecondary, padding: `${len(26, 12)} 0 ${len(6, 3)}` }}>
          {t('calendar.daySheet.empty')}
        </div>
      )}
      <div style={{ display: 'flex', gap: len(16, 8), marginTop: len(26, 14) }}>
      {onAdd && (
        <button
          type="button"
          {...wallPressProps}
          data-testid="day-sheet-add-event"
          onClick={onAdd}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: len(14, 8),
            background: accentColor,
            border: '1px solid transparent',
            color: '#fff',
            fontSize: len(28, 15),
            fontWeight: 700,
            fontFamily: 'inherit',
            padding: `${len(22, 12)} 0`,
            borderRadius: 18,
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          <Plus aria-hidden="true" strokeWidth={2.6} style={{ width: len(34, 18), height: len(34, 18) }} />
          {t('calendar.daySheet.addEvent')}
        </button>
      )}
      <button
        type="button"
        {...wallPressProps}
        onClick={onClose}
        style={{
          display: 'block',
          flex: 1,
          width: '100%',
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          color: theme.text,
          fontSize: len(28, 15),
          fontWeight: 600,
          fontFamily: 'inherit',
          padding: `${len(22, 12)} 0`,
          borderRadius: 18,
          textAlign: 'center',
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        {t('event-detail.close')}
      </button>
      </div>
    </div>
  );

  return (
    <WallOverlay
      label={heading.full}
      onClose={onClose}
      autoCloseMs={EVENT_DETAIL_AUTO_DISMISS_MS}
      paused={paused}
      scrim={theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)'}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif', lineHeight: 1.5, '--ds-u': 'min(1vw, 0.7vh)' } as CSSProperties}
    >
      <WallSheetPanel variant={variant} theme={theme} data-day-sheet-style={variant}>
        {body}
      </WallSheetPanel>
    </WallOverlay>
  );
}
