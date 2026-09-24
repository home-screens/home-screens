'use client';

/**
 * Dates to remember: a test, a one-off thing to bring, or lessons that are off.
 *
 * Their own tab, because they change every week while timetables change twice
 * a year. One list for the whole family, grouped by day, so a parent sees what
 * is coming this week in one place; the rail narrows it to one child. Each row
 * says who, what kind, which lesson, and when it reaches the wall.
 *
 * The form asks for the day before it asks what, because the choices under
 * "what" come from that day's real lessons: a test can only land on a subject
 * the child has that day, and "lesson off" lists that day's lessons as tick
 * boxes, with a double lesson as one box.
 */

import { useMemo, useState } from 'react';
import { Backpack, CalendarDays, Check, Pencil, Plus, Sun, Trash2, Users, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { MODAL_INPUT_CLASS } from '@/components/ui/input-classes';
import { formatDateSync, fullDatePattern, useFormattingLocale, useTranslate } from '@/i18n';
import { formatClockTime } from '@/lib/clock-time';
import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { addDays, closureOn, dayBlocks, dayKeyOf, daySpan, dateInZone, endsAfterOn, weekLetterOn, type LessonBlock } from '@/lib/timetable-layout';
import { parseISODate } from '@/lib/todo-due-labels';
import type { FamilyMember } from '@/types/family';
import { TIMETABLE_LIMITS, type Timetable, type TimetableData, type TimetableNote, type TimetableSchool } from '@/types/timetables';
import MemberDot from './MemberDot';
import { PROSE_CLASS } from './prose';
import { findSchool, findTimetable, makeNote, noteIsComplete, withNote, withoutNote } from './use-timetable-draft';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';

interface DatesTabProps {
  data: TimetableData;
  members: readonly FamilyMember[];
  update: (change: (data: TimetableData) => TimetableData) => void;
  /** The clock, for which dates are still to come. Omitted = now. */
  now?: Date;
}

/** One person's date, with the person on it, as the list draws it. */
interface Dated {
  member: FamilyMember;
  timetable: Timetable;
  school: TimetableSchool;
  note: TimetableNote;
}

/** What one day looks like for one person: the words the form says and the lessons it offers. */
interface DayFacts {
  weekday: string;
  /** School is shut (a weekend, a holiday, a day the school entered as off). */
  closed: boolean;
  lessons: LessonBlock[];
  letter?: 'A' | 'B';
  /** First bell to last bell, before any cancellation. */
  span: { start: string; end: string } | null;
}

const KINDS: TimetableNote['kind'][] = ['test', 'bring', 'cancelled'];

const CHIP = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors';
const CHIP_OFF = `${CHIP} border-hs-border-strong bg-hs-card text-hs-text-body hover:bg-hs-hover`;
const CHIP_ON = `${CHIP} border-hs-accent bg-hs-accent/20 text-hs-text-primary`;

export default function DatesTab({ data, members, update, now }: DatesTabProps) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  // The household's clock, so "done at 12:25" reads the way the wall says it.
  const timeFormat = useHouseholdTimeFormat(useEditorStore((state) => state.config?.settings.timeFormat));
  // Today and Tomorrow on the household's calendar, the same as the wall.
  const timezone = useEditorHouseholdTimezone();
  const today = dateInZone(now ?? new Date(), timezone);

  const withTimetables = members.filter((member) => findTimetable(data, member.id));
  const [who, setWho] = useState<string>('all');
  /** The date being added or changed, with whose it is; null while the list is showing. */
  const [draft, setDraft] = useState<{ memberId: string | null; note: TimetableNote; isNew: boolean } | null>(null);

  const on = (iso: string, pattern: string): string => {
    const date = parseISODate(iso);
    return date ? formatDateSync(date, pattern, { locale }) : iso;
  };
  const clock = (time: string) => formatClockTime(time, timeFormat);

  // Every date still to come, for everyone, in date order and then roster order.
  const upcoming = useMemo<Dated[]>(() => {
    const out: Dated[] = [];
    for (const member of withTimetables) {
      const timetable = findTimetable(data, member.id)!;
      const school = findSchool(data, timetable.schoolId);
      if (!school) continue;
      for (const note of timetable.notes ?? []) {
        if (note.date && note.date >= today && noteIsComplete(note)) out.push({ member, timetable, school, note });
      }
    }
    return out.sort((a, b) => (a.note.date < b.note.date ? -1 : a.note.date > b.note.date ? 1 : 0));
  }, [data, withTimetables, today]);

  const shown = who === 'all' ? upcoming : upcoming.filter((entry) => entry.member.id === who);
  const countFor = (memberId: string) => upcoming.filter((entry) => entry.member.id === memberId).length;

  /** What a day is for a person: the lessons the form offers and the sentence it says. */
  const factsFor = (memberId: string | null, iso: string): DayFacts | null => {
    if (!memberId || !iso) return null;
    const timetable = findTimetable(data, memberId);
    const school = findSchool(data, timetable?.schoolId);
    if (!timetable || !school) return null;
    const weekday = on(iso, 'EEEE');
    const day = dayKeyOf(iso);
    const ctx = { school, timetable, subjects: data.subjects };
    if (!day || closureOn(iso, ctx) !== undefined) return { weekday, closed: true, lessons: [], span: null };
    const letter = weekLetterOn(school, iso);
    const blocks = dayBlocks(timetable, school, data.subjects, day, letter, endsAfterOn(iso, ctx));
    const lessons = blocks.filter((b): b is LessonBlock => b.kind === 'lesson' && !b.off);
    const span = daySpan(blocks);
    return {
      weekday,
      closed: false,
      lessons,
      letter: school.weekCycle.mode === 'parity' ? letter : undefined,
      span: span ? { start: span.start, end: span.end } : null,
    };
  };

  const startAdding = () => {
    setDraft({ memberId: who === 'all' ? (withTimetables.length === 1 ? withTimetables[0].id : null) : who, note: makeNote('test'), isNew: true });
  };
  const startChanging = (entry: Dated) => {
    setDraft({ memberId: entry.member.id, note: { ...entry.note }, isNew: false });
  };
  const remove = (entry: Dated) => {
    update((current) => withoutNote(current, entry.member.id, entry.note.id));
  };
  const save = () => {
    if (!draft?.memberId || !noteIsComplete(draft.note)) return;
    const { memberId, note } = draft;
    update((current) => withNote(current, memberId, note));
    setDraft(null);
  };

  /** The row's words: what the date is about, and the small line beside it. */
  const describe = (entry: Dated): { what: string; small: string } => {
    const { note, timetable, school } = entry;
    const subject = data.subjects.find((s) => s.id === note.subjectId);
    if (note.kind === 'test') {
      return { what: subject?.name ?? '', small: note.text ?? '' };
    }
    if (note.kind === 'bring') return { what: note.text ?? '', small: '' };
    const day = dayKeyOf(note.date);
    const letter = weekLetterOn(school, note.date);
    const ctx = { school, timetable, subjects: data.subjects };
    const all = day ? dayBlocks(timetable, school, data.subjects, day, letter, endsAfterOn(note.date, ctx)) : [];
    const off = new Set(note.periods ?? []);
    const names = all
      .filter((b): b is LessonBlock => b.kind === 'lesson' && b.periods.some((p) => off.has(p)))
      .map((b) => b.subject.name);
    const before = daySpan(all);
    const after = daySpan(day ? dayBlocks(timetable, school, data.subjects, day, letter, endsAfterOn(note.date, ctx), off) : []);
    const lessons = [...new Set(names)].join(', ');
    let small = '';
    if (before && !after) small = t('timetableModal.dates.rowAllOff');
    else if (before && after && after.end !== before.end) small = t('timetableModal.dates.rowOff', { time: clock(after.end) });
    else if (before && after && after.start !== before.start) small = t('timetableModal.dates.rowOffStart', { time: clock(after.start) });
    return { what: lessons, small };
  };

  /** "Today · Friday, 11 September", "Tomorrow · ...", or the date alone. */
  const groupLabel = (iso: string): string => {
    const date = on(iso, fullDatePattern(locale, 'long'));
    if (iso === today) return `${t('timetableModal.dates.today')} · ${date}`;
    if (iso === addDays(today, 1)) return `${t('timetableModal.dates.tomorrow')} · ${date}`;
    return date;
  };

  const kindWord = (kind: TimetableNote['kind']) =>
    kind === 'test' ? t('timetableModal.dates.kindTest') : kind === 'bring' ? t('timetableModal.dates.kindBring') : t('timetableModal.dates.kindOff');
  const kindIcon = (kind: TimetableNote['kind']) =>
    kind === 'test' ? <Pencil className="h-3 w-3" aria-hidden="true" /> : kind === 'bring' ? <Backpack className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />;
  const kindClass = (kind: TimetableNote['kind']) =>
    kind === 'test'
      ? 'bg-amber-400/20 text-amber-300'
      : kind === 'bring'
        ? 'bg-hs-hover text-hs-text-body'
        : 'bg-red-400/15 text-red-300';

  // ---------------------------------------------------------------------
  // The form
  // ---------------------------------------------------------------------
  const facts = draft ? factsFor(draft.memberId, draft.note.date) : null;
  const person = draft?.memberId ? members.find((m) => m.id === draft.memberId) : undefined;
  const hasLessons = Boolean(facts && !facts.closed && facts.lessons.length > 0);
  const setNote = (patch: Partial<TimetableNote>) => setDraft((current) => (current ? { ...current, note: { ...current.note, ...patch } } : current));
  const setKind = (kind: TimetableNote['kind']) =>
    setDraft((current) => (current ? { ...current, note: { id: current.note.id, date: current.note.date, kind } } : current));

  /** The sentence under the day: what that day already is for this person. */
  const dayLine = (): { icon: 'sun' | 'calendar' | 'clock'; text: string } | null => {
    if (!facts || !person) return null;
    if (facts.closed) return { icon: 'sun', text: t('timetableModal.dates.noSchool', { weekday: facts.weekday }) };
    if (!facts.span) return { icon: 'sun', text: t('timetableModal.dates.noLessons', { name: person.name }) };
    const values = { weekday: facts.weekday, name: person.name, start: clock(facts.span.start), end: clock(facts.span.end) };
    return facts.letter
      ? { icon: 'calendar', text: t('timetableModal.dates.dayHelp', { ...values, letter: facts.letter }) }
      : { icon: 'calendar', text: t('timetableModal.dates.dayHelpPlain', values) };
  };

  /** What ticking lessons off does to the day: the new end, or the new start. */
  const offLine = (): string | null => {
    if (!draft || !facts || !person || draft.note.kind !== 'cancelled' || !facts.span) return null;
    const off = new Set(draft.note.periods ?? []);
    if (off.size === 0) return null;
    const timetable = findTimetable(data, person.id)!;
    const school = findSchool(data, timetable.schoolId)!;
    const day = dayKeyOf(draft.note.date)!;
    const ctx = { school, timetable, subjects: data.subjects };
    const after = daySpan(dayBlocks(timetable, school, data.subjects, day, weekLetterOn(school, draft.note.date), endsAfterOn(draft.note.date, ctx), off));
    if (!after) return t('timetableModal.dates.allOff', { name: person.name });
    if (after.end !== facts.span.end) return t('timetableModal.dates.doneAt', { name: person.name, time: clock(after.end), usual: clock(facts.span.end) });
    if (after.start !== facts.span.start) return t('timetableModal.dates.startsAt', { name: person.name, time: clock(after.start), usual: clock(facts.span.start) });
    return null;
  };

  const subjectsOnDay = facts
    ? [...new Map(facts.lessons.map((b) => [b.subject.id, b.subject])).values()]
    : [];

  const line = dayLine();
  const offNote = offLine();
  const canSave = Boolean(draft?.memberId && noteIsComplete(draft.note));

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[236px] shrink-0 flex-col border-r border-hs-border bg-hs-card/40">
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="px-1 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-hs-text-faint">
            {t('timetableModal.dates.railTitle')}
          </p>
          <button
            type="button"
            aria-pressed={who === 'all'}
            onClick={() => setWho('all')}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
              who === 'all' ? 'border border-hs-border-strong bg-hs-panel' : 'border border-transparent hover:bg-hs-hover'
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hs-hover text-hs-text-muted">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-hs-text-primary">{t('timetableModal.dates.everyone')}</span>
            <span className="text-[11px] tabular-nums text-hs-text-muted">{upcoming.length}</span>
          </button>
          {withTimetables.map((member) => (
            <button
              key={member.id}
              type="button"
              aria-pressed={who === member.id}
              onClick={() => setWho(member.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                who === member.id ? 'border border-hs-border-strong bg-hs-panel' : 'border border-transparent hover:bg-hs-hover'
              }`}
            >
              <MemberDot member={member} size={28} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-hs-text-primary">{member.name}</span>
              <span className="text-[11px] tabular-nums text-hs-text-muted">{countFor(member.id) || ''}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-hs-text-primary">
              {draft ? (draft.isNew ? t('timetableModal.dates.formTitle') : t('timetableModal.dates.formEditTitle')) : t('timetableModal.dates.title')}
            </h3>
            {!draft && <p className={`${PROSE_CLASS} text-hs-text-muted`}>{t('timetableModal.dates.subtitle')}</p>}
          </div>
          {!draft && withTimetables.length > 0 && (
            <Button size="sm" variant="primary" onClick={startAdding}>
              <span className="flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t('timetableModal.dates.add')}
              </span>
            </Button>
          )}
        </div>

        {draft && (
          <form
            data-testid="timetable-note-form"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 rounded-lg border border-hs-accent bg-hs-panel px-4 py-3.5"
          >
            <span className="pt-1.5 text-xs text-hs-text-muted">{t('timetableModal.dates.who')}</span>
            <div role="group" aria-label={t('timetableModal.dates.who')} className="flex flex-wrap gap-1.5">
              {withTimetables.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  aria-pressed={draft.memberId === member.id}
                  onClick={() => setDraft((current) => (current ? { ...current, memberId: member.id, note: { id: current.note.id, date: current.note.date, kind: current.note.kind } } : current))}
                  className={draft.memberId === member.id ? CHIP_ON : CHIP_OFF}
                >
                  <MemberDot member={member} size={18} />
                  {member.name}
                </button>
              ))}
            </div>

            <span className="pt-1.5 text-xs text-hs-text-muted">{t('timetableModal.dates.day')}</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-[150px]">
                <input
                  type="date"
                  value={draft.note.date}
                  aria-label={t('timetableModal.dates.day')}
                  onChange={(event) => setDraft((current) => (current ? { ...current, note: { id: current.note.id, date: event.target.value, kind: current.note.kind, ...(current.note.kind === 'bring' ? { text: current.note.text } : {}) } } : current))}
                  className={`${MODAL_INPUT_CLASS} tabular-nums`}
                />
              </span>
              {!draft.memberId && <span className={`${PROSE_CLASS} text-hs-text-muted`}>{t('timetableModal.dates.needsPerson')}</span>}
              {line && (
                <span data-testid="timetable-note-dayline" className={`flex items-center gap-1.5 ${PROSE_CLASS} text-hs-text-muted`}>
                  {line.icon === 'sun'
                    ? <Sun className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                    : <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {line.text}
                </span>
              )}
            </div>

            <span className="pt-1.5 text-xs text-hs-text-muted">{t('timetableModal.dates.what')}</span>
            <div role="radiogroup" aria-label={t('timetableModal.dates.what')} className="inline-flex w-fit gap-0.5 rounded-lg border border-hs-border-strong bg-hs-card p-0.5">
              {KINDS.map((kind) => {
                const needsLessons = kind !== 'bring';
                const disabled = needsLessons && facts !== null && !hasLessons;
                const selected = draft.note.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => setKind(kind)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${
                      selected ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-body'
                    } disabled:cursor-not-allowed disabled:opacity-35`}
                  >
                    {kindIcon(kind)}
                    {kindWord(kind)}
                  </button>
                );
              })}
            </div>

            {draft.note.kind === 'test' && (
              <>
                <span className="pt-1.5 text-xs text-hs-text-muted">{t('timetableModal.dates.subject')}</span>
                <div role="group" aria-label={t('timetableModal.dates.subject')} className="flex flex-wrap gap-1.5">
                  {subjectsOnDay.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      aria-pressed={draft.note.subjectId === subject.id}
                      onClick={() => setNote({ subjectId: subject.id })}
                      className={draft.note.subjectId === subject.id ? CHIP_ON : CHIP_OFF}
                    >
                      <i
                        className="flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold not-italic text-white"
                        style={{ background: `color-mix(in srgb, ${subject.color} 45%, #111)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${subject.color} 70%, transparent)` }}
                      >
                        {subject.code}
                      </i>
                      {subject.name}
                    </button>
                  ))}
                  {subjectsOnDay.length === 0 && <span className={`${PROSE_CLASS} text-hs-text-faint`}>{facts ? '' : t('timetableModal.dates.needsPerson')}</span>}
                </div>
                <label className="pt-1.5 text-xs text-hs-text-muted" htmlFor="timetable-note-name">
                  {t('timetableModal.dates.name')} <span className="text-hs-text-faint">{t('timetableModal.dates.optional')}</span>
                </label>
                <input
                  id="timetable-note-name"
                  type="text"
                  value={draft.note.text ?? ''}
                  maxLength={TIMETABLE_LIMITS.maxNoteLength}
                  placeholder={t('timetableModal.dates.namePlaceholder')}
                  onChange={(event) => setNote({ text: event.target.value })}
                  className={`${MODAL_INPUT_CLASS} max-w-[320px]`}
                />
              </>
            )}

            {draft.note.kind === 'cancelled' && (
              <>
                <span className="pt-1.5 text-xs text-hs-text-muted">{t('timetableModal.dates.periods')}</span>
                <div role="group" aria-label={t('timetableModal.dates.periods')} className="flex flex-wrap gap-1.5">
                  {(facts?.lessons ?? []).map((block) => {
                    const off = new Set(draft.note.periods ?? []);
                    const ticked = block.periods.every((p) => off.has(p));
                    const range = block.periods.length > 1 ? `${block.periods[0]}–${block.periods[block.periods.length - 1]}` : String(block.periods[0]);
                    return (
                      <button
                        key={block.periods.join('-')}
                        type="button"
                        role="checkbox"
                        aria-checked={ticked}
                        aria-label={`${range}. ${block.subject.name}`}
                        onClick={() => {
                          const next = new Set(off);
                          for (const p of block.periods) {
                            if (ticked) next.delete(p); else next.add(p);
                          }
                          setNote({ periods: [...next].sort((a, b) => a - b) });
                        }}
                        className={ticked ? CHIP_ON : CHIP_OFF}
                      >
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${ticked ? 'border-hs-accent bg-hs-accent text-white' : 'border-hs-border-strong'}`}>
                          {ticked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                        </span>
                        <span className="tabular-nums">{range}.</span> {block.subject.name}
                      </button>
                    );
                  })}
                </div>
                {offNote && (
                  <>
                    <span />
                    <span data-testid="timetable-note-offline" className={`flex w-fit items-center gap-2 rounded-md bg-hs-hover px-3 py-2 ${PROSE_CLASS} text-hs-text-body`}>
                      {offNote}
                    </span>
                  </>
                )}
              </>
            )}

            {draft.note.kind === 'bring' && (
              <>
                <label className="pt-1.5 text-xs text-hs-text-muted" htmlFor="timetable-note-bring">{t('timetableModal.dates.bring')}</label>
                <input
                  id="timetable-note-bring"
                  type="text"
                  value={draft.note.text ?? ''}
                  maxLength={TIMETABLE_LIMITS.maxNoteLength}
                  placeholder={t('timetableModal.dates.bringPlaceholder')}
                  onChange={(event) => setNote({ text: event.target.value })}
                  className={`${MODAL_INPUT_CLASS} max-w-[320px]`}
                />
              </>
            )}

            <div className="col-span-2 flex items-center gap-2 border-t border-hs-border pt-3">
              <Button size="sm" type="button" className="ml-auto" onClick={() => setDraft(null)}>
                {t('timetableModal.dates.cancel')}
              </Button>
              <Button size="sm" type="submit" variant="primary" disabled={!canSave}>
                {draft.isNew ? t('timetableModal.dates.save') : t('timetableModal.dates.saveChange')}
              </Button>
            </div>
          </form>
        )}

        {shown.length === 0 && !draft ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <CalendarDays className="h-9 w-9 text-hs-text-faint" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm font-semibold text-hs-text-body">{t('timetableModal.dates.emptyTitle')}</p>
            <p className={`max-w-[42ch] ${PROSE_CLASS} text-hs-text-muted`}>{t('timetableModal.dates.emptyBody')}</p>
          </div>
        ) : (
          <div className={`space-y-1.5 ${draft ? 'opacity-60' : ''}`}>
            {shown.map((entry, index) => {
              const first = index === 0 || shown[index - 1].note.date !== entry.note.date;
              const { what, small } = describe(entry);
              const eve = on(addDays(entry.note.date, -1), 'EEEE');
              return (
                <div key={`${entry.member.id}-${entry.note.id}`}>
                  {first && (
                    <p className="pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-hs-text-faint">{groupLabel(entry.note.date)}</p>
                  )}
                  <div
                    data-testid="timetable-note-row"
                    data-kind={entry.note.kind}
                    className="grid grid-cols-[22px_72px_auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-hs-border bg-hs-card px-3 py-2"
                  >
                    <MemberDot member={entry.member} size={22} />
                    <span className="truncate text-[13px] font-semibold text-hs-text-primary">{entry.member.name}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${kindClass(entry.note.kind)}`}>
                      {kindIcon(entry.note.kind)}
                      {kindWord(entry.note.kind)}
                    </span>
                    <span className="min-w-0 truncate text-[13px] text-hs-text-body">
                      {what}
                      {small && <span className="ml-1.5 text-xs text-hs-text-muted">· {small}</span>}
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-hs-text-muted">{t('timetableModal.dates.wallFrom', { weekday: eve })}</span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`${t('timetableModal.dates.edit')}: ${entry.member.name}, ${what}`}
                        onClick={() => startChanging(entry)}
                        className="rounded p-1 text-hs-text-muted transition-colors hover:bg-hs-hover hover:text-hs-text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`${t('timetableModal.dates.remove')}: ${entry.member.name}, ${what}`}
                        onClick={() => remove(entry)}
                        className="rounded p-1 text-hs-text-muted transition-colors hover:bg-hs-hover hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** How many dates are still to come on the household's calendar, for the badge on the tab. */
export function upcomingNoteCount(data: TimetableData, timezone: string | undefined, now: Date = new Date()): number {
  const today = dateInZone(now, timezone);
  let count = 0;
  for (const timetable of data.timetables) {
    for (const note of timetable.notes ?? []) if (note.date >= today && noteIsComplete(note)) count++;
  }
  return count;
}
