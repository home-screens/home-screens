'use client';

import type { ReactNode } from 'react';
import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { getLocalizedConditionLabel } from './condition-label';
import type { WeatherConfig } from '@/types/config';
import type { ForecastDay, HourlyWeather } from '@/lib/weather';

interface CurrentConditionsHeaderProps {
  config: WeatherConfig;
  current: HourlyWeather;
  /** Today's forecast, for the high and low line; none hides the line. */
  today?: ForecastDay;
  /**
   * `stacked` puts the sky beside the temperature and everything else under
   * them, centred (the Hourly view's left block); `inline` runs the sky, the
   * temperature and the details across one row (the Combined view's top band).
   */
  layout: 'stacked' | 'inline';
  /** The stat chips under the high/low and feels-like lines. */
  children?: ReactNode;
}

/**
 * The big "right now" cluster the Hourly and Combined views open with: the
 * sky and the temperature, then today's high and low, how it feels, and the
 * chips the caller passes. Drawn once so the two views cannot drift apart.
 */
export function CurrentConditionsHeader({ config, current, today, layout, children }: CurrentConditionsHeaderProps) {
  const t = useTranslate('modules');
  const tWeather = useTranslate('weather');
  const Icon = getWeatherIcon(current.icon, config.iconSet);
  const stacked = layout === 'stacked';
  const details = (
    <div className={stacked ? 'flex flex-col items-center gap-0.5' : 'flex flex-col gap-0.5'}>
      {today && (
        <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>
          {t('weather.highLow', { high: `${Math.round(today.high)}°`, low: `${Math.round(today.low)}°` })}
        </span>
      )}
      {config.showFeelsLike !== false && current.feelsLike != null && (
        <span style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>
          {t('weather.feelsLike', { temp: `${Math.round(current.feelsLike)}°` })}
        </span>
      )}
      {children}
    </div>
  );
  const sky = <Icon size="2.5em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(current.icon, tWeather)} role="img" />;
  const temp = <span className="font-light" style={{ fontSize: '3em' }}>{Math.round(current.temp)}&deg;</span>;
  if (stacked) {
    return (
      <div className="flex flex-col items-center justify-center shrink-0" data-testid="weather-current-header">
        <div className="flex items-center gap-2">{temp}{sky}</div>
        {details}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4" data-testid="weather-current-header">
      {sky}
      {temp}
      {details}
    </div>
  );
}
