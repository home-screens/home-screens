'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { CurrentWeatherStats } from './CurrentWeatherStats';
import { WeatherEmptyState } from './WeatherEmptyState';
import { getLocalizedConditionLabel } from './condition-label';
import type { WeatherViewProps } from './types';

export default function WeatherCurrentView({ config, forecast, hourly, units, scaledFontSize, containerRef }: WeatherViewProps) {
  const t = useTranslate('modules');
  const tWeather = useTranslate('weather');
  const current = hourly[0];
  const today = forecast[0];

  if (!current) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <WeatherEmptyState />
      </div>
    );
  }

  const Icon = getWeatherIcon(current.icon, config.iconSet);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ fontSize: `${scaledFontSize}px` }}>
      <div className="flex items-center gap-3">
        <Icon size="3em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(current.icon, tWeather)} role="img" />
        <span className="font-light" style={{ fontSize: '4em' }}>{Math.round(current.temp)}&deg;</span>
      </div>
      <p className="capitalize" style={{ fontSize: '1em', opacity: TEXT_OPACITY.secondary }}>{current.description}</p>
      {today && (
        <span style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.dim }}>
          {t('weather.highLow', { high: `${Math.round(today.high)}°`, low: `${Math.round(today.low)}°` })}
        </span>
      )}
      {config.showFeelsLike !== false && current.feelsLike != null && (
        <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>
          {t('weather.feelsLike', { temp: `${Math.round(current.feelsLike)}°` })}
        </span>
      )}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <CurrentWeatherStats config={config} current={current} units={units} fontSize="0.85em" />
      </div>
    </div>
  );
}
