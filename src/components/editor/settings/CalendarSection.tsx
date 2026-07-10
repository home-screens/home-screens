'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { ICalSource, ICloudSource } from '@/types/config';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import { useGoogleDeviceFlow } from '@/hooks/useGoogleDeviceFlow';
import { useGoogleCalendars } from '@/hooks/useGoogleCalendars';
import ICalFeedManager from './ICalFeedManager';
import ICloudCalendarManager from './ICloudCalendarManager';
import { useTranslate } from '@/i18n';

interface HolidayCountry {
  countryCode: string;
  name: string;
}

interface CalendarSettings {
  selectedCalendarIds: string[];
  icalSources: ICalSource[];
  icloudSources: ICloudSource[];
  maxEvents: number;
  daysAhead: number;
  holidayCountry?: string;
}

interface Props {
  values: CalendarSettings;
  onChange: (updates: Partial<CalendarSettings>) => void;
}

export default function CalendarSection({ values, onChange }: Props) {
  const { selectedCalendarIds, icalSources, icloudSources, maxEvents, daysAhead, holidayCountry } = values;
  const t = useTranslate('editor');

  const [availableCountries, setAvailableCountries] = useState<HolidayCountry[]>([]);

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

  return (
    <div className="space-y-6">
      {/* Google Calendar section */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.calendarPage.google.heading')}
        </h3>
        <div className="space-y-3">
          {googleLoading ? (
            <p className="text-xs text-hs-text-faint">{t('settings.calendarPage.google.checkingConnection')}</p>
          ) : googleConnected ? (
            <>
              <div className="flex items-center justify-between">
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
              </div>

              {googleCalendars.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-xs text-hs-text-muted">{t('settings.calendarPage.google.selectCalendars')}</span>
                  <div className="max-h-40 overflow-y-auto rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong">
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
                        <span className="text-sm text-hs-text-body truncate">
                          {cal.summary}
                          {cal.primary && (
                            <span className="text-hs-text-faint ml-1 text-xs">{t('settings.calendarPage.google.primaryBadge')}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
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
                  href="/editor/settings?tab=integrations"
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
                      href="/editor/settings?tab=integrations"
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
          )}
        </div>
      </section>

      {/* iCloud Calendar section */}
      <ICloudCalendarManager icloudSources={icloudSources} onChange={onChange} />

      {/* ICS / iCal Feeds section */}
      <ICalFeedManager icalSources={icalSources} onChange={onChange} />

      {/* Public Holidays section */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.calendarPage.holidays.heading')}
        </h3>
        <div className="space-y-2">
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
        </div>
      </section>

      {/* Shared settings */}
      <section>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Slider
              label={t('settings.calendarPage.shared.maxEventsLabel')}
              value={maxEvents}
              min={1}
              max={100}
              onChange={(v) => onChange({ maxEvents: v })}
            />
          </div>
          <div>
            <Slider
              label={t('settings.calendarPage.shared.daysAheadLabel')}
              value={daysAhead}
              min={1}
              max={90}
              onChange={(v) => onChange({ daysAhead: v })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
