'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { CalendarPlus, ChevronRight, Repeat } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { upcomingDays } from '@/lib/day-notes';
import { capitalize } from '@/lib/meal-constants';
import { daySheetHeading, daySheetRows } from '@/lib/calendar-day-sheet';
import { formatEventTime } from '@/lib/calendar-utils';
import { refusalText } from '@/lib/hub-request';
import type { EditableGoogleEvent } from '@/lib/google-calendar-write';
import type { EditableICloudEvent } from '@/lib/icloud-calendar-write';
import type { EntryCalendar } from '@/lib/calendar-event-writes';
import type { ChangeScope } from '@/lib/calendar-write';
import type { CalendarEvent } from '@/types/config';
import { useCalendarTab, type CalendarWriteResult } from '../hooks/useCalendarTab';
import { useHouseholdClockFormat, useHouseholdTimezone, useHouseholdToday } from '../household-clock';
import { showToast } from '../remote-toast';
import DayNotesPage from './DayNotesPage';
import EventFormOverlay, { rememberCalendar, type EventFormSubmit } from './EventFormOverlay';
import EventChoiceSheet from './EventChoiceSheet';
import ConfirmSheet from './ConfirmSheet';
import { dateOfIso } from './DayNoteSheet';

const ROW: CSSProperties = {
  position: 'relative', overflow: 'hidden', width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 52,
  padding: '8px 10px 8px 15px', borderRadius: 10, textAlign: 'left', fontFamily: 'inherit', color: 'var(--hs-text-primary)',
};

/** An event as the Change form loads it, from Google or iCloud. */
type EditableEvent = EditableGoogleEvent | EditableICloudEvent;

type Form =
  | { mode: 'new'; date: string; fromWall?: string }
  | { mode: 'change'; event: CalendarEvent; editable: EditableEvent; calendar: Pick<EntryCalendar, 'name' | 'color' | 'source'>; notice?: 'changedElsewhere' };

type Ask =
  | { kind: 'save'; value: EventFormSubmit }
  | { kind: 'remove' };

/**
 * The Calendar tab: the coming days with their events
 * and day notes, "Add event" beside "Add note", and the add and change
 * forms. Notes > Calendar shows the same days and notes without the events.
 */
export default function CalendarTab({ openAdd, onOpenedAdd }: {
  /** A wall's "Type on your phone" code: open a new event for that day. */
  openAdd?: { date: string; wall?: string } | null;
  onOpenedAdd?: () => void;
}) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const today = useHouseholdToday();
  const zone = useHouseholdTimezone();
  const timeFormat = useHouseholdClockFormat();
  const [page, setPage] = useState(0);
  const days = upcomingDays(today, page);
  const { entry, events, reload, write } = useCalendarTab(days);
  const [form, setForm] = useState<Form | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);

  const canAdd = Boolean(entry && entry.calendars.length > 0);
  // An iCloud event names the calendar object it lives in, which the hub checks before writing.
  const editUrl = (event: CalendarEvent) =>
    `/api/calendar/events/${encodeURIComponent(event.id)}${event.sourceRef ? `?ref=${encodeURIComponent(event.sourceRef)}` : ''}`;

  useEffect(() => {
    if (!openAdd || !entry) return;
    if (canAdd) setForm({ mode: 'new', date: openAdd.date, ...(openAdd.wall ? { fromWall: openAdd.wall } : {}) });
    onOpenedAdd?.();
  }, [openAdd, entry, canAdd, onOpenedAdd]);

  const clock = (d: Date) => formatEventTime(d, timeFormat, locale);
  const sourceWords = (source: 'google' | 'icloud') => (source === 'icloud' ? t('calendarTab.appleCalendar') : t('calendarTab.googleCalendar'));
  const failed = (result: CalendarWriteResult) => {
    if (!result.ok && 'cancelled' in result) return;
    if (!result.ok && 'unreachable' in result) return showToast(t('calendarTab.unreachable'), 'error');
    showToast(refusalText(result.ok ? null : result.json, tCore, 'refusals.saveFailed', 'refusals.hubUnreachable'), 'error');
  };
  const codeOf = (result: CalendarWriteResult) => (!result.ok && 'json' in result ? (result.json as { code?: string } | null)?.code : undefined);

  const openEvent = async (event: CalendarEvent) => {
    if (!event.canEdit || busy) return;
    setBusy(true);
    const result = await write(editUrl(event), 'GET');
    setBusy(false);
    if (!result.ok) return failed(result);
    const known = entry?.calendars.find((c) => c.id === event.sourceId);
    setForm({
      mode: 'change',
      event,
      editable: result.json as EditableEvent,
      calendar: known ?? { name: event.sourceName ?? '', color: event.calendarColor ?? '#888', source: event.sourceRef ? 'icloud' : 'google' },
    });
    setFormKey((k) => k + 1);
  };

  const close = () => {
    setForm(null);
    setAsk(null);
  };

  const add = async (value: EventFormSubmit) => {
    setBusy(true);
    const result = await write('/api/calendar/events', 'POST', { calendarId: value.calendarId, draft: value.draft });
    setBusy(false);
    if (!result.ok) return failed(result);
    rememberCalendar(value.calendarId);
    const name = entry?.calendars.find((c) => c.id === value.calendarId)?.name ?? '';
    close();
    showToast(t('calendarTab.added', { calendar: name }));
    void reload();
  };

  const change = async (value: EventFormSubmit, scope: ChangeScope) => {
    if (form?.mode !== 'change') return;
    const { editable, event } = form;
    setBusy(true);
    const result = await write(`/api/calendar/events/${encodeURIComponent(event.id)}`, 'PATCH', {
      draft: value.draft,
      etag: scope === 'series' ? editable.seriesEtag : editable.etag,
      scope,
      seriesId: editable.seriesId,
      ...('sourceRef' in editable ? { sourceRef: editable.sourceRef } : {}),
      dayWas: editable.draft.date,
      repeatChanged: value.repeatChanged,
    }, scope === 'series' ? tCore('grownUp.why.calendarChangeSeries', { title: value.draft.title }) : undefined);
    setBusy(false);
    setAsk(null);
    if (result.ok) {
      close();
      showToast(t('calendarTab.changed'));
      void reload();
      return;
    }
    const code = codeOf(result);
    if (code === 'calendarWrite.changedElsewhere') {
      // Reload the newest version into the form and say so; nothing was overwritten.
      const fresh = await write(editUrl(event), 'GET');
      if (fresh.ok) {
        setForm({ ...form, editable: fresh.json as EditableEvent, notice: 'changedElsewhere' });
        setFormKey((k) => k + 1);
        return;
      }
    }
    if (code === 'calendarWrite.gone') {
      close();
      showToast(tCore('refusals.calendarWrite.gone'), 'info');
      void reload();
      return;
    }
    failed(result);
  };

  const remove = async (scope: ChangeScope) => {
    if (form?.mode !== 'change') return;
    const { editable, event, calendar } = form;
    setBusy(true);
    const result = await write(`/api/calendar/events/${encodeURIComponent(event.id)}`, 'DELETE', {
      scope,
      seriesId: editable.seriesId,
      ...('sourceRef' in editable ? { sourceRef: editable.sourceRef, etag: editable.etag } : {}),
    }, tCore('grownUp.why.calendarRemove', { title: editable.draft.title }));
    setBusy(false);
    setAsk(null);
    if (!result.ok) return failed(result);
    close();
    showToast(t('calendarTab.removed', { calendar: calendar.name }));
    void reload();
  };

  const submit = (value: EventFormSubmit) => {
    if (!form) return;
    if (form.mode === 'new') return void add(value);
    // One day of a repeating event asks which days; a new repeat can only mean every time.
    if (form.editable.seriesId && !value.repeatChanged) return setAsk({ kind: 'save', value });
    void change(value, form.editable.seriesId ? 'series' : 'instance');
  };

  const rows = (date: string) => daySheetRows(events, dateOfIso(date), zone).map(({ event, allDay, start, end }) => {
    const editable = Boolean(event.canEdit);
    const inner = (
      <>
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: event.calendarColor }} />
        <span style={{ width: 66, flex: 'none', fontSize: 13, fontWeight: 600, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums' }}>
          {allDay ? t('calendarTab.allDay') : clock(start)}
          {!allDay && <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--hs-text-faint)' }}>{clock(end)}</span>}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 15, fontWeight: editable ? 600 : 500, lineHeight: 1.25, color: editable ? undefined : 'var(--hs-text-body)', overflowWrap: 'anywhere' }}>{event.title}</b>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 1 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: event.calendarColor, flex: 'none' }} />
            {event.sourceName}
            {event.repeats && <><Repeat size={12} aria-hidden="true" />{t('calendarTab.repeats')}</>}
          </span>
        </span>
        {editable && <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--hs-text-faint)', flex: 'none' }} />}
      </>
    );
    // An event that cannot be changed here is not a button: no arrow, no fill.
    return editable ? (
      <button
        key={event.id}
        type="button"
        className="press-scale"
        data-testid="calendar-event"
        data-event-id={event.id}
        aria-label={t('calendarTab.changeAria', { title: event.title })}
        onClick={() => void openEvent(event)}
        style={{ ...ROW, cursor: 'pointer', background: 'var(--hs-bg-panel)', border: '1px solid var(--hs-border)' }}
      >
        {inner}
      </button>
    ) : (
      <div key={event.id} data-testid="calendar-event" data-event-id={event.id} data-read-only="" style={{ ...ROW, background: 'transparent', border: '1px solid var(--hs-border)' }}>
        {inner}
      </div>
    );
  });

  const off = entry && !entry.enabled && entry.google !== 'notOffered';
  const needsGoogle = entry?.enabled && !canAdd && entry.google !== null && entry.google !== 'notOffered' && entry.google !== 'ready';
  const card = (off || needsGoogle) ? (
    <div data-testid="calendar-adding-card" style={{ background: 'var(--hs-bg-card)', border: '1px solid var(--hs-border-strong)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.14)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <CalendarPlus size={20} aria-hidden="true" />
      </span>
      <div>
        <b style={{ display: 'block', fontSize: 15, marginBottom: 3 }}>{off ? t('calendarTab.offTitle') : t('calendarTab.signInTitle')}</b>
        <p style={{ fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: 1.45 }}>{off ? t('calendarTab.offBody') : t('calendarTab.signInBody')}</p>
      </div>
    </div>
  ) : null;

  const editing = form?.mode === 'change' ? form : null;
  const editDay = editing ? daySheetHeading(dateOfIso(editing.editable.draft.date), locale).full : '';
  const app = editing ? sourceWords(editing.calendar.source) : '';

  return (
    <div data-testid="calendar-tab">
      <div style={{ padding: '8px 0 12px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--hs-text-primary)', margin: 0, letterSpacing: '-0.02em' }}>{t('calendarTab.title')}</h2>
      </div>
      <DayNotesPage
        events={{ rows, ...(canAdd ? { onAdd: (date: string) => setForm({ mode: 'new', date }) } : {}) }}
        sub={t('calendarTab.sub')}
        card={card}
        page={page}
        onPageChange={setPage}
      />

      {form && entry && (
        <EventFormOverlay
          key={formKey}
          mode={form.mode}
          entry={entry}
          date={form.mode === 'new' ? form.date : form.editable.draft.date}
          {...(form.mode === 'change'
            ? { initial: form.editable.draft, repeat: form.editable.repeat, calendar: form.calendar, notice: form.notice ?? null, onRemove: () => setAsk({ kind: 'remove' }) }
            : { fromWall: form.fromWall })}
          busy={busy}
          onSubmit={submit}
          onClose={close}
        />
      )}

      {ask?.kind === 'save' && editing && (
        <EventChoiceSheet
          testId="event-save-choice"
          title={t('calendarTab.saveAsk.title', { title: ask.value.draft.title })}
          description={tCore('calendarChange.askBody')}
          cancelLabel={t('calendarTab.backToForm')}
          choices={[
            { id: 'instance', label: t('calendarTab.justThisDay'), detail: editDay, tone: 'primary' },
            { id: 'series', label: t('calendarTab.everyTime'), detail: tCore('calendarChange.everyTimeFromFirst'), tone: 'plain' },
          ]}
          onPick={(id) => void change(ask.value, id as ChangeScope)}
          onCancel={() => setAsk(null)}
        />
      )}

      {ask?.kind === 'remove' && editing && (editing.editable.seriesId ? (
        <EventChoiceSheet
          testId="event-remove-choice"
          title={t('calendarTab.removeAsk.title', { title: editing.editable.draft.title })}
          description={t('calendarTab.removeAsk.body', { calendar: editing.calendar.name, app })}
          cancelLabel={t('calendarTab.keepIt')}
          choices={[
            { id: 'instance', label: t('calendarTab.justThisDay'), detail: tCore('calendarChange.thisDayStays', { day: capitalize(editDay) }), tone: 'danger' },
            { id: 'series', label: t('calendarTab.everyTime'), detail: tCore('calendarChange.everyTimePastFuture'), tone: 'dangerFill' },
          ]}
          onPick={(id) => void remove(id as ChangeScope)}
          onCancel={() => setAsk(null)}
        />
      ) : (
        <ConfirmSheet
          title={t('calendarTab.removeAsk.title', { title: editing.editable.draft.title })}
          description={t('calendarTab.removeAsk.body', { calendar: editing.calendar.name, app })}
          confirmLabel={t('calendarTab.form.remove')}
          cancelLabel={t('calendarTab.keepIt')}
          confirmColor="#f87171"
          onConfirm={() => void remove('instance')}
          onCancel={() => setAsk(null)}
          zIndex={210}
        />
      ))}
    </div>
  );
}
