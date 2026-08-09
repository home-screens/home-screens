'use client';

import type { WeatherConfig, WeatherView, ModuleStyle } from '@/types/config';
import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';
import { TEXT_OPACITY } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useTranslate } from '@/i18n';
import { resolveWeatherLocationLabel } from './location-label';
import ModuleWrapper from '../ModuleWrapper';
import WeatherCurrentView from './WeatherCurrentView';
import WeatherHourlyView from './WeatherHourlyView';
import WeatherDailyView from './WeatherDailyView';
import WeatherCombinedView from './WeatherCombinedView';
import WeatherCompactView from './WeatherCompactView';
import WeatherTableView from './WeatherTableView';
import WeatherPrecipitationView from './WeatherPrecipitationView';
import WeatherAlertsView from './WeatherAlertsView';

interface WeatherModuleProps {
  config: WeatherConfig;
  style: ModuleStyle;
  hourly?: HourlyWeather[];
  forecast?: ForecastDay[];
  minutely?: MinutelyPrecip[];
  alerts?: WeatherAlert[];
  units?: 'metric' | 'imperial';
  timezone?: string;
  locationMissing?: boolean;
  /** Geocoded place name from settings; the fallback when no custom label is set. */
  locationName?: string;
  /** Last-resort label source when the location was entered as raw coordinates. */
  latitude?: number;
  longitude?: number;
}

const SCALE_FACTORS: Record<WeatherView, number> = {
  current: 0.12,
  hourly: 0.09,
  daily: 0.12,
  combined: 0.06,
  // 1/3.15em of content (icon+temp row, stats row, gap) with a hair of margin.
  // Was 0.25, tuned when the 2em temperature still reserved a 3em line box; with
  // that leading removed the view filled only 78% of its height.
  compact: 0.31,
  table: 0.08,
  precipitation: 0.09,
  alerts: 0.08,
};

// `current` centers its hero temperature, so a centered header reads as part of
// the same stack; every other view is a left-aligned list or table.
const LABEL_ALIGN: Record<WeatherView, string> = {
  current: 'text-center',
  hourly: 'text-left',
  daily: 'text-left',
  combined: 'text-left',
  compact: 'text-left',
  table: 'text-left',
  precipitation: 'text-left',
  alerts: 'text-left',
};

const VIEW_COMPONENTS = {
  current: WeatherCurrentView,
  hourly: WeatherHourlyView,
  daily: WeatherDailyView,
  combined: WeatherCombinedView,
  compact: WeatherCompactView,
  table: WeatherTableView,
  precipitation: WeatherPrecipitationView,
  alerts: WeatherAlertsView,
};

export default function WeatherModule({ config, style, hourly, forecast, minutely, alerts, units = 'imperial', timezone, locationMissing, locationName, latitude, longitude }: WeatherModuleProps) {
  const view = config.view ?? 'hourly';
  const scaleFactor = SCALE_FACTORS[view] ?? 0.09;
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, scaleFactor);
  // Second measurement on the view box (outer height minus the label). Not
  // circular: the label sizes off the OUTER box, so the inner height it drives
  // never feeds back into it. With no label the two boxes are the same height
  // and this returns exactly `scaledFontSize`, leaving existing layouts untouched.
  const { containerRef: viewRef, scaledFontSize: viewFontSize } = useScaledFontSize(style.fontSize, scaleFactor);
  const t = useTranslate('modules');

  if (locationMissing) {
    return (
      <ModuleWrapper style={style}>
        <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center gap-1">
          <p style={{ fontSize: `${scaledFontSize}px`, opacity: TEXT_OPACITY.secondary }}>{t('weather.locationNotSet')}</p>
          <p style={{ fontSize: `${scaledFontSize * 0.7}px`, opacity: TEXT_OPACITY.tertiary }}>{t('weather.setLocationInSettings')}</p>
        </div>
      </ModuleWrapper>
    );
  }

  // Hide the entire module when alerts view has no active alerts
  // Only hide when alerts is defined (data loaded from a supported provider)
  if (view === 'alerts' && config.hideWhenNoAlerts && alerts !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    const activeAlerts = alerts.filter((a) => a.expires > now);
    if (activeAlerts.length === 0) return null;
  }

  const ViewComponent = VIEW_COMPONENTS[view] ?? WeatherHourlyView;

  // The view re-scales by exactly the height the label takes. Letting the label
  // simply eat height instead was tried first and doesn't hold up: `current`
  // fills its default 600x300 box to the pixel, so the header landed on top of
  // the hero temperature.
  const label = resolveWeatherLocationLabel(
    config,
    locationName,
    latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null,
  );

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="w-full h-full flex flex-col">
        {label && (
          <p
            className={`flex-none truncate ${LABEL_ALIGN[view] ?? 'text-left'}`}
            style={{ fontSize: `${scaledFontSize * 0.7}px`, opacity: TEXT_OPACITY.dim }}
          >
            {label}
          </p>
        )}
        {/* Clipped so a view whose content exceeds its box (the `current` view
            does, at its own default size) can never paint over the header. Same
            boundary ModuleWrapper already clips at when no label is shown. */}
        <div ref={viewRef} className="flex-1 min-h-0 overflow-hidden">
          <ViewComponent
            config={config}
            hourly={hourly ?? []}
            forecast={forecast ?? []}
            minutely={minutely}
            alerts={alerts}
            units={units}
            timezone={timezone}
            scaledFontSize={viewFontSize}
          />
        </div>
      </div>
    </ModuleWrapper>
  );
}
