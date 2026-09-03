'use client';

import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { describeSchedule } from '@/lib/schedule-summary';

import {
  computeWeekSegments,
  subtractRanges,
  MINUTES_PER_DAY,
  type WeekSegment,
} from '@/lib/schedule-timeline';
import type { ModuleSchedule, TimeFormat } from '@/types/config';

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const HOUR_TICKS = [0, 6, 12, 18, 0];
/** Row height plus its bottom margin, used to map a drag's Y to a day row. */
const ROW_PITCH = 21;
const SNAP_MINUTES = 15;
const WEEK_MINUTES = 7 * MINUTES_PER_DAY;

/** Positive modulo; `%` keeps the sign of the dividend, which wraps wrongly. */
const mod = (n: number, m: number) => ((n % m) + m) % m;

type Edge = 'start' | 'end';

interface DragState {
  edge: Edge;
  anchorDay: number;
  shape: 'repeat' | 'span';
}

interface ScheduleWeekStripProps {
  schedule: ModuleSchedule;
  timeFormat: TimeFormat | undefined;
  /**
   * A repeating schedule picks any set of days; a span picks the one day it
   * starts on, so its chips behave like radio buttons.
   */
  shape: 'repeat' | 'span';
  /** Toggle a day on or off. The caller enforces "at least one day stays on". */
  onToggleDay: (day: number) => void;
  /** Commit a dragged edge. `endDayOffset` is only sent for a span. */
  onDragEdge: (patch: { startTime?: string; endTime?: string; endDayOffset?: number }) => void;
}

const pct = (min: number) => `${(min / MINUTES_PER_DAY) * 100}%`;

const toClock = (min: number) => {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, min));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * The week as a picture: seven 24-hour tracks with the module's lit stretches
 * drawn on them, each day's chip in the gutter of the row it controls, and a
 * drag handle on each end of a stretch.
 *
 * This is the whole of the schedule editor's explanation. It replaced a summary
 * sentence and a separate row of day chips, both of which described an
 * overnight window as "4:00 PM to 8:00 AM" and left users to guess which day it
 * ended on. Three rules carry it:
 *
 *  - A squared-off band end means the stretch continues onto the next row; a
 *    rounded end means it stops. Same convention as a wrapped line of text.
 *  - Hovering an unpicked day draws a dashed ghost of what picking it would
 *    add, including the spill onto the following morning, so the start-day rule
 *    is demonstrated before the click rather than explained after it.
 *  - Dragging an end sets the stretch's length, capped at 24 hours for a
 *    repeating window and a week for a span, so a repeating schedule can never
 *    be dragged far enough for two picked days to light the same hour.
 *
 * The bands come from the display's own `isModuleVisible` (see
 * `computeWeekSegments`), so the picture cannot disagree with the wall.
 */
export default function ScheduleWeekStrip({
  schedule,
  timeFormat,
  shape,
  onToggleDay,
  onDragEdge,
}: ScheduleWeekStripProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);

  // date-fns backed; re-deriving on every unrelated parent render is wasted work.
  const shortDays = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'short'),
    [formattingLocale],
  );
  const fullDays = useMemo(
    () => getLocalizedDayNames(formattingLocale, 'full'),
    [formattingLocale],
  );

  const inverted = !!schedule.invert;
  /** When the module is actually on. Solid bands. */
  const segments = useMemo(() => computeWeekSegments(schedule), [schedule]);
  /**
   * The window the times and days describe. Same thing as `segments` normally,
   * but under `invert` the solid bands are its complement, so the window has to
   * be drawn separately: it is what the grips edit, and without it the panel
   * shows a picked day whose row is dark and looks broken.
   */
  const windowSegments = useMemo(
    () => (inverted ? computeWeekSegments({ ...schedule, invert: undefined }) : segments),
    [inverted, schedule, segments],
  );
  const selectedDays = schedule.daysOfWeek ?? EVERY_DAY;

  // The drag listeners live for many renders; they read the current schedule
  // through this rather than closing over the one at pointerdown.
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  /**
   * What hovering an unpicked chip would add: the segments of the schedule as
   * it would be, minus the ones already lit. Computed off the real predicate
   * rather than assumed, so it stays correct under `invert`, where adding a day
   * takes light away and the preview is correctly empty.
   */
  const ghosts = useMemo(() => {
    if (hoverDay === null || dragging || selectedDays.includes(hoverDay)) return [];
    const next = computeWeekSegments({
      ...schedule,
      // A span moves its one start day; a repeating schedule adds another.
      daysOfWeek:
        shape === 'span' ? [hoverDay] : [...selectedDays, hoverDay].sort((a, b) => a - b),
    });
    const out: WeekSegment[] = [];
    for (const seg of next) {
      for (const part of subtractRanges(seg, segments.filter((s) => s.day === seg.day))) {
        out.push({ ...seg, ...part });
      }
    }
    return out;
  }, [hoverDay, dragging, schedule, segments, selectedDays, shape]);

  /** Pointer position → the day row and the snapped minute under it. */
  const pointToSlot = useCallback((clientX: number, clientY: number) => {
    const box = rowsRef.current?.getBoundingClientRect();
    if (!box) return null;
    const day = Math.max(0, Math.min(6, Math.floor((clientY - box.top) / ROW_PITCH)));
    // Tracks are inset by the chip gutter; measure against a track, not the row.
    const track = rowsRef.current?.querySelector('[data-track]')?.getBoundingClientRect();
    if (!track || track.width === 0) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - track.left) / track.width));
    const minute = Math.round((ratio * MINUTES_PER_DAY) / SNAP_MINUTES) * SNAP_MINUTES;
    return { day, minute };
  }, []);

  const applyDrag = useCallback(
    (state: DragState, clientX: number, clientY: number) => {
      const slot = pointToSlot(clientX, clientY);
      if (!slot) return;

      if (state.edge === 'start') {
        // The start edge only moves along its own row. Letting it change rows
        // would silently repick the day, which is the chips' job.
        onDragEdge({ startTime: toClock(slot.minute) });
        return;
      }

      // Read through a ref: the listeners below outlive several renders.
      const live = scheduleRef.current;
      const start = clockToMinutes(live.startTime ?? '') ?? 0;

      // Drag the end as a length, not as a position, so it can never land
      // before its own start and the wrap past Saturday needs no special case.
      // A repeating window tops out at 24 hours, which is what stops two picked
      // days ever lighting the same hour; a span may run the week.
      //
      // Rows disambiguate direction. Measured purely as a distance around the
      // week, "a little before the start" and "days after it" both come out
      // large, and a small leftward nudge would snap to a full day.
      const startAbs = state.anchorDay * MINUTES_PER_DAY + start;
      const dayDelta = mod(slot.day - state.anchorDay, 7);
      const minuteDelta = slot.minute - start;
      const ceiling = state.shape === 'span' ? WEEK_MINUTES : MINUTES_PER_DAY;
      const length = Math.min(
        Math.max(
          dayDelta === 0 && minuteDelta <= 0
            ? SNAP_MINUTES // dragged back onto or behind its own start
            : dayDelta * MINUTES_PER_DAY + minuteDelta,
          SNAP_MINUTES,
        ),
        ceiling,
      );

      const endAbs = startAbs + length;
      onDragEdge({
        endTime: toClock(endAbs % MINUTES_PER_DAY),
        // A repeating window carries no explicit offset: an end earlier than
        // its start already means the next morning, everywhere.
        endDayOffset:
          state.shape === 'span'
            ? mod(Math.floor(endAbs / MINUTES_PER_DAY) - state.anchorDay, 7)
            : undefined,
      });
    },
    [onDragEdge, pointToSlot],
  );

  /**
   * Listeners go on the window, not the grip. Each pointermove rewrites the
   * schedule, which re-renders the strip and can unmount the very element the
   * drag started on, taking element-bound listeners and any pointer capture
   * with it. The window outlives the bands.
   */
  const startDrag = (edge: Edge, seg: WeekSegment) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const state: DragState = { edge, anchorDay: seg.closingAnchorDay ?? seg.day, shape };
    setDragging(state);
    const move = (ev: PointerEvent) => applyDrag(state, ev.clientX, ev.clientY);
    const up = () => {
      setDragging(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // 12 AM / 6 AM / 12 PM / 6 PM / 12 AM in en-US; 24-hour locales vary by Intl
  // data. The final tick reuses hour 0, meaning midnight of the next day.
  const hourLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(formattingLocale, { hour: 'numeric' });
    return HOUR_TICKS.map((h) => fmt.format(new Date(2000, 0, 1, h)));
  }, [formattingLocale]);

  // The strip is the only description of the schedule on screen, and a bar
  // chart says nothing to a screen reader. `describeSchedule` already produces
  // the sentence this used to show, so it moves here rather than being deleted.
  const spokenSummary = useMemo(
    () => describeSchedule(schedule, t, formattingLocale, timeFormat).sentence,
    [schedule, t, formattingLocale, timeFormat],
  );

  const VARIANT_CLASS = {
    solid: 'bg-hs-accent',
    ghost: 'border border-dashed border-hs-accent-hover/65 bg-hs-accent/20',
    window: 'border border-dashed border-hs-text-faint',
  } as const;

  const band = (
    seg: WeekSegment,
    variant: 'solid' | 'ghost' | 'window',
    grips: boolean,
    key: string,
  ) => (
    <span
      key={key}
      aria-hidden="true"
      data-testid={variant === 'ghost' ? 'schedule-ghost' : variant === 'window' ? 'schedule-window' : 'schedule-band'}
      className={`absolute inset-y-0 rounded-full ${VARIANT_CLASS[variant]} ${
        seg.continuesFromPrev ? 'rounded-l-none' : ''
      } ${seg.continuesToNext ? 'rounded-r-none' : ''}`}
      style={{ left: pct(seg.startMin), width: pct(seg.endMin - seg.startMin) }}
    >
      {/* Grips sit only on the real ends of a stretch, and only on the window
          the times describe. A squared-off end is a continuation with nothing
          to grab, and an inverted schedule's solid bands are the complement of
          the window, so a handle on one would edit nothing the user is holding. */}
      {grips && !seg.continuesFromPrev && grip('start', seg)}
      {grips && !seg.continuesToNext && grip('end', seg)}
    </span>
  );

  const grip = (edge: Edge, seg: WeekSegment) => (
    <span
      role="presentation"
      data-testid={`schedule-grip-${edge}`}
      onPointerDown={startDrag(edge, seg)}
      className={`absolute inset-y-0 w-2 cursor-ew-resize touch-none ${
        edge === 'start' ? '-left-0.5' : '-right-0.5'
      }`}
    >
      <span className="absolute inset-y-[3px] left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-white/80" />
    </span>
  );

  return (
    <div data-testid="schedule-week-strip" className={dragging ? 'select-none' : undefined}>
      <p className="sr-only">{spokenSummary}</p>

      <div ref={rowsRef} role={shape === 'span' ? 'radiogroup' : undefined}>
        {EVERY_DAY.map((day) => {
          const picked = selectedDays.includes(day);
          return (
            <div key={day} className="flex items-center gap-2 mb-[3px]">
              <button
                type="button"
                // A span has one start day, so its chips are radios; a
                // repeating schedule's are independent switches.
                role={shape === 'span' ? 'radio' : 'switch'}
                aria-checked={picked}
                aria-label={fullDays[day]}
                data-testid={`schedule-day-${day}`}
                onClick={() => onToggleDay(day)}
                onMouseEnter={() => setHoverDay(day)}
                onMouseLeave={() => setHoverDay((d) => (d === day ? null : d))}
                onFocus={() => setHoverDay(day)}
                onBlur={() => setHoverDay((d) => (d === day ? null : d))}
                className={`w-[34px] shrink-0 h-[18px] leading-[18px] text-center text-[10px] rounded transition-colors ${
                  picked
                    ? 'bg-hs-accent text-white font-semibold'
                    : 'bg-hs-card text-hs-text-faint hover:bg-hs-hover hover:text-hs-text-secondary'
                }`}
              >
                {shortDays[day]}
              </button>
              {/* No overflow-hidden: a clipped rounded track would quietly round
                  off the square band ends that carry the "continues" signal. */}
              <div
                data-track
                data-testid={`schedule-track-${day}`}
                className="relative flex-1 h-[18px] rounded-sm bg-hs-card"
              >
                {ghosts.filter((s) => s.day === day).map((s, i) => band(s, 'ghost', false, `g${i}`))}
                {segments
                  .filter((s) => s.day === day)
                  .map((s, i) => band(s, 'solid', !inverted, `s${i}`))}
                {inverted &&
                  windowSegments
                    .filter((s) => s.day === day)
                    .map((s, i) => band(s, 'window', true, `w${i}`))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="flex justify-between text-[9px] text-hs-text-faint mt-1 ml-[42px]"
        aria-hidden="true"
      >
        {hourLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function clockToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
