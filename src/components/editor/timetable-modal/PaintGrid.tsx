'use client';

/**
 * The week as a grid you paint: the school's bell rows down the side, Monday
 * to Friday across, one cell per period.
 *
 * Pointer down paints the cell under the pointer and keeps painting the cells
 * the pointer moves across, so a run of Sport is one drag rather than six
 * clicks. Arrow keys move between cells and Space or Enter paints, so the same
 * grid is usable without a mouse.
 *
 * Which cell the pointer is over is the browser's own answer (`pointerenter`
 * on the cell), never row-height arithmetic. A grid whose rows are different
 * heights, and whose break bands sit between them, cannot be divided into even
 * steps, and a hit test that tries lands one row off as soon as a school has a
 * second break.
 *
 * The grid always shows single periods. Two periods of the same subject in a
 * row are one block on the wall, but merging them here would take away the
 * only place a single period of it can be painted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { formatClockTime } from '@/lib/clock-time';
import { useEditorStore } from '@/stores/editor-store';
import { addDays, dateInZone, mondayOf } from '@/lib/timetable-layout';
import {
  DAY_KEYS,
  type DayKey,
  type TimetableCell,
  type TimetableSchool,
  type TimetableSlot,
  type TimetableSubject,
  type TimetableWeek,
  type WeekLetter,
} from '@/types/timetables';
import CellDetails, { type CellDetailsHandlers } from './CellDetails';
import { SubjectIcon, subjectTint } from './SubjectPalette';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';

interface PaintGridProps {
  school: TimetableSchool;
  week: TimetableWeek;
  /** The other week, when this person has two, drawn under a cell that differs. */
  otherWeek?: TimetableWeek;
  otherLetter?: WeekLetter;
  subjects: readonly TimetableSubject[];
  showIcons?: boolean;
  onPaint: (day: DayKey, period: number) => void;
  /**
   * Where the room and the course group a cell's pencil writes go. Left out,
   * no pencil is drawn: a grid whose owner cannot save details has no
   * business collecting them.
   */
  details?: CellDetailsHandlers;
}

/** What two cells have to agree on to count as the same lesson. */
function cellKey(cell: TimetableCell | undefined): string {
  if (!cell) return 'free';
  if ('lunch' in cell) return 'lunch';
  return `${cell.subjectId}|${cell.course ?? ''}`;
}

export default function PaintGrid({
  school,
  week,
  otherWeek,
  otherLetter,
  subjects,
  showIcons,
  onPaint,
  details,
}: PaintGridProps) {
  const t = useTranslate('editor');
  // Bell times are stored as 24-hour strings and were printed as stored, so a
  // household on a 12-hour clock read its own schedule in a format it uses
  // nowhere else, next to native time pickers showing the other one.
  const timeFormat = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings.timeFormat));
  const clock = (time: string) => formatClockTime(time, timeFormat);
  const tModules = useTranslate('modules');
  const locale = useFormattingLocale();

  const byId = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const periods = useMemo(
    () => school.slots.filter((slot): slot is Extract<TimetableSlot, { kind: 'period' }> => slot.kind === 'period'),
    [school.slots],
  );

  // The day names are this week's, so they read the way a calendar does; only
  // the weekday is drawn, never the date, because a timetable is every week.
  const dayNames = useMemo(() => {
    const monday = mondayOf(dateInZone(new Date()));
    return DAY_KEYS.map((_, index) => formatDateSync(new Date(`${addDays(monday, index)}T12:00:00`), 'EEEE', { locale }));
  }, [locale]);

  const [focus, setFocus] = useState({ day: 0, period: 0 });
  // The pencil's own position at the moment it was pressed, because the
  // popover is placed against it and the grid it sits in scrolls.
  const [editing, setEditing] = useState<{ day: DayKey; period: number; anchor: { bottom: number; left: number } } | null>(
    null,
  );
  const cells = useRef(new Map<string, HTMLButtonElement | null>());
  const painting = useRef(false);
  const lastPainted = useRef<string | null>(null);

  const focusDay = Math.min(focus.day, DAY_KEYS.length - 1);
  const focusPeriod = Math.min(focus.period, Math.max(periods.length - 1, 0));

  const paint = useCallback(
    (day: DayKey, period: number, again: boolean) => {
      const key = `${day}:${period}`;
      if (!again && lastPainted.current === key) return;
      lastPainted.current = key;
      onPaint(day, period);
    },
    [onPaint],
  );

  const stop = useCallback(() => {
    painting.current = false;
    lastPainted.current = null;
  }, []);

  // The drag outlives the cell it started on, so the end of it is watched on
  // the window: a pointer released over the palette still ends the stroke.
  useEffect(() => {
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [stop]);

  // The lesson the popover is open on, read back out of the week on every
  // render rather than copied when it opened: a stroke that lands underneath
  // it has to change what it is editing, not leave it writing to a lesson
  // that is no longer there.
  const openCell = editing ? week[editing.day]?.[editing.period] : undefined;
  const openLesson = openCell && 'subjectId' in openCell ? openCell : undefined;
  const openSubject = openLesson ? byId.get(openLesson.subjectId) : undefined;

  const moveFocus = (dayStep: number, periodStep: number) => {
    const day = Math.max(0, Math.min(DAY_KEYS.length - 1, focusDay + dayStep));
    const period = Math.max(0, Math.min(periods.length - 1, focusPeriod + periodStep));
    setFocus({ day, period });
    cells.current.get(`${DAY_KEYS[day]}:${periods[period]?.n}`)?.focus();
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
      <div
        className="grid min-h-full gap-x-[5px] gap-y-1"
        style={{
          gridTemplateColumns: '96px repeat(5, minmax(0, 1fr))',
          gridTemplateRows: ['auto', ...school.slots.map((slot) => (slot.kind === 'period' ? 'minmax(2.25rem, 1fr)' : '14px'))].join(' '),
        }}
      >
        <div aria-hidden="true" />
        {dayNames.map((name) => (
          <div key={name} className="text-center text-xs font-semibold text-hs-text-muted">
            {name}
          </div>
        ))}

        {school.slots.map((slot) => {
          if (slot.kind === 'break') {
            return (
              <div
                key={`break-${slot.start}`}
                style={{ gridColumn: '1 / -1' }}
                className="flex items-center gap-2 text-[10.5px] text-hs-text-faint"
              >
                <span className="tabular-nums">{`${slot.label} ${clock(slot.start)}–${clock(slot.end)}`}</span>
                <span className="flex-1 border-t border-dashed border-hs-border" />
              </div>
            );
          }

          const periodIndex = periods.findIndex((period) => period.n === slot.n);
          return [
            <div key={`gutter-${slot.n}`} className="flex items-baseline justify-end gap-1.5 pr-1">
              <b className="text-[13px] text-hs-text-body">{slot.n}</b>
              <span className="text-[11.5px] tabular-nums text-hs-text-faint">{`${clock(slot.start)}–${clock(slot.end)}`}</span>
            </div>,
            ...DAY_KEYS.map((day, dayIndex) => {
              const cell = week[day]?.[slot.n];
              const other = otherWeek?.[day]?.[slot.n];
              const differs = otherWeek !== undefined && cellKey(cell) !== cellKey(other);
              const subject = cell && 'subjectId' in cell ? byId.get(cell.subjectId) : undefined;
              const otherSubject = other && 'subjectId' in other ? byId.get(other.subjectId) : undefined;
              const lunch = cell !== undefined && 'lunch' in cell;

              const content = subject
                ? subject.name
                : lunch
                  ? tModules('timetable.lunch')
                  : tModules('timetable.free');
              const focused = dayIndex === focusDay && periodIndex === focusPeriod;
              const where = t('timetableModal.grid.cellAria', { day: dayNames[dayIndex], number: slot.n });
              /**
               * What this period is in the other week, when the two disagree.
               * The cell has room for the short code only, so the full lesson
               * goes into the cell's own name and its tooltip: a bare "B: Sp"
               * told a reader nothing about what it was, and told a screen
               * reader nothing at all, so the weeks looked identical to anyone
               * who could not see the line.
               */
              const otherLesson =
                differs && otherLetter
                  ? {
                      letter: otherLetter,
                      code: otherSubject ? otherSubject.code : other ? tModules('timetable.lunch') : '–',
                      full: otherSubject
                        ? otherSubject.name || otherSubject.code
                        : other
                          ? tModules('timetable.lunch')
                          : tModules('timetable.free'),
                    }
                  : null;
              // One sentence rather than two unrelated fragments: the week the
              // cell is not showing is read out as part of the cell.
              const cellName = otherLesson
                ? `${where}, ${content}, ${t('timetableModal.grid.otherWeek', {
                    letter: otherLesson.letter,
                    lesson: otherLesson.full,
                  })}`
                : `${where}, ${content}`;
              // A lesson that already carries a room or a course keeps its pencil
              // on show, so what is there is never hidden behind a hover.
              const hasDetails = cell !== undefined && 'subjectId' in cell && Boolean(cell.room || cell.course);

              return (
                <div key={`${day}-${slot.n}`} className="group relative">
                  <button
                    ref={(element) => {
                      cells.current.set(`${day}:${slot.n}`, element);
                    }}
                    type="button"
                    data-day={day}
                    data-period={slot.n}
                    tabIndex={focused ? 0 : -1}
                    aria-label={cellName}
                    // Only where there is something the cell cannot say in the
                    // space it has, so a grid of ordinary lessons is not a
                    // field of tooltips.
                    title={otherLesson ? cellName : undefined}
                    onPointerDown={(event) => {
                      if (event.button > 0) return;
                      // Touch gives the first element the pointer, which would
                      // keep every later event on it and paint one cell however
                      // far the finger travelled.
                      const target = event.currentTarget;
                      if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
                      painting.current = true;
                      lastPainted.current = null;
                      setFocus({ day: dayIndex, period: periodIndex });
                      paint(day, slot.n, true);
                    }}
                    onPointerEnter={() => {
                      if (painting.current) paint(day, slot.n, false);
                    }}
                    // A finger that never leaves the grid fires no enter event
                    // on the cell it lands in once capture has been released,
                    // so the move is watched as well. Painting the same cell
                    // twice is not a second edit, so the two cannot fight.
                    onPointerMove={() => {
                      if (painting.current) paint(day, slot.n, false);
                    }}
                    onKeyDown={(event) => {
                      const steps: Record<string, [number, number]> = {
                        ArrowRight: [1, 0],
                        ArrowLeft: [-1, 0],
                        ArrowDown: [0, 1],
                        ArrowUp: [0, -1],
                      };
                      const step = steps[event.key];
                      if (step) {
                        event.preventDefault();
                        moveFocus(step[0], step[1]);
                        return;
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        paint(day, slot.n, true);
                      }
                    }}
                    className={`flex h-full w-full touch-none flex-col items-center justify-center rounded-md px-1 text-center text-[13px] font-semibold transition-colors ${
                      subject
                        ? 'text-hs-text-primary'
                        : lunch
                          ? 'bg-hs-card text-[11px] font-normal text-hs-text-muted'
                          : 'text-hs-text-faint hover:bg-hs-hover'
                    }`}
                    style={
                      subject
                        ? subjectTint(subject.color, 28)
                        : lunch
                          ? undefined
                          : { boxShadow: 'inset 0 0 0 1px var(--color-hs-border)' }
                    }
                  >
                    {subject ? (
                      <span className="flex items-center gap-1">
                        {showIcons && <SubjectIcon name={subject.icon} className="h-3 w-3" />}
                        {subject.code}
                      </span>
                    ) : lunch ? (
                      tModules('timetable.lunch')
                    ) : (
                      <Plus className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                    )}
                    {cell && 'subjectId' in cell && cell.room && (
                      <small className="max-w-full truncate text-[10px] font-normal opacity-80">{cell.room}</small>
                    )}
                    {cell && 'subjectId' in cell && cell.course && (
                      <small className="text-[10px] font-normal opacity-80">{cell.course}</small>
                    )}
                    {otherLesson && (
                      // 12px, the size the day headings are set at, rather than
                      // the 10px of the room and the course beside it: this is
                      // the only line in the cell a household has to read to
                      // know the two weeks differ. Not the 13px of the lesson
                      // code, which would read as a second lesson in the cell.
                      <small className="text-[12px] font-normal text-hs-text-muted">
                        {`${otherLesson.letter}: ${otherLesson.code}`}
                      </small>
                    )}
                  </button>
                  {details && subject && (
                    // Out of the tab order unless this is the focused cell: the grid
                    // hands focus to one cell at a time and its pencil comes next,
                    // rather than every lesson in the week adding a stop.
                    <button
                      type="button"
                      tabIndex={focused ? 0 : -1}
                      aria-label={`${t('timetableModal.cell.edit', { subject: subject.name || subject.code })}, ${where}`}
                      onPointerDown={(event) => {
                        // The press that opens the editor is not a brush stroke, and
                        // the surface under it paints on pointer down.
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        // The cell the arrow keys walk from follows the pencil that
                        // was pressed, so closing the editor leaves the keyboard
                        // where the eye already is.
                        setFocus({ day: dayIndex, period: periodIndex });
                        setEditing({ day, period: slot.n, anchor: { bottom: rect.bottom, left: rect.left } });
                      }}
                      className={`absolute bottom-1 right-1 flex h-[17px] w-[17px] items-center justify-center rounded-[5px] bg-hs-panel/85 text-hs-text-body transition-opacity hover:text-hs-text-primary focus-visible:opacity-100 ${
                        hasDetails
                          ? 'opacity-70 group-hover:opacity-100'
                          : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                      }`}
                    >
                      <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            }),
          ];
        })}
      </div>

      {details && editing && openLesson && openSubject && (
        <CellDetails
          key={`${editing.day}:${editing.period}`}
          subject={openSubject}
          where={t('timetableModal.grid.cellAria', {
            day: dayNames[DAY_KEYS.indexOf(editing.day)],
            number: editing.period,
          })}
          room={openLesson.room ?? ''}
          course={openLesson.course ?? ''}
          anchor={editing.anchor}
          onSave={(patch) => details.onCell(editing.day, editing.period, patch)}
          onCopyToSubject={(patch) => details.onSubject(openSubject.id, patch)}
          onClose={() => {
            const lesson = cells.current.get(`${editing.day}:${editing.period}`);
            setEditing(null);
            lesson?.focus();
          }}
        />
      )}
    </div>
  );
}
