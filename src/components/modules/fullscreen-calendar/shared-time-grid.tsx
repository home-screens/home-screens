'use client';

import { useElementBox } from '@/hooks/useElementBox';
import { formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import type { TimedEventLayout } from '@/lib/calendar-event-layout';
import { eventOwner, type EventOwner } from '@/lib/calendar-people';
import { eventGlyph } from '@/lib/calendar-rules';
import { eventEndLabel, formatEventTime, parseEventWallTime } from '@/lib/calendar-utils';
import type { CalendarEvent, TimeFormat } from '@/types/config';
import { eventAriaLabel } from './list-view-bits';
import type { openDayProps } from '../shared/useDaySheet';

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

/**
 * Where a timed event's block sits in an hour grid, and what it says: the
 * part the Schedule and the Day timeline work out the same way. Null for an
 * event the grid does not draw: outside the visible hours, or hidden behind
 * the "+N" of a side-by-side layout. Each view keeps its own block (insets,
 * type sizes, what it lists under the title) and its own idea of "past".
 */
export function timedBlockModel(ev: CalendarEvent, grid: Pick<TimedEventLayout, 'hourSpans' | 'overlapLayout'> & {
  hourStart: number;
  hourHeight: number;
  /** The least a block is drawn at, px, so a short event keeps its title. */
  minHeight: number;
  owners?: ReadonlyMap<string, EventOwner>;
  timezone?: string;
  timeFormat: TimeFormat;
  locale: string;
  t: TranslateFn;
}) {
  // Absent span = outside the visible hour window (dropped by
  // computeTimedEventLayout's clamp-and-filter).
  const span = grid.hourSpans.get(ev.id);
  if (!span) return null;
  const layout = grid.overlapLayout.get(ev.id);
  if (!layout || layout.width === 0) return null; // behind the "+N"
  const startAt = parseEventWallTime(ev.start, grid.timezone);
  const startLabel = formatEventTime(startAt, grid.timeFormat, grid.locale);
  const endLabel = eventEndLabel(startAt, parseEventWallTime(ev.end, grid.timezone), grid.timeFormat, grid.locale);
  return {
    layout,
    top: (span.startHour - grid.hourStart) * grid.hourHeight,
    height: Math.max((span.endHour - span.startHour) * grid.hourHeight, grid.minHeight),
    /** The hour the event ends on this day, for the caller's "already over" test. */
    endHour: span.endHour,
    color: ev.calendarColor ?? DEFAULT_EVENT_COLOR,
    glyph: eventGlyph(ev),
    owner: eventOwner(ev, grid.owners),
    startLabel,
    endLabel,
    ariaLabel: eventAriaLabel(grid.t, ev, { startLabel, endLabel }),
  };
}

// ─── Hooks ───

/**
 * Content height of the scrollable container, used to size the time grid so it
 * fills the space without scrolling.
 *
 * Built on `useElementBox`, whose callback ref follows the element. The hand
 * rolled version attached a RefObject inside a mount effect with an empty
 * dependency list — the exact shape that pinned every weather view to 16px
 * (c8a8ad6f): the effect runs once, and an element that first appears on a
 * later render is never observed. These four views happen to mount their box
 * unconditionally, so it was latent rather than broken; one conditional
 * wrapper would have made it real.
 *
 * `'content'` is deliberate. The old code seeded from `clientHeight` (padding
 * box) and then updated from `contentRect.height` (content box), so the content
 * box is the steady state these grids are tuned against. `'padding'` would add
 * each box's padding to every hour row and month cell.
 */
export function useContainerHeight() {
  const [scrollRef, box] = useElementBox<HTMLDivElement>('content');
  return { scrollRef, containerH: box.height };
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

/**
 * The hour labels down the side of a time grid. The two grids set them a
 * little differently (size, weight, how far from the grid), so those are the
 * caller's; `highlightHour` marks the hour it is now, where a view does that.
 */
export function HourGutter({ hourStart, totalHours, hourHeight, fontSize, weight, inset, highlightHour, timeFormat, am, pm }: {
  hourStart: number;
  totalHours: number;
  hourHeight: number;
  /** The labels' own size, px. */
  fontSize: number;
  weight: number;
  /** Space between the labels and the grid, px. */
  inset: number;
  highlightHour?: number | null;
  timeFormat: TimeFormat;
  am: string;
  pm: string;
}) {
  return (
    <>
      {Array.from({ length: totalHours + 1 }, (_, i) => {
        const h = hourStart + i;
        const current = highlightHour === h;
        return (
          <div
            key={h}
            style={{
              position: 'absolute',
              top: i * hourHeight,
              right: inset,
              fontSize,
              fontWeight: current ? 600 : weight,
              color: current ? 'var(--cal-text-primary)' : 'var(--cal-text-tertiary)',
              transform: hourLabelShift(i, totalHours),
              lineHeight: 1,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatHourLabel(h, timeFormat, am, pm)}
          </div>
        );
      })}
    </>
  );
}

/**
 * "+2" over the hour where a side-by-side layout ran out of room: the events
 * it stands for are not drawn at all. With "Tap an event to see details" on
 * it opens the day (`tap`, from `openDayProps`), in the accent like the
 * grids' "+N more", with room around it for a finger; otherwise it is the
 * quiet count it always was.
 */
export function HiddenCountPill({ count, top, right, fontSize, padding, label, tap, scale }: {
  count: number;
  top: number;
  right: number;
  fontSize: number;
  padding: string;
  /** "+2 more", for a screen reader when the pill is only a count. */
  label: string;
  tap: ReturnType<typeof openDayProps>;
  scale: { bu: number };
}) {
  const pill = {
    fontSize,
    fontWeight: 600,
    borderRadius: 999,
    padding,
  } as const;
  if (!tap) {
    return (
      <div
        aria-label={label}
        style={{
          ...pill,
          position: 'absolute',
          top,
          right,
          zIndex: 3,
          color: 'var(--cal-text-secondary)',
          background: 'var(--cal-surface)',
          border: '1px solid var(--cal-border)',
          pointerEvents: 'none',
        }}
      >
        +{count}
      </div>
    );
  }
  // The button is the pill plus a margin of nothing, so a finger does not
  // have to land on a few millimetres of text.
  const reach = scale.bu * 0.9;
  return (
    <button
      type="button"
      {...tap}
      data-hidden-count=""
      style={{
        position: 'absolute',
        top: top - reach,
        right: right - reach,
        zIndex: 3,
        padding: reach,
        border: 'none',
        background: 'none',
        fontFamily: 'inherit',
        lineHeight: 'inherit',
        cursor: 'pointer',
      }}
    >
      {/* The tint over the surface the plain count had, so the blocks under it do not show through. */}
      <span style={{ ...pill, display: 'block', color: 'var(--cal-accent)', background: 'linear-gradient(var(--cal-accent-bg), var(--cal-accent-bg)), var(--cal-surface)', border: '1px solid var(--cal-accent-surface)' }}>
        +{count}
      </span>
    </button>
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
