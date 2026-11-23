'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { CalendarDays, ChevronRight, Info, Lock, Repeat, Smartphone } from 'lucide-react';
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
  endKeepingLength,
  endsNextDay,
  isLongTimed,
  normalizeEventDraft,
  type EventDraft,
  type RepeatReading,
  type RepeatRule,
} from '@/lib/calendar-write';
import { defaultStartMinutes, draftToSend, minutesOfTime, repeatEditable as mayChangeRepeat, repeatWasChanged, timeOfMinutes, timesWereChanged } from '@/lib/calendar-event-form';
import type { CalendarEntryInfo, EntryCalendar } from '@/lib/calendar-event-writes';
import { useHouseholdClockFormat } from '../household-clock';
import { withAlpha } from '@/lib/hex-color';
import FormOverlay from './FormOverlay';
import EventRepeatSheet from './EventRepeatSheet';
import PhoneSwitch from './PhoneSwitch';
import SaveDeleteFooter from './SaveDeleteFooter';
import { FIELD, FIELD_LABEL, toggleChipStyle } from './remote-styles';
import { settingsPlaceText } from '@/lib/settings-route';

/** The calendar this phone put its last event on, offered first next time while it still takes events. */
const LAST_CALENDAR_KEY = 'hs.calendarTab.lastCalendar';

export function rememberCalendar(id: string): void {
  try { localStorage.setItem(LAST_CALENDAR_KEY, id); } catch { /* private window: nothing to remember */ }
}

function lastCalendar(): string | null {
  try { return localStorage.getItem(LAST_CALENDAR_KEY); } catch { return null; }
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const NOTE: CSSProperties = {
  display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.45, marginBottom: 18,
};

export interface EventFormSubmit {
  calendarId: string;
  draft: EventDraft;
  /** Change only: the Repeats field itself was changed, which can only mean every time. */
  repeatChanged: boolean;
}

/** The latest a new event is offered to start, so its end still shows on the same day's clock. */
const LATEST_DEFAULT_START = 23 * 60;

/**
 * The phone's add and change form. A full-screen
 * `FormOverlay` like the chore and meal forms. Times are on the household's
 * clock; an end earlier than the start is the next day. The calendar is
 * picked for a new event and shown, not picked, on a change: an edit never
 * moves an event. An event of a day or more shows its day and times and
 * does not change them: the two time fields cannot say which day it ends.
 */
export default function EventFormOverlay({ mode, entry, date, initial, repeat, calendar, fromWall, notice, saving, removing, onSubmit, onRemove, onClose }: {
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
  /** The hub is saving this form: the save button says so. */
  saving: boolean;
  /** The hub is removing this event: nothing can be pressed, and the save button keeps its words. */
  removing: boolean;
  onSubmit: (value: EventFormSubmit) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const timeFormat = useHouseholdClockFormat();

  const start = useMemo(() => {
    if (initial) return initial;
    const startMinutes = Math.min(LATEST_DEFAULT_START, defaultStartMinutes(date, new Date(), entry.timezone));
    const startTime = timeOfMinutes(startMinutes);
    return {
      title: '',
      date,
      allDay: false,
      startTime,
      endTime: timeOfMinutes(minutesOfTime(startTime) + entry.defaultMinutes),
      lastDate: date,
      location: '',
      repeat: null,
    } satisfies EventDraft;
  }, [initial, date, entry.defaultMinutes, entry.timezone]);

  const [draft, setDraft] = useState<EventDraft>({ ...start, lastDate: start.lastDate ?? start.date });
  const [calendarId, setCalendarId] = useState(() => {
    const remembered = lastCalendar();
    return entry.calendars.some((c) => c.id === remembered) ? remembered! : entry.defaultCalendarId ?? '';
  });
  const [repeatOpen, setRepeatOpen] = useState(false);

  const set = (patch: Partial<EventDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const loaded = mode === 'change' && repeat ? { repeat } : null;
  const repeatEditable = mayChangeRepeat(loaded);
  const repeatChanged = repeatWasChanged(draft.repeat, loaded);
  // A change that leaves the day and times alone sends none, so they are not held to what this form can make.
  const timesChanged = initial ? timesWereChanged(draft, initial) : true;
  const locked = Boolean(initial && isLongTimed(initial));
  const dirty = JSON.stringify({ ...draft, lastDate: draft.allDay ? draft.lastDate : undefined })
    !== JSON.stringify({ ...start, lastDate: start.allDay ? (start.lastDate ?? start.date) : undefined });

  // The hub's own rule decides what may be saved, so the form never offers what it would refuse.
  const problem = useMemo(() => {
    try {
      normalizeEventDraft(draft, { timezone: entry.timezone, timesChanged });
      return null;
    } catch (e) {
      return e instanceof CalendarWriteError ? e : null;
    }
  }, [draft, entry.timezone, timesChanged]);
  const problemText = problem && problem.code !== 'calendarWrite.titleRequired' ? refusalSentence(problem, tCore) : null;
  const canSave = !saving && !removing && !problem && (mode === 'new' ? Boolean(calendarId) : dirty);

  const nextDay = !draft.allDay && endsNextDay(draft.startTime ?? '', draft.endTime ?? '');
  const minutes = !draft.allDay ? draftMinutes(draft.startTime ?? '', draft.endTime ?? '') : null;
  const clock = (time: string) => formatEventTime(new Date(2000, 0, 1, ...time.split(':').map(Number) as [number, number]), timeFormat, locale);
  const lengthWords = minutes === null ? ''
    : minutes < 60 ? t('calendarTab.form.minutes', { count: minutes })
    : minutes % 60 === 0 ? t('calendarTab.form.hours', { count: minutes / 60 })
    : t('calendarTab.form.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });

  const submit = () => {
    if (!canSave) return;
    onSubmit({ calendarId, draft: draftToSend(draft, { repeatEditable }), repeatChanged });
  };

  const footer = (
    <SaveDeleteFooter
      saveLabel={mode === 'new' ? t('calendarTab.form.add') : undefined}
      canSave={canSave}
      busy={saving}
      deleting={removing}
      onSave={submit}
      deleteLabel={mode === 'change' && onRemove ? t('calendarTab.form.remove') : undefined}
      onDelete={onRemove}
      saveTestId="event-form-save"
      deleteTestId="event-form-remove"
    />
  );

  const label = (key: string) => <span style={FIELD_LABEL}>{t(key)}</span>;
  const gap = { marginTop: 20 } as const;

  return (
    <FormOverlay title={mode === 'new' ? t('calendarTab.form.newTitle') : t('calendarTab.form.changeTitle')} dirty={dirty} onBack={onClose} footer={footer}>
      <div data-testid="event-form" data-mode={mode}>
        {fromWall && (
          <div style={{ ...NOTE, background: 'var(--hs-bg-panel)', border: '1px solid var(--hs-border-strong)', color: 'var(--hs-text-body)' }}>
            <Smartphone size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 1, color: 'var(--hs-text-muted)' }} />
            <span>{t('calendarTab.form.fromWall', { wall: fromWall, day: daySheetHeading(dateOf(date), locale).full })}</span>
          </div>
        )}
        {notice === 'changedElsewhere' && (
          <div role="status" data-testid="event-form-changed" style={{ ...NOTE, background: withAlpha('var(--hs-warning)', 0.1), border: `1px solid ${withAlpha('var(--hs-warning)', 0.35)}`, color: 'var(--hs-warning-ink)' }}>
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

        {locked ? (
          <div data-testid="event-form-locked-times" style={gap}>
            <div style={{ ...FIELD, background: 'transparent', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 8, alignItems: 'baseline' }}>
              <span style={{ ...FIELD_LABEL, margin: 0 }}>{t('calendarTab.form.starts')}</span>
              <span>{daySheetHeading(dateOf(draft.date), locale).full} · {clock(draft.startTime ?? '00:00')}</span>
              <span style={{ ...FIELD_LABEL, margin: 0 }}>{t('calendarTab.form.ends')}</span>
              <span>{daySheetHeading(dateOf(draft.endDate ?? draft.date), locale).full} · {clock(draft.endTime ?? '00:00')}</span>
            </div>
            <p style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 8 }}>
              <Lock size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />{tCore('calendarChange.longNote')}
            </p>
          </div>
        ) : (
          <>
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

          <PhoneSwitch
            checked={draft.allDay}
            onChange={(allDay) => set({ allDay })}
            label={t('calendarTab.form.allDay')}
            testId="event-form-all-day"
            style={{ marginTop: 12 }}
          />

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
                      // Ends moves with Starts, so the event keeps its length.
                      setDraft((d) => ({ ...d, startTime: next, endTime: endKeepingLength(d.startTime ?? '', d.endTime ?? '', next, entry.defaultMinutes) }));
                    }}
                    style={FIELD}
                  />
                </label>
                <label>
                  <span style={FIELD_LABEL}>
                    {t('calendarTab.form.ends')}
                    {nextDay && <span data-testid="event-form-next-day" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--hs-warning-ink)', marginLeft: 6 }}>{t('calendarTab.form.nextDay')}</span>}
                  </span>
                  <input
                    type="time"
                    data-testid="event-form-end"
                    value={draft.endTime}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      set({ endTime: e.target.value });
                    }}
                    style={{ ...FIELD, ...(problem?.code === 'calendarWrite.endsWhenItStarts' ? { borderColor: 'var(--hs-danger)' } : {}) }}
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
          </>
        )}
        {problemText && <p role="alert" style={{ fontSize: 12.5, color: 'var(--hs-danger)', marginTop: 8 }}>{problemText}</p>}

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
                  style={{ ...toggleChipStyle(c.id === calendarId), fontSize: 14 }}
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
            <CalendarDays size={16} aria-hidden="true" />{t('calendarTab.form.noCalendars', { place: settingsPlaceText(tCore, 'calendar') })}
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
