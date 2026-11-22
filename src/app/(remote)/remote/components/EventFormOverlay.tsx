'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { CalendarDays, ChevronRight, Info, Repeat, Smartphone, Trash2 } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { addIsoDays } from '@/lib/iso-date';
import { formatEventTime } from '@/lib/calendar-utils';
import { daySheetHeading } from '@/lib/calendar-day-sheet';
import { repeatReadingWords, repeatWords } from '@/lib/calendar-repeat-words';
import { refusalSentence } from '@/lib/hub-request';
import {
  CALENDAR_WRITE_LIMITS,
  CalendarWriteError,
  draftMinutes,
  endsNextDay,
  normalizeEventDraft,
  type EventDraft,
  type RepeatReading,
  type RepeatRule,
} from '@/lib/calendar-write';
import type { CalendarEntryInfo, EntryCalendar } from '@/lib/calendar-event-writes';
import { useHouseholdClockFormat, useHouseholdToday } from '../household-clock';
import FormOverlay from './FormOverlay';
import EventRepeatSheet from './EventRepeatSheet';
import { FIELD, FIELD_LABEL, selectedPillStyle } from './remote-styles';

/** The calendar this phone put its last event on, offered first next time while it still takes events. */
const LAST_CALENDAR_KEY = 'hs.calendarTab.lastCalendar';

export function rememberCalendar(id: string): void {
  try { localStorage.setItem(LAST_CALENDAR_KEY, id); } catch { /* private window: nothing to remember */ }
}

function lastCalendar(): string | null {
  try { return localStorage.getItem(LAST_CALENDAR_KEY); } catch { return null; }
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** A new event's start: the next whole hour today, 9:00 on any other day. */
function defaultStart(date: string, today: string): string {
  if (date !== today) return '09:00';
  const now = new Date();
  return fromMinutes(Math.min(23 * 60, (now.getHours() + 1) * 60));
}

const SWITCH: (on: boolean) => CSSProperties = (on) => ({
  width: 51, height: 31, borderRadius: 16, position: 'relative', flex: 'none', border: 0, padding: 0,
  background: on ? 'var(--hs-accent)' : '#404040', transition: 'background 0.15s',
});

const KNOB: (on: boolean) => CSSProperties = (on) => ({
  position: 'absolute', top: 2, left: on ? 22 : 2, width: 27, height: 27, borderRadius: '50%', background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transition: 'left 0.15s',
});

const NOTE: CSSProperties = {
  display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.45, marginBottom: 18,
};

export interface EventFormSubmit {
  calendarId: string;
  draft: EventDraft;
  /** Change only: the Repeats field itself was changed, which can only mean every time. */
  repeatChanged: boolean;
}

/**
 * The phone's add and change form. A full-screen
 * `FormOverlay` like the chore and meal forms. Times are on the household's
 * clock; an end earlier than the start is the next day. The calendar is
 * picked for a new event and shown, not picked, on a change: an edit never
 * moves an event.
 */
export default function EventFormOverlay({ mode, entry, date, initial, repeat, calendar, fromWall, notice, busy, onSubmit, onRemove, onClose }: {
  mode: 'new' | 'change';
  entry: CalendarEntryInfo;
  /** The day tapped (new) or the day the event is on (change). */
  date: string;
  /** Change: the event as Google or iCloud holds it now. */
  initial?: EventDraft;
  /** Change: how its series repeats; `other` cannot be changed here. */
  repeat?: RepeatReading;
  /** Change: the calendar it stays on. */
  calendar?: Pick<EntryCalendar, 'name' | 'color' | 'source'>;
  /** Opened from a wall's "Type on your phone" code: that wall's name. */
  fromWall?: string;
  notice?: 'changedElsewhere' | null;
  busy: boolean;
  onSubmit: (value: EventFormSubmit) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const today = useHouseholdToday();
  const timeFormat = useHouseholdClockFormat();

  const start = useMemo(() => {
    if (initial) return initial;
    const startTime = defaultStart(date, today);
    return {
      title: '',
      date,
      allDay: false,
      startTime,
      endTime: fromMinutes(toMinutes(startTime) + entry.defaultMinutes),
      lastDate: date,
      location: '',
      repeat: null,
    } satisfies EventDraft;
  }, [initial, date, today, entry.defaultMinutes]);

  const [draft, setDraft] = useState<EventDraft>({ ...start, lastDate: start.lastDate ?? start.date });
  const [endTouched, setEndTouched] = useState(mode === 'change');
  const [calendarId, setCalendarId] = useState(() => {
    const remembered = lastCalendar();
    return entry.calendars.some((c) => c.id === remembered) ? remembered! : entry.defaultCalendarId ?? '';
  });
  const [repeatOpen, setRepeatOpen] = useState(false);

  const set = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const repeatEditable = repeat?.kind !== 'other';
  const repeatChanged = mode === 'change' && repeatEditable
    && JSON.stringify(draft.repeat ?? null) !== JSON.stringify(repeat?.kind === 'known' ? repeat.rule : null);
  const dirty = JSON.stringify({ ...draft, lastDate: draft.allDay ? draft.lastDate : undefined })
    !== JSON.stringify({ ...start, lastDate: start.allDay ? (start.lastDate ?? start.date) : undefined });

  // The hub's own rule decides what may be saved, so the form never offers what it would refuse.
  const problem = useMemo(() => {
    try {
      normalizeEventDraft(draft, { timezone: entry.timezone });
      return null;
    } catch (e) {
      return e instanceof CalendarWriteError ? e : null;
    }
  }, [draft, entry.timezone]);
  const problemText = problem && problem.code !== 'calendarWrite.titleRequired' ? refusalSentence(problem, tCore) : null;
  const canSave = !busy && !problem && (mode === 'new' ? Boolean(calendarId) : dirty);

  const nextDay = !draft.allDay && endsNextDay(draft.startTime ?? '', draft.endTime ?? '');
  const minutes = !draft.allDay ? draftMinutes(draft.startTime ?? '', draft.endTime ?? '') : null;
  const clock = (time: string) => formatEventTime(new Date(2000, 0, 1, ...time.split(':').map(Number) as [number, number]), timeFormat, locale);
  const lengthWords = minutes === null ? ''
    : minutes < 60 ? t('calendarTab.form.minutes', { count: minutes })
    : minutes % 60 === 0 ? t('calendarTab.form.hours', { count: minutes / 60 })
    : t('calendarTab.form.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });

  const submit = () => {
    if (!canSave) return;
    const sent: EventDraft = draft.allDay
      ? { title: draft.title, date: draft.date, allDay: true, lastDate: draft.lastDate, location: draft.location, repeat: draft.repeat ?? null }
      : { title: draft.title, date: draft.date, allDay: false, startTime: draft.startTime, endTime: draft.endTime, location: draft.location, repeat: draft.repeat ?? null };
    // A repeat set up elsewhere is left exactly as it is.
    if (!repeatEditable) delete sent.repeat;
    onSubmit({ calendarId, draft: sent, repeatChanged });
  };

  const footer = (
    <div style={{ display: 'flex', gap: 10 }}>
      {mode === 'change' && onRemove && (
        <button
          type="button"
          className="press-scale"
          data-testid="event-form-remove"
          disabled={busy}
          onClick={onRemove}
          style={{ minHeight: 48, borderRadius: 12, padding: '0 18px', border: '1px solid rgba(248,113,113,0.35)', background: 'transparent', color: '#f87171', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}
        >
          <Trash2 size={18} aria-hidden="true" />{t('calendarTab.form.remove')}
        </button>
      )}
      <button
        type="button"
        className="press-scale"
        data-testid="event-form-save"
        disabled={!canSave}
        onClick={submit}
        style={{ flex: 1, minHeight: 48, borderRadius: 12, background: 'var(--hs-accent)', color: '#fff', fontSize: 15, fontWeight: 700, border: 0, opacity: canSave ? 1 : 0.5, fontFamily: 'inherit' }}
      >
        {mode === 'new' ? t('calendarTab.form.add') : t('calendarTab.form.save')}
      </button>
    </div>
  );

  const label = (key: string) => <span style={FIELD_LABEL}>{t(key)}</span>;
  const gap = { marginTop: 20 } as const;

  return (
    <FormOverlay title={mode === 'new' ? t('calendarTab.form.newTitle') : t('calendarTab.form.changeTitle')} dirty={dirty} onBack={onClose} footer={footer}>
      <div style={{ padding: '20px 16px 120px' }} data-testid="event-form" data-mode={mode}>
        {fromWall && (
          <div style={{ ...NOTE, background: 'var(--hs-bg-panel)', border: '1px solid var(--hs-border-strong)', color: 'var(--hs-text-body)' }}>
            <Smartphone size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 1, color: 'var(--hs-text-muted)' }} />
            <span>{t('calendarTab.form.fromWall', { wall: fromWall, day: daySheetHeading(dateOf(date), locale).full })}</span>
          </div>
        )}
        {notice === 'changedElsewhere' && (
          <div role="status" data-testid="event-form-changed" style={{ ...NOTE, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#fcd34d' }}>
            <Info size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
            <span>{t('calendarTab.form.changedElsewhere')}</span>
          </div>
        )}
        {mode === 'change' && repeat && repeat.kind !== 'none' && (
          <div style={{ ...NOTE, background: 'var(--hs-bg-panel)', border: '1px solid var(--hs-border-strong)', color: 'var(--hs-text-body)' }}>
            <Repeat size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 1, color: 'var(--hs-text-muted)' }} />
            <span>{t('calendarTab.form.repeatsNote', { title: start.title })}</span>
          </div>
        )}

        <label>
          {label('calendarTab.form.what')}
          <input
            data-testid="event-form-title"
            value={draft.title}
            autoFocus={mode === 'new'}
            maxLength={CALENDAR_WRITE_LIMITS.maxTitleLength * 2}
            placeholder={t('calendarTab.form.whatPlaceholder')}
            onChange={(e) => set({ title: e.target.value })}
            style={FIELD}
          />
        </label>

        <label style={{ display: 'block', ...gap }}>
          {label(draft.allDay ? 'calendarTab.form.firstDay' : 'calendarTab.form.day')}
          <input
            type="date"
            data-testid="event-form-date"
            value={draft.date}
            onChange={(e) => {
              const next = e.target.value;
              if (!next) return;
              // Keep an all-day event as long as it was.
              const span = draft.lastDate && draft.lastDate > draft.date ? Math.round((dateOf(draft.lastDate).getTime() - dateOf(draft.date).getTime()) / 86_400_000) : 0;
              set({ date: next, lastDate: addIsoDays(next, span) });
            }}
            style={FIELD}
          />
        </label>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, minHeight: 44 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{t('calendarTab.form.allDay')}</span>
          <button type="button" role="switch" aria-checked={draft.allDay} aria-label={t('calendarTab.form.allDay')} data-testid="event-form-all-day" onClick={() => set({ allDay: !draft.allDay })} style={SWITCH(draft.allDay)}>
            <span aria-hidden="true" style={KNOB(draft.allDay)} />
          </button>
        </div>

        {draft.allDay ? (
          <label style={{ display: 'block', marginTop: 14 }}>
            {label('calendarTab.form.lastDay')}
            <input type="date" data-testid="event-form-last-day" min={draft.date} value={draft.lastDate ?? draft.date} onChange={(e) => set({ lastDate: e.target.value || draft.date })} style={FIELD} />
          </label>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <label>
                {label('calendarTab.form.starts')}
                <input
                  type="time"
                  data-testid="event-form-start"
                  value={draft.startTime}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    // Ends follows Starts by the usual length until someone sets Ends.
                    set(endTouched ? { startTime: next } : { startTime: next, endTime: fromMinutes(toMinutes(next) + entry.defaultMinutes) });
                  }}
                  style={FIELD}
                />
              </label>
              <label>
                <span style={FIELD_LABEL}>
                  {t('calendarTab.form.ends')}
                  {nextDay && <span data-testid="event-form-next-day" style={{ textTransform: 'none', letterSpacing: 0, color: '#f59e0b', marginLeft: 6 }}>{t('calendarTab.form.nextDay')}</span>}
                </span>
                <input
                  type="time"
                  data-testid="event-form-end"
                  value={draft.endTime}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setEndTouched(true);
                    set({ endTime: e.target.value });
                  }}
                  style={{ ...FIELD, ...(problem?.code === 'calendarWrite.endsWhenItStarts' ? { borderColor: '#f87171' } : {}) }}
                />
              </label>
            </div>
            {nextDay && draft.endTime && (
              <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 8 }}>
                {t('calendarTab.form.endsOn', { day: daySheetHeading(dateOf(addIsoDays(draft.date, 1)), locale).full, time: clock(draft.endTime), length: lengthWords })}
              </p>
            )}
          </>
        )}
        {problemText && <p role="alert" style={{ fontSize: 12.5, color: '#f87171', marginTop: 8 }}>{problemText}</p>}

        <div style={gap}>
          {label('calendarTab.form.repeats')}
          <button
            type="button"
            data-testid="event-form-repeat"
            disabled={!repeatEditable}
            onClick={() => setRepeatOpen(true)}
            style={{ ...FIELD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left', fontFamily: 'inherit', opacity: repeatEditable ? 1 : 0.7 }}
          >
            <span>{repeatEditable ? repeatWords(draft.repeat, draft.date, locale, tCore) : repeatReadingWords(repeat!, draft.date, locale, tCore)}</span>
            {repeatEditable && <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--hs-text-faint)' }} />}
          </button>
        </div>

        <div style={gap}>
          {label('calendarTab.form.calendar')}
          {mode === 'new' ? (
            <div role="radiogroup" aria-label={t('calendarTab.form.calendar')} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {entry.calendars.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === calendarId}
                  className="press-scale"
                  data-calendar={c.id}
                  onClick={() => setCalendarId(c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', borderRadius: 20, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', ...selectedPillStyle(c.id === calendarId, 'var(--hs-text-muted)') }}
                >
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />{c.name}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ ...FIELD, background: 'transparent', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: calendar?.color }} />{calendar?.name}
              </div>
              <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 8 }}>
                {calendar?.source === 'icloud' ? t('calendarTab.form.staysOnICloud') : t('calendarTab.form.staysOnGoogle')}
              </p>
            </>
          )}
        </div>

        <label style={{ display: 'block', ...gap }}>
          <span style={FIELD_LABEL}>
            {t('calendarTab.form.place')} <span style={{ textTransform: 'none', fontWeight: 500, letterSpacing: 0 }}>{t('calendarTab.form.placeOptional')}</span>
          </span>
          <input data-testid="event-form-place" value={draft.location ?? ''} placeholder={t('calendarTab.form.placePlaceholder')} onChange={(e) => set({ location: e.target.value })} style={FIELD} />
        </label>
        {mode === 'new' && entry.calendars.length === 0 && (
          <p style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--hs-text-faint)', marginTop: 12 }}>
            <CalendarDays size={16} aria-hidden="true" />{t('calendarTab.form.noCalendars')}
          </p>
        )}
      </div>

      {repeatOpen && (
        <EventRepeatSheet
          date={draft.date}
          value={(draft.repeat as RepeatRule | null | undefined) ?? null}
          onDone={(rule) => { set({ repeat: rule }); setRepeatOpen(false); }}
          onClose={() => setRepeatOpen(false)}
        />
      )}
    </FormOverlay>
  );
}
