'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { Check } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import TimezoneSelect from '@/components/editor/TimezoneSelect';
import SudoPasswordPrompt from '@/components/editor/SudoPasswordPrompt';
import { useFormattingLocale, useLocale, useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import { useHouseholdTimeFormat } from '@/hooks/useHouseholdTimeFormat';
import { logger } from '@/lib/logger';
import { hasValidLocation } from '@/lib/location';
import { formatDuration, type UnitValue } from '@/lib/duration-format';
import { formatTimeInTZ, isKnownTimezone, isPlaceTimezone, sameTimezone, timezoneLabel } from '@/lib/timezone';
import { suggestHouseholdZone, zoneGapMinutes, type ZoneSuggestion } from '@/lib/zone-suggestion';

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
type StatusKind = 'progress' | 'success' | 'error';
interface LocationStatus {
  message: string;
  kind: StatusKind;
  /**
   * The zone a lookup filled in because none was saved, so the page can say
   * what it set. Absent when the lookup left the zone alone.
   */
  filledZone?: ZoneSuggestion | null;
}

/**
 * The device-clock result, tagged with the zone it was about. Picking a
 * different zone brings the offer back, and "the device's clock now matches
 * your screens" sitting under it would be a lie, so the message is rendered
 * only while `forZone` is still the chosen zone. Tagging beats clearing on
 * change: it retires a stale failure the same way, with no effect to fire.
 */
interface DeviceClockStatus extends LocationStatus {
  forZone: string;
}

/**
 * The saved place's own zone, tagged with the coordinates it was found for,
 * the same way `DeviceClockStatus` is tagged: a zone found for the old town
 * must not be offered once the coordinates change. `timezone: null` records a
 * lookup that found none, so it is not asked again on every render.
 */
interface PlaceZone {
  lat: string;
  lon: string;
  timezone: string | null;
}

/** Typing coordinates by hand asks once the typing stops, not per keystroke. */
const PLACE_ZONE_DEBOUNCE_MS = 400;

/** "Prior Lake" out of "Prior Lake, Minnesota, US". */
function shortPlaceName(locationName: string | null): string | null {
  const first = locationName?.split(',')[0].trim();
  return first ? first : null;
}

/** A zone gap as words in the page's language: "5 hours", "5 hours, 45 minutes". */
function gapWords(minutes: number, uiLocale: string): string {
  const abs = Math.abs(minutes);
  const units: UnitValue[] = [{ unit: 'hours', value: Math.floor(abs / 60) }];
  if (abs % 60) units.push({ unit: 'minutes', value: abs % 60 });
  if (units[0].value === 0 && units.length > 1) units.shift();
  return formatDuration(units, 'words', uiLocale);
}

export default function LocationSection({ values, onChange }: Props) {
  const { lat, lon, locationName, timezone } = values;
  const locale = useFormattingLocale();
  const uiLocale = useLocale();
  const t = useTranslate('editor');
  const hour12 = useHouseholdTimeFormat(useEditorStore((s) => s.config?.settings?.timeFormat)) === '12h';
  // The hub's zone as the config load reported it, until `/api/time` answers.
  const loadedHubZone = useEditorStore((s) => s.hubTimezone);
  const tzFieldId = useId();
  const tzHelpId = useId();
  const queryFieldId = useId();

  const [locationQuery, setLocationQuery] = useState('');
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null);
  const [placeZone, setPlaceZone] = useState<PlaceZone | null>(null);

  const [browserTime, setBrowserTime] = useState(() => new Date());
  const [serverInfo, setServerInfo] = useState<{ offsetMs: number; timezone: string } | null>(null);

  // Device-clock offer state. `deviceStatus` is only ever set by pressing the
  // button, so a page that opens with a mismatch opens on the plain offer.
  const [settingDeviceZone, setSettingDeviceZone] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceClockStatus | null>(null);
  const [needsSudo, setNeedsSudo] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setBrowserTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchServerTime = useCallback(async () => {
    const fetchedAt = Date.now();
    try {
      const res = await editorFetch('/api/time');
      const data = await res.json();
      const serverMs = new Date(data.iso).getTime();
      setServerInfo({ offsetMs: serverMs - fetchedAt, timezone: data.timezone });
    } catch (err) {
      log.debug('Failed to fetch server time:', err);
    }
  }, []);

  useEffect(() => {
    fetchServerTime();
  }, [fetchServerTime]);

  /**
   * With no zone saved, every surface runs on the hub's own clock, and a
   * stock Pi is on UTC. The page asks for a zone until one is saved and
   * offers the saved town's own zone, or this browser's when the town's is
   * not known (see `suggestHouseholdZone`).
   */
  const zoneUnset = timezone.trim() === '';
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hasPlace = lat.trim() !== '' && lon.trim() !== '' && hasValidLocation(Number(lat), Number(lon));
  const placeZoneKnown = placeZone !== null && placeZone.lat === lat && placeZone.lon === lon;
  // While the saved town's zone is still being asked for, offer nothing
  // rather than this browser's zone for a moment: that is the wrong answer a
  // parent on a travelling laptop would click.
  const suggestion = zoneUnset && (!hasPlace || placeZoneKnown)
    ? suggestHouseholdZone(placeZoneKnown ? placeZone.timezone : null, browserZone)
    : null;
  const hubZone = serverInfo?.timezone ?? loadedHubZone ?? null;
  /** A zone the way a parent says it: "Chicago time", but "UTC" as it is. */
  const zoneWords = (zone: string) =>
    isPlaceTimezone(zone) ? t('settings.locationPage.zoneTime', { place: timezoneLabel(zone) }) : timezoneLabel(zone);

  useEffect(() => {
    if (!zoneUnset || !hasPlace || placeZoneKnown) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let zone: string | null = null;
      try {
        const res = await editorFetch(`/api/geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.timezone === 'string') zone = data.timezone;
        }
      } catch (err) {
        log.debug('Failed to look up the time zone of the saved place:', err);
      }
      if (!cancelled) setPlaceZone({ lat, lon, timezone: zone });
    }, PLACE_ZONE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [zoneUnset, hasPlace, placeZoneKnown, lat, lon]);

  /**
   * Recording a location is where setup ends, so it fills an empty zone too,
   * but only with the place's own zone. When the lookup cannot name one, the
   * zone stays unset and the notice offers this browser's instead, so a
   * laptop's zone is never saved for a town without the parent choosing it.
   * Also remembers the place's zone for the notice. Returns the updates to
   * save and what was filled (null when nothing was).
   */
  function fillUnsetZone(
    newLat: string,
    newLon: string,
    lookedUpZone: unknown,
  ): { updates: Partial<LocationSettings>; filled: ZoneSuggestion | null } {
    const zone = typeof lookedUpZone === 'string' ? lookedUpZone : null;
    setPlaceZone({ lat: newLat, lon: newLon, timezone: zone });
    if (!zoneUnset) return { updates: {}, filled: null };
    const filled = suggestHouseholdZone(zone, null);
    return { updates: filled ? { timezone: filled.timezone } : {}, filled };
  }

  /**
   * The device's own clock zone, when it disagrees with the one the screens
   * render in. Null covers every case with nothing to offer: the server time
   * hasn't arrived, no zone has been chosen yet (the unset notice asks for one
   * first), the configured value isn't a zone this runtime knows, or the two
   * already agree, alias spellings of one zone included, so "Asia/Calcutta"
   * against "Asia/Kolkata" stays quiet.
   */
  const deviceZoneToFix =
    serverInfo &&
    timezone.trim() !== '' &&
    isKnownTimezone(timezone) &&
    !sameTimezone(timezone, serverInfo.timezone)
      ? serverInfo.timezone
      : null;

  async function matchDeviceClock() {
    if (!deviceZoneToFix || settingDeviceZone) return;
    // Captured up front: the request describes this zone whatever the picker
    // does while it is in flight.
    const zone = timezone;
    setSettingDeviceZone(true);
    setDeviceStatus(null);
    try {
      const res = await editorFetch('/api/system/timezone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: zone }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        // Re-read rather than trusting the request: the offer disappears
        // because the device now reports the new zone, not because we said so.
        await fetchServerTime();
        setDeviceStatus({
          message: t('settings.locationPage.hubClock.success'),
          kind: 'success',
          forZone: zone,
        });
      } else if (data.needsSudoPassword) {
        setNeedsSudo(true);
      } else {
        setDeviceStatus({
          message: data.error ?? t('settings.locationPage.hubClock.error'),
          kind: 'error',
          forZone: zone,
        });
      }
    } catch {
      setDeviceStatus({ message: t('common.serverUnreachable'), kind: 'error', forZone: zone });
    } finally {
      setSettingDeviceZone(false);
    }
  }

  async function lookupLocation() {
    if (!locationQuery.trim()) return;
    setLocationStatus({ message: t('settings.locationPage.status.lookingUp'), kind: 'progress' });
    onChange({ locationName: null });
    try {
      const res = await editorFetch(`/api/geocode?q=${encodeURIComponent(locationQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const newLat = data.latitude.toFixed(4);
        const newLon = data.longitude.toFixed(4);
        const { updates, filled } = fillUnsetZone(newLat, newLon, data.timezone);
        onChange({ lat: newLat, lon: newLon, locationName: data.displayName, ...updates });
        setLocationStatus({
          message: t('settings.locationPage.status.found', { name: data.displayName }),
          kind: 'success',
          filledZone: filled,
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
    const { updates, filled } = fillUnsetZone(newLat, newLon, data.timezone);
    onChange({ lat: newLat, lon: newLon, locationName: data.displayName, ...updates });
    setLocationStatus({
      message: t('settings.locationPage.status.detectedViaIp', { name: data.displayName }),
      kind: 'success',
      filledZone: filled,
    });
  }

  function detectLocation() {
    setLocationStatus({ message: t('settings.locationPage.status.detecting'), kind: 'progress' });
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
        // The zone waits for the place lookup, which names it; without one
        // it stays unset and the notice offers this browser's.
        let name: string | null = null;
        let lookedUpZone: unknown = null;
        try {
          const res = await editorFetch(`/api/geocode?q=${newLat},${newLon}`);
          if (res.ok) {
            const data = await res.json();
            name = data.displayName;
            lookedUpZone = data.timezone;
          }
        } catch {
          // Coordinates alone are still worth keeping.
        }
        const { updates, filled } = fillUnsetZone(newLat, newLon, lookedUpZone);
        onChange({ ...(name ? { locationName: name } : {}), ...updates });
        setLocationStatus({
          message: name
            ? t('settings.locationPage.status.detected', { name })
            : t('settings.locationPage.status.detectedCoords', { lat: newLat, lon: newLon }),
          kind: 'success',
          filledZone: filled,
        });
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

  /** The zone the screens run in: the saved one, or the hub's while none is. */
  const screensZone = timezone.trim() !== '' ? timezone : hubZone;
  const clockText = (instant: Date, zone: string) => formatTimeInTZ(instant, { timezone: zone, locale, hour12 });

  /**
   * Why an unset zone matters, in this household's terms: which clock the
   * screens are on right now, and how far that is from home ("5 hours ahead
   * of Prior Lake"), or from this computer when home's zone is not known.
   */
  function unsetExplanation(): string {
    const lead = hubZone
      ? t('settings.locationPage.timezoneUnset.lead', { zone: zoneWords(hubZone) })
      : t('settings.locationPage.timezoneUnset.leadPending');
    if (!hubZone || !suggestion) return `${lead} ${t('settings.locationPage.timezoneUnset.canBeWrong')}`;
    const gap = zoneGapMinutes(hubZone, suggestion.timezone, browserTime);
    const direction = gap === 0 ? 'same' : gap > 0 ? 'ahead' : 'behind';
    const vars = { gap: gapWords(gap, uiLocale) };
    const sentence = suggestion.source === 'browser'
      ? t(`settings.locationPage.timezoneUnset.${direction}Here`, vars)
      : t(`settings.locationPage.timezoneUnset.${direction}`, { ...vars, place: placeWords() });
    return `${lead} ${sentence}`;
  }

  function suggestionButtonLabel(s: ZoneSuggestion): string {
    const zone = zoneWords(s.timezone);
    return s.source === 'browser'
      ? t('settings.locationPage.timezoneUnset.buttonHere', { zone })
      : t('settings.locationPage.timezoneUnset.buttonPlace', { zone, place: placeWords() });
  }

  function placeWords(): string {
    return shortPlaceName(locationName) ?? t('settings.locationPage.timezoneUnset.yourTown');
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

        <div className="space-y-2" data-field-id="location.query">
          <label htmlFor={queryFieldId} className="text-xs text-hs-text-muted">
            {t('settings.locationPage.queryLabel')}
          </label>
          <div className="flex gap-2">
            <input
              id={queryFieldId}
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
            className={`text-xs ${!locationStatus ? 'sr-only' : locationStatus.kind === 'error' ? 'text-hs-danger' : locationStatus.kind === 'progress' ? 'text-hs-text-muted' : 'text-hs-text-body'}`}
            aria-live="polite"
            role={locationStatus?.kind === 'error' ? 'alert' : undefined}
          >
            {locationStatus?.kind === 'success' && (
              <Check className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-hs-success" aria-hidden="true" />
            )}
            {locationStatus?.message ?? ''}
            {locationStatus?.filledZone && (
              <>
                {' '}
                {withZone(t('settings.locationPage.status.zoneSet'), zoneWords(locationStatus.filledZone.timezone))}
              </>
            )}
          </p>
          {lat.trim() !== '' && lon.trim() !== '' && hasValidLocation(Number(lat), Number(lon)) && (
            <p className="text-xs text-hs-text-faint">
              {locationName ? `${locationName}: ` : ''}
              {lat}, {lon}
            </p>
          )}
        </div>

        <div className="block" data-field-id="location.timezone">
          <label htmlFor={tzFieldId} className="text-xs text-hs-text-muted">
            {t('settings.locationPage.timezoneLabel')}
          </label>
          <div className="mt-1">
            <TimezoneSelect
              value={timezone}
              onChange={(v) => onChange({ timezone: v })}
              defaultOptionLabel={t('settings.locationPage.timezoneNotPicked')}
              ariaLabel={t('settings.locationPage.timezoneLabel')}
              id={tzFieldId}
              ariaDescribedBy={tzHelpId}
              // Muted while nothing is picked, so "Not picked yet" does not
              // read like a choice already made.
              inputClassName={`w-full rounded-md bg-hs-card border border-hs-border-strong text-sm px-3 py-2 focus:outline-none focus:border-hs-accent ${zoneUnset ? 'text-hs-text-muted' : 'text-hs-text-body'}`}
            />
          </div>

          {zoneUnset ? (
            // Warning-colored, unlike the optional hub-clock line in Clock
            // check: this one is wrong on every screen until it is answered.
            <div
              className="mt-2.5 rounded-lg border border-hs-warning/45 bg-hs-warning/10 px-3.5 py-3"
              data-testid="timezone-unset"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-hs-text-primary">
                <span className="h-2 w-2 shrink-0 rounded-full bg-hs-warning" aria-hidden="true" />
                {t('settings.locationPage.timezoneUnset.title')}
              </p>
              <p id={tzHelpId} className="mt-1 text-xs text-hs-text-body">
                {unsetExplanation()}
              </p>
              {suggestion && (
                <Button
                  variant="warning"
                  className="mt-2.5"
                  onClick={() => onChange({ timezone: suggestion.timezone })}
                >
                  {suggestionButtonLabel(suggestion)}
                </Button>
              )}
            </div>
          ) : (
            <p id={tzHelpId} className="text-xs text-hs-text-faint mt-1">
              {t('settings.locationPage.timezoneHelp')}
            </p>
          )}
        </div>

        {/* Diagnostic, not a setting: folded away so the page opens on the two
            things people came for (their town, then their time zone). The
            hub's own clock lives in here too, as an optional extra: the
            screens are right either way, so it must not look like a second
            problem the moment a zone is picked. */}
        <details className="text-xs">
          <summary className="text-hs-text-faint cursor-pointer hover:text-hs-text-muted">
            {t('settings.locationPage.clockCheck.summary')}
          </summary>
          <div
            className="mt-2 grid grid-cols-[1.2fr_1fr_1fr] rounded-lg border border-hs-border-strong bg-hs-card divide-x divide-hs-border-strong"
            data-testid="clock-check"
          >
            <ClockCell
              label={t('settings.locationPage.clockCheck.screens')}
              time={screensZone ? clockText(browserTime, screensZone) : null}
              zone={screensZone ? zoneWords(screensZone) : ''}
              home
            />
            <ClockCell
              label={t('settings.locationPage.clockCheck.computer')}
              time={clockText(browserTime, browserZone)}
              zone={zoneWords(browserZone)}
            />
            <ClockCell
              label={t('settings.locationPage.clockCheck.hub')}
              time={serverInfo ? clockText(new Date(browserTime.getTime() + serverInfo.offsetMs), serverInfo.timezone) : null}
              zone={serverInfo ? zoneWords(serverInfo.timezone) : ''}
            />
          </div>
          <p className="text-xs text-hs-text-muted mt-2">
            {zoneUnset ? t('settings.locationPage.clockCheck.adviceUnset') : t('settings.locationPage.clockCheck.advice')}
          </p>

          {/* The hub's own clock is a separate thing from the zone above, and
              an image-flashed Pi runs UTC because nobody ever chose. This is
              an offer and never a side effect of saving the picker. */}
          {deviceZoneToFix && (
            <div
              className="mt-2.5 flex items-center justify-between gap-3 border-t border-dashed border-hs-border pt-2.5"
              data-testid="device-clock-offer"
            >
              <p className="text-xs text-hs-text-muted">
                <span className="mr-1.5 rounded-full border border-hs-border-strong px-1.5 text-[10.5px] uppercase tracking-wider text-hs-text-faint">
                  {t('settings.locationPage.hubClock.optional')}
                </span>
                {t('settings.locationPage.hubClock.message', { zone: zoneWords(deviceZoneToFix) })}
              </p>
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={matchDeviceClock}
                disabled={settingDeviceZone}
              >
                {settingDeviceZone
                  ? t('settings.locationPage.hubClock.settingButton')
                  : t('settings.locationPage.hubClock.button', { zone: zoneWords(timezone) })}
              </Button>
            </div>
          )}

          {/* Outside the offer above, which unmounts the moment the hub
              reports the new zone, so the confirmation has to outlive it. */}
          {deviceStatus?.forZone === timezone && (
            <p
              className={`text-xs mt-1.5 ${deviceStatus.kind === 'error' ? 'text-hs-danger' : 'text-hs-success'}`}
              aria-live="polite"
              role={deviceStatus.kind === 'error' ? 'alert' : undefined}
            >
              {deviceStatus.message}
            </p>
          )}
          {needsSudo && (
            <SudoPasswordPrompt
              compact
              onGranted={() => {
                setNeedsSudo(false);
                matchDeviceClock();
              }}
              onCancel={() => setNeedsSudo(false)}
            />
          )}
        </details>

        <details className="text-xs">
          <summary className="text-hs-text-faint cursor-pointer hover:text-hs-text-muted">
            {t('settings.locationPage.editCoordinates')}
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <label className="block" data-field-id="location.latitude">
              <span className="text-xs text-hs-text-muted">{t('settings.locationPage.latitudeLabel')}</span>
              <input
                type="text"
                value={lat}
                onChange={(e) => onChange({ lat: e.target.value })}
                placeholder={t('settings.locationPage.latitudePlaceholder')}
                className="mt-1 block w-full rounded-md bg-hs-card border border-hs-border-strong text-sm text-hs-text-body px-3 py-2 focus:outline-none focus:border-hs-accent"
              />
            </label>
            <label className="block" data-field-id="location.longitude">
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

/** A translated sentence with its `{zone}` slot drawn in bold. */
function withZone(template: string, zone: string) {
  const [before, after = ''] = template.split('{zone}');
  return (
    <>
      {before}
      <strong className="font-semibold text-hs-text-primary">{zone}</strong>
      {after}
    </>
  );
}

/** One clock in Clock check. `home` marks the time the screens show. */
function ClockCell({ label, time, zone, home = false }: { label: string; time: string | null; zone: string; home?: boolean }) {
  return (
    <div className="px-3.5 py-3 min-w-0">
      <span className={`text-[10.5px] uppercase tracking-wider ${home ? 'text-hs-accent' : 'text-hs-text-faint'}`}>{label}</span>
      <p className={`text-base tabular-nums mt-0.5 ${home ? 'font-semibold text-hs-text-primary' : 'text-hs-text-body'}`}>
        {time ?? <span className="text-hs-text-faint">...</span>}
      </p>
      <p className="text-[11px] text-hs-text-faint truncate">{zone}</p>
    </div>
  );
}
