'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, ChevronRight, Info, Pencil, Repeat, Smartphone, WifiOff } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { displayFetch } from '@/lib/display-fetch';
import { grownUpFetch, isGrownUpCancelled } from '@/lib/grown-up-client';
import { displayCache } from '@/lib/display-cache';
import { isCalendarReadUrl } from '@/lib/calendar-sources';
import { daySheetHeading } from '@/lib/calendar-day-sheet';
import { refusalSentence } from '@/lib/hub-request';
import { repeatChoiceWords, repeatShortWords } from '@/lib/calendar-repeat-words';
import {
  CALENDAR_WRITE_LIMITS,
  CalendarWriteError,
  endKeepingLength,
  normalizeEventDraft,
  repeatFrequenciesFor,
  type ChangeScope,
  type EventDraft,
  type RepeatFrequency,
  type RepeatReading,
  type RepeatRule,
} from '@/lib/calendar-write';
import type { CalendarEntryInfo } from '@/lib/calendar-event-writes';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import type { CalendarEvent, TimeFormat } from '@/types/config';
import { isoDateInTZ } from '@/lib/timezone';
import { WallOverlay, WallSheetPanel } from './WallOverlay';
import { wallPressProps } from './wallPress';
import { wallTypingVars } from './wallTypingVars';
import { useWallTyping } from './useWallTyping';
import { WallTextField } from './WallTextField';
import { WallKeyboard, WALL_KEYBOARD_IDLE_MS } from './WallKeyboard';
import { WallNotice } from './WallNotice';
import { WallChoiceChips, WallRadioRows } from './WallChoiceChips';
import { WallAskInSheet } from './WallAskInSheet';
import { useWallOverlayScale } from './useWallOverlayScale';
import { useDisplayId } from '@/hooks/useDisplayId';

const SERIF = "var(--font-dm-serif), 'DM Serif Display', Georgia, serif";
/** The hours the grid offers: family life. Earlier or later is for the phone. */
const FIRST_HOUR = 6;
const LAST_HOUR = 21;
const MINUTES = [0, 15, 30, 45] as const;
const LENGTHS = [30, 60, 90, 120, 180] as const;
/** The calendar this wall put its last event on, offered first next time. */
const LAST_CALENDAR_KEY = 'hs.wall.lastCalendar';

type Step = 'typing' | 'details' | 'repeat' | 'ask' | 'handoff';
type Notice = { tone: 'warning' | 'error'; text: string } | null;

/** One event loaded for Change: the Google or iCloud shape, whichever the hub answered. */
interface Editable {
  etag: string;
  seriesId?: string;
  seriesEtag?: string;
  sourceRef?: string;
  draft: EventDraft;
  repeat: RepeatReading;
}

function toMinutes(time: string | undefined): number {
  const [h, m] = (time ?? '09:00').split(':').map(Number);
  return h * 60 + m;
}

function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function remembered(): string | null {
  try { return localStorage.getItem(LAST_CALENDAR_KEY); } catch { return null; }
}

/**
 * The wall's add and change form: the name on the wall keyboard, then the
 * time on an hour grid with minute and length chips, the repeat and the
 * calendar as big chips. One overlay, stepping through its pages, so nothing
 * stacks. The rules are the hub's own (`normalizeEventDraft`), so the form
 * never offers what the hub would refuse. The screen holds still while it is
 * open and it closes after a minute with nobody touching it, like the recipe
 * search.
 */
export function WallEventForm({ mode, date, event, entry, theme, accent, timeFormat, onDone, onClose }: {
  mode: 'new' | 'change';
  /** The day tapped (new). */
  date: string;
  /** The event being changed. */
  event?: CalendarEvent;
  entry: CalendarEntryInfo;
  theme: FullscreenThemeTokens;
  accent: string;
  timeFormat: TimeFormat;
  /** Saved: the sheet closes and the event shows up on the calendar. */
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const { P: base, landscape } = useWallOverlayScale();
  // A landscape wall draws the sheet at the day sheet's smaller scale, and any
  // step still taller than the sheet's room (the Ends grid, a longer language)
  // shrinks to fit, so Save is never below the screen's edge.
  const fit = useSheetFit();
  const P = useCallback((n: number) => base(n) * (landscape ? 0.7 : 1) * fit.scale, [base, landscape, fit.scale]);
  const typing = useWallTyping({ maxLength: CALENDAR_WRITE_LIMITS.maxTitleLength, capitalize: true });
  const displayId = useDisplayId();

  const [step, setStep] = useState<Step>(mode === 'new' ? 'typing' : 'details');
  const [editable, setEditable] = useState<Editable | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(date);
  const [allDay, setAllDay] = useState(false);
  const today = isoDateInTZ(new Date(), entry.timezone);
  const [start, setStart] = useState(() => {
    if (date !== today) return 9 * 60;
    const next = (new Date().getHours() + 1) * 60;
    return Math.min(LAST_HOUR * 60, Math.max(FIRST_HOUR * 60, next));
  });
  const [length, setLength] = useState<number>(entry.defaultMinutes);
  const [other, setOther] = useState(!LENGTHS.includes(entry.defaultMinutes as (typeof LENGTHS)[number]));
  const [end, setEnd] = useState(() => start + entry.defaultMinutes);
  /** With Other picked, which time has its grid open; the other folds to one line. */
  const [otherOpen, setOtherOpen] = useState<'start' | 'end'>('end');
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [calendarId, setCalendarId] = useState(() => {
    const last = remembered();
    return entry.calendars.some((c) => c.id === last) ? last! : entry.defaultCalendarId ?? '';
  });

  const editUrl = event
    ? `/api/calendar/events/${encodeURIComponent(event.id)}${event.sourceRef ? `?ref=${encodeURIComponent(event.sourceRef)}` : ''}`
    : '';

  /** Fill the form from the event as Google or iCloud holds it now. */
  const load = useCallback(async (changed: boolean) => {
    if (!event) return;
    try {
      const res = await displayFetch(editUrl);
      const body = await res.json().catch(() => null);
      if (!res.ok) return setNotice({ tone: 'error', text: refusalSentence(body, tCore) ?? tCore('refusals.calendarWrite.unreachable') });
      const loaded = body as Editable;
      setEditable(loaded);
      const d = loaded.draft;
      typing.setText(d.title);
      setDay(d.date);
      setAllDay(d.allDay);
      const s = toMinutes(d.startTime);
      const e = toMinutes(d.endTime);
      const len = (((e - s) % 1440) + 1440) % 1440;
      setStart(s);
      setEnd(e);
      setLength(len);
      setOther(!LENGTHS.includes(len as (typeof LENGTHS)[number]));
      setOtherOpen('end');
      setRepeat(loaded.repeat.kind === 'known' ? loaded.repeat.rule : null);
      setNotice(changed ? { tone: 'warning', text: t('calendar.eventForm.changedElsewhere') } : null);
    } catch {
      setNotice({ tone: 'error', text: tCore('refusals.calendarWrite.unreachable') });
    }
    // typing.setText is stable; the rest is what a load reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, editUrl, t, tCore]);

  useEffect(() => {
    if (mode === 'change') void load(false);
  }, [mode, load]);

  const endMinutes = other ? end : start + length;
  const draft: EventDraft = useMemo(() => (allDay
    ? { title: typing.text, date: day, allDay: true, lastDate: editable?.draft.lastDate ?? day, location: editable?.draft.location, repeat }
    : { title: typing.text, date: day, allDay: false, startTime: clock(start), endTime: clock(endMinutes), location: editable?.draft.location, repeat }),
  [allDay, typing.text, day, editable, repeat, start, endMinutes]);

  const problem = useMemo(() => {
    try {
      normalizeEventDraft(draft, { timezone: entry.timezone });
      return null;
    } catch (e) {
      return e instanceof CalendarWriteError ? e : null;
    }
  }, [draft, entry.timezone]);
  const repeatEditable = editable?.repeat.kind !== 'other';
  const repeatChanged = mode === 'change' && repeatEditable
    && JSON.stringify(repeat) !== JSON.stringify(editable?.repeat.kind === 'known' ? editable.repeat.rule : null);

  const finish = () => {
    // The hub moved the calendar revision; read now rather than at the next beat.
    displayCache.refreshWhere(isCalendarReadUrl);
    onDone();
  };

  const send = async (scope: ChangeScope) => {
    setBusy(true);
    setNotice(null);
    try {
      const sent = { ...draft, ...(repeatEditable ? {} : { repeat: undefined }) };
      const res = mode === 'new'
        ? await displayFetch('/api/calendar/events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendarId, draft: sent }),
        })
        : await (scope === 'series'
          ? grownUpFetch(displayFetch, tCore('grownUp.why.calendarChangeSeries', { title: typing.text.trim() }))
          : displayFetch)(editUrl.split('?')[0], {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: sent,
            etag: scope === 'series' ? editable?.seriesEtag : editable?.etag,
            scope,
            seriesId: editable?.seriesId,
            ...(editable?.sourceRef ? { sourceRef: editable.sourceRef } : {}),
            dayWas: editable?.draft.date,
            repeatChanged,
          }),
        });
      if (res.ok) {
        if (mode === 'new') {
          try { localStorage.setItem(LAST_CALENDAR_KEY, calendarId); } catch { /* nothing to remember */ }
        }
        return finish();
      }
      const body = await res.json().catch(() => null) as { code?: string } | null;
      setStep('details');
      if (body?.code === 'calendarWrite.changedElsewhere') return void load(true);
      setNotice({ tone: 'error', text: refusalSentence(body, tCore) ?? tCore('refusals.calendarWrite.unreachable') });
    } catch (err) {
      setStep('details');
      // Nobody gave the grown-up code: back to the form, nothing changed, nothing to say.
      if (!isGrownUpCancelled(err)) setNotice({ tone: 'error', text: tCore('refusals.calendarWrite.unreachable') });
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (problem || busy) return;
    // One day of a repeating event asks which days; a new repeat can only mean every time.
    if (mode === 'change' && editable?.seriesId && !repeatChanged) return setStep('ask');
    void send(mode === 'change' && editable?.seriesId ? 'series' : 'instance');
  };

  // ── Pieces ──
  const heading = daySheetHeading(dateOf(day), locale);
  const hourLabel = (h: number) => {
    if (timeFormat === '24h') return <>{String(h).padStart(2, '0')}<small style={{ fontSize: P(20), opacity: 0.7 }}>:00</small></>;
    const twelve = h % 12 === 0 ? 12 : h % 12;
    return <>{twelve}<small style={{ fontSize: P(20), opacity: 0.7, marginLeft: P(6) }}>{h < 12 ? 'AM' : 'PM'}</small></>;
  };
  const timeWords = (minutes: number) => {
    const d = new Date(2000, 0, 1, Math.floor(minutes / 60) % 24, minutes % 60);
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: timeFormat !== '24h' }).format(d);
  };
  const lengthWords = (minutes: number) => (minutes % 60 === 0
    ? t('calendar.eventForm.hours', { count: minutes / 60 })
    : minutes < 60 ? t('calendar.eventForm.minutes', { count: minutes }) : t('calendar.eventForm.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 }));

  const label: CSSProperties = {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: P(22), fontWeight: 600,
    letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wt-text-3)', margin: `${P(26)}px 0 ${P(12)}px`,
  };
  const labelValue: CSSProperties = { letterSpacing: 0, textTransform: 'none', fontSize: P(26), color: 'var(--wt-text)' };
  const cell = (on: boolean, off = false): CSSProperties => ({
    minHeight: Math.max(44, P(74)), borderRadius: P(16), display: 'flex', alignItems: 'center', justifyContent: 'center',
    font: 'inherit', fontSize: P(28), fontWeight: 600, fontVariantNumeric: 'tabular-nums', cursor: off ? 'default' : 'pointer',
    background: on ? 'var(--wt-accent)' : 'color-mix(in srgb, var(--wt-text) 4%, var(--wt-surface))',
    color: on ? 'var(--wt-on-accent)' : 'var(--wt-text)', border: on ? `${P(2)}px solid transparent` : `${P(2)}px solid var(--wt-border)`,
    opacity: off ? 0.3 : 1,
  });
  const bigButton = (primary: boolean): CSSProperties => ({
    flex: primary ? 1 : '0 0 auto', padding: primary ? 0 : `0 ${P(40)}px`, minHeight: Math.max(44, P(88)), borderRadius: P(18),
    font: 'inherit', fontSize: P(28), fontWeight: primary ? 700 : 600, cursor: 'pointer',
    background: primary ? 'var(--wt-accent)' : 'color-mix(in srgb, var(--wt-text) 6%, var(--wt-surface))',
    color: primary ? 'var(--wt-on-accent)' : 'var(--wt-text)', border: primary ? 0 : `1px solid var(--wt-border)`, opacity: primary && (problem || busy) ? 0.5 : 1,
  });

  const header = (kickerRight?: React.ReactNode) => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: P(16), fontSize: P(22), letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wt-text-3)', marginBottom: P(8) }}>
        <span>{mode === 'new' ? t('calendar.eventForm.newKicker', { weekday: heading.weekday }) : t('calendar.eventForm.changeKicker', { weekday: heading.weekday })}</span>
        {kickerRight}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: P(56), lineHeight: 1.1, color: 'var(--wt-text)', marginBottom: P(24) }}>{heading.date}</div>
    </>
  );

  const hourGrid = (selected: number, onPick: (minutes: number) => void, before?: number) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: P(12) }} role="radiogroup">
      {Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i).map((h) => {
        const off = before !== undefined && h * 60 + 45 <= before;
        const on = Math.floor(selected / 60) === h;
        return (
          <button key={h} type="button" role="radio" aria-checked={on} disabled={off} data-hour={h} {...wallPressProps}
            onClick={() => onPick(h * 60 + (selected % 60))} style={cell(on, off)}>
            {hourLabel(h)}
          </button>
        );
      })}
    </div>
  );
  // With Other picked, moving Starts carries Ends along, so the event keeps its length.
  const moveStart = (next: number) => {
    setEnd(toMinutes(endKeepingLength(clock(start), clock(end), clock(next), entry.defaultMinutes)));
    setStart(next);
  };
  /** A time folded to one line while the other one's grid is open; pressing it opens this one. */
  const foldedTime = (minutes: number, onOpen: () => void, testId: string) => (
    <button type="button" {...wallPressProps} onClick={onOpen}
      style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
      <WallTextField P={P} text={timeWords(minutes)} placeholder="" typing={false} fontSize={40} minHeight={92} testId={testId}
        trailing={<span style={{ display: 'inline-flex', alignItems: 'center', gap: P(10), fontSize: P(26), fontWeight: 600, color: 'var(--wt-accent)' }}><Pencil size={P(28)} aria-hidden="true" />{t('event-detail.change')}</span>} />
    </button>
  );
  const minuteRow = (selected: number, onPick: (minutes: number) => void) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: P(12), marginTop: P(12) }} role="radiogroup">
      {MINUTES.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={selected % 60 === m} data-minute={m} {...wallPressProps}
          onClick={() => onPick(Math.floor(selected / 60) * 60 + m)} style={cell(selected % 60 === m)}>
          :{String(m).padStart(2, '0')}
        </button>
      ))}
    </div>
  );

  // ── Pages ──
  let body: React.ReactNode;
  if (step === 'typing') {
    body = (
      <>
        {header(mode === 'new' && (
          <button type="button" {...wallPressProps} data-testid="wall-event-handoff" onClick={() => setStep('handoff')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: P(10), height: P(60), padding: `0 ${P(22)}px`, borderRadius: P(30), border: `${P(2)}px solid var(--wt-border)`, background: 'transparent', color: 'var(--wt-text-2)', font: 'inherit', fontSize: P(22), letterSpacing: 0, textTransform: 'none', fontWeight: 600, cursor: 'pointer' }}>
            <Smartphone size={P(28)} aria-hidden="true" />{t('calendar.eventForm.typeOnPhone')}
          </button>
        ))}
        <div style={{ ...label, marginTop: 0 }}>{t('calendar.eventForm.what')}</div>
        <WallTextField P={P} text={typing.text} placeholder={t('calendar.eventForm.namePlaceholder')} left={typing.left} testId="wall-event-title" />
      </>
    );
  } else if (step === 'handoff') {
    // The phone opens its own form for this day, saying which wall sent it.
    const url = `${window.location.origin}/remote?tab=calendar&add=${day}${displayId ? `&wall=${encodeURIComponent(displayId)}` : ''}`;
    body = (
      <>
        {header()}
        <div style={{ display: 'flex', gap: P(40), alignItems: 'center', marginTop: P(10) }}>
          <div style={{ padding: P(22), background: '#fff', borderRadius: P(22), border: `${P(2)}px solid var(--wt-border)`, flexShrink: 0 }}>
            <QRCodeSVG value={url} size={P(336)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: P(36), fontWeight: 700, lineHeight: 1.25, marginBottom: P(16) }}>{t('calendar.eventForm.typeOnPhone')}</div>
            <div style={{ fontSize: P(27), color: 'var(--wt-text-2)', lineHeight: 1.45 }}>{t('calendar.eventForm.handoffBody', { day: heading.full })}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: P(16), marginTop: P(44) }}>
          <button type="button" {...wallPressProps} onClick={() => setStep('typing')} style={{ ...bigButton(false), flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: P(12) }}>
            <ArrowLeft size={P(30)} aria-hidden="true" />{t('calendar.eventForm.backToKeyboard')}
          </button>
        </div>
      </>
    );
  } else if (step === 'repeat') {
    const choices: (RepeatFrequency | 'none')[] = ['none', ...repeatFrequenciesFor(day)];
    body = (
      <>
        {header()}
        <div style={{ fontFamily: SERIF, fontSize: P(40), marginTop: -P(10), marginBottom: P(20) }}>{t('calendar.eventForm.howOften')}</div>
        <WallRadioRows
          P={P}
          label={t('calendar.eventForm.repeats')}
          testId="wall-event-repeat"
          value={repeat?.frequency ?? 'none'}
          options={choices.map((c) => ({
            value: c,
            label: c === 'none' ? tCore('calendarRepeat.none') : repeatChoiceWords(c, day, locale, tCore),
            ...(c === 'weekdays' ? { hint: tCore('calendarRepeat.weekdaysHint') } : {}),
          }))}
          onChange={(c) => setRepeat(c === 'none' ? null : { frequency: c, ...(repeat?.until ? { until: repeat.until } : {}) })}
        />
        <div style={{ marginTop: P(26) }}>
          <WallNotice tone="info" P={P} icon={<Smartphone size={P(32)} aria-hidden="true" />}>{t('calendar.eventForm.repeatNote')}</WallNotice>
        </div>
        <div style={{ display: 'flex', marginTop: P(30) }}>
          <button type="button" {...wallPressProps} data-testid="wall-event-repeat-done" onClick={() => setStep('details')} style={bigButton(true)}>{t('calendar.eventForm.done')}</button>
        </div>
      </>
    );
  } else if (step === 'ask') {
    body = (
      <>
        {header()}
        <WallAskInSheet
          testId="wall-event-save-ask"
          theme={theme}
          accentColor={accent}
          busy={busy}
          title={t('calendar.eventForm.changeTitle', { title: typing.text.trim() })}
          body={tCore('calendarChange.askBody')}
          cancelLabel={t('calendar.eventForm.backToForm')}
          choices={[
            { id: 'instance', label: t('event-detail.justThisDay'), detail: heading.full, tone: 'primary' },
            { id: 'series', label: t('event-detail.everyTime'), detail: tCore('calendarChange.everyTimeFromFirst'), tone: 'plain' },
          ]}
          onPick={(id) => void send(id === 'series' ? 'series' : 'instance')}
          onCancel={() => setStep('details')}
        />
      </>
    );
  } else {
    const calendar = entry.calendars.find((c) => c.id === (event?.sourceId ?? calendarId));
    const problemText = problem && problem.code !== 'calendarWrite.titleRequired' ? refusalSentence(problem, tCore) : null;
    body = (
      <>
        {header()}
        {notice && (
          <div style={{ marginBottom: P(22) }}>
            <WallNotice tone={notice.tone} P={P} testId="wall-event-notice"
              icon={notice.tone === 'warning' ? <Info size={P(34)} aria-hidden="true" /> : <WifiOff size={P(34)} aria-hidden="true" />}>
              {notice.text}
            </WallNotice>
          </div>
        )}
        <button type="button" {...wallPressProps} onClick={() => setStep('typing')} aria-label={t('event-detail.change')}
          style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
          <WallTextField P={P} text={typing.text} placeholder={t('calendar.eventForm.namePlaceholder')} typing={false} testId="wall-event-title"
            trailing={<span style={{ display: 'inline-flex', alignItems: 'center', gap: P(10), fontSize: P(26), fontWeight: 600, color: 'var(--wt-accent)' }}><Pencil size={P(28)} aria-hidden="true" />{t('event-detail.change')}</span>} />
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: P(14), marginTop: P(26) }}>
          <button type="button" role="switch" aria-checked={allDay} {...wallPressProps} data-testid="wall-event-all-day" onClick={() => setAllDay((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: Math.max(44, P(100)), padding: `${P(14)}px ${P(26)}px`, borderRadius: P(20), background: 'color-mix(in srgb, var(--wt-text) 4%, var(--wt-surface))', border: `1px solid var(--wt-border)`, font: 'inherit', fontSize: P(30), fontWeight: 600, color: 'var(--wt-text)', cursor: 'pointer' }}>
            {t('calendar.eventForm.allDay')}
            <span aria-hidden="true" style={{ width: P(112), height: P(64), borderRadius: P(32), position: 'relative', background: allDay ? 'var(--wt-accent)' : 'var(--wt-border)', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: P(6), left: allDay ? P(54) : P(6), width: P(52), height: P(52), borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }} />
            </span>
          </button>
          <button type="button" {...wallPressProps} data-testid="wall-event-repeats" disabled={!repeatEditable} onClick={() => setStep('repeat')}
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', minHeight: Math.max(44, P(100)), padding: `${P(14)}px ${P(64)}px ${P(14)}px ${P(26)}px`, borderRadius: P(20), background: 'color-mix(in srgb, var(--wt-text) 4%, var(--wt-surface))', border: `1px solid var(--wt-border)`, font: 'inherit', color: 'var(--wt-text)', cursor: repeatEditable ? 'pointer' : 'default', textAlign: 'left' }}>
            <small style={{ fontSize: P(19), letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wt-text-3)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: P(8) }}>
              <Repeat size={P(20)} aria-hidden="true" />{t('calendar.eventForm.repeats')}
            </small>
            <b style={{ fontSize: P(28), fontWeight: 600, whiteSpace: 'nowrap' }}>
              {repeatEditable ? repeatShortWords(repeat, tCore) : tCore('calendarRepeat.other')}
            </b>
            {repeatEditable && <ChevronRight size={P(34)} aria-hidden="true" style={{ position: 'absolute', right: P(20), top: '50%', transform: 'translateY(-50%)', color: 'var(--wt-text-3)' }} />}
          </button>
        </div>

        {!allDay && !other && (
          <>
            <div style={label}>{t('calendar.eventForm.starts')}<span style={labelValue}>{timeWords(start)}</span></div>
            {hourGrid(start, setStart)}
            {minuteRow(start, setStart)}
            <div style={label}>{t('calendar.eventForm.howLong')}<span style={labelValue}>{t('calendar.eventForm.endsAt', { time: timeWords(start + length) })}</span></div>
          </>
        )}
        {!allDay && other && otherOpen === 'end' && (
          <>
            <div style={label}>{t('calendar.eventForm.starts')}</div>
            {foldedTime(start, () => setOtherOpen('start'), 'wall-event-start-folded')}
            <div style={label}>{t('calendar.eventForm.ends')}<span style={labelValue}>{t('calendar.eventForm.endsLength', { time: timeWords(end), length: lengthWords((((end - start) % 1440) + 1440) % 1440) })}</span></div>
            {hourGrid(end, setEnd, start)}
            {minuteRow(end, setEnd)}
            <div style={label}>{t('calendar.eventForm.howLong')}</div>
          </>
        )}
        {!allDay && other && otherOpen === 'start' && (
          <>
            <div style={label}>{t('calendar.eventForm.starts')}<span style={labelValue}>{timeWords(start)}</span></div>
            {hourGrid(start, moveStart)}
            {minuteRow(start, moveStart)}
            <div style={label}>{t('calendar.eventForm.ends')}<span style={labelValue}>{lengthWords((((end - start) % 1440) + 1440) % 1440)}</span></div>
            {foldedTime(end, () => setOtherOpen('end'), 'wall-event-end-folded')}
            <div style={label}>{t('calendar.eventForm.howLong')}</div>
          </>
        )}
        {!allDay && (
          <WallChoiceChips
            P={P}
            fill
            label={t('calendar.eventForm.howLong')}
            testId="wall-event-length"
            value={other ? 'other' : String(length)}
            options={[
              ...LENGTHS.map((m) => ({ value: String(m), label: t(`calendar.eventForm.length${m}`) })),
              { value: 'other', label: t('calendar.eventForm.lengthOther'), other: true },
            ]}
            onChange={(v) => {
              if (v === 'other') {
                setEnd(start + length);
                setOther(true);
                setOtherOpen('end');
              } else {
                setOther(false);
                setLength(Number(v));
              }
            }}
          />
        )}
        {problemText && <div role="alert" style={{ marginTop: P(14), fontSize: P(24), color: theme.isDark ? '#f87171' : '#b91c1c' }}>{problemText}</div>}

        <div style={label}>{t('calendar.eventForm.calendar')}</div>
        {mode === 'new' ? (
          <WallChoiceChips
            P={P}
            label={t('calendar.eventForm.calendar')}
            testId="wall-event-calendar"
            value={calendarId}
            options={entry.calendars.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
            onChange={setCalendarId}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: P(16), padding: `${P(22)}px ${P(26)}px`, borderRadius: P(20), background: 'color-mix(in srgb, var(--wt-text) 4%, var(--wt-surface))', border: '1px solid var(--wt-border)', fontSize: P(30), fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: P(22), height: P(22), borderRadius: '50%', background: event?.calendarColor ?? calendar?.color }} />
            {event?.sourceName ?? calendar?.name}
            <small style={{ marginLeft: 'auto', fontSize: P(22), color: 'var(--wt-text-3)', fontWeight: 500 }}>{t('calendar.eventForm.staysOn')}</small>
          </div>
        )}
        <div style={{ display: 'flex', gap: P(16), marginTop: P(36) }}>
          <button type="button" {...wallPressProps} data-testid="wall-event-save" disabled={Boolean(problem) || busy} onClick={save} style={bigButton(true)}>
            {notice?.tone === 'error' ? t('calendar.eventForm.tryAgain') : mode === 'new' ? t('calendar.eventForm.add') : t('calendar.eventForm.save')}
          </button>
          <button type="button" {...wallPressProps} onClick={onClose} style={bigButton(false)}>{t('calendar.eventForm.cancel')}</button>
        </div>
      </>
    );
  }

  return (
    <WallOverlay
      label={mode === 'new' ? t('calendar.eventForm.newKicker', { weekday: heading.full }) : t('calendar.eventForm.changeKicker', { weekday: heading.full })}
      testId="wall-event-form"
      onClose={onClose}
      autoCloseMs={WALL_KEYBOARD_IDLE_MS}
      scrim={theme.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.52)'}
      style={{ fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      <WallSheetPanel variant="sheet" theme={theme}>
        <div ref={fit.ref} data-step={step} style={{ ...wallTypingVars(theme, accent), color: 'var(--wt-text)' }}>
          <div style={{ padding: `${P(36)}px ${P(56)}px ${P(40)}px`, borderTop: `${P(12)}px solid var(--wt-accent)` }}>{body}</div>
          {step === 'typing' && (
            <WallKeyboard
              kind="text"
              P={P}
              keyHeight={landscape ? 78 : 104}
              shift={typing.shift}
              round={typing.round}
              onShift={typing.onShift}
              onKey={typing.onKey}
              onDelete={typing.onDelete}
              onAction={() => typing.text.trim() && setStep('details')}
              onIdle={onClose}
              actionLabel={t('calendar.eventForm.done')}
              actionDisabled={typing.text.trim() === ''}
            />
          )}
        </div>
      </WallSheetPanel>
    </WallOverlay>
  );
}

/** The smallest a step is drawn to fit, against the sheet's own size. */
const MIN_FIT = 0.6;

/**
 * Shrinks a wall sheet's content to the room its panel has (`WallSheetPanel`
 * stops at 88% of the screen height and would otherwise scroll with no bar).
 * Everything in the form is sized through `P`, so its height follows the
 * scale and one measurement lands on the fit; it grows back when a shorter
 * step replaces a tall one.
 */
function useSheetFit() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    const panel = el?.parentElement;
    if (!el || !panel || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const max = getComputedStyle(panel).maxHeight;
      const height = el.offsetHeight;
      if (!max.endsWith('px') || height === 0) return;
      // The panel's own handle sits above the content.
      const room = parseFloat(max) - (panel.scrollHeight - height);
      setScale((now) => {
        const next = Math.max(MIN_FIT, Math.min(1, (now * room) / height));
        return Math.abs(next - now) < 0.02 ? now : next;
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return { ref, scale };
}
