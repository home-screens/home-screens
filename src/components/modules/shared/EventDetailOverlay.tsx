'use client';

import { useState } from 'react';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { Clock, MapPin, CalendarDays, Pencil, Repeat, Trash2 } from 'lucide-react';
import { parseEventWallTime, isEventOnDay, formatEventTime, eventEndLabel, eventKindGlyph, eventKindLabel } from '@/lib/calendar-utils';
import { sanitizeEventDescription } from '@/lib/event-description';
import { useTranslate, useFormattingLocale, formatDayRange, formatRelativeTime, fullDateHeading } from '@/i18n';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { CalendarEvent, EventTapStyle, TimeFormat } from '@/types/config';
import { householdTimeFormat } from '@/lib/clock-time';
import { WallOverlay, WallSheetPanel } from './WallOverlay';
import { wallPressProps } from './wallPress';
import { WallAskInSheet } from './WallAskInSheet';

// A kiosk nobody is standing at must not show an event detail forever.
export const EVENT_DETAIL_AUTO_DISMISS_MS = 45_000;

export interface EventTimeText {
  /** "5:30 PM – 7:00 PM", "9:00 PM" for an event with no length, "All Day", or "All Day · Aug 7 – 9". */
  main: string;
  /** Relative context: "in 2 hours", "Happening now", "Today" — or ''. */
  sub: string;
}

/**
 * Main time line + relative sub-line for an event detail. Pure so the date
 * math is unit-testable against a frozen `now` (E2E runs at arbitrary
 * wall-clock times and cannot assert this deterministically).
 */
export function describeEventTime(
  event: CalendarEvent,
  now: Date,
  locale: string,
  labels: { allDay: string; today: string; happeningNow: string },
  savedTimeFormat?: TimeFormat,
  timezone?: string,
): EventTimeText {
  const timeFormat = householdTimeFormat(savedTimeFormat, locale);
  // Both callers pass a display-timezone `now` (useTZClock / createTZDate),
  // so the event bounds are read on the same wall clock — mixing a true epoch
  // instant with the shifted `now` drifts by the OS↔display offset.
  const start = parseEventWallTime(event.start, timezone);
  const end = parseEventWallTime(event.end, timezone);

  if (event.allDay) {
    let main = labels.allDay;
    // All-day ends are exclusive (a one-day event on Aug 7 ends Aug 8).
    const lastDay = addDays(end, -1);
    if (!isSameDay(start, lastDay) && lastDay > start) {
      main += ` · ${formatDayRange(start, lastDay, locale, { month: 'short', year: false })}`;
    }
    // isEventOnDay's all-day branch does half-open interval overlap against
    // [date, date+1day) — it needs a midnight, not a mid-day timestamp, or
    // tomorrow's event would read as "today" from this afternoon.
    if (isEventOnDay(event, startOfDay(now), timezone)) return { main, sub: labels.today };
    // Compare midnights, not elapsed time: a Friday event on a Wednesday is
    // "in 2 days", never "tomorrow" because only ~34 hours remain.
    if (start > now) return { main, sub: formatRelativeTime(startOfDay(now), start, { locale }) };
    return { main, sub: '' };
  }

  const startLabel = formatEventTime(start, timeFormat, locale);
  const endLabel = eventEndLabel(start, end, timeFormat, locale);
  const main = endLabel === null ? startLabel : `${startLabel} – ${endLabel}`;
  if (now >= start && now < end) return { main, sub: labels.happeningNow };
  if (start > now) return { main, sub: formatRelativeTime(now, start, { locale }) };
  return { main, sub: '' };
}

interface EventDetailOverlayProps {
  event: CalendarEvent;
  variant: EventTapStyle;
  theme: FullscreenThemeTokens;
  /** Resolved event accent (calendar color, already dark-adjusted by the caller). */
  accentColor: string;
  /** Household clock preference; the time range line follows it. */
  timeFormat?: TimeFormat;
  /** Display timezone; event times are read on the same wall clock as `now`. */
  timezone?: string;
  now: Date;
  /**
   * Change and Remove, shown only for an event this wall may change.
   * Remove asks inside the sheet first; `onRemove` answers whether
   * it went through, so the sheet can stay open with its words when it did not.
   */
  actions?: {
    onChange: () => void;
    onRemove: (scope: 'instance' | 'series') => Promise<boolean>;
  };
  onClose: () => void;
}

/**
 * Tap-to-open event detail for calendar modules, in a `WallOverlay`. The
 * overlay escapes the zoom-scaled ScreenRenderer, which is exactly why every
 * size here is viewport-relative (clamp/vmin) rather than raw px: the
 * calendar behind it scales with the configured display, the overlay scales
 * with the actual viewport. The scrim keeps the tapped view visible
 * underneath for context.
 */
export function EventDetailOverlay({ event, variant, theme, accentColor, timeFormat, timezone, now, actions, onClose }: EventDetailOverlayProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const description = sanitizeEventDescription(event.description);
  const start = parseEventWallTime(event.start, timezone);
  const time = describeEventTime(event, now, locale, {
    allDay: t('event-detail.allDay'),
    today: tCore('today'),
    happeningNow: t('event-detail.happeningNow'),
  }, timeFormat, timezone);
  const glyph = eventKindGlyph(event.kind);
  const kindLabel = eventKindLabel(event, start.getFullYear(), t, 'event-detail');

  const iconStyle: React.CSSProperties = {
    color: theme.textMuted,
    flexShrink: 0,
    marginTop: 3,
    width: 'clamp(24px, 3.7vmin, 40px)',
    height: 'clamp(24px, 3.7vmin, 40px)',
  };
  const rowGap = 'clamp(12px, 2vmin, 22px)';
  const rowMargin = 'clamp(14px, 2.4vmin, 26px)';
  const secondaryFont = 'clamp(14px, 2.4vmin, 26px)';

  const infoRow = (icon: React.ReactNode, main: React.ReactNode, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: rowGap, marginBottom: rowMargin }}>
      {icon}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'clamp(17px, 3vmin, 32px)', color: theme.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{main}</div>
        {sub && <div style={{ fontSize: secondaryFont, color: theme.textSecondary, marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );

  const body = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        padding: 'clamp(20px, 3.7vmin, 40px) clamp(24px, 5.9vmin, 64px) clamp(28px, 5.6vmin, 60px)',
        borderTop: `12px solid ${accentColor}`,
        cursor: 'default',
      }}
    >
      <div style={{
        fontSize: secondaryFont,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: theme.textMuted,
        marginBottom: 'clamp(8px, 1.3vmin, 14px)',
      }}>
        {fullDateHeading(start, locale)}
      </div>
      <div style={{
        fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
        fontSize: 'clamp(28px, 5.4vmin, 58px)',
        lineHeight: 1.12,
        fontWeight: 400,
        color: theme.text,
        marginBottom: 'clamp(20px, 3.3vmin, 36px)',
        wordBreak: 'break-word',
      }}>
        {glyph && <span aria-hidden="true" style={{ marginRight: 'clamp(6px, 1vmin, 12px)' }}>{glyph}</span>}
        {event.title}
      </div>

      {infoRow(<Clock strokeWidth={2.2} style={iconStyle} aria-hidden="true" />, kindLabel ?? time.main, time.sub)}

      {event.location && infoRow(
        <MapPin strokeWidth={2.2} style={iconStyle} aria-hidden="true" />,
        event.location,
      )}

      {event.sourceName && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: rowGap, marginBottom: rowMargin }}>
          <CalendarDays strokeWidth={2.2} style={iconStyle} aria-hidden="true" />
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'clamp(8px, 1.3vmin, 14px)',
            fontSize: secondaryFont,
            color: theme.textSecondary,
            marginTop: 7,
          }}>
            <span style={{ width: 'clamp(14px, 2vmin, 22px)', height: 'clamp(14px, 2vmin, 22px)', borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
            {event.sourceName}
          </div>
        </div>
      )}

      {description && (
        <div style={{
          borderTop: `1px solid ${theme.borderSubtle}`,
          marginTop: 12,
          paddingTop: 'clamp(16px, 2.8vmin, 30px)',
          fontSize: 'clamp(15px, 2.6vmin, 28px)',
          lineHeight: 1.5,
          color: theme.textSecondary,
          whiteSpace: 'pre-line',
          wordBreak: 'break-word',
          display: '-webkit-box',
          WebkitLineClamp: 6,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {description}
        </div>
      )}

      {event.repeats && infoRow(<Repeat strokeWidth={2.2} style={iconStyle} aria-hidden="true" />, t('event-detail.repeats'))}

      {actions && asking && (
        <WallAskInSheet
          testId="event-detail-remove-ask"
          theme={theme}
          accentColor={accentColor}
          busy={busy}
          title={t('event-detail.removeTitle', { title: event.title })}
          body={t('event-detail.removeBody', { calendar: event.sourceName ?? '' })}
          cancelLabel={t('event-detail.keepIt')}
          choices={event.repeats
            ? [
              { id: 'instance', label: t('event-detail.justThisDay'), detail: tCore('calendarChange.thisDayStays', { day: fullDateHeading(start, locale) }), tone: 'danger' },
              { id: 'series', label: t('event-detail.everyTime'), detail: tCore('calendarChange.everyTimePastFuture'), tone: 'dangerFill' },
            ]
            : [{ id: 'instance', label: t('event-detail.remove'), tone: 'dangerFill' }]}
          onPick={async (id) => {
            setBusy(true);
            const removed = await actions.onRemove(id === 'series' ? 'series' : 'instance');
            setBusy(false);
            if (removed) onClose();
          }}
          onCancel={() => setAsking(false)}
        />
      )}

      {actions && !asking && (
        <div style={{ display: 'flex', gap: 16, marginTop: 'clamp(24px, 4vmin, 44px)' }}>
          {[
            { id: 'change', label: t('event-detail.change'), icon: <Pencil strokeWidth={2.4} aria-hidden="true" style={{ width: 'clamp(18px, 3vmin, 32px)', height: 'clamp(18px, 3vmin, 32px)' }} />, onClick: actions.onChange, danger: false },
            { id: 'remove', label: t('event-detail.remove'), icon: <Trash2 strokeWidth={2.4} aria-hidden="true" style={{ width: 'clamp(18px, 3vmin, 32px)', height: 'clamp(18px, 3vmin, 32px)' }} />, onClick: () => setAsking(true), danger: true },
          ].map((b) => (
            <button
              key={b.id}
              type="button"
              {...wallPressProps}
              data-testid={`event-detail-${b.id}`}
              onClick={b.onClick}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(8px, 1.3vmin, 14px)',
                minHeight: 'max(44px, clamp(56px, 8.2vmin, 88px))', borderRadius: 18, fontFamily: 'inherit', cursor: 'pointer',
                fontSize: 'clamp(16px, 2.8vmin, 30px)', fontWeight: 600,
                background: b.danger ? 'transparent' : theme.surfaceAlt,
                border: b.danger ? `2px solid color-mix(in srgb, ${theme.isDark ? '#f87171' : '#b91c1c'} 40%, transparent)` : `1px solid ${theme.border}`,
                color: b.danger ? (theme.isDark ? '#f87171' : '#b91c1c') : theme.text,
              }}
            >
              {b.icon}{b.label}
            </button>
          ))}
        </div>
      )}

      {/* Close keeps its own row under Change and Remove, so a tap meant for
          Close can never land on Remove. */}
      {!asking && <button
        type="button"
        {...wallPressProps}
        onClick={onClose}
        style={{
          display: 'block',
          width: '100%',
          marginTop: actions ? 16 : 'clamp(24px, 4vmin, 44px)',
          background: theme.surfaceAlt,
          border: `1px solid ${theme.border}`,
          color: theme.text,
          fontSize: 'clamp(16px, 2.8vmin, 30px)',
          fontWeight: 600,
          fontFamily: 'inherit',
          padding: 'clamp(14px, 2.4vmin, 26px) 0',
          borderRadius: 18,
          textAlign: 'center',
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        {t('event-detail.close')}
      </button>}
    </div>
  );

  return (
    <WallOverlay
      label={event.title}
      onClose={onClose}
      autoCloseMs={EVENT_DETAIL_AUTO_DISMISS_MS}
      scrim={theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)'}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      <WallSheetPanel variant={variant} theme={theme} data-detail-style={variant}>
        {body}
      </WallSheetPanel>
    </WallOverlay>
  );
}
