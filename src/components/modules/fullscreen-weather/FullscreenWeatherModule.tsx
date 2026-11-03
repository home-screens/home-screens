'use client';

import { useMemo, useRef } from 'react';
import SunCalc from 'suncalc';
import { sunTimesFor } from '@/lib/weather/sun-times';
import { useFetchData } from '@/hooks/useFetchData';
import { airQualityUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useRealClock } from '@/hooks/useTZClock';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier } from '@/lib/fullscreen-themes';
import type { FullscreenWeatherConfig, ModuleStyle, TimeFormat } from '@/types/config';
import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';
import { forecastFromToday } from '@/lib/weather/daily';
import { isoDateInTZ } from '@/lib/timezone';
import { LocationRequired } from '../LocationRequired';
import { ModuleSetupState } from '../ModuleStates';
import { useLoadingStalled } from '@/hooks/useLoadingStalled';
import type { FetchError } from '@/lib/fetch-error';
import { resolveWeatherLocationLabel } from '../weather/location-label';
import { resolveSkyCondition, skyBackground, SKY_ACCENT, skyScene, sunPhase } from './sky-layer';
import { getOrientation } from '@/lib/orientation';
import {
  timelineHours, hoursWithin, baseUnit,
  CANVAS_PAD_X_U, CANVAS_PAD_Y_U,
  type WeatherScale, type WeatherViewProps, type SunTimes,
} from './weather-view-utils';
import LivingSky from './LivingSky';
import { useFitScale, FIT_FACTOR_ATTR, FIT_SETTLED_ATTR } from '@/hooks/useFitScale';
import PanoramaView, { StripView } from './PanoramaView';
import AlmanacView from './AlmanacView';
import AmbientView from './AmbientView';
import WeekView from './WeekView';
import HourlyView from './HourlyView';
import ForecastView from './ForecastView';
import ConditionsView from './ConditionsView';
import { availableCards } from './cards';
import { resolveWeatherCards } from '@/lib/fullscreen-weather-cards';
import { householdTimeFormat } from '@/lib/clock-time';

interface FullscreenWeatherModuleProps {
  config: FullscreenWeatherConfig;
  style: ModuleStyle;
  hourly?: HourlyWeather[];
  forecast?: ForecastDay[];
  minutely?: MinutelyPrecip[];
  alerts?: WeatherAlert[];
  /** Set by buildModuleProps only while there is no payload and the fetch failed. */
  weatherError?: FetchError;
  units?: 'metric' | 'imperial';
  timezone?: string;
  locationMissing?: boolean;
  locationSettingsHref?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  fullscreenTheme?: string;
  /** Household 12/24-hour preference, threaded by buildModuleProps. */
  timeFormat?: TimeFormat;
}

/**
 * The living sky is the background, whatever the theme: white type and
 * translucent dark cards over it, the way the phone app does it. The theme
 * still owns the still and off skies. Snow and fog are the lightest scenes
 * and the hero's text shadow is what keeps white type readable there.
 */
const LIVING_SKY_TOKENS = {
  surface: 'rgba(20,22,48,.62)',
  surfaceAlt: 'rgba(0,0,0,.28)',
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,.78)',
  textMuted: 'rgba(255,255,255,.58)',
  border: 'rgba(255,255,255,.10)',
  borderSubtle: 'rgba(255,255,255,.10)',
  cardShadow: '0 8px 30px rgba(0,0,0,.12)',
} as const;
const LIVING_TEXT_SHADOW = '0 2px 10px rgba(0,0,0,.35), 0 4px 30px rgba(0,0,0,.3)';

const AIR_QUALITY_REFRESH_MS = FETCH_KEY_REGISTRY['air-quality']?.ttlMs ?? 300_000;

/** How long to promise a forecast before admitting it is not arriving. */
const WEATHER_STALL_MS = 20_000;

/**
 * How the fit correction is split between type and structure.
 *
 * When the stack outgrows the canvas, `useFitScale` returns a factor below 1
 * and both units shrink — but structure gives way faster than type, so a
 * larger `typographySize` still buys visibly larger text instead of being
 * cancelled out by padding and chart heights growing alongside it. The
 * exponents are applied to the *requested* multipliers, never to a unit that
 * already contains the factor, or the two would collapse back to one.
 */
const TYPE_FIT_EXPONENT = 0.6;
const STRUCTURE_FIT_EXPONENT = 1.6;

export default function FullscreenWeatherModule({
  config,
  style,
  hourly: rawHourly,
  forecast: rawForecast,
  minutely: rawMinutely,
  alerts: rawAlerts,
  weatherError,
  units = 'imperial',
  timezone,
  locationMissing,
  locationSettingsHref,
  locationName,
  latitude,
  longitude,
  fullscreenTheme,
  timeFormat,
}: FullscreenWeatherModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { containerRef, dims } = useFullscreenDims();
  // The real instant, not the tz-shifted wall clock: it feeds SunCalc and is
  // formatted with an explicit `timeZone` everywhere below, so a shifted date
  // would be shifted twice on any Pi whose OS zone differs from the display's.
  const now = useRealClock(60_000);

  // No payload yet (props absent) vs a provider that answered with nothing.
  const waiting = rawHourly === undefined && rawForecast === undefined && !locationMissing;
  const stalled = useLoadingStalled(waiting && !weatherError, WEATHER_STALL_MS);
  const hourly = useMemo(() => rawHourly ?? [], [rawHourly]);
  // From the household's today on: a forecast fetched before midnight still
  // leads with yesterday until the next refresh.
  const todayISO = isoDateInTZ(now, timezone);
  const forecast = useMemo(() => forecastFromToday(rawForecast ?? [], todayISO), [rawForecast, todayISO]);
  const minutely = useMemo(() => rawMinutely ?? [], [rawMinutely]);
  const alerts = useMemo(() => rawAlerts ?? [], [rawAlerts]);

  const skyMode = config.skyLayer ?? 'living';
  const baseTheme = getThemeTokens(config.theme ?? fullscreenTheme);
  const theme = skyMode === 'living' ? { ...baseTheme, ...LIVING_SKY_TOKENS, isDark: true } : baseTheme;
  const cardView = config.view === 'forecast' || config.view === 'conditions';

  // The Forecast and Conditions views' air quality card. Only they ask, and only with a
  // location (the route reads the household's). A missing OpenWeatherMap
  // key answers with a setup error, which simply leaves the card hidden.
  const wantAirQuality = cardView && resolveWeatherCards(config).includes('airQuality') && latitude != null && longitude != null;
  const [airQuality] = useFetchData<{ aqi: number }>(wantAirQuality ? airQualityUrl() : '', AIR_QUALITY_REFRESH_MS);

  // Counts, not array identities: a refetch that returns the same shape must
  // not restart the fit loop. And the count the *view draws*, not the raw
  // length: Open-Meteo and NOAA drop entries older than an hour, so the raw
  // list shrinks by one at every hour boundary while the 24-row timeline
  // stays 24 rows. Re-fitting an identical layout costs a frame at factor 1
  // (the list visibly overflows at large type) and a fresh bisection.
  // The Wide strip view is scaled by its area while it has a wide box to lay
  // across (see `baseUnit`); its portrait form is a portrait view like the
  // others and takes the short-edge unit, and draws the 24-row timeline
  // rather than the ribbon.
  const strip = config.view === 'strip' && getOrientation(dims.w, dims.h) === 'landscape';
  const stripRows = config.view === 'strip' && !strip;
  const hourlyCount = config.view === 'hourly' || stripRows
    ? timelineHours(hourly).length
    : config.view === 'almanac'
      ? hoursWithin(hourly, 12).length
      : cardView
        ? Math.min(12, hoursWithin(hourly, 36).length)
        : Math.min(48, hourly.length);
  const forecastCount = forecast.length;
  const minutelyCount = minutely.length;
  const alertCount = alerts.length;

  // Panorama and Almanac are fixed-height stacks, so a large typographySize
  // can push them past the canvas. `useFitScale` measures the rendered stack
  // and returns the factor that brings it back inside; it is 1 whenever the
  // content already fits, which is every size up to extra-large.
  // Sun times drive the sky layer, the ribbon's night shading, and the Almanac
  // sun arc. Without coordinates there is no daylight model, so the module
  // falls back to "always day" rather than guessing.
  const sun: SunTimes = useMemo(() => sunTimesFor(now, latitude, longitude, timezone), [latitude, longitude, now, timezone]);

  // The Forecast and Conditions views' card set, as the views decide it: a toggle and the data
  // behind it. A refetch that brings pressure or visibility where the first
  // answer had none adds cards, and the fit must run again for them, so the
  // set itself is a dependency rather than the toggles alone.
  const cardSet = cardView
    ? availableCards({ config, hourly, forecast, minutely, units, sun, t, latitude, longitude, airQuality: wantAirQuality ? airQuality : null }).join(',')
    : '';

  const stackRef = useRef<HTMLDivElement>(null);
  const requestedTypoMul = getTypoMultiplier(config.typographySize ?? 'medium');
  const { factor: fit, settled: fitSettled } = useFitScale(stackRef, [
    config.view, config.typographySize, config.density, config.daysToShow,
    config.showNowcast, config.showAlerts, config.showRibbon, config.showStatRail,
    config.showTime, config.showMap, cardSet,
    dims.w, dims.h, hourlyCount, forecastCount, minutelyCount, alertCount,
  ]);

  const scale: WeatherScale = useMemo(() => {
    const bu = baseUnit(dims.w, dims.h, strip);
    const densityMul = getDensityMultiplier(config.density ?? 'snug');
    return {
      bu,
      s: bu * requestedTypoMul * Math.pow(fit, TYPE_FIT_EXPONENT),
      u: bu * densityMul * Math.pow(fit, STRUCTURE_FIT_EXPONENT),
      width: dims.w,
      height: dims.h,
      isDark: theme.isDark,
      orientation: getOrientation(dims.w, dims.h),
      fit,
    };
  }, [dims, requestedTypoMul, fit, config.density, theme.isDark, strip]);

  const skyCondition = resolveSkyCondition(hourly[0]?.icon, sun.isNight);
  const accent = config.accentColor || SKY_ACCENT[skyCondition];

  // The living sky follows the sun's height as well as the conditions, so a
  // clear sky is blue at noon, warm at dusk and starry at night.
  const sunAltitude = latitude != null && longitude != null
    ? (SunCalc.getPosition(now, latitude, longitude).altitude * 180) / Math.PI
    : null;
  const scene = skyScene(hourly[0]?.icon, sunPhase(sunAltitude));
  const moonPhase = SunCalc.getMoonIllumination(now).phase;

  // The fullscreen views always show a place name (unlike the standard weather
  // module, whose header is opt-in), so `showLocation` is pinned true and the
  // null branch only fires when there are no coordinates at all.
  const locationLabel = resolveWeatherLocationLabel(
    { showLocation: true, locationLabel: config.locationLabel },
    locationName,
    latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null,
  ) ?? '';

  if (locationMissing) {
    return <LocationRequired style={style} locationSettingsHref={locationSettingsHref} />;
  }
  if (waiting && weatherError?.kind === 'setup') {
    return <ModuleSetupState style={style} error={weatherError} />;
  }

  const viewProps: WeatherViewProps = {
    config, scale, hourly, forecast, minutely, alerts, units, now, timezone,
    timeFormat: householdTimeFormat(timeFormat, locale),
    locationLabel, sky: skyCondition, accent, sun, t, locale,
    latitude, longitude, airQuality: wantAirQuality ? airQuality : null,
  };

  const themeVars: React.CSSProperties = {
    ['--fsw-bg' as string]: theme.bg,
    ['--fsw-surface' as string]: theme.surface,
    ['--fsw-surface-alt' as string]: theme.surfaceAlt,
    ['--fsw-text' as string]: theme.text,
    ['--fsw-text-2' as string]: theme.textSecondary,
    ['--fsw-text-3' as string]: theme.textMuted,
    ['--fsw-border' as string]: theme.border,
    ['--fsw-border-sub' as string]: theme.borderSubtle,
    ['--fsw-card-shadow' as string]: theme.cardShadow,
    ['--fsw-text-shadow' as string]: skyMode === 'living' ? LIVING_TEXT_SHADOW : 'none',
  };

  const { s, u } = scale;
  const hasData = hourly.length > 0 || forecast.length > 0;

  return (
    <div
      ref={containerRef}
      data-testid="fullscreen-weather"
      data-view={config.view}
      data-orientation={scale.orientation}
      style={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        // The theme's atmosphere layer shows whenever the sky layer is off;
        // with the sky on it is covered, and costs nothing.
        backgroundColor: theme.bg, backgroundImage: theme.bgImage ?? 'none', color: theme.text,
        fontVariantNumeric: 'tabular-nums',
        ...themeVars,
      }}
    >
      {skyMode === 'living' ? (
        <LivingSky scene={scene} moonPhase={moonPhase} moonPlace={config.view === 'forecast' ? 'hero' : 'header'} />
      ) : skyMode === 'still' ? (
        <div
          data-testid="fsw-sky"
          data-scene="still"
          style={{ position: 'absolute', inset: 0, zIndex: 0, background: skyBackground(skyCondition, theme.isDark) }}
        />
      ) : null}

      {/*
        Two boxes, not one. The outer carries the canvas padding; the inner is
        what the fit loop measures. `scrollWidth` / `scrollHeight` only grow
        past the *padding* edge, so with the padding on the measured element
        any overflow that landed inside it (up to ~47px a side) was invisible
        to the fit loop and rendered into the margin — which is how the Week
        view's high-temperature column ended up clipped at the canvas edge at
        2x-large. With the padding outside, the measured box is exactly the
        content area, and overflow past it is what gets measured.
      */}
      <div style={{ position: 'relative', zIndex: 2, height: '100%', padding: `${Math.max(u * CANVAS_PAD_Y_U, scale.s * 2)}px ${Math.max(u * CANVAS_PAD_X_U, scale.s * 2)}px`, textShadow: 'var(--fsw-text-shadow)' }}>
      <div
        ref={stackRef}
        data-testid="fsw-stack"
        // The fit loop measures this element, and needs to know which factor
        // the layout it is reading belongs to. See useFitScale.
        {...{ [FIT_FACTOR_ATTR]: String(fit), [FIT_SETTLED_ATTR]: String(fitSettled) }}
        style={{
        height: '100%',
        display: 'flex', flexDirection: 'column',
        gap: u * 2,
        // The fit loop reads scrollHeight against this box, so the box must be
        // the content area and the content must be allowed to exceed it while
        // measuring.
        overflow: 'hidden',
      }}>
        {!hasData ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: theme.textMuted, fontSize: s * 2.2 }} aria-live="polite">
            {waiting && (weatherError || stalled) ? t('weather.notUpdating') : t('fullscreen-weather.loading')}
          </div>
        ) : config.view === 'almanac' ? (
          <AlmanacView {...viewProps} />
        ) : config.view === 'ambient' ? (
          <AmbientView {...viewProps} />
        ) : config.view === 'week' ? (
          <WeekView {...viewProps} />
        ) : config.view === 'hourly' ? (
          <HourlyView {...viewProps} />
        ) : config.view === 'strip' ? (
          <StripView {...viewProps} />
        ) : config.view === 'forecast' ? (
          <ForecastView {...viewProps} />
        ) : config.view === 'conditions' ? (
          <ConditionsView {...viewProps} />
        ) : (
          <PanoramaView {...viewProps} />
        )}
      </div>
      </div>
    </div>
  );
}
