'use client';

import { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { parseEventDate } from '@/lib/calendar-utils';

// ─── Utilities ───

/** Convert an ISO date string to fractional hours (e.g. 14:30 → 14.5). */
export function parseTimeToHours(dateStr: string): number {
  const d = parseEventDate(dateStr);
  return d.getHours() + d.getMinutes() / 60;
}

/** Format an hour number (0-23) as a 12-hour label (e.g. 0 → "12 AM", 13 → "1 PM"). */
export function formatHourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
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
}

/** Accent-colored horizontal line showing the current time, with a circle bullet on the left. */
export function NowLine({ nowY, now }: NowLineProps) {
  return (
    <div
      aria-label={`Current time: ${format(now, 'h:mm a')}`}
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
  timeFormat?: string;
}

/** Small pill badge showing the current time, positioned in the time gutter. */
export function NowBadge({ nowY, now, scale, fontSize, position, timeFormat = 'h:mm' }: NowBadgeProps) {
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
      {format(now, timeFormat)}
    </div>
  );
}
