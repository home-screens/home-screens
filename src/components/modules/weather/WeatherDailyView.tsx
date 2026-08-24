'use client';

import { CloudRain, Droplets, Wind } from 'lucide-react';
import { windUnitLabel } from '@/lib/weather/units';
import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { WeatherStat } from '../WeatherStat';
import { dayLabel } from './day-label';
import { WeatherEmptyState } from './WeatherEmptyState';
import { getLocalizedConditionLabel } from './condition-label';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import type { WeatherViewProps } from './types';

export default function WeatherDailyView({ config, forecast, units, scaledFontSize }: WeatherViewProps) {
  const formattingLocale = useFormattingLocale();
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const tWeather = useTranslate('weather');
  const dayLabels = { today: tCore('today'), tomorrowShort: t('weather.tomorrowShort') };
  const days = forecast.slice(0, config.daysToShow);
  const windUnit = windUnitLabel(units);
  const showHighLow = config.showHighLow !== false;

  // Day count drives the width and the enabled stats drive the height, so this
  // view is measured on both axes. Previously it overflowed at every size: the
  // upcoming-days row wrapped, which pushed the last day off the bottom edge and
  // ran the columns back up under the "Forecast" heading.
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [
      days.length, showHighLow, config.showPrecipitation !== false, config.showPrecipAmount,
      config.showHumidity, config.showWind,
    ].join('|'),
  );

  return (
    <div
      ref={boxRef}
      className="w-full h-full flex flex-col justify-center overflow-hidden"
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* Natural-height stack: this is what gets measured against the box above. */}
      <div ref={contentRef} className="flex flex-col">
        <h2 className="font-semibold mb-[0.35em]" style={{ fontSize: '1.125em', opacity: TEXT_OPACITY.heading }}>{t('weather.forecast')}</h2>
        {days.length === 0 ? (
          <WeatherEmptyState message={t('weather.noForecastData')} />
        ) : (
          <div className="flex items-center gap-[0.5em]">
            {/* Today - large */}
            <div className="flex flex-col items-center shrink-0">
              <span className="font-medium" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>{dayLabel(days[0].date, formattingLocale, dayLabels)}</span>
              <div className="flex items-center gap-[0.2em]">
                {(() => { const Icon = getWeatherIcon(days[0].icon, config.iconSet); return <Icon size="2.5em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(days[0].icon, tWeather)} role="img" />; })()}
                {showHighLow && (
                  <div className="flex flex-col">
                    {/* leading-tight: the 2em high and 1.2em low reserved 1.5x line
                        boxes, which is most of this column's wasted height. */}
                    <span className="font-light leading-tight" style={{ fontSize: '2em' }}>{Math.round(days[0].high)}&deg;</span>
                    <span className="leading-tight" style={{ fontSize: '1.2em', opacity: TEXT_OPACITY.dim }}>{Math.round(days[0].low)}&deg;</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-[0.05em]">
                <WeatherStat icon={CloudRain} value={days[0].precipProbability} unit="%" visible={config.showPrecipitation !== false} fontSize="0.85em" />
                <WeatherStat icon={Droplets} value={days[0].humidity} unit="%" visible={config.showHumidity} fontSize="0.85em" />
                <WeatherStat icon={Wind} value={days[0].windSpeed} unit={` ${windUnit}`} visible={config.showWind} fontSize="0.85em" />
              </div>
            </div>

            {/* Divider */}
            <div className="self-stretch w-px opacity-30 bg-current shrink-0" />

            {/* Upcoming days. No flex-wrap: a wrapped day used to land outside the
                box entirely. Overflow is handled by scaling the view down instead,
                and justify-between keeps that overflow on the end edge where the
                fit measurement can see it. */}
            <div className="flex flex-1 min-w-0 items-center justify-between gap-[0.4em]">
              {days.slice(1).map((day, i) => {
                const Icon = getWeatherIcon(day.icon, config.iconSet);
                return (
                  <div key={i} className="flex flex-col items-center gap-[0.1em] shrink-0">
                    <span style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}>
                      {dayLabel(day.date, formattingLocale, dayLabels)}
                    </span>
                    <Icon size="1.8em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
                    <WeatherStat icon={CloudRain} value={day.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                    {config.showPrecipAmount && day.precipAmount != null && day.precipAmount > 0 && (
                      <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.dim }}>{day.precipAmount.toFixed(1)}&quot;</span>
                    )}
                    {showHighLow && (
                      <div className="flex gap-1" style={{ fontSize: '0.875em' }}>
                        <span className="font-medium">{Math.round(day.high)}&deg;</span>
                        <span style={{ opacity: TEXT_OPACITY.dim }}>{Math.round(day.low)}&deg;</span>
                      </div>
                    )}
                    <WeatherStat icon={Droplets} value={day.humidity} unit="%" visible={config.showHumidity} />
                    <WeatherStat icon={Wind} value={day.windSpeed} unit={` ${windUnit}`} visible={config.showWind} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
