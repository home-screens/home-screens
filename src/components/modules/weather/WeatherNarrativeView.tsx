'use client';

import { CloudRain, Wind } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useTZClock } from '@/hooks/useTZClock';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { localISODate } from '@/lib/timezone';
import { windUnitLabel } from '@/lib/weather/units';
import { getWeatherIcon } from '@/lib/weather-icons';
import { WeatherStat } from '../WeatherStat';
import { dayLabel } from './day-label';
import { getLocalizedConditionLabel } from './condition-label';
import { useViewBox } from './chart-parts';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

/**
 * A box this many times wider than tall lays the days side by side. The
 * stacked list wants about three ems of height a day and a column about
 * nine ems of width, so past this ratio the columns come out with the
 * larger type. A strip across the screen stacked five days into a column
 * of 5 px text in its left quarter and left the rest empty.
 */
export const COLUMNS_RATIO = 2.5;

/**
 * The written forecast: one row per day with its icon, the day's name and
 * high and low, and the sentence or two the provider wrote about it. Only
 * the US National Weather Service writes one (`detailedForecast`); for any
 * other provider the row carries the short condition with the rain chance
 * and wind beside it, so the view never goes blank. In a wide strip the
 * days stand side by side instead, each a column with its icon and name
 * on top and its words below.
 */
export default function WeatherNarrativeView({ config, forecast, units, timezone, scaledFontSize }: WeatherViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const tWeather = useTranslate('weather');
  const locale = useFormattingLocale();
  const todayISO = localISODate(useTZClock(timezone, 60_000));
  const days = forecast.slice(0, Math.max(1, config.daysToShow || 5));
  const labels = { today: tCore('today'), tomorrowShort: t('weather.tomorrowShort') };
  const showHighLow = config.showHighLow !== false;
  const [outerRef, box] = useViewBox();
  const columns = days.length > 1 && box.height > 0 && box.width >= box.height * COLUMNS_RATIO;

  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [columns, days.length, days.map((d) => d.detailedForecast?.length ?? 0).join(','), showHighLow, config.showTitle !== false, config.showRelativeDayLabels !== false].join('|'),
  );

  return (
    <div ref={outerRef} className="w-full h-full">
      <div ref={boxRef} className="w-full h-full overflow-hidden flex flex-col" style={{ fontSize: `${fontSize}px` }} data-weather-narrative-mode={columns ? 'columns' : 'rows'}>
        {/* Title and rows measured together: the rows take their natural
            height and run past the box when they do not fit. Auto margins
            centre a short list and never go negative, so a tall one still
            overflows past the bottom edge where the fit loop sees it. */}
        <div ref={contentRef} className="flex flex-col my-auto">
          {config.showTitle !== false && (
            <h2 className="font-semibold mb-[0.35em] shrink-0" style={{ fontSize: '1.125em', opacity: TEXT_OPACITY.heading }}>{t('weather.forecast')}</h2>
          )}
          {days.length === 0 ? (
            <WeatherEmptyState message={t('weather.noForecastData')} />
          ) : (
            <div
              className={columns ? 'grid gap-x-[1.2em] items-start' : 'flex flex-col gap-[0.6em]'}
              style={columns ? { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` } : undefined}
            >
              {days.map((day) => {
                const Icon = getWeatherIcon(day.icon, config.iconSet);
                const name = (
                  <div className="flex items-baseline gap-[0.6em] font-semibold min-w-0" style={{ fontSize: '0.95em' }}>
                    <span>{dayLabel(day.date, todayISO, locale, labels, config.showRelativeDayLabels !== false)}</span>
                    {showHighLow && (
                      <span className="font-normal tabular-nums" style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.dim }}>
                        {t('weather.highLow', { high: `${Math.round(day.high)}°`, low: `${Math.round(day.low)}°` })}
                      </span>
                    )}
                  </div>
                );
                const words = day.detailedForecast ? (
                  <p data-testid="weather-narrative-text" style={{ fontSize: '0.85em', lineHeight: 1.4, opacity: TEXT_OPACITY.heading }}>{day.detailedForecast}</p>
                ) : (
                  <div className="flex items-center gap-[0.8em] flex-wrap" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.heading }}>
                    <span className="capitalize">{day.description}</span>
                    <WeatherStat icon={CloudRain} value={day.precipProbability} unit="%" visible fontSize="0.85em" />
                    <WeatherStat icon={Wind} value={day.windSpeed} unit={` ${windUnitLabel(units)}`} visible={day.windSpeed != null} fontSize="0.85em" />
                  </div>
                );
                if (columns) {
                  return (
                    <div key={day.date} data-weather-day={day.date} className="flex flex-col gap-[0.25em] min-w-0">
                      <div className="flex items-center gap-[0.5em] min-w-0">
                        <div className="flex items-center shrink-0" style={{ fontSize: '1.6em' }}>
                          <Icon size="1em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
                        </div>
                        {name}
                      </div>
                      {words}
                    </div>
                  );
                }
                return (
                  <div key={day.date} data-weather-day={day.date} className="grid gap-x-[0.8em] gap-y-[0.15em] items-start" style={{ gridTemplateColumns: 'auto 1fr' }}>
                    <div className="row-span-2 flex items-center pt-[0.15em]" style={{ fontSize: '2.1em' }}>
                      <Icon size="1em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
                    </div>
                    {name}
                    {words}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
