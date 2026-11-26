'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import type { CalendarEventEntry, CalendarOverride, ICloudSource } from '@/types/config';
import { calendarLook } from '@/lib/calendar-overrides';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import type { CalendarEntryInfo } from '@/lib/calendar-event-writes';
import { addingReadiness, googleEntryStateWithSetting, type GoogleEntryState } from '@/lib/calendar-write';
import type { GoogleCalendar } from '@/hooks/useGoogleCalendars';
import Button from '@/components/ui/Button';
import { Switch } from '@/components/ui/Toggle';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { SettingsArea } from './calendar-settings-bits';
import { CHECKBOX_CLASS, SETTINGS_INPUT_SM_CLASS } from '@/components/ui/input-classes';
import FieldHint from '@/components/ui/FieldHint';
import StatusDot from '@/components/ui/StatusDot';

const LENGTHS = [30, 60, 90, 120] as const;

/** Google's sign-in mark, for the sign-in buttons. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.7 7.1-17z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * Settings > Calendar's "Adding events" area: the switch,
 * Google's one extra sign-in when it is needed, which calendars take new
 * events, where a new event starts, its usual length, and the walls' switch.
 * Google calendars only appear while Home Screens may offer adding for them;
 * on Home Screens' own app before Google's review they are not mentioned.
 */
export default function CalendarAddingArea({ eventEntry, wallEntry, googleCalendars, googleUnreadable = false, googleSignedOut = false, shownGoogleIds, icloudSources, calendarOverrides, onChange }: {
  eventEntry: CalendarEventEntry | null;
  wallEntry: boolean;
  /** Google's own list, with which calendars this account may write. */
  googleCalendars: GoogleCalendar[];
  /** Signed in, but Google's list could not be read: an empty list then is an outage, not nothing picked. */
  googleUnreadable?: boolean;
  /**
   * Not signed in to Google at all, so there is no sign-in to add to: the
   * one Google asks for here is the first, and it shows the calendars too.
   */
  googleSignedOut?: boolean;
  /** The Google calendars ticked to show, whether or not Google is connected right now. */
  shownGoogleIds: string[];
  icloudSources: ICloudSource[];
  /** The household's own names and colours, so this list names calendars as the rest of the page does. */
  calendarOverrides?: Record<string, CalendarOverride>;
  onChange: (updates: { eventEntry?: CalendarEventEntry | null; wallEntry?: boolean }) => void;
}) {
  const t = useTranslate('editor');
  // Where Google would stand with adding on. The switch below is applied as it
  // is on this page, so the sign-in step shows the moment it flips; the saved
  // setting reaches the hub half a second later.
  const [googleIfOn, setGoogleIfOn] = useState<GoogleEntryState | null>(null);
  const [link, setLink] = useState<{ url: string; returnsToHub: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const enabled = Boolean(eventEntry?.enabled);

  const readState = useCallback(async () => {
    try {
      const res = await editorFetch('/api/calendar/entry');
      if (res.ok) setGoogleIfOn(((await res.json()) as CalendarEntryInfo).googleIfOn);
    } catch { /* the next look tries again */ }
  }, []);

  // Read again when the editor comes back to the front: the Google tab where
  // the sign-in finished is closed by then.
  useEffect(() => {
    void readState();
    const onFocus = () => void readState();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [readState]);

  const google = googleIfOn === null ? null : googleEntryStateWithSetting(googleIfOn, enabled);
  const icloudCalendars = icloudSources.filter((s) => s.enabled);
  const googleOffered = google !== null && google !== 'notOffered' && shownGoogleIds.length > 0;
  // Nothing to add events to: Home Screens' own Google app with adding
  // switched off (HS_GOOGLE_HOSTED_EVENTS=0), and no iCloud calendar.
  if (google === 'notOffered' && icloudCalendars.length === 0) return null;
  if (google === null && shownGoogleIds.length === 0 && icloudCalendars.length === 0) return null;

  const entry: CalendarEventEntry = eventEntry ?? { enabled: false, calendarIds: [] };
  const setEntry = (patch: Partial<CalendarEventEntry>) => onChange({ eventEntry: { ...entry, ...patch } });
  const ticked = new Set(entry.calendarIds);

  const toggleCalendar = (id: string) => setEntry({
    calendarIds: ticked.has(id) ? entry.calendarIds.filter((c) => c !== id) : [...entry.calendarIds, id],
  });

  const openSignIn = async () => {
    setCodeError(null);
    const res = await editorFetch(`/api/auth/google/web?origin=${encodeURIComponent(window.location.origin)}`);
    if (!res.ok) return setCodeError(t('settings.calendarPage.adding.signInFailed'));
    const next = (await res.json()) as { url: string; returnsToHub: boolean };
    setLink(next);
    window.open(next.url, '_blank', 'noopener');
  };

  const sendCode = async () => {
    setCodeError(null);
    const res = await editorFetch('/api/auth/google/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      return setCodeError(t('settings.calendarPage.adding.signInFailed'));
    }
    setCode('');
    setLink(null);
    void readState();
  };

  const tickable = [
    ...(googleOffered
      // Only calendars Google lists right now: while it needs signing in again
      // there is no name or write access to show, and the sign-in step is up.
      ? shownGoogleIds.flatMap((id) => {
        const cal = googleCalendars.find((c) => c.id === id);
        if (!cal) return [];
        const look = calendarLook(id, { name: cal.summary ?? id, color: cal.backgroundColor ?? DEFAULT_EVENT_COLOR }, calendarOverrides);
        return [{ id, ...look, group: 'google' as const, writable: cal.writable !== false }];
      })
      : []),
    ...icloudCalendars.map((s) => ({
      id: s.id, ...calendarLook(s.id, { name: s.name, color: s.color }, calendarOverrides), group: 'icloud' as const, writable: s.kind !== 'birthdays',
    })),
  ];
  const pickable = tickable.filter((c) => c.writable && ticked.has(c.id));
  // Counted as the phone counts them: ticked, shown on the screens and able to take an event.
  const readiness = addingReadiness({ enabled, google, calendars: pickable.length, googleUnreachable: googleUnreadable && googleOffered });

  const signInStep = (warn: boolean, title: string, body: string, button: string) => (
    <div className={`mt-4 rounded-lg border p-3.5 ${warn ? 'border-hs-warning/30 bg-hs-warning/10' : 'border-hs-border-strong bg-hs-card'}`} data-testid="calendar-adding-sign-in">
      <p className={`text-[13px] font-semibold ${warn ? 'text-hs-warning-ink' : 'text-hs-text-primary'}`}>{title}</p>
      <p className="mt-1 mb-3 text-[12.5px] text-hs-text-faint">{body}</p>
      <button
        type="button"
        onClick={() => void openSignIn()}
        className="inline-flex h-10 items-center gap-2.5 rounded-full border border-hs-border-strong bg-hs-panel pl-3 pr-4 text-sm font-medium text-hs-text-primary hover:bg-hs-hover"
      >
        <GoogleMark />{button}
      </button>
      {link && !link.returnsToHub && (
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('settings.calendarPage.adding.pastePlaceholder')}
            className={`flex-1 ${SETTINGS_INPUT_SM_CLASS}`}
          />
          <Button variant="primary" onClick={() => void sendCode()} disabled={!code.trim()}>{t('settings.calendarPage.adding.pasteButton')}</Button>
        </div>
      )}
      {codeError && <p role="alert" className="mt-2 text-xs text-hs-danger">{codeError}</p>}
    </div>
  );

  return (
    <SettingsArea title={t('settings.calendarPage.adding.heading')} description={t('settings.calendarPage.adding.description')} testId="calendar-area-adding">
      <div className="flex items-start justify-between gap-4" data-field-id="calendar.eventEntry">
        <div>
          <p className="text-[13px] font-medium text-hs-text-body">{t('settings.calendarPage.adding.switch')}</p>
          {readiness === 'googleUnreachable' ? (
            // The phone says the same: Google is out of reach, not that nothing is picked.
            <p className="mt-1 flex items-center gap-1.5 text-xs text-hs-warning-ink"><StatusDot tone="warning" size="sm" />{t('settings.calendarPage.adding.googleNotAnswering')}</p>
          ) : readiness === 'noCalendars' ? (
            // Switched on with nothing ticked below: nothing can be added yet, whatever Google says.
            <p className="mt-1 flex items-center gap-1.5 text-xs text-hs-warning-ink"><StatusDot tone="warning" size="sm" />{t('settings.calendarPage.adding.pickCalendars')}</p>
          ) : readiness === 'ready' && google === 'ready' ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-hs-success"><StatusDot tone="success" size="sm" />{t('settings.calendarPage.adding.ready')}</p>
          ) : (
            <FieldHint className="mt-1">
              {googleOffered && icloudCalendars.length > 0 ? t(googleSignedOut ? 'settings.calendarPage.adding.switchHelpBothSignedOut' : 'settings.calendarPage.adding.switchHelpBoth')
                : googleOffered ? t(googleSignedOut ? 'settings.calendarPage.adding.switchHelpGoogleSignedOut' : 'settings.calendarPage.adding.switchHelpGoogle')
                  : t('settings.calendarPage.adding.switchHelpICloud')}
            </FieldHint>
          )}
        </div>
        <Switch checked={enabled} onChange={(v) => setEntry({ enabled: v })} ariaLabel={t('settings.calendarPage.adding.switch')} />
      </div>

      {enabled && googleOffered && google === 'needsSignIn' && signInStep(false,
        t(googleSignedOut ? 'settings.calendarPage.adding.signInTitleSignedOut' : 'settings.calendarPage.adding.signInTitle'),
        t('settings.calendarPage.adding.signInBody'), t('settings.calendarPage.adding.signInButton'))}
      {enabled && googleOffered && google === 'scopeMissing' && signInStep(true,
        t('settings.calendarPage.adding.scopeMissingTitle'), t('settings.calendarPage.adding.scopeMissingBody'), t('settings.calendarPage.adding.signInAgain'))}
      {enabled && googleOffered && google === 'needsWebClient' && (
        <div className="mt-4 rounded-lg border border-hs-border-strong bg-hs-card p-3.5" data-testid="calendar-adding-web-client">
          <p className="text-[13px] font-semibold text-hs-text-primary">{t('settings.calendarPage.adding.webClientTitle')}</p>
          <p className="mt-1 text-[12.5px] text-hs-text-faint">
            {t('settings.calendarPage.adding.webClientBody')}{' '}
            <Link href={settingsPath({ kind: 'defaults', page: 'integrations' })} className="text-hs-accent underline">{t('settings.calendarPage.adding.webClientLink')}</Link>
          </p>
        </div>
      )}

      {enabled && (
        <>
          {/* Nothing to list (Google signed out, no iCloud calendars): the sign-in step above says what to do, so no empty box or blank picker sits under it. */}
          {tickable.length > 0 && (<>
          <div className="my-3.5 border-t border-hs-border-strong" />
          <span className="mb-1.5 block text-[13px] text-hs-text-body">{t('settings.calendarPage.adding.calendarsLabel')}</span>
          <div className="rounded-md border border-hs-border-strong bg-hs-card">
            {(['google', 'icloud'] as const).map((group) => {
              const rows = tickable.filter((c) => c.group === group);
              if (rows.length === 0) return null;
              return (
                <div key={group}>
                  {googleOffered && icloudCalendars.length > 0 && (
                    <div className="border-t border-hs-border-strong bg-hs-panel px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-hs-text-muted first:border-t-0">
                      {group === 'google' ? t('settings.calendarPage.adding.groupGoogle') : t('settings.calendarPage.adding.groupICloud')}
                    </div>
                  )}
                  {rows.map((c) => (
                    <label key={c.id} className={`flex items-center gap-3 border-t border-hs-border-strong px-3 py-2 text-[13.5px] first:border-t-0 ${c.writable ? 'text-hs-text-body' : 'text-hs-text-faint'}`}>
                      <input type="checkbox" disabled={!c.writable} checked={c.writable && ticked.has(c.id)} onChange={() => toggleCalendar(c.id)} className={CHECKBOX_CLASS} />
                      <span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: c.color }} />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {!c.writable && (
                        <span className="text-[11px] text-hs-text-faint">
                          {c.group === 'icloud' ? t('settings.calendarPage.adding.fromContacts') : t('settings.calendarPage.adding.readOnly')}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <FieldHint className="mt-2">{t('settings.calendarPage.adding.calendarsHelp')}</FieldHint>
          </>)}

          <div className="my-3.5 border-t border-hs-border-strong" />
          <div className="flex flex-wrap gap-7">
            {tickable.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-hs-text-body">{t('settings.calendarPage.adding.defaultLabel')}</span>
              <select
                value={entry.defaultCalendarId ?? pickable[0]?.id ?? ''}
                disabled={pickable.length === 0}
                onChange={(e) => setEntry({ defaultCalendarId: e.target.value || undefined })}
                className={`w-64 ${SETTINGS_INPUT_SM_CLASS}`}
              >
                {pickable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            )}
            <div>
              <span className="mb-1.5 block text-[13px] text-hs-text-body">{t('settings.calendarPage.adding.lengthLabel')}</span>
              <SegmentedControl
                fit="content"
                label={t('settings.calendarPage.adding.lengthLabel')}
                value={String(entry.defaultMinutes ?? 60)}
                onChange={(minutes) => setEntry({ defaultMinutes: Number(minutes) })}
                options={LENGTHS.map((minutes) => ({ value: String(minutes), label: t(`settings.calendarPage.adding.length${minutes}`) }))}
              />
            </div>
          </div>

          <div className="my-3.5 border-t border-hs-border-strong" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-hs-text-body">{t('settings.calendarPage.adding.wallSwitch')}</p>
              <FieldHint className="mt-1">{t('settings.calendarPage.adding.wallHelp')}</FieldHint>
            </div>
            <Switch checked={wallEntry} onChange={(v) => onChange({ wallEntry: v })} ariaLabel={t('settings.calendarPage.adding.wallSwitch')} />
          </div>
        </>
      )}
    </SettingsArea>
  );
}
