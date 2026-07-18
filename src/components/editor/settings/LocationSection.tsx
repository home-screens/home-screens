'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { COMMON_TIMEZONES } from '@/lib/timezone';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { logger } from '@/lib/logger';

const log = logger('location');

interface LocationSettings {
  lat: string;
  lon: string;
  locationName: string | null;
  timezone: string;
}

interface Props {
  values: LocationSettings;
  onChange: (updates: Partial<LocationSettings>) => void;
}

// kind drives styling/role explicitly — don't sniff English prefixes from message.
type StatusKind = 'success' | 'error';
interface LocationStatus {
  message: string;
  kind: StatusKind;
}

export default function LocationSection({ values, onChange }: Props) {
  const { lat, lon, locationName, timezone } = values;
  const locale = useFormattingLocale();
  const t = useTranslate('editor');

  const [locationQuery, setLocationQuery] = useState('');
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null);

  const [browserTime, setBrowserTime] = useState(() => new Date());
  const [serverInfo, setServerInfo] = useState<{ offsetMs: number; timezone: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setBrowserTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchServerTime() {
      const fetchedAt = Date.now();
      try {
        const res = await editorFetch('/api/time');
        const data = await res.json();
        const serverMs = new Date(data.iso).getTime();
        setServerInfo({ offsetMs: serverMs - fetchedAt, timezone: data.timezone });
      } catch (err) {
        log.debug('Failed to fetch server time:', err);
      }
    }
    fetchServerTime();
  }, []);

  async function lookupLocation() {
    if (!locationQuery.trim()) return;
    setLocationStatus({ message: t('settings.locationPage.status.lookingUp'), kind: 'success' });
    onChange({ locationName: null });
    try {
      const res = await editorFetch(`/api/geocode?q=${encodeURIComponent(locationQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const newLat = data.latitude.toFixed(4);
        const newLon = data.longitude.toFixed(4);
        onChange({ lat: newLat, lon: newLon, locationName: data.displayName });
        setLocationStatus({
          message: t('settings.locationPage.status.found', { name: data.displayName }),
          kind: 'success',
        });
      } else {
        const err = await res.json();
        setLocationStatus({
          message: t('settings.locationPage.status.error', { message: err.error }),
          kind: 'error',
        });
      }
    } catch {
      setLocationStatus({
        message: t('settings.locationPage.status.lookupFailed'),
        kind: 'error',
      });
    }
  }

  async function detectViaIP() {
    const res = await editorFetch('/api/geocode?detect=ip');
    if (!res.ok) throw new Error('IP geolocation failed');
    const data = await res.json();
    const newLat = data.latitude.toFixed(4);
    const newLon = data.longitude.toFixed(4);
    onChange({ lat: newLat, lon: newLon, locationName: data.displayName });
    setLocationStatus({
      message: t('settings.locationPage.status.detectedViaIp', { name: data.displayName }),
      kind: 'success',
    });
  }

  function detectLocation() {
    setLocationStatus({ message: t('settings.locationPage.status.detecting'), kind: 'success' });
    onChange({ locationName: null });

    // Browser geolocation requires HTTPS — fall back to IP geolocation on non-secure origins
    if (!navigator.geolocation || window.location.protocol === 'http:') {
      detectViaIP().catch(() => {
        setLocationStatus({
          message: t('settings.locationPage.status.detectFailed'),
          kind: 'error',
        });
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = pos.coords.latitude.toFixed(4);
        const newLon = pos.coords.longitude.toFixed(4);
        onChange({ lat: newLat, lon: newLon });
        try {
          const res = await editorFetch(`/api/geocode?q=${newLat},${newLon}`);
          if (res.ok) {
            const data = await res.json();
            onChange({ locationName: data.displayName });
            setLocationStatus({
              message: t('settings.locationPage.status.detected', { name: data.displayName }),
              kind: 'success',
            });
          } else {
            setLocationStatus({
              message: t('settings.locationPage.status.detectedCoords', { lat: newLat, lon: newLon }),
              kind: 'success',
            });
          }
        } catch {
          setLocationStatus({
            message: t('settings.locationPage.status.detectedCoords', { lat: newLat, lon: newLon }),
            kind: 'success',
          });
        }
      },
      () => {
        // Geolocation denied or failed — try IP fallback
        detectViaIP().catch(() => {
          setLocationStatus({
            message: t('settings.locationPage.status.detectFailed'),
            kind: 'error',
          });
        });
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <section>
      <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
        {t('settings.locationPage.heading')}
      </h3>
      <div className="space-y-3">
        <p className="text-xs text-hs-text-faint">
          {t('settings.locationPage.description')}
        </p>

        <div className="rounded-md bg-hs-card border border-hs-border-strong px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">{t('settings.locationPage.browserLabel')}</span>
            <p className="text-sm text-hs-text-body tabular-nums">
              {browserTime.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] text-hs-text-faint">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-hs-text-faint">{t('settings.locationPage.serverLabel')}</span>
            <p className="text-sm text-hs-text-body tabular-nums">
              {serverInfo
                ? new Date(browserTime.getTime() + serverInfo.offsetMs).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: serverInfo.timezone })
                : <span className="text-hs-text-faint">...</span>}
            </p>
            <p className="text-[10px] text-hs-text-faint">{serverInfo?.timezone ?? ''}</p>
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-hs-text-muted">{t('settings.locationPage.timezoneLabel')}</span>
          <select
            value={timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
          >
            <option value="">
              {t('settings.locationPage.timezoneSystemDefault', {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })}
            </option>
            {(() => {
              try {
                return Intl.supportedValuesOf('timeZone').map((tz: string) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ));
              } catch {
                return COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.value.replace(/_/g, ' ')}</option>
                ));
              }
            })()}
          </select>
          <p className="text-xs text-hs-text-faint mt-1">
            {t('settings.locationPage.timezoneHelp')}
          </p>
        </label>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookupLocation()}
              placeholder={t('settings.locationPage.queryPlaceholder')}
              className="flex-1 rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
            />
            <Button variant="secondary" size="sm" onClick={lookupLocation}>
              {t('settings.locationPage.lookUpButton')}
            </Button>
            <Button variant="secondary" size="sm" onClick={detectLocation}>
              {t('settings.locationPage.detectButton')}
            </Button>
          </div>
          <p
            className={`text-xs ${!locationStatus ? 'sr-only' : locationStatus.kind === 'error' ? 'text-hs-danger' : 'text-hs-success'}`}
            aria-live="polite"
            role={locationStatus?.kind === 'error' ? 'alert' : undefined}
          >
            {locationStatus?.message ?? ''}
          </p>
          {(lat && lon) && (
            <p className="text-xs text-hs-text-faint">
              {locationName ? `${locationName}: ` : ''}
              {lat}, {lon}
            </p>
          )}
        </div>

        <details className="text-xs">
          <summary className="text-hs-text-faint cursor-pointer hover:text-hs-text-muted">
            {t('settings.locationPage.editCoordinates')}
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <label className="block">
              <span className="text-xs text-hs-text-muted">{t('settings.locationPage.latitudeLabel')}</span>
              <input
                type="text"
                value={lat}
                onChange={(e) => onChange({ lat: e.target.value })}
                placeholder={t('settings.locationPage.latitudePlaceholder')}
                className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
            </label>
            <label className="block">
              <span className="text-xs text-hs-text-muted">{t('settings.locationPage.longitudeLabel')}</span>
              <input
                type="text"
                value={lon}
                onChange={(e) => onChange({ lon: e.target.value })}
                placeholder={t('settings.locationPage.longitudePlaceholder')}
                className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
            </label>
          </div>
        </details>
      </div>
    </section>
  );
}
