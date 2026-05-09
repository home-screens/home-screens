'use client';

import type { WeatherConfig, WeatherView, ModuleStyle } from '@/types/config';
import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';
import { TEXT_OPACITY } from '@/lib/constants';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { useTranslate } from '@/i18n';
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
}

const SCALE_FACTORS: Record<WeatherView, number> = {
  current: 0.12,
  hourly: 0.09,
  daily: 0.12,
  combined: 0.06,
  compact: 0.25,
  table: 0.08,
  precipitation: 0.09,
  alerts: 0.08,
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

export default function WeatherModule({ config, style, hourly, forecast, minutely, alerts, units = 'imperial', timezone, locationMissing }: WeatherModuleProps) {
  const view = config.view ?? 'hourly';
  const scaleFactor = SCALE_FACTORS[view] ?? 0.09;
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, scaleFactor);
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

  return (
    <ModuleWrapper style={style}>
      <ViewComponent
        config={config}
        hourly={hourly ?? []}
        forecast={forecast ?? []}
        minutely={minutely}
        alerts={alerts}
        units={units}
        timezone={timezone}
        scaledFontSize={scaledFontSize}
        containerRef={containerRef}
      />
    </ModuleWrapper>
  );
}
