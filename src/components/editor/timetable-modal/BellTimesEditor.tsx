'use client';

/**
 * One school's bell schedule: the periods, the breaks between them, and the
 * after-school care that runs on after the last one.
 *
 * Lengths are shown, never typed. A period is its two times and nothing else,
 * so "45 minutes" is always the truth about the times beside it rather than a
 * third number that can disagree with them.
 */

import { Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { parseTimeToMinutes } from '@/lib/clock-time';
import { dateInZone } from '@/lib/timetable-layout';
import {
  DAY_KEYS,
  TIMETABLE_LIMITS,
  type TimetableSchool,
  type TimetableSlot,
} from '@/types/timetables';
import NameInput from './NameInput';
import { PROSE_CLASS } from './prose';
import { addIsoDays, mondayOf } from '@/lib/iso-date';

interface BellTimesEditorProps {
  school: TimetableSchool;
  onChange: (change: (school: TimetableSchool) => TimetableSchool) => void;
}

const TIME_CLASS = `${MODAL_INPUT_CLASS} tabular-nums`;

function shift(time: string, minutes: number): string {
  const at = parseTimeToMinutes(time);
  if (at === null) return time;
  const total = (at + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function lengthOf(slot: TimetableSlot): number | null {
  const start = parseTimeToMinutes(slot.start);
  const end = parseTimeToMinutes(slot.end);
  return start === null || end === null ? null : end - start;
}

/**
 * Which rows the store would refuse, and why, in the household's own words.
 *
 * The store checks that every row ends after it starts and that the rows run in
 * time order without overlapping, and refuses the whole document over one that
 * does not. Since the document is one save, a half-typed bell time used to block
 * saving subjects, schools and every other person's week with a message that
 * named no row. The same rules are read here so the offending row says so
 * itself, while it is still the thing somebody is looking at.
 */
function slotProblems(slots: readonly TimetableSlot[], t: (key: string) => string): (string | null)[] {
  let previousEnd = -1;
  return slots.map((slot) => {
    const start = parseTimeToMinutes(slot.start);
    const end = parseTimeToMinutes(slot.end);
    if (start === null || end === null) return t('timetableModal.schools.timeNeeded');
    if (end <= start) {
      previousEnd = end;
      return t('timetableModal.schools.endsBeforeStart');
    }
    const overlaps = start < previousEnd;
    previousEnd = end;
    return overlaps ? t('timetableModal.schools.outOfOrder') : null;
  });
}

export default function BellTimesEditor({ school, onChange }: BellTimesEditorProps) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();

  const setSlot = (index: number, patch: Partial<TimetableSlot>) => {
    onChange((current) => ({
      ...current,
      slots: current.slots.map((slot, at) => (at === index ? ({ ...slot, ...patch } as TimetableSlot) : slot)),
    }));
  };

  const removeSlot = (index: number) => {
    onChange((current) => ({ ...current, slots: current.slots.filter((_, at) => at !== index) }));
  };

  const lastEnd = school.slots[school.slots.length - 1]?.end ?? '08:00';
  const nextNumber = school.slots.reduce((highest, slot) => (slot.kind === 'period' ? Math.max(highest, slot.n) : highest), 0) + 1;
  const full = school.slots.length >= TIMETABLE_LIMITS.maxSlotsPerSchool;

  const addPeriod = () => {
    const start = school.slots.length === 0 ? '08:00' : shift(lastEnd, 5);
    onChange((current) => ({
      ...current,
      slots: [...current.slots, { kind: 'period', n: nextNumber, start, end: shift(start, 45) }],
    }));
  };

  // Named, not blank. A row with no name is thrown away on the next save, so a
  // break added and given its times and then quietly dropped was the one way
  // this editor could lose somebody's work without saying so.
  const addBreak = () => {
    onChange((current) => ({
      ...current,
      slots: [
        ...current.slots,
        { kind: 'break', label: t('timetableModal.schools.breakDefault'), start: lastEnd, end: shift(lastEnd, 15) },
      ],
    }));
  };

  // Care runs per weekday, so each box is named by its own day rather than by
  // a number nobody counts in.
  const monday = mondayOf(dateInZone(new Date()));
  const dayNames = DAY_KEYS.map((_, index) =>
    formatDateSync(new Date(`${addIsoDays(monday, index)}T12:00:00`), 'EEEEEE', { locale }),
  );

  // Care with no name goes the same way a nameless break does, and the times
  // are the part somebody came here to type. So the first time one is entered
  // the care names itself, and the name field is there to change rather than to
  // remember to fill in.
  const setCare = (patch: { name?: string; day?: { key: (typeof DAY_KEYS)[number]; time: string } }) => {
    onChange((current) => {
      const care = current.care ?? { name: '', until: {} };
      const until = { ...care.until };
      if (patch.day) {
        if (patch.day.time) until[patch.day.key] = patch.day.time;
        else delete until[patch.day.key];
      }
      const named = patch.name ?? care.name;
      const keeps = Object.values(until).some(Boolean);
      return {
        ...current,
        care: { name: named.trim() === '' && keeps ? t('timetableModal.schools.careDefault') : named, until },
      };
    });
  };

  const problems = slotProblems(school.slots, t);

  return (
    <div className="space-y-2">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-hs-text-faint">
        {t('timetableModal.schools.title')}
      </h3>

      <div className="space-y-1">
        {school.slots.map((slot, index) => {
          const minutes = lengthOf(slot);
          const problem = problems[index];
          return (
            // Columns declared once, rather than a wrapping row. A row that
            // wraps puts the end time on a second line behind a dangling dash
            // and the bin on a third, where it reads as belonging to the row
            // below. The problem message is the one thing that takes a line of
            // its own, so it spans them all. Capped in width so a wide pane
            // does not leave the length and the bin stranded out to the right.
            <div
              key={`${slot.kind}-${index}`}
              className={`grid max-w-[520px] grid-cols-[104px_124px_8px_124px_minmax(76px,1fr)_24px] items-center gap-1.5 rounded-md px-1 py-0.5 ${
                problem
                  ? 'border border-hs-danger/40 bg-hs-danger/5'
                  : slot.kind === 'break'
                    ? 'border border-dashed border-hs-border'
                    : ''
              }`}
            >
              {slot.kind === 'period' ? (
                <span className="text-xs text-hs-text-body">
                  {t('timetableModal.schools.period', { number: slot.n })}
                </span>
              ) : (
                // The name the household typed is kept when the box is
                // emptied: a break whose label went blank was dropped on the
                // next save, times and all, while still looking real on screen.
                <NameInput
                  value={slot.label}
                  maxLength={TIMETABLE_LIMITS.maxNameLength}
                  placeholder={t('timetableModal.schools.breakDefault')}
                  aria-label={t('timetableModal.schools.breakName')}
                  onCommit={(label) => setSlot(index, { label })}
                  className={MODAL_INPUT_CLASS}
                />
              )}
              {/*
                124px is what a native time box measures at when left to size
                itself: a 12-hour value and the picker glyph beside it. At 92px
                the AM or PM was cut off the right of every box, and the hour
                off the left of whichever one was last typed in, so "07:50 AM"
                read as "50 AM".
              */}
              <input
                type="time"
                value={slot.start}
                aria-label={t('timetableModal.schools.start')}
                onChange={(event) => setSlot(index, { start: event.target.value })}
                className={TIME_CLASS}
              />
              <span aria-hidden="true" className="text-center text-xs text-hs-text-faint">
                –
              </span>
              <input
                type="time"
                value={slot.end}
                aria-label={t('timetableModal.schools.end')}
                onChange={(event) => setSlot(index, { end: event.target.value })}
                className={TIME_CLASS}
              />
              <span className="truncate text-right text-xs text-hs-text-faint">
                {minutes !== null && minutes > 0 ? t('timetableModal.schools.minutes', { count: minutes }) : ''}
              </span>
              <button
                type="button"
                aria-label={t(
                  slot.kind === 'period' ? 'timetableModal.schools.removePeriod' : 'timetableModal.schools.removeBreak',
                )}
                onClick={() => removeSlot(index)}
                className="rounded p-1 text-hs-text-faint transition-colors hover:bg-hs-card hover:text-hs-danger"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {problem && (
                <p role="alert" className={`col-span-full pl-1 ${PROSE_CLASS} text-hs-danger`}>
                  {problem}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={addPeriod} disabled={full}>
          {t('timetableModal.schools.addPeriod')}
        </Button>
        <Button size="sm" onClick={addBreak} disabled={full}>
          {t('timetableModal.schools.addBreak')}
        </Button>
      </div>

      <div className="space-y-1.5 border-t border-hs-border pt-2">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-hs-text-faint">
          {t('timetableModal.schools.careTitle')}
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          {/* Wide enough for the name it fills in by itself: "After-school
              care" and "Naschoolse opvang" are seventeen characters, and at
              104px the box cut its own value down to "After-school". */}
          <label className="flex w-[168px] flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">{t('timetableModal.schools.careName')}</span>
            <input
              type="text"
              value={school.care?.name ?? ''}
              maxLength={TIMETABLE_LIMITS.maxNameLength}
              placeholder={t('timetableModal.schools.careDefault')}
              onChange={(event) => setCare({ name: event.target.value })}
              className={MODAL_INPUT_CLASS}
            />
          </label>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">{t('timetableModal.schools.careUntil')}</span>
            <div className="flex flex-wrap gap-1.5">
              {DAY_KEYS.map((day, index) => (
                // As wide as the bell boxes, and for the same reason: a
                // 12-hour value plus the picker glyph does not fit in less.
                <label key={day} className="flex w-[124px] flex-col items-center gap-0.5">
                  <span className="text-[10px] text-hs-text-faint">{dayNames[index]}</span>
                  <input
                    type="time"
                    value={school.care?.until[day] ?? ''}
                    aria-label={dayNames[index]}
                    onChange={(event) => setCare({ day: { key: day, time: event.target.value } })}
                    className={`${MODAL_INPUT_CLASS} tabular-nums`}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className={`${PROSE_CLASS} text-hs-text-faint`}>{t('timetableModal.schools.careHelp')}</p>
      </div>
    </div>
  );
}
