'use client';

import { useRef, useState, useEffect } from 'react';
import { formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { TimeFormat } from '@/types/config';

// ─── Utilities ───

/**
 * Format an hour number (0-24) as a gutter/axis label in the household time
 * format: "8 PM" / "20:00". Owns the 24h branch so no call site can forget
 * it. Pass the resolved AM/PM strings from `useTranslate('modules')` so the
 * 12-hour label honors the active locale.
 */
export function formatHourLabel(h: number, timeFormat: TimeFormat, am: string, pm: string): string {
  // 24 is the end-of-day gutter label (an hourEnd of 24), which is midnight.
  const hour = h % 24;
  if (timeFormat === '24h') return `${String(hour).padStart(2, '0')}:00`;
  if (hour === 0) return `12 ${am}`;
  if (hour === 12) return `12 ${pm}`;
  return hour > 12 ? `${hour - 12} ${pm}` : `${hour} ${am}`;
}

/**
 * Vertical offset for an hour-axis label. Labels centre on their hour line,
 * but the first and last lines sit exactly on the grid's clipped edges — the
 * all-day band above, the legend below — so centring there slices the label
 * through the middle. Those two tuck inside the grid instead.
 */
export function hourLabelShift(index: number, lastIndex: number): string {
  if (index === 0) return 'translateY(0)';
  if (index === lastIndex) return 'translateY(-100%)';
  return 'translateY(-50%)';
}

// ─── Hooks ───

/**
 * Measures the content height of a scrollable container via ResizeObserver.
 * Used to size the time grid so it fills the available space without scrolling.
 */
export function useContainerHeight() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerH(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      setContainerH(entries[0]?.contentRect.height ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { scrollRef, containerH };
}

// ─── Components ───

/**
 * Footer strip for a time grid whose hours follow the clock: names the
 * window it is showing and how many of today's events already ended before
 * it opens, so a board that starts at 2 PM never reads as "nothing happened
 * this morning".
 */
export function RollingWindowStrip({ hourStart, hourEnd, hiddenEarlier, fontSize, scale, timeFormat, am, pm, t }: {
  hourStart: number;
  hourEnd: number;
  hiddenEarlier: number;
  fontSize: number;
  scale: { bu: number };
  timeFormat: TimeFormat;
  am: string;
  pm: string;
  t: TranslateFn;
}) {
  const label = (h: number) => formatHourLabel(h, timeFormat, am, pm);
  return (
    <div
      data-rolling-window=""
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: scale.bu * 0.8, flexShrink: 0,
        padding: `${scale.bu * 0.5}px ${scale.bu * 1.5}px`,
        borderTop: '1px solid var(--cal-border-subtle)',
        background: 'var(--cal-surface-alt)',
        fontSize: fontSize * 0.8, color: 'var(--cal-text-secondary)',
      }}
    >
      <span>
        {t('fullscreen-calendar.rollingWindow.showing', { range: `${label(hourStart)} – ${label(hourEnd)}` })}
      </span>
      {hiddenEarlier > 0 && (
        <span style={{ marginLeft: 'auto', color: 'var(--cal-text-tertiary)', whiteSpace: 'nowrap' }}>
          {t('fullscreen-calendar.rollingWindow.earlierToday', { count: hiddenEarlier })}
        </span>
      )}
    </div>
  );
}

interface HourLinesProps {
  totalHours: number;
  hourHeight: number;
  hourStart: number;
  dimOffHours?: { businessStart: number; businessEnd: number };
}

/** Renders hour and half-hour grid lines across a time column. */
export function HourLines({ totalHours, hourHeight, hourStart, dimOffHours }: HourLinesProps) {
  return (
    <>
      {Array.from({ length: totalHours + 1 }, (_, i) => {
        const h = hourStart + i;
        const isOff = dimOffHours && (h < dimOffHours.businessStart || h >= dimOffHours.businessEnd);
        return (
          <div key={`h-${i}`}>
            <div style={{
              position: 'absolute',
              top: i * hourHeight,
              left: 0,
              right: 0,
              height: 1,
              background: 'var(--cal-border)',
              opacity: isOff ? 0.5 : 1,
            }} />
            {i < totalHours && (
              <div style={{
                position: 'absolute',
                top: i * hourHeight + hourHeight / 2,
                left: 0,
                right: 0,
                height: 1,
                borderTop: '1px dashed var(--cal-border-subtle)',
                opacity: isOff ? 0.5 : 1,
              }} />
            )}
          </div>
        );
      })}
    </>
  );
}

interface NowLineProps {
  nowY: number;
  now: Date;
  /** aria-label for the now line, e.g. "Current time: 3:45 PM" — already localized by the caller. */
  ariaLabel: string;
}

/** Accent-colored horizontal line showing the current time, with a circle bullet on the left. */
export function NowLine({ nowY, ariaLabel }: NowLineProps) {
  return (
    <div
      aria-label={ariaLabel}
      style={{
        position: 'absolute',
        top: nowY,
        left: 0,
        right: 0,
        height: 2,
        color: 'var(--cal-accent)',
        background: 'var(--cal-accent)',
        zIndex: 10,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 0 4px currentColor)',
      }}
    >
      <div style={{
        position: 'absolute',
        left: -4,
        top: -3,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: 'var(--cal-accent)',
      }} />
    </div>
  );
}

interface NowBadgeProps {
  nowY: number;
  now: Date;
  scale: { bu: number };
  fontSize: number;
  position: 'left' | 'right';
  /** Household time format; the badge derives its own date-fns pattern from it. */
  timeFormat: TimeFormat;
  /** Active formatting locale tag (e.g. "en-US") — used for the time label. */
  locale: string;
}

/** Small pill badge showing the current time, positioned in the time gutter. */
export function NowBadge({ nowY, now, scale, fontSize, position, timeFormat, locale }: NowBadgeProps) {
  const timePattern = timeFormat === '24h' ? 'HH:mm' : 'h:mm a';
  const posStyle = position === 'right'
    ? { right: scale.bu * 0.3 }
    : { left: scale.bu * 0.5 };
  return (
    <div style={{
      position: 'absolute',
      top: nowY,
      ...posStyle,
      transform: 'translateY(-50%)',
      fontSize: fontSize * 0.7,
      fontWeight: 600,
      color: '#fff',
      background: 'var(--cal-accent)',
      borderRadius: 999,
      padding: `${scale.bu * 0.15}px ${scale.bu * 0.5}px`,
      whiteSpace: 'nowrap',
      zIndex: 11,
      lineHeight: 1.3,
    }}>
      {formatDateSync(now, timePattern, { locale })}
    </div>
  );
}
