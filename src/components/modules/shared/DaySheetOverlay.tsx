'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { formatEventTime, isZeroLengthEvent } from '@/lib/calendar-utils';
import { daySheetHeading, daySheetRows, type DaySheetRow } from '@/lib/calendar-day-sheet';
import { eventGlyph } from '@/lib/calendar-rules';
import { useInteractionHold } from '@/lib/interaction-hold';
import { useSettledTap } from '@/hooks/useSheetTapGuard';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { GlyphPrefix } from '@/components/ui/Glyph';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { CalendarEvent, EventTapStyle, TimeFormat } from '@/types/config';
import { EVENT_DETAIL_AUTO_DISMISS_MS } from './EventDetailOverlay';

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
  onClose: () => void;
}

/**
 * Every event on one day, opened from a calendar grid's "+N more" or day
 * number. It copies the event detail's look (grabber, accent stripe, small
 * capitals over a serif heading, a full-width Close) and its behaviour: it
 * portals to the body with viewport-relative sizes, holds the screen while
 * open, and closes itself after the same 45 seconds, counted from the last
 * touch and not while an event's detail is open over it. A row opens that
 * event's detail on top; closing the detail comes back here.
 */
export function DaySheetOverlay({ date, events, variant, theme, accentColor, colorFor, timeFormat, timezone, paused, onOpenEvent, onClose }: DaySheetOverlayProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  useInteractionHold();

  // onClose lives in a ref so parent re-renders (the clock tick) never reset
  // the countdown; a touch on the sheet, or coming back from a detail, does.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [touches, setTouches] = useState(0);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onCloseRef.current(), EVENT_DETAIL_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [paused, touches]);
  // The second tap of a double tap on the day lands on the scrim, which must
  // not close the sheet it just opened.
  const settled = useSettledTap();

  if (typeof document === 'undefined') return null;

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
            {allDay ? t('calendar.allDay') : time(start, startsEarlier)}
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
              <span aria-hidden="true" style={{ width: len(12, 7), height: len(12, 7), borderRadius: '50%', background: color, flexShrink: 0 }} />
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
        {heading.weekday} · {t('calendar.daySheet.eventCount', { count: rows.length })}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: len(12, 6) }}>
        {rows.map(row)}
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          display: 'block',
          width: '100%',
          marginTop: len(26, 14),
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
  );

  const panelStyle: React.CSSProperties = variant === 'sheet'
    ? {
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 0,
        width: 'min(100%, 900px)',
        maxHeight: '88vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        background: theme.surface,
        borderRadius: 'min(36px, 5vmin) min(36px, 5vmin) 0 0',
        boxShadow: '0 -16px 60px rgba(0,0,0,0.35)',
        cursor: 'default',
        animation: 'ds-sheet-in 250ms ease-out',
      }
    : {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(calc(100% - 10vmin), 900px)',
        maxHeight: '88vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        background: theme.surface,
        borderRadius: 'min(28px, 4vmin)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        cursor: 'default',
        animation: 'ds-card-in 250ms ease-out',
      };

  const overlay = (
    <div
      role="dialog"
      aria-label={heading.full}
      className="ds-overlay"
      onClick={settled(onClose)}
      onPointerDown={() => setTouches((n) => n + 1)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: DISPLAY_LAYERS.moduleOverlay,
        // Plain scrim, no backdrop blur: see EventDetailOverlay.
        background: theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)',
        cursor: 'pointer',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        lineHeight: 1.5,
        animation: 'ds-scrim-in 200ms ease-out',
        '--ds-u': 'min(1vw, 0.7vh)',
      } as React.CSSProperties}
    >
      <style>{`
        @keyframes ds-scrim-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ds-sheet-in { from { transform: translate(-50%, 10%); opacity: 0.4; } to { transform: translate(-50%, 0); opacity: 1; } }
        @keyframes ds-card-in { from { transform: translate(-50%, -50%) scale(0.95); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
        .ds-panel::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .ds-overlay, .ds-overlay * { animation: none !important; }
        }
      `}</style>
      <div className="ds-panel" style={panelStyle} data-day-sheet-style={variant} onClick={(e) => e.stopPropagation()}>
        {variant === 'sheet' && (
          <div style={{ padding: 'clamp(12px, 2vmin, 22px) 0 6px' }}>
            <div style={{ width: 'min(96px, 12vmin)', height: 10, borderRadius: 5, background: theme.border, margin: '0 auto' }} />
          </div>
        )}
        {body}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
