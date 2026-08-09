'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { useTranslate } from '@/i18n';
import { CurrentWeatherStats } from './CurrentWeatherStats';
import { WeatherEmptyState } from './WeatherEmptyState';
import { getLocalizedConditionLabel } from './condition-label';
import type { WeatherViewProps } from './types';

export default function WeatherCurrentView({ config, forecast, hourly, units, scaledFontSize }: WeatherViewProps) {
  const t = useTranslate('modules');
  const tWeather = useTranslate('weather');
  const current = hourly[0];
  const today = forecast[0];
  const showFeelsLike = config.showFeelsLike !== false && current?.feelsLike != null;

  // Which rows render, and how many lines the stats row wraps into, decide this
  // view's height — so it is measured rather than assumed. The key lists every
  // input that changes the content, so turning a stat back off restores the size.
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [
      today != null, showFeelsLike, config.showPrecipitation !== false, config.showHumidity,
      config.showWind, config.showPressure, config.showVisibility, config.showDewPoint,
      current?.description,
    ].join('|'),
  );

  if (!current) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <WeatherEmptyState />
      </div>
    );
  }

  const Icon = getWeatherIcon(current.icon, config.iconSet);

  return (
    <div
      ref={boxRef}
      className="w-full h-full flex flex-col items-center justify-center overflow-hidden"
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* Natural-height stack: this is what gets measured against the box above.
          Gaps are em-based so the fit doesn't drift with the module's size. */}
      <div ref={contentRef} className="flex flex-col items-center gap-[0.2em]">
        <div className="flex items-center gap-3">
          <Icon size="3em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(current.icon, tWeather)} role="img" />
          {/* leading-none: at 4em the inherited 1.5 line-height reserved 6em for a
              numeral that only ever inks 4em, half the view's height budget. */}
          <span className="font-light leading-none" style={{ fontSize: '4em' }}>{Math.round(current.temp)}&deg;</span>
        </div>
        <p className="capitalize" style={{ fontSize: '1em', opacity: TEXT_OPACITY.secondary }}>{current.description}</p>
        {today && (
          <span style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.dim }}>
            {t('weather.highLow', { high: `${Math.round(today.high)}°`, low: `${Math.round(today.low)}°` })}
          </span>
        )}
        {showFeelsLike && (
          <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>
            {t('weather.feelsLike', { temp: `${Math.round(current.feelsLike as number)}°` })}
          </span>
        )}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <CurrentWeatherStats config={config} current={current} units={units} fontSize="0.85em" />
        </div>
      </div>
    </div>
  );
}
