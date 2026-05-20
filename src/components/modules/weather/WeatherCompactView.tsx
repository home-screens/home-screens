'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { CurrentWeatherStats } from './CurrentWeatherStats';
import { WeatherEmptyState } from './WeatherEmptyState';
import { getLocalizedConditionLabel } from './condition-label';
import type { WeatherViewProps } from './types';

export default function WeatherCompactView({ config, hourly, forecast, units, scaledFontSize, containerRef }: WeatherViewProps) {
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
    <div ref={containerRef} className="w-full h-full flex flex-col justify-center gap-1" style={{ fontSize: `${scaledFontSize}px` }}>
      <div className="flex items-center gap-3">
        <Icon size="1.8em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(current.icon, tWeather)} role="img" />
        <span className="font-light" style={{ fontSize: '2em' }}>{Math.round(current.temp)}&deg;</span>
        {today && config.showHighLow !== false && (
          <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>
            {t('weather.highLow', { high: `${Math.round(today.high)}°`, low: `${Math.round(today.low)}°` })}
          </span>
        )}
        <span className="capitalize truncate" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>{current.description}</span>
      </div>
      <div className="flex items-center gap-3">
        {config.showFeelsLike !== false && current.feelsLike != null && (
          <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>
            {t('weather.feelsShort', { temp: `${Math.round(current.feelsLike)}°` })}
          </span>
        )}
        <CurrentWeatherStats config={config} current={current} units={units} fontSize="0.7em" />
      </div>
    </div>
  );
}
