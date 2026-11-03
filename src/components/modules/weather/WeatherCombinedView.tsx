'use client';

import { CloudRain, Droplets, Wind } from 'lucide-react';
import { windUnitLabel } from '@/lib/weather/units';
import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { WeatherStat } from '../WeatherStat';
import { dayLabel } from './day-label';
import { useTZClock } from '@/hooks/useTZClock';
import { localISODate } from '@/lib/timezone';
import { WeatherEmptyState } from './WeatherEmptyState';
import { CurrentWeatherStats } from './CurrentWeatherStats';
import { CurrentConditionsHeader } from './CurrentConditionsHeader';
import { HourColumn } from './HourColumn';
import { getLocalizedConditionLabel } from './condition-label';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import type { WeatherViewProps } from './types';

export default function WeatherCombinedView({ config, hourly, forecast, units, timezone, timeFormat, scaledFontSize, latitude, longitude }: WeatherViewProps) {
  const locale = useFormattingLocale();
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const tWeather = useTranslate('weather');
  const dayLabels = { today: tCore('today'), tomorrowShort: t('weather.tomorrowShort') };
  // Ticks so "Today" moves at the household's midnight, not at the next refresh.
  const todayISO = localISODate(useTZClock(timezone, 60_000));
  const hours = hourly.slice(0, config.hoursToShow);
  const days = forecast.slice(0, config.daysToShow);
  const windUnit = windUnitLabel(units);
  const current = hourly[0];

  // Three fixed bands, so this view never reports a natural height — its rows
  // just spill past the bottom of the last band. It overflowed at both ends of
  // the size range: 10px at 600x300 with a location header (the font is pinned
  // at the base-size floor there and can't shrink on its own) and 18px at 600x900.
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [
      hours.length, days.length, config.showHighLow !== false, config.showFeelsLike !== false,
      config.showPrecipitation !== false, config.showHumidity, config.showWind,
      config.showPressure, config.showVisibility, config.showDewPoint,
      config.showUV, config.showSunTimes,
    ].join('|'),
  );

  return (
    <div ref={boxRef} className="w-full h-full overflow-hidden" style={{ fontSize: `${fontSize}px` }}>
    <div ref={contentRef} className="w-full h-full flex flex-col">
      {/* Current conditions, 25%. The same header and stat chips as the
          Hourly, Current and Compact views, so a chip added there lands here. */}
      {current && (
        <div style={{ flex: '0 0 25%' }}>
          <CurrentConditionsHeader config={config} current={current} today={forecast[0]} layout="inline">
            <div className="flex items-center gap-2 flex-wrap">
              <CurrentWeatherStats config={config} current={current} units={units} fontSize="0.75em" latitude={latitude} longitude={longitude} timezone={timezone} timeFormat={timeFormat} />
            </div>
          </CurrentConditionsHeader>
        </div>
      )}

      {/* Hourly strip, 25%, the Hourly view's columns at a smaller size. */}
      {hours.length > 1 && (
        <div className="flex flex-col" style={{ flex: '0 0 25%' }}>
          <div className="w-full h-px opacity-20 bg-current" />
          <div className="flex items-center justify-around flex-1" style={{ fontSize: '0.85em' }} data-testid="weather-hours">
            {hours.slice(1).map((hour, i) => (
              <HourColumn key={i} config={config} hour={hour} timezone={timezone} timeFormat={timeFormat} />
            ))}
          </div>
        </div>
      )}

      {/* Daily forecast — remaining 50% */}
      {days.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="w-full h-px opacity-20 bg-current shrink-0" />
          <div className="flex flex-col flex-1 min-h-0 justify-evenly py-1">
            {days.map((day, i) => {
              const Icon = getWeatherIcon(day.icon, config.iconSet);
              return (
                <div key={i} className="flex items-center gap-3" style={{ fontSize: '0.85em' }}>
                  <span className="w-[3.5em] text-right" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>{dayLabel(day.date, todayISO, locale, dayLabels)}</span>
                  <Icon size="1.4em" strokeWidth={1.5} className="shrink-0" aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
                  <WeatherStat icon={CloudRain} value={day.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                  {config.showHighLow !== false && (
                    <div className="flex gap-1 ml-auto">
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

      {!current && days.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <WeatherEmptyState />
        </div>
      )}
    </div>
    </div>
  );
}
