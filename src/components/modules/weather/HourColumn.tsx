'use client';

import { CloudRain, Droplets, Wind } from 'lucide-react';
import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { WeatherStat } from '../WeatherStat';
import { getLocalizedConditionLabel } from './condition-label';
import type { TimeFormat, WeatherConfig } from '@/types/config';
import type { HourlyWeather } from '@/lib/weather';

interface HourColumnProps {
  config: WeatherConfig;
  hour: HourlyWeather;
  timezone?: string;
  timeFormat: TimeFormat;
}

/**
 * One upcoming hour, drawn the same way in the Hourly view and the Combined
 * view's hourly band: the time, the sky, the rain chance, the temperature,
 * and the humidity and wind chips the household switched on. Sizes are in em
 * of the column's font size, so a view that wants it smaller wraps the row
 * in a smaller font rather than drawing its own column.
 */
export function HourColumn({ config, hour, timezone, timeFormat }: HourColumnProps) {
  const locale = useFormattingLocale();
  const tWeather = useTranslate('weather');
  const Icon = getWeatherIcon(hour.icon, config.iconSet);
  return (
    <div className="flex flex-col items-center justify-evenly min-h-0 whitespace-nowrap" data-testid="weather-hour">
      <span style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}>
        {new Date(hour.time).toLocaleTimeString(locale, {
          hour: 'numeric',
          hour12: timeFormat !== '24h',
          ...(timezone ? { timeZone: timezone } : {}),
        })}
      </span>
      <Icon size="1.8em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(hour.icon, tWeather)} role="img" />
      <WeatherStat icon={CloudRain} value={hour.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
      <span className="font-medium" style={{ fontSize: '0.875em' }}>{Math.round(hour.temp)}&deg;</span>
      <WeatherStat icon={Droplets} value={hour.humidity} unit="%" visible={config.showHumidity} />
      <WeatherStat icon={Wind} value={hour.windSpeed} visible={config.showWind} />
    </div>
  );
}
