'use client';

import { useMemo, useRef } from 'react';
import SunCalc from 'suncalc';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useRealClock } from '@/hooks/useTZClock';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier } from '@/lib/fullscreen-themes';
import type { FullscreenWeatherConfig, ModuleStyle, TimeFormat } from '@/types/config';
import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';
import { LocationRequired } from '../LocationRequired';
import { resolveWeatherLocationLabel } from '../weather/location-label';
import { resolveSkyCondition, skyBackground, SKY_ACCENT, particleKind } from './sky-layer';
import {
  tzHour, getOrientation, isNightHour,
  type WeatherScale, type WeatherViewProps, type SunTimes,
} from './weather-view-utils';
import ConditionParticles from './ConditionParticles';
import { useFitScale, FIT_FACTOR_ATTR, FIT_SETTLED_ATTR } from './useFitScale';
import PanoramaView from './PanoramaView';
import AlmanacView from './AlmanacView';
import AmbientView from './AmbientView';

interface FullscreenWeatherModuleProps {
  config: FullscreenWeatherConfig;
  style: ModuleStyle;
  hourly?: HourlyWeather[];
  forecast?: ForecastDay[];
  minutely?: MinutelyPrecip[];
  alerts?: WeatherAlert[];
  units?: 'metric' | 'imperial';
  timezone?: string;
  locationMissing?: boolean;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  fullscreenTheme?: string;
  /** Household 12/24-hour preference, threaded by buildModuleProps. */
  timeFormat?: TimeFormat;
}

/** Particle colours differ by theme group: pale blue drops vanish on Linen. */
const DROP_LIGHT = 'rgba(71,85,105,.62)';
const DROP_DARK = 'rgba(196,220,255,.88)';

const DAY_MS = 86_400_000;

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
  units = 'imperial',
  timezone,
  locationMissing,
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

  const hourly = useMemo(() => rawHourly ?? [], [rawHourly]);
  const forecast = useMemo(() => rawForecast ?? [], [rawForecast]);
  const minutely = useMemo(() => rawMinutely ?? [], [rawMinutely]);
  const alerts = useMemo(() => rawAlerts ?? [], [rawAlerts]);

  const theme = getThemeTokens(config.theme ?? fullscreenTheme);

  // Counts, not array identities: a refetch that returns the same shape must
  // not restart the fit loop.
  const hourlyCount = hourly.length;
  const forecastCount = forecast.length;
  const minutelyCount = minutely.length;
  const alertCount = alerts.length;

  // Panorama and Almanac are fixed-height stacks, so a large typographySize
  // can push them past the canvas. `useFitScale` measures the rendered stack
  // and returns the factor that brings it back inside; it is 1 whenever the
  // content already fits, which is every size up to extra-large.
  const stackRef = useRef<HTMLDivElement>(null);
  const requestedTypoMul = getTypoMultiplier(config.typographySize ?? 'medium');
  const { factor: fit, settled: fitSettled } = useFitScale(stackRef, [
    config.view, config.typographySize, config.density, config.daysToShow,
    config.showNowcast, config.showAlerts, config.showRibbon, config.showStatRail,
    config.showTime,
    dims.w, dims.h, hourlyCount, forecastCount, minutelyCount, alertCount,
  ]);

  const scale: WeatherScale = useMemo(() => {
    const bu = Math.min(dims.w, dims.h) / 100;
    const densityMul = getDensityMultiplier(config.density ?? 'snug');
    return {
      bu,
      s: bu * requestedTypoMul * Math.pow(fit, TYPE_FIT_EXPONENT),
      u: bu * densityMul * Math.pow(fit, STRUCTURE_FIT_EXPONENT),
      width: dims.w,
      height: dims.h,
      isDark: theme.isDark,
      orientation: getOrientation(dims.w, dims.h),
    };
  }, [dims, requestedTypoMul, fit, config.density, theme.isDark]);

  // Sun times drive the sky layer, the ribbon's night shading, and the Almanac
  // sun arc. Without coordinates there is no daylight model, so the module
  // falls back to "always day" rather than guessing.
  const sun: SunTimes = useMemo(() => {
    if (latitude == null || longitude == null) {
      return { sunrise: null, sunset: null, sunriseHour: 0, sunsetHour: 24, isNight: false, dayLengthMs: 0 };
    }
    const times = SunCalc.getTimes(now, latitude, longitude);
    const valid = (d: Date | undefined) => (d && !Number.isNaN(d.getTime()) ? d : null);
    const sunrise = valid(times.sunrise);
    const sunset = valid(times.sunset);
    if (!sunrise || !sunset) {
      // Polar day or night: the sun never crosses the horizon today, so its
      // altitude right now settles which one, for the whole day.
      const up = SunCalc.getPosition(now, latitude, longitude).altitude > 0;
      return { sunrise: null, sunset: null, sunriseHour: 0, sunsetHour: 24, isNight: !up, dayLengthMs: up ? DAY_MS : 0 };
    }
    const window: SunTimes = {
      sunrise, sunset,
      sunriseHour: tzHour(sunrise, timezone),
      sunsetHour: tzHour(sunset, timezone),
      isNight: false,
      dayLengthMs: Math.max(0, sunset.getTime() - sunrise.getTime()),
    };
    return { ...window, isNight: isNightHour(tzHour(now, timezone), window) };
  }, [latitude, longitude, now, timezone]);

  const skyCondition = resolveSkyCondition(hourly[0]?.icon, sun.isNight);
  const accent = config.accentColor || SKY_ACCENT[skyCondition];
  const skyOn = (config.skyLayer ?? 'auto') !== 'off';
  const motionOn = config.animateConditions !== false;

  // The fullscreen views always show a place name (unlike the widget, whose
  // header is opt-in), so `showLocation` is pinned true and the null branch
  // only fires when there are no coordinates at all.
  const locationLabel = resolveWeatherLocationLabel(
    { showLocation: true, locationLabel: config.locationLabel },
    locationName,
    latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null,
  ) ?? '';

  if (locationMissing) {
    return <LocationRequired style={style} />;
  }

  const viewProps: WeatherViewProps = {
    config, scale, hourly, forecast, minutely, alerts, units, now, timezone,
    timeFormat: timeFormat === '24h' ? '24h' : '12h',
    locationLabel, sky: skyCondition, accent, sun, t, locale,
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
    ['--fsw-drop' as string]: theme.isDark ? DROP_DARK : DROP_LIGHT,
    ['--fsw-flake' as string]: theme.isDark ? '#fafafa' : '#ffffff',
    ['--fsw-flake-ring' as string]: theme.isDark ? 'transparent' : 'rgba(100,116,139,.40)',
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
        background: theme.bg, color: theme.text,
        fontVariantNumeric: 'tabular-nums',
        ...themeVars,
      }}
    >
      {skyOn && (
        <div
          data-testid="fsw-sky"
          style={{ position: 'absolute', inset: 0, zIndex: 0, background: skyBackground(skyCondition, theme.isDark) }}
        />
      )}
      {motionOn && <ConditionParticles kind={particleKind(skyCondition)} height={dims.h} />}

      <div
        ref={stackRef}
        // The fit loop measures this element, and needs to know which factor
        // the layout it is reading belongs to. See useFitScale.
        {...{ [FIT_FACTOR_ATTR]: String(fit), [FIT_SETTLED_ATTR]: String(fitSettled) }}
        style={{
        position: 'relative', zIndex: 2, height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: `${u * 4}px ${u * 4.4}px`,
        gap: u * 2,
        // The fit loop reads scrollHeight against this box, so the box must be
        // the canvas and the content must be allowed to exceed it while measuring.
        overflow: 'hidden',
      }}>
        {!hasData ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: theme.textMuted, fontSize: s * 2.2 }}>
            {t('fullscreen-weather.loading')}
          </div>
        ) : config.view === 'almanac' ? (
          <AlmanacView {...viewProps} />
        ) : config.view === 'ambient' ? (
          <AmbientView {...viewProps} />
        ) : (
          <PanoramaView {...viewProps} />
        )}
      </div>
    </div>
  );
}
