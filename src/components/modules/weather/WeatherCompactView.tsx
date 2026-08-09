'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { useTranslate } from '@/i18n';
import { CurrentWeatherStats } from './CurrentWeatherStats';
import { WeatherEmptyState } from './WeatherEmptyState';
import { getLocalizedConditionLabel } from './condition-label';
import type { WeatherViewProps } from './types';

export default function WeatherCompactView({ config, hourly, forecast, units, scaledFontSize }: WeatherViewProps) {
  const t = useTranslate('modules');
  const tWeather = useTranslate('weather');
  const current = hourly[0];
  const today = forecast[0];
  const showFeelsLike = config.showFeelsLike !== false && current?.feelsLike != null;

  // Same reason as the `current` view: the stats row wraps, so this view's
  // height depends on which stats are on, not just on the container.
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [
      today != null && config.showHighLow !== false, showFeelsLike,
      config.showPrecipitation !== false, config.showHumidity, config.showWind,
      config.showPressure, config.showVisibility, config.showDewPoint,
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
      className="w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* Natural-height stack: this is what gets measured against the box above. */}
      <div ref={contentRef} className="flex flex-col gap-[0.1em]">
        {/* shrink-0 + nowrap on everything except the description: these are the
            parts that must not deform. Letting them squash was what made this
            view fail in a tall box — the font grew off the height alone, and the
            row absorbed the excess width silently (icon squashed to a sliver,
            high/low broken onto two lines) instead of overflowing where the fit
            above could see it and scale down. The description stays the one
            flexible element, truncating rather than driving the whole view smaller. */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 flex items-center">
            <Icon size="1.8em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(current.icon, tWeather)} role="img" />
          </span>
          {/* leading-none: at 2em the inherited 1.5 line-height reserved 3em for a
              numeral that only ever inks 2em, which is what pushed this view over. */}
          <span className="font-light leading-none shrink-0 whitespace-nowrap" style={{ fontSize: '2em' }}>{Math.round(current.temp)}&deg;</span>
          {today && config.showHighLow !== false && (
            <span className="shrink-0 whitespace-nowrap" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>
              {t('weather.highLow', { high: `${Math.round(today.high)}°`, low: `${Math.round(today.low)}°` })}
            </span>
          )}
          {/* min-w, not min-w-0: the description is the flexible element, but
              squeezing it to nothing left a bare temperature with no conditions
              at all. A floor of ~8 characters keeps it legible and makes it push
              back on the width, so the fit scales the row down instead of
              silently deleting it. Anything longer still truncates. */}
          <span className="capitalize truncate min-w-[4em]" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>{current.description}</span>
        </div>
        {/* flex-wrap, matching the `current` view: without it six stats squeeze
            into each other and break mid-word. Wrapping makes the row taller,
            which the fit above absorbs by scaling the whole view down. */}
        <div className="flex items-center gap-3 flex-wrap">
          {showFeelsLike && (
            <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>
              {t('weather.feelsShort', { temp: `${Math.round(current.feelsLike as number)}°` })}
            </span>
          )}
          <CurrentWeatherStats config={config} current={current} units={units} fontSize="0.7em" />
        </div>
      </div>
    </div>
  );
}
