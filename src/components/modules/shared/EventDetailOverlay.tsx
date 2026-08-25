'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { Clock, MapPin, CalendarDays } from 'lucide-react';
import { parseEventWallTime, isEventOnDay, formatEventTime, eventKindGlyph, eventKindLabel } from '@/lib/calendar-utils';
import { sanitizeEventDescription } from '@/lib/event-description';
import { useTranslate, useFormattingLocale, formatDateSync, formatRelativeTime } from '@/i18n';
import { useInteractionHold } from '@/lib/interaction-hold';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { DEFAULT_TIME_FORMAT, type CalendarEvent, type EventTapStyle, type TimeFormat } from '@/types/config';

// A kiosk nobody is standing at must not show an event detail forever.
export const EVENT_DETAIL_AUTO_DISMISS_MS = 45_000;

export interface EventTimeText {
  /** "5:30 – 7:00 PM", "All Day", or "All Day · Aug 7 – 9". */
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
  timeFormat: TimeFormat = DEFAULT_TIME_FORMAT,
  timezone?: string,
): EventTimeText {
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
      main += ` · ${formatDateSync(start, 'MMM d', { locale })} – ${formatDateSync(lastDay, 'MMM d', { locale })}`;
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

  const main = `${formatEventTime(start, timeFormat, locale)} – ${formatEventTime(end, timeFormat, locale)}`;
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
  onClose: () => void;
}

/**
 * Tap-to-open event detail for calendar modules. Portals to document.body so
 * it escapes the zoom-scaled ScreenRenderer — which is exactly why every size
 * is viewport-relative (clamp/vmin) rather than raw px: the calendar behind
 * it scales with the configured display, the overlay scales with the actual
 * viewport. The scrim keeps the tapped view visible underneath for context.
 * Sits below the sleep and alert overlays so those still take over the
 * screen.
 *
 * No `data-swipe-ignore` here: swipe navigation is already disabled while the
 * overlay is open (useInteractionHold → ScreenRotator's `enabled` gate), and
 * the attribute's stylesheet side effect would re-enable pinch/double-tap
 * zoom over the overlay on a real touchscreen.
 */
export function EventDetailOverlay({ event, variant, theme, accentColor, timeFormat, timezone, now, onClose }: EventDetailOverlayProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();

  // Pause rotation and swipe navigation while open; the auto-dismiss timer
  // bounds the hold.
  useInteractionHold();

  // onClose lives in a ref so parent re-renders (the 60s clock tick) can
  // never reset the countdown.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), EVENT_DETAIL_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  if (typeof document === 'undefined') return null;

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
        {formatDateSync(start, 'EEEE, MMMM d', { locale })}
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

      <button
        type="button"
        onClick={onClose}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 'clamp(24px, 4vmin, 44px)',
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
        animation: 'fscd-sheet-in 250ms ease-out',
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
        animation: 'fscd-card-in 250ms ease-out',
      };

  const overlay = (
    <div
      role="dialog"
      aria-label={event.title}
      className="fscd-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: DISPLAY_LAYERS.moduleOverlay,
        // No backdrop-filter: a full-viewport blur over content that repaints
        // continuously (the today-pulse animation) forces Chromium to re-blur
        // the whole surface every frame for the overlay's entire lifetime.
        // A slightly stronger plain scrim reads almost identically.
        background: theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)',
        cursor: 'pointer',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        animation: 'fscd-scrim-in 200ms ease-out',
      }}
    >
      <style>{`
        @keyframes fscd-scrim-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fscd-sheet-in { from { transform: translate(-50%, 10%); opacity: 0.4; } to { transform: translate(-50%, 0); opacity: 1; } }
        @keyframes fscd-card-in { from { transform: translate(-50%, -50%) scale(0.95); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
        .fscd-panel::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .fscd-overlay, .fscd-overlay * { animation: none !important; }
        }
      `}</style>
      <div className="fscd-panel" style={panelStyle} data-detail-style={variant}>
        {variant === 'sheet' && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ padding: 'clamp(12px, 2vmin, 22px) 0 6px', cursor: 'default' }}
          >
            <div style={{
              width: 'min(96px, 12vmin)',
              height: 10,
              borderRadius: 5,
              background: theme.border,
              margin: '0 auto',
            }} />
          </div>
        )}
        {body}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
