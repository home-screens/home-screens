'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarPlus, ChevronRight, Repeat, TriangleAlert } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { upcomingDays } from '@/lib/day-notes';
import { capitalize } from '@/lib/meal-constants';
import { daySheetHeading, daySheetRows, daySheetTime } from '@/lib/calendar-day-sheet';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { refusalText } from '@/lib/hub-request';
import { afterChangeRefusal, changeRequestBody, saveScope, seriesStartAfterMove } from '@/lib/calendar-event-form';
import type { EditableGoogleEvent } from '@/lib/google-calendar-write';
import type { EditableICloudEvent } from '@/lib/icloud-calendar-write';
import type { EntryCalendar } from '@/lib/calendar-event-writes';
import { addingReadiness, type ChangeScope, type EventDraft } from '@/lib/calendar-write';
import { formatTimeOfDay, parseDateInTZ } from '@/lib/timezone';
import type { CalendarEvent } from '@/types/config';
import { useCalendarTab, type CalendarWriteResult } from '../hooks/useCalendarTab';
import { useHouseholdClockFormat, useHouseholdTimezone, useHouseholdToday } from '../household-clock';
import { showToast } from '../remote-toast';
import DayNotesPage from './DayNotesPage';
import EventFormOverlay, { rememberCalendar, type EventFormSubmit } from './EventFormOverlay';
import EventChoiceSheet from './EventChoiceSheet';
import ConfirmSheet from './ConfirmSheet';
import { dateOfIso } from './DayNoteSheet';
import TabHeader from './TabHeader';
import { LoadFailed } from './RetryButton';
import { settingsPlaceText } from '@/lib/settings-route';

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
  const { entry, events, loadError, trouble, reload, write } = useCalendarTab(days);
  const [form, setForm] = useState<Form | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  // What the hub is doing just now: opening an event, saving the form, or removing the event.
  const [pending, setPending] = useState<'open' | 'save' | 'remove' | null>(null);
  // One write at a time. A ref, since two presses can land before `pending`
  // has drawn: a second save would carry the same version and come back as
  // "changed somewhere else" over a form that had already saved.
  const writing = useRef(false);
  const begin = (what: 'save' | 'remove'): boolean => {
    if (writing.current) return false;
    writing.current = true;
    setPending(what);
    return true;
  };
  const end = () => {
    writing.current = false;
    setPending(null);
  };

  const canAdd = Boolean(entry && entry.calendars.length > 0);
  // An iCloud event names the calendar object it lives in, which the hub checks before writing.
  const editUrl = (event: CalendarEvent) =>
    `/api/calendar/events/${encodeURIComponent(event.id)}${event.sourceRef ? `?ref=${encodeURIComponent(event.sourceRef)}` : ''}`;

  useEffect(() => {
    if (!openAdd || !entry) return;
    if (canAdd) setForm({ mode: 'new', date: openAdd.date, ...(openAdd.wall ? { fromWall: openAdd.wall } : {}) });
    onOpenedAdd?.();
  }, [openAdd, entry, canAdd, onOpenedAdd]);

  const sourceWords = (source: 'google' | 'icloud') => (source === 'icloud' ? t('calendarTab.appleCalendar') : t('calendarTab.googleCalendar'));
  const failed = (result: CalendarWriteResult) => {
    if (!result.ok && 'cancelled' in result) return;
    if (!result.ok && 'unreachable' in result) return showToast(t('calendarTab.unreachable'), 'error');
    showToast(refusalText(result.ok ? null : result.json, tCore, 'refusals.saveFailed', 'refusals.hubUnreachable'), 'error');
  };
  const codeOf = (result: CalendarWriteResult) => (!result.ok && 'json' in result ? (result.json as { code?: string } | null)?.code : undefined);

  const openEvent = async (event: CalendarEvent) => {
    if (!event.canEdit || pending) return;
    setPending('open');
    const result = await write(editUrl(event), 'GET');
    setPending(null);
    if (!result.ok) return failed(result);
    const known = entry?.calendars.find((c) => c.id === event.sourceId);
    setForm({
      mode: 'change',
      event,
      editable: result.json as EditableEvent,
      calendar: known ?? { name: event.sourceName ?? '', color: event.calendarColor ?? DEFAULT_EVENT_COLOR, source: event.sourceRef ? 'icloud' : 'google' },
    });
    setFormKey((k) => k + 1);
  };

  const close = () => {
    setForm(null);
    setAsk(null);
  };

  const add = async (value: EventFormSubmit) => {
    if (!begin('save')) return;
    const result = await write('/api/calendar/events', 'POST', { calendarId: value.calendarId, draft: value.draft });
    end();
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
    if (!begin('save')) return;
    const result = await write(
      `/api/calendar/events/${encodeURIComponent(event.id)}`,
      'PATCH',
      changeRequestBody(editable, { draft: value.draft, scope, repeatChanged: value.repeatChanged }),
      scope === 'series' ? tCore('grownUp.why.calendarChangeSeries', { title: value.draft.title }) : undefined,
    );
    end();
    setAsk(null);
    if (result.ok) {
      close();
      showToast(t('calendarTab.changed'));
      void reload();
      return;
    }
    const next = afterChangeRefusal(codeOf(result));
    if (next === 'reload') {
      // Reload the newest version into the form and say so; nothing was overwritten.
      const fresh = await write(editUrl(event), 'GET');
      if (fresh.ok) {
        setForm({ ...form, editable: fresh.json as EditableEvent, notice: 'changedElsewhere' });
        setFormKey((k) => k + 1);
        return;
      }
    }
    if (next === 'close') {
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
    if (!begin('remove')) return;
    const result = await write(`/api/calendar/events/${encodeURIComponent(event.id)}`, 'DELETE', {
      scope,
      seriesId: editable.seriesId,
      ...('sourceRef' in editable ? { sourceRef: editable.sourceRef, etag: editable.etag } : {}),
    }, tCore('grownUp.why.calendarRemove', { title: editable.draft.title }));
    end();
    setAsk(null);
    if (!result.ok) return failed(result);
    close();
    showToast(t('calendarTab.removed', { calendar: calendar.name }));
    void reload();
  };

  const submit = (value: EventFormSubmit) => {
    if (!form) return;
    if (form.mode === 'new') return void add(value);
    const scope = saveScope(form.editable, value.repeatChanged);
    if (scope === 'ask') return setAsk({ kind: 'save', value });
    void change(value, scope);
  };

  const rows = (date: string) => {
    const dayRows = daySheetRows(events, dateOfIso(date), zone);
    // One width for the day's time column, so the names line up; wider on a
    // day where some time carries its weekday ("Fri 4:00 PM").
    const timeWidth = dayRows.some((r) => !r.allDay && (r.startsEarlier || r.endsLater)) ? 92 : 66;
    return dayRows.map(({ event, allDay, start, end, startsEarlier, endsLater }) => {
      const editable = Boolean(event.canEdit);
      const inner = (
        <>
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: event.calendarColor }} />
          <span style={{ width: timeWidth, flex: 'none', fontSize: 13, fontWeight: 600, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {/* A start or end on another day carries its weekday, as on the wall's day sheet. */}
            {allDay ? t('calendarTab.allDay') : daySheetTime(start, startsEarlier, timeFormat, locale)}
            {!allDay && <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--hs-text-faint)' }}>{daySheetTime(end, endsLater, timeFormat, locale)}</span>}
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
  };

  const readiness = entry ? addingReadiness({ enabled: entry.enabled, google: entry.google, calendars: entry.calendars.length, googleUnreachable: entry.googleUnreachable }) : null;
  // A Google app not yet allowed to add says nothing about adding at all.
  const cardKind = readiness === 'off' ? (entry?.google !== 'notOffered' ? 'off' : null)
    : readiness === 'needsGoogle' ? 'signIn'
      : readiness === 'googleUnreachable' ? 'unreachable'
        : readiness === 'noCalendars' ? 'pick'
          : null;
  const place = settingsPlaceText(tCore, 'calendar');
  // Calendars the hub could not read leave their days looking free: say so
  // over the days, the way the wall's calendar card does. A Google sign-in
  // that lapsed is said once, here, rather than again by the adding card.
  const troubleCard = trouble ? (
    <TabCard
      testId="calendar-trouble-card"
      tone="warning"
      icon={<TriangleAlert size={20} aria-hidden="true" />}
      title={trouble.kind === 'signIn' ? t('calendarTab.troubleSignInTitle')
        : trouble.name ? t('calendarTab.troubleOneTitle', { name: trouble.name })
          : t('calendarTab.troubleSomeTitle')}
      body={trouble.kind === 'signIn' ? t('calendarTab.troubleSignInBody', { place }) : t('calendarTab.troubleFailingBody')}
    />
  ) : null;
  const addingCard = cardKind && !(cardKind === 'signIn' && trouble?.kind === 'signIn') ? (
    <TabCard
      testId="calendar-adding-card"
      icon={<CalendarPlus size={20} aria-hidden="true" />}
      title={t(`calendarTab.${cardKind}Title`)}
      body={t(`calendarTab.${cardKind}Body`, { place })}
    />
  ) : null;
  const card = troubleCard || addingCard ? <>{troubleCard}{addingCard}</> : null;

  const editing = form?.mode === 'change' ? form : null;
  const editDay = editing ? daySheetHeading(dateOfIso(editing.editable.draft.date), locale).full : '';
  // "Every time" moves the series by however far this day's start moved: say where it lands.
  const everyTimeWords = (draft: EventDraft) => {
    const movedTo = editing ? seriesStartAfterMove(editing.editable, draft) : null;
    return movedTo
      ? tCore('calendarChange.everyTimeMovesTo', { time: formatTimeOfDay(parseDateInTZ(`${draft.date}T${movedTo}:00`, zone), { timeFormat, locale, timezone: zone }) })
      : tCore('calendarChange.everyTimeFromFirst');
  };
  const app = editing ? sourceWords(editing.calendar.source) : '';

  return (
    <div data-testid="calendar-tab">
      <TabHeader title={t('calendarTab.title')} />
      <DayNotesPage
        events={{ rows, ...(canAdd ? { onAdd: (date: string) => setForm({ mode: 'new', date }) } : {}) }}
        sub={t('calendarTab.sub')}
        card={<>
          {/* Over the days rather than in their place: they still show, with their notes. */}
          {loadError && <LoadFailed testId="calendar-load-error" message={t('calendarTab.loadError')} onRetry={reload} style={{ marginTop: 0, marginBottom: 16 }} />}
          {card}
        </>}
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
          saving={pending === 'save'}
          removing={pending === 'remove'}
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
            { id: 'series', label: t('calendarTab.everyTime'), detail: everyTimeWords(ask.value.draft), tone: 'plain' },
          ]}
          busy={pending === 'save'}
          onPick={(id) => void change(ask.value, id as ChangeScope)}
          onCancel={() => setAsk(null)}
        />
      )}

      {ask?.kind === 'remove' && editing && (editing.editable.seriesId ? (
        <EventChoiceSheet
          testId="event-remove-choice"
          title={tCore('confirm.removeTitle', { name: editing.editable.draft.title })}
          description={t('calendarTab.removeAsk.body', { calendar: editing.calendar.name, app })}
          cancelLabel={t('calendarTab.keepIt')}
          choices={[
            { id: 'instance', label: t('calendarTab.justThisDay'), detail: tCore('calendarChange.thisDayStays', { day: capitalize(editDay) }), tone: 'danger' },
            { id: 'series', label: t('calendarTab.everyTime'), detail: tCore('calendarChange.everyTimePastFuture'), tone: 'dangerFill' },
          ]}
          busy={pending === 'remove'}
          onPick={(id) => void remove(id as ChangeScope)}
          onCancel={() => setAsk(null)}
        />
      ) : (
        <ConfirmSheet
          title={tCore('confirm.removeTitle', { name: editing.editable.draft.title })}
          description={t('calendarTab.removeAsk.body', { calendar: editing.calendar.name, app })}
          confirmLabel={t('calendarTab.form.remove')}
          cancelLabel={t('calendarTab.keepIt')}
          busy={pending === 'remove'}
          onConfirm={() => void remove('instance')}
          onCancel={() => setAsk(null)}
        />
      ))}
    </div>
  );
}

/** One card over the days: what adding needs, or which calendars stopped updating. */
function TabCard({ testId, icon, title, body, tone }: { testId: string; icon: ReactNode; title: string; body: string; tone?: 'warning' }) {
  return (
    <div data-testid={testId} role={tone === 'warning' ? 'status' : undefined} style={{ background: 'var(--hs-bg-card)', border: '1px solid var(--hs-border-strong)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 12 }}>
      <span
        style={{
          width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          ...(tone === 'warning'
            ? { background: 'color-mix(in srgb, var(--hs-warning) 14%, transparent)', color: 'var(--hs-warning-ink)' }
            : { background: 'var(--hs-accent-soft)', color: 'var(--hs-accent)' }),
        }}
      >
        {icon}
      </span>
      <div>
        <b style={{ display: 'block', fontSize: 15, marginBottom: 3 }}>{title}</b>
        <p style={{ fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: 1.45 }}>{body}</p>
      </div>
    </div>
  );
}
