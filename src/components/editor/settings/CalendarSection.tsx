'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { CalendarPerson, ICalSource, ICloudSource } from '@/types/config';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import { useGoogleDeviceFlow } from '@/hooks/useGoogleDeviceFlow';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import ICalFeedManager from './ICalFeedManager';
import ICloudCalendarManager from './ICloudCalendarManager';
import CalendarPeopleManager from './CalendarPeopleManager';
import { SettingsArea, SourceBlock, SourceHealthBadge, SourceHealthError, useCalendarSourceHealth } from './calendar-settings-bits';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';

interface HolidayCountry {
  countryCode: string;
  name: string;
}

interface CalendarSettings {
  selectedCalendarIds: string[];
  icalSources: ICalSource[];
  icloudSources: ICloudSource[];
  people: CalendarPerson[];
  maxEvents: number;
  daysAhead: number;
  holidayCountry?: string;
  hideDeclined: boolean;
}

interface Props {
  values: CalendarSettings;
  onChange: (updates: Partial<CalendarSettings>) => void;
}

export default function CalendarSection({ values, onChange }: Props) {
  const { selectedCalendarIds, icalSources, icloudSources, people, maxEvents, daysAhead, holidayCountry, hideDeclined } = values;
  const t = useTranslate('editor');

  const [availableCountries, setAvailableCountries] = useState<HolidayCountry[]>([]);
  const health = useCalendarSourceHealth();

  // Track auth errors from useGoogleCalendars separately so they show in the right place
  const [authError, setAuthError] = useState<string | null>(null);

  const onAuthError = useCallback((message: string) => {
    setAuthError(message);
  }, []);

  const {
    credentialsConfigured,
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
  });

  const deviceFlow = useGoogleDeviceFlow({
    onSuccess: async () => {
      setAuthError(null);
      setGoogleConnected(true);
      await fetchCalendars(true);
    },
  });

  const disconnectGoogle = useCallback(async () => {
    await disconnectGoogleCalendars();
    deviceFlow.clearError();
    setAuthError(null);
  }, [disconnectGoogleCalendars, deviceFlow]);

  // Click-to-copy for the device flow user code
  const [codeCopied, setCodeCopied] = useState(false);

  const copyUserCode = useCallback(async () => {
    const code = deviceFlow.userCode;
    if (!code) return;
    const flash = () => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    };
    try {
      await navigator.clipboard.writeText(code);
      flash();
    } catch {
      // Fallback for insecure contexts (kiosk over plain HTTP on the LAN)
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) flash();
      } catch {
        // Copy unsupported; user can still read and type the code manually
      }
    }
  }, [deviceFlow.userCode]);

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
        <div className="max-h-48 overflow-y-auto rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
          {googleCalendars.map((cal) => (
            <label
              key={cal.id}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-hs-hover"
            >
              <input
                type="checkbox"
                checked={selectedCalendarIds.includes(cal.id)}
                onChange={() => toggleCalendar(cal.id)}
                className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
              />
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: cal.backgroundColor }}
              />
              <span className="text-sm text-hs-text-body flex-1 min-w-0">
                <span className="block truncate">
                  {cal.summary}
                  {cal.primary && (
                    <span className="text-hs-text-faint ml-1 text-xs">{t('settings.calendarPage.google.primaryBadge')}</span>
                  )}
                </span>
                {selectedCalendarIds.includes(cal.id) && <SourceHealthError status={health.get(cal.id)} />}
              </span>
              {selectedCalendarIds.includes(cal.id) && <SourceHealthBadge status={health.get(cal.id)} />}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.google.noCalendars')}</p>
      )}
      {combinedError && (
        <p className="text-xs text-hs-warning">{combinedError}</p>
      )}
    </>
  ) : !credentialsConfigured ? (
    <div className="space-y-2">
      <p className="text-xs text-hs-text-muted">
        {t('settings.calendarPage.google.credentialsRequired')}
      </p>
      <p className="text-xs text-hs-text-faint">
        {t('settings.calendarPage.google.credentialsSetupPart1')}
        <a
          href={settingsPath({ kind: 'defaults', page: 'integrations' })}
          className="text-hs-accent hover:text-hs-accent-hover underline"
        >
          {t('settings.calendarPage.google.settingsIntegrationsLink')}
        </a>
        {t('settings.calendarPage.google.credentialsSetupPart2')}
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
            <a
              href={deviceFlow.verificationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-hs-accent hover:text-hs-accent-hover underline"
            >
              {deviceFlow.verificationUrl}
            </a>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={copyUserCode}
              title={t('settings.calendarPage.google.copyCode')}
              aria-label={t('settings.calendarPage.google.copyCode')}
              className="group flex items-center gap-3 text-2xl font-bold tracking-widest text-hs-text-primary bg-hs-card border border-hs-border-strong rounded-lg px-4 py-2 hover:border-hs-accent transition-colors cursor-pointer"
            >
              <code>{deviceFlow.userCode}</code>
              <span className="text-xs font-normal tracking-normal text-hs-text-faint group-hover:text-hs-accent">
                {codeCopied
                  ? t('settings.calendarPage.google.codeCopied')
                  : t('settings.calendarPage.google.copyCode')}
              </span>
            </button>
            {deviceFlow.deviceFlowPolling && (
              <span className="text-xs text-hs-text-faint animate-pulse">
                {t('settings.calendarPage.google.waitingForAuthorization')}
              </span>
            )}
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={deviceFlow.startDeviceFlow}
          disabled={deviceFlow.deviceFlowPolling}
        >
          {t('settings.calendarPage.google.signIn')}
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
            <a
              href={settingsPath({ kind: 'defaults', page: 'integrations' })}
              className="text-hs-accent hover:text-hs-accent-hover underline"
            >
              {t('settings.calendarPage.google.settingsIntegrationsLink')}
            </a>
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
      <div className="mb-7">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-1.5">{t('settings.calendarPage.heading')}</h2>
        <p className="text-[13px] text-hs-text-faint">{t('settings.calendarPage.description')}</p>
      </div>

      {/* 1. Where events come from: every source type, each row with its health */}
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
            <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
              {missingGoogleIds.map((id) => {
                const status = health.get(id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-sm text-hs-text-body flex-1 min-w-0">
                      <span className="block truncate">{status?.name ?? id}</span>
                      <span className="block text-[11px] text-hs-text-faint">{t('settings.calendarPage.google.notInListing')}</span>
                      <SourceHealthError status={status} />
                    </span>
                    <SourceHealthBadge status={status} />
                  </div>
                );
              })}
            </div>
          )}
        </SourceBlock>

        <ICloudCalendarManager icloudSources={icloudSources} onChange={onChange} health={health} />

        <ICalFeedManager icalSources={icalSources} onChange={onChange} health={health} />

        <SourceBlock title={t('settings.calendarPage.holidays.heading')} right={holidayCountry ? <SourceHealthBadge status={health.get('holidays')} /> : undefined}>
          <div className="space-y-2" data-field-id="calendar.holidayCountry">
            <select
              value={holidayCountry ?? ''}
              onChange={(e) => onChange({ holidayCountry: e.target.value || undefined })}
              className="w-full rounded-md bg-hs-card border border-hs-border-strong px-2.5 py-1.5 text-sm text-hs-text-body focus:border-hs-accent focus:outline-none"
            >
              <option value="">{t('settings.calendarPage.holidays.none')}</option>
              {availableCountries.map((c) => (
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

      {/* 2. People: who the calendars belong to */}
      <SettingsArea
        title={t('settings.calendarPage.people.heading')}
        description={t('settings.calendarPage.people.help')}
        testId="calendar-area-people"
      >
        <div data-field-id="calendar.people">
          <CalendarPeopleManager people={people} onChange={(next) => onChange({ people: next })} />
        </div>
      </SettingsArea>

      {/* 3. What to show: the limits every calendar module starts from */}
      <SettingsArea
        title={t('settings.calendarPage.areas.show')}
        description={t('settings.calendarPage.areas.showDescription')}
        testId="calendar-area-show"
      >
        <div className="grid grid-cols-2 gap-3">
          <div data-field-id="calendar.maxEvents">
            <Slider
              label={t('settings.calendarPage.shared.maxEventsLabel')}
              value={maxEvents}
              min={1}
              max={100}
              onChange={(v) => onChange({ maxEvents: v })}
            />
          </div>
          <div data-field-id="calendar.daysAhead">
            <Slider
              label={t('settings.calendarPage.shared.daysAheadLabel')}
              value={daysAhead}
              min={1}
              max={90}
              onChange={(v) => onChange({ daysAhead: v })}
            />
          </div>
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
    </div>
  );
}
