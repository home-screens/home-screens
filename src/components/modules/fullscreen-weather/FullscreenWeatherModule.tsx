'use client';

import { useMemo, useRef } from 'react';
import SunCalc from 'suncalc';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useTZClock } from '@/hooks/useTZClock';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { getThemeTokens, getTypoMultiplier, getDensityMultiplier } from '@/lib/fullscreen-themes';
import type { FullscreenWeatherConfig, ModuleStyle, TimeFormat } from '@/types/config';
import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';
import { resolveWeatherLocationLabel } from '../weather/location-label';
import { resolveSkyCondition, skyBackground, SKY_ACCENT, particleKind } from './sky-layer';
import { tzHour, type WeatherScale, type WeatherViewProps, type SunTimes } from './weather-view-utils';
import ConditionParticles from './ConditionParticles';
import { useFitScale } from './useFitScale';
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

export default function FullscreenWeatherModule({
  config,
  style: _style,
  hourly: rawHourly,
  forecast: rawForecast,
  minutely: rawMinutely,
  alerts: rawAlerts,
  units = 'imperial',
  timezone,
  locationName,
  latitude,
  longitude,
  fullscreenTheme,
  timeFormat,
}: FullscreenWeatherModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { containerRef, dims } = useFullscreenDims();
  const now = useTZClock(timezone, 60_000);

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
  const fit = useFitScale(stackRef, [
    config.view, config.typographySize, config.density, config.daysToShow,
    config.showNowcast, config.showAlerts, config.showRibbon, config.showStatRail,
    config.showTime,
    dims.w, dims.h, hourlyCount, forecastCount, minutelyCount, alertCount,
  ]);

  const scale: WeatherScale = useMemo(() => {
    const bu = Math.min(dims.w, dims.h) / 100;
    const typoMul = requestedTypoMul * fit;
    const densityMul = getDensityMultiplier(config.density ?? 'snug');
    return {
      bu,
      // Type and structure scale independently — see WeatherScale. When the
      // fit correction bites, structure gives way faster than type (exponents
      // 1.6 vs 0.6), so a larger typographySize still buys visibly larger text
      // instead of being cancelled out by padding growing alongside it.
      s: bu * typoMul * Math.pow(fit, 0.5),
      u: bu * densityMul * Math.pow(fit, 1.5),
      width: dims.w,
      height: dims.h,
      typoMul,
      densityMul,
      isDark: theme.isDark,
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
    const sunrise = Number.isNaN(times.sunrise?.getTime()) ? null : times.sunrise;
    const sunset = Number.isNaN(times.sunset?.getTime()) ? null : times.sunset;
    const sunriseHour = sunrise ? tzHour(sunrise, timezone) : 0;
    const sunsetHour = sunset ? tzHour(sunset, timezone) : 24;
    const nowHour = tzHour(now, timezone);
    // Polar day/night collapses the window; treat a missing event as all-day.
    const isNight = sunrise && sunset
      ? (sunriseHour < sunsetHour
        ? nowHour < sunriseHour || nowHour >= sunsetHour
        : nowHour < sunriseHour && nowHour >= sunsetHour)
      : false;
    return {
      sunrise, sunset, sunriseHour, sunsetHour, isNight,
      dayLengthMs: sunrise && sunset ? Math.max(0, sunset.getTime() - sunrise.getTime()) : 0,
    };
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

      <div ref={stackRef} style={{
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
