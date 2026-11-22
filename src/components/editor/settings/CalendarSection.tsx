'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Pencil, X } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import type { CalendarEventEntry, CalendarOverride, ICalSource, ICloudSource } from '@/types/config';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import { useGoogleDeviceFlow } from '@/hooks/useGoogleDeviceFlow';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import HostedCalendarSignIn from './HostedCalendarSignIn';
import { DeviceCodeButton, DeviceCodeLink } from '../DeviceCodeParts';
import ICalFeedManager from './ICalFeedManager';
import ICloudCalendarManager from './ICloudCalendarManager';
import CalendarAddingArea from './CalendarAddingArea';
import CalendarPeopleManager from './CalendarPeopleManager';
import { SettingsArea, SourceBlock, SourceHealthBadge, SourceHealthError, useCalendarSourceHealth } from './calendar-settings-bits';
import { useLocale, useTranslate } from '@/i18n';
import { localizedHolidayCountries, type HolidayCountry } from '@/lib/holiday-countries';
import { settingsPath } from '@/lib/settings-route';
import { configuredCalendarSourceIds, prunePersonSources } from '@/lib/calendar-source-refs';


interface CalendarSettings {
  selectedCalendarIds: string[];
  icalSources: ICalSource[];
  icloudSources: ICloudSource[];
  personSources: Record<string, string[]>;
  daysAhead: number;
  holidayCountry?: string;
  hideDeclined: boolean;
  eventEntry: CalendarEventEntry | null;
  wallEntry: boolean;
  calendarOverrides?: Record<string, CalendarOverride>;
}

interface Props {
  values: CalendarSettings;
  onChange: (updates: Partial<CalendarSettings>) => void;
}

export default function CalendarSection({ values, onChange: stageChange }: Props) {
  const { selectedCalendarIds, icalSources, icloudSources, personSources, daysAhead, holidayCountry, hideDeclined, calendarOverrides } = values;

  // One row open at a time: two editors side by side in a scrolling list is
  // more noise than help, and the strip is tall enough to crowd its neighbour.
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);

  /**
   * Write one calendar's own name or colour.
   *
   * An empty box or an unset colour is removed rather than stored blank, and
   * an entry with nothing left in it goes entirely, so a household that
   * clears what it typed is back to the name and colour Google sends rather
   * than carrying an override that says "no override".
   */
  const setCalendarOverride = (id: string, patch: { name?: string; color?: string }) => {
    const next = { ...(calendarOverrides ?? {}) };
    const merged = { ...(next[id] ?? {}), ...patch };
    if (!merged.name?.trim()) delete merged.name;
    if (!merged.color?.trim()) delete merged.color;
    if (Object.keys(merged).length === 0) delete next[id];
    else next[id] = merged;
    onChange({ calendarOverrides: Object.keys(next).length ? next : undefined });
  };
  const t = useTranslate('editor');

  // Every way a calendar leaves the list arrives here: a feed removed, a
  // Google calendar unpicked or signed out, an iCloud calendar unticked or
  // its account removed, the holidays turned off. Whoever owned it lets go in
  // the same edit, so People never keeps a tick it has no box to untick.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const onChange = useCallback((updates: Partial<CalendarSettings>) => {
    const next = { ...valuesRef.current, ...updates };
    const configured = configuredCalendarSourceIds({
      googleCalendarIds: next.selectedCalendarIds,
      icalSources: next.icalSources,
      icloudSources: next.icloudSources,
      holidayCountry: next.holidayCountry,
    });
    const pruned = prunePersonSources(next.personSources, (id) => configured.has(id));
    stageChange(pruned === next.personSources ? updates : { ...updates, personSources: pruned });
  }, [stageChange]);

  const [availableCountries, setAvailableCountries] = useState<HolidayCountry[]>([]);
  const locale = useLocale();
  const countryOptions = useMemo(() => localizedHolidayCountries(availableCountries, locale), [availableCountries, locale]);
  const { health, recordSourceHealth, recheckSourceHealth } = useCalendarSourceHealth();

  // Track auth errors from useGoogleCalendars separately so they show in the right place
  const [authError, setAuthError] = useState<string | null>(null);

  const onAuthError = useCallback((message: string) => {
    setAuthError(message);
  }, []);

  const {
    credentialsConfigured,
    mode: googleMode,
    googleConnected,
    googleCalendars,
    googleLoading,
    setGoogleConnected,
    fetchCalendars,
    toggleCalendar,
    disconnectGoogle: disconnectGoogleCalendars,
  } = useGoogleCalendars({
    values,
    onChange,
    onAuthError,
    onSignedInElsewhere: () => {
      setAuthError(null);
      // The badges still show the status from before the sign-in.
      recheckSourceHealth();
    },
  });

  const deviceFlow = useGoogleDeviceFlow({
    onSuccess: async () => {
      setAuthError(null);
      setGoogleConnected(true);
      await fetchCalendars(true);
      // The badges still show the status from before the sign-in.
      recheckSourceHealth();
    },
  });

  const disconnectGoogle = useCallback(async () => {
    // A refusal is already on screen through `onAuthError`; it must stay there.
    if (!(await disconnectGoogleCalendars())) return;
    deviceFlow.clearError();
    setAuthError(null);
  }, [disconnectGoogleCalendars, deviceFlow]);

  // Combine device flow errors from both sources
  const combinedError = deviceFlow.deviceFlowError || authError;

  // Calendars still in config but absent from the live listing (unshared,
  // revoked, or Google unreachable) would otherwise have no row at all; the
  // cached status is the only health signal the user gets for them.
  const missingGoogleIds = googleLoading ? [] : selectedCalendarIds.filter((id) => !googleCalendars.some((c) => c.id === id));

  // Fetch available countries for holiday picker
  useEffect(() => {
    async function fetchCountries() {
      try {
        const res = await editorFetch('/api/holidays?countries');
        if (res.ok) setAvailableCountries(await res.json());
      } catch { /* ignore */ }
    }
    fetchCountries();
  }, []);

  const googleBlock = googleLoading ? (
    <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.google.checkingConnection')}</p>
  ) : googleConnected ? (
    <>
      {googleCalendars.length > 0 ? (
        <div
            className="max-h-48 overflow-y-auto rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong"
            // Settings search jumps here for "names and colours": the per
            // calendar name and colour are edited on these rows.
            data-field-id="calendar.calendarOverrides"
          >
          {googleCalendars.map((cal) => {
            const override = calendarOverrides?.[cal.id];
            const editing = editingCalendarId === cal.id;
            return (
              <div key={cal.id}>
                {/* A div, not a label: a label would hand a click on the
                    pencil to the checkbox and toggle the calendar off. The
                    checkbox carries its own label instead. */}
                <div className="flex items-center gap-3 px-3 py-2 hover:bg-hs-hover">
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(cal.id)}
                    onChange={() => toggleCalendar(cal.id)}
                    aria-label={cal.summary}
                    className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    // The household's colour once it has set one, so the dot
                    // beside the name matches what the wall will draw.
                    style={{ backgroundColor: override?.color || cal.backgroundColor }}
                  />
                  <span className="text-sm text-hs-text-body flex-1 min-w-0">
                    <span className="block truncate">
                      {override?.name?.trim() || cal.summary}
                      {cal.primary && (
                        <span className="text-hs-text-faint ml-1 text-xs">{t('settings.calendarPage.google.primaryBadge')}</span>
                      )}
                    </span>
                    {selectedCalendarIds.includes(cal.id) && <SourceHealthError status={health.get(cal.id)} />}
                  </span>
                  {selectedCalendarIds.includes(cal.id) && <SourceHealthBadge status={health.get(cal.id)} />}
                  <button
                    type="button"
                    onClick={() => setEditingCalendarId(editing ? null : cal.id)}
                    aria-expanded={editing}
                    aria-label={t('settings.calendarPage.appearance.edit', { name: cal.summary })}
                    title={t('settings.calendarPage.appearance.edit', { name: cal.summary })}
                    className="shrink-0 rounded p-1 text-hs-text-faint transition-colors hover:bg-hs-hover hover:text-hs-text-body"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                {editing && (
                  // Under the row rather than over it: the list is scrollable
                  // and a popover would be clipped by its own container.
                  <div className="flex items-center gap-2 bg-hs-accent-soft px-3 py-2 pl-9">
                    <input
                      type="text"
                      value={override?.name ?? ''}
                      // The placeholder is Google's own name, so an empty box
                      // reads as "use what Google sends" and not as missing.
                      placeholder={cal.summary}
                      onChange={(e) => setCalendarOverride(cal.id, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded border border-hs-border-strong bg-hs-input px-2 py-1 text-[13px] text-hs-text-body"
                    />
                    <input
                      type="color"
                      value={override?.color || cal.backgroundColor || '#888888'}
                      onChange={(e) => setCalendarOverride(cal.id, { color: e.target.value })}
                      aria-label={t('settings.calendarPage.appearance.colorFor', { name: cal.summary })}
                      className="h-7 w-9 shrink-0 cursor-pointer rounded border border-hs-border-strong bg-transparent"
                    />
                    {(override?.name || override?.color) && (
                      <button
                        type="button"
                        onClick={() => setCalendarOverride(cal.id, { name: '', color: '' })}
                        className="shrink-0 text-xs text-hs-text-muted hover:text-hs-text-body"
                      >
                        {t('settings.calendarPage.appearance.reset')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingCalendarId(null)}
                      className="shrink-0 text-xs text-hs-text-muted hover:text-hs-text-body"
                    >
                      {t('settings.calendarPage.appearance.done')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.google.noCalendars')}</p>
      )}
      {combinedError && (
        <p className="text-xs text-hs-warning">{combinedError}</p>
      )}
    </>
  ) : googleMode === 'hosted' ? (
    // Home Screens' own Google app: nothing to set up, so Google's button
    // and the short code. A household's own app keeps the view below.
    <HostedCalendarSignIn
      userCode={deviceFlow.userCode}
      verificationUrl={deviceFlow.verificationUrl}
      polling={deviceFlow.deviceFlowPolling}
      onStart={deviceFlow.startDeviceFlow}
      onCancel={deviceFlow.cancel}
      error={combinedError}
    />
  ) : !credentialsConfigured ? (
    <div className="space-y-2">
      <p className="text-xs text-hs-text-muted">
        {t('settings.calendarPage.google.credentialsRequired')}
      </p>
      {/* The destination has one name now, the one the sidebar uses. This
          used to read "Settings → Integrations" while the sidebar said "API
          keys" and the page's own H1 said "Integrations". */}
      <p className="text-xs text-hs-text-faint">
        {t('settings.calendarPage.google.credentialsSetupPrefix')}
        <Link
          href={settingsPath({ kind: 'defaults', page: 'integrations' })}
          className="text-hs-accent hover:text-hs-accent-hover underline"
        >
          {t('settings.sidebar.navLabels.integrations')}
        </Link>
        {t('settings.calendarPage.google.credentialsSetupSuffix')}
      </p>
    </div>
  ) : (
    <div className="space-y-3">
      {deviceFlow.userCode && deviceFlow.verificationUrl ? (
        <div className="space-y-3">
          <p className="text-xs text-hs-text-muted">
            {t('settings.calendarPage.google.deviceCodeIntro')}
          </p>
          <div className="flex items-center gap-3">
            <DeviceCodeLink
              url={deviceFlow.verificationUrl}
              className="text-sm text-hs-accent hover:text-hs-accent-hover underline"
            />
          </div>
          <div className="flex items-center gap-3">
            <DeviceCodeButton
              code={deviceFlow.userCode}
              className="group flex items-center gap-3 text-2xl font-bold tracking-widest text-hs-text-primary bg-hs-card border border-hs-border-strong rounded-lg px-4 py-2 hover:border-hs-accent transition-colors cursor-pointer"
              labelClassName="text-xs font-normal tracking-normal text-hs-text-faint group-hover:text-hs-accent"
            />
            {deviceFlow.deviceFlowPolling && (
              <span className="text-xs text-hs-text-faint animate-pulse">
                {t('settings.calendarPage.google.waitingForAuthorization')}
              </span>
            )}
            {/* The other three sign-ins could always be backed out of; this
                one left the code up until it ran out. */}
            <button
              type="button"
              onClick={deviceFlow.cancel}
              data-testid="google-calendar-own-cancel"
              className="text-xs text-hs-text-faint underline hover:text-hs-text-muted"
            >
              {t('settings.calendarPage.google.hosted.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={deviceFlow.startDeviceFlow}
          disabled={deviceFlow.deviceFlowPolling}
        >
          {t('common.signInWithGoogle')}
        </Button>
      )}
      {deviceFlow.deviceFlowError && (
        <div className="space-y-1.5">
          <p className="text-xs text-hs-danger">{deviceFlow.deviceFlowError}</p>
          {deviceFlow.clientIdHint && (
            <p className="text-xs text-hs-text-faint">
              {t('settings.calendarPage.google.usingClientIdLabel')}{' '}
              <code className="text-hs-text-muted">{deviceFlow.clientIdHint}</code>
            </p>
          )}
          <p className="text-xs text-hs-text-faint">
            {t('settings.calendarPage.google.verifyCredentialsPart1')}
            <Link
              href={settingsPath({ kind: 'defaults', page: 'integrations' })}
              className="text-hs-accent hover:text-hs-accent-hover underline"
            >
              {t('settings.calendarPage.google.settingsIntegrationsLink')}
            </Link>
            {t('settings.calendarPage.google.verifyCredentialsPart2')}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-hs-accent hover:text-hs-accent-hover underline"
            >
              {t('settings.calendarPage.google.googleCloudConsoleLink')}
            </a>
            {t('settings.calendarPage.google.verifyCredentialsPart3')}
          </p>
        </div>
      )}
      <p className="text-xs text-hs-text-faint">
        {t('settings.calendarPage.google.signInHelp')}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* 1. What to show: the window every calendar module starts from. First
          on purpose: a single slider that decides how far every list looks
          ahead should never sit below the long list of sources. */}
      <SettingsArea
        title={t('settings.calendarPage.areas.show')}
        description={t('settings.calendarPage.areas.showDescription')}
        testId="calendar-area-show"
      >
        <div data-field-id="calendar.daysAhead">
          <Slider
            label={t('settings.calendarPage.shared.daysAheadLabel')}
            value={daysAhead}
            min={1}
            max={90}
            onChange={(v) => onChange({ daysAhead: v })}
          />
        </div>
        <div className="mt-3 pt-3 border-t border-hs-border-strong" data-field-id="calendar.hideDeclined">
          <Toggle
            label={t('settings.calendarPage.google.hideDeclinedLabel')}
            checked={hideDeclined}
            onChange={(v) => onChange({ hideDeclined: v })}
          />
          <p className="mt-1 text-[11px] text-hs-text-faint">{t('settings.calendarPage.google.googleOnly')}</p>
        </div>
      </SettingsArea>

      {/* 2. Where events come from: every source type, each row with its health */}
      <SettingsArea
        title={t('settings.calendarPage.areas.sources')}
        description={t('settings.calendarPage.areas.sourcesDescription')}
        testId="calendar-area-sources"
      >
        <SourceBlock
          first
          title={t('settings.calendarPage.google.heading')}
          right={googleConnected && !googleLoading ? (
            <>
              <span className="text-xs text-hs-success flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
                {t('settings.calendarPage.google.connected')}
              </span>
              <button
                onClick={disconnectGoogle}
                className="text-xs text-hs-text-faint hover:text-hs-danger transition-colors"
              >
                {t('settings.calendarPage.google.disconnect')}
              </button>
            </>
          ) : undefined}
        >
          {googleBlock}
          {missingGoogleIds.length > 0 && (
            <>
              {/* One explanation above the group, rather than the same three
                  failure sentences stacked inside every row. Rows carry the
                  last name we saw, the id underneath, and a way to remove
                  them, which iCal feeds have always had and these did not. */}
              <p className="mb-2 text-[11px] text-hs-text-faint">
                {t('settings.calendarPage.google.pausedExplanation')}
              </p>
              <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
                {missingGoogleIds.map((id) => {
                  const status = health.get(id);
                  return (
                    <div key={id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-sm text-hs-text-body flex-1 min-w-0">
                        <span className="block truncate">{status?.name ?? id}</span>
                        {status?.name && (
                          <code className="mt-0.5 block truncate font-mono text-[10px] text-hs-text-faint">
                            {id}
                          </code>
                        )}
                      </span>
                      <span className="shrink-0 rounded bg-hs-warning/10 px-1.5 py-0.5 text-[11px] text-hs-warning">
                        {t('settings.calendarPage.google.pausedBadge')}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCalendar(id)}
                        title={t('settings.calendarPage.google.removeTitle', { name: status?.name ?? id })}
                        aria-label={t('settings.calendarPage.google.removeTitle', { name: status?.name ?? id })}
                        className="shrink-0 text-hs-text-faint transition-colors hover:text-hs-danger"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </SourceBlock>

        <ICloudCalendarManager icloudSources={icloudSources} onChange={onChange} health={health} />

        <ICalFeedManager icalSources={icalSources} onChange={onChange} health={health} onSourceChecked={recordSourceHealth} />

        <SourceBlock title={t('settings.calendarPage.holidays.heading')} right={holidayCountry ? <SourceHealthBadge status={health.get('holidays')} /> : undefined}>
          <div className="space-y-2" data-field-id="calendar.holidayCountry">
            <select
              value={holidayCountry ?? ''}
              onChange={(e) => onChange({ holidayCountry: e.target.value || undefined })}
              className="w-full rounded-md bg-hs-card border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
            >
              <option value="">{t('settings.calendarPage.holidays.none')}</option>
              {countryOptions.map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-hs-text-faint">
              {t('settings.calendarPage.holidays.help')}
            </p>
            {holidayCountry && <SourceHealthError status={health.get('holidays')} />}
          </div>
        </SourceBlock>
      </SettingsArea>

      {/* 3. Adding events from the phone and the wall */}
      <CalendarAddingArea
        eventEntry={values.eventEntry}
        wallEntry={values.wallEntry}
        googleCalendars={googleCalendars}
        shownGoogleIds={selectedCalendarIds}
        icloudSources={icloudSources}
        onChange={onChange}
      />

      {/* 4. People: who the calendars belong to */}
      <SettingsArea
        title={t('settings.calendarPage.people.heading')}
        description={t('settings.calendarPage.people.help')}
        testId="calendar-area-people"
      >
        <div data-field-id="calendar.personSources">
          {/* Read again when Google signs in or out: it names Google's calendars from its own listing. */}
          <CalendarPeopleManager
            key={googleConnected ? 'google' : 'no-google'}
            personSources={personSources}
            onChange={(next) => onChange({ personSources: next })}
          />
        </div>
      </SettingsArea>

    </div>
  );
}
