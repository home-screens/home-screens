'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { formatDateSync, formatDayRange, fullDatePattern, useFormattingLocale, useTranslate } from '@/i18n';
import { NoteGlyph } from '@/components/notes/NoteGlyph';
import { LAST_DAY_NOTES_PAGE, upcomingDays } from '@/lib/day-notes';
import { capitalize, formatShortDayMonth } from '@/lib/meal-constants';
import { DAY_NOTES_LIMITS, type DayNote } from '@/types/day-notes';
import { useDayNotesData } from '../hooks/useDayNotesData';
import { useHouseholdToday } from '../household-clock';
import { showToast } from '../remote-toast';
import DayNoteSheet, { dateOfIso, dayInWords } from './DayNoteSheet';
import MealsWeekNav from './MealsWeekNav';
import { REMOTE_ACCENT, REMOTE_ACCENT_INK } from './remote-styles';
import { withAlpha } from '@/lib/hex-color';
import { LoadFailed } from './RetryButton';
import { addIsoDays } from '@/lib/iso-date';
import { DAY_NOTE_YELLOW } from '@/components/modules/shared/DayNoteLine';

const ROW: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 48,
  borderRadius: 10,
  textAlign: 'left',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const NOTE_ROW: CSSProperties = {
  ...ROW,
  position: 'relative',
  overflow: 'hidden',
  padding: '11px 12px 11px 16px',
  background: 'var(--hs-bg-panel)',
  border: '1px solid var(--hs-border)',
  color: 'var(--hs-text-primary)',
  fontSize: 15,
  lineHeight: 1.3,
};

/** The note row's yellow edge: a straight bar the rounded row clips, as on the wall. */
const NOTE_EDGE: CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: DAY_NOTE_YELLOW };

const EMPTY_ROW: CSSProperties = {
  ...ROW,
  padding: '10px 12px',
  background: 'transparent',
  border: '1px dashed var(--hs-border)',
  color: 'var(--hs-text-faint)',
  fontSize: 13,
};

const TODAY_BADGE: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 4,
  background: withAlpha(REMOTE_ACCENT, 0.12),
  color: REMOTE_ACCENT_INK,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginLeft: 'auto',
};

type Editing = { date: string; id: string | null };
const draftKey = (e: Editing) => `${e.date}:${e.id ?? 'new'}`;

/** "Nov 9 – 15" in the phone's language, with the year once the range leaves this one. */
function rangeLabel(first: string, last: string, today: string, locale: string): string {
  return formatDayRange(dateOfIso(first), dateOfIso(last), locale, { month: 'short', year: last.slice(0, 4) !== today.slice(0, 4) });
}

/** What the Calendar tab adds to each day: its events above the notes, and "Add event" beside "Add note". */
export interface DayEventsSlot {
  /** The day's event rows, drawn above its notes. */
  rows: (date: string) => ReactNode;
  /** Shown only while events can be added. */
  onAdd?: (date: string) => void;
}

/**
 * Short notes for a day ("Picture day", "Bring boots") that every calendar
 * on the wall draws on that day, on the Notes tab's Calendar page and, with
 * the day's events beside them, on the Calendar tab. Seven days at a time
 * starting today, laid out like the Meals week: each note is its own row, and
 * a dashed row adds one while the day has room. Past days are not listed,
 * since a note cannot be written for them.
 */
export default function DayNotesPage({ events, sub, card, page: pageProp, onPageChange }: {
  events?: DayEventsSlot;
  /** The week on screen, when the caller needs it too (the Calendar tab reads that week's events). */
  page?: number;
  onPageChange?: (page: number) => void;
  /** The line under the page title; the Notes tab's own when absent. */
  sub?: string;
  /** A card above the days (the Calendar tab's "adding is off"). */
  card?: ReactNode;
} = {}) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const today = useHouseholdToday();
  const { notes, loaded, loadError, retry, add, update, remove, resolveId } = useDayNotesData();
  const [ownPage, setOwnPage] = useState(0);
  const page = pageProp ?? ownPage;
  const setPage = (next: (p: number) => number) => {
    const value = next(page);
    if (onPageChange) onPageChange(value);
    else setOwnPage(value);
  };
  const [editing, setEditing] = useState<Editing | null>(null);
  // Words typed and then closed without saving, per day and note, so a stray
  // tap outside the sheet never costs anyone what they typed.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const days = upcomingDays(today, page);
  const weekLabel = page === 0 ? t('notes.dayNotes.nextDays') : rangeLabel(days[0], days[days.length - 1], today, locale);
  // A note added moments ago carries a stand-in id until the hub names it, so
  // a sheet opened on it follows it to its real id rather than closing.
  const editingNote = editing?.id ? notes.find((n) => n.id === resolveId(editing.id!)) ?? null : null;

  const forget = (e: Editing) => setDrafts(({ [draftKey(e)]: _gone, ...rest }) => rest);
  const weekdayOf = (date: string) => capitalize(formatDateSync(dateOfIso(date), 'EEEE', { locale }));
  // The weekday alone names a day in the coming week; further out it needs its date.
  const savedDay = (date: string) => formatDateSync(dateOfIso(date), date < addIsoDays(today, 7) ? 'EEEE' : fullDatePattern(locale), { locale });

  const save = (e: Editing, text: string) => {
    forget(e);
    setEditing(null);
    const saved = e.id ? update(e.id, text, today) : add(e.date, text, today);
    void saved.then((ok) => {
      // Turned down (the toast says why): the words wait as the note's draft,
      // so opening it again brings them back rather than an empty box.
      if (!ok) {
        setDrafts((current) => ({ ...current, [draftKey(e)]: text }));
        return;
      }
      // The wall only draws a note while its day is on a calendar there, so
      // say so: a note for next week is saved even if no wall shows it yet.
      showToast(t('notes.dayNotes.saved', { day: savedDay(e.date) }));
    });
  };

  const removeNote = (note: DayNote) => {
    forget({ date: note.date, id: note.id });
    setEditing(null);
    void remove(note.id).then((ok) => {
      if (!ok) return;
      showToast(t('notes.dayNotes.removed'), 'info', {
        label: t('notes.dayNotes.undo'),
        onPress: () => void add(note.date, note.text, today),
      });
    });
  };

  if (!loaded && loadError) {
    return <LoadFailed testId="day-notes-load-error" message={t('notes.dayNotes.loadError')} onRetry={retry} />;
  }
  if (!loaded) return null;

  return (
    <div data-testid="day-notes-page">
      <div style={{ fontSize: 13, color: 'var(--hs-text-faint)', margin: '0 0 12px' }}>{sub ?? t('notes.dayNotes.sub')}</div>
      {card}
      <MealsWeekNav
        weekLabel={weekLabel}
        isCurrentWeek={page === 0}
        navigateWeek={(direction) => setPage((p) => Math.min(LAST_DAY_NOTES_PAGE, Math.max(0, p + direction)))}
        jumpToToday={() => setPage(() => 0)}
        prevDisabled={page === 0}
        nextDisabled={page === LAST_DAY_NOTES_PAGE}
      />
      {days.map((date) => {
        const isToday = date === today;
        const onDay = notes.filter((n) => n.date === date);
        const words = dayInWords(date, locale);
        return (
          <div key={date} data-testid="day-notes-day" data-date={date} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: isToday ? 'var(--hs-text-primary)' : 'var(--hs-text-muted)' }}>
                {weekdayOf(date)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--hs-text-faint)' }}>{formatShortDayMonth(date, locale)}</span>
              {isToday && <span style={TODAY_BADGE}>{t('mealsTab.weekView.todayBadge')}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events?.rows(date)}
              {onDay.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="press-scale"
                  data-testid="day-notes-note"
                  aria-label={t('notes.dayNotes.editAria', { day: words })}
                  onClick={() => setEditing({ date, id: note.id })}
                  style={NOTE_ROW}
                >
                  <span aria-hidden="true" style={NOTE_EDGE} />
                  <span style={{ color: DAY_NOTE_YELLOW, fontSize: 17, display: 'flex' }}><NoteGlyph /></span>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', hyphens: 'auto' }}>{note.text}</span>
                  <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--hs-text-faint)', flex: 'none' }} />
                </button>
              ))}
              {(() => {
                const addNote = onDay.length < DAY_NOTES_LIMITS.maxPerDay && (
                  <button
                    type="button"
                    className="press-scale"
                    data-testid="day-notes-add"
                    aria-label={t('notes.dayNotes.addAria', { day: words })}
                    onClick={() => setEditing({ date, id: null })}
                    style={EMPTY_ROW}
                  >
                    <Plus size={16} aria-hidden="true" style={{ color: 'var(--hs-text-faint)', flex: 'none' }} />
                    {events?.onAdd ? t('calendarTab.addNote') : onDay.length === 0 ? t('notes.dayNotes.addForDay') : t('notes.dayNotes.addAnother')}
                  </button>
                );
                if (!events?.onAdd) return addNote;
                const onAdd = events.onAdd;
                // Add event and Add note side by side; a full day of notes leaves Add event the whole row.
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: addNote ? '1fr 1fr' : '1fr', gap: 6 }}>
                    <button
                      type="button"
                      className="press-scale"
                      data-testid="calendar-add-event"
                      aria-label={t('calendarTab.addEventAria', { day: words })}
                      onClick={() => onAdd(date)}
                      style={{ ...EMPTY_ROW, color: 'var(--hs-text-muted)' }}
                    >
                      <Plus size={16} aria-hidden="true" style={{ flex: 'none' }} />
                      {t('calendarTab.addEvent')}
                    </button>
                    {addNote}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}

      {editing && (editing.id === null || editingNote) && (
        <DayNoteSheet
          key={draftKey(editing)}
          date={editing.date}
          note={editingNote}
          initialText={drafts[draftKey(editing)] ?? editingNote?.text ?? ''}
          onSave={(text) => save(editing, text)}
          onRemove={() => editingNote && removeNote(editingNote)}
          onClose={(draft) => {
            const key = draftKey(editing);
            const kept = draft.trim() !== '' && draft !== (editingNote?.text ?? '');
            setDrafts(({ [key]: _old, ...rest }) => (kept ? { ...rest, [key]: draft } : rest));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
