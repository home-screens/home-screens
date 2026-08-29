'use client';

import { CloudRain, Droplets, Wind } from 'lucide-react';
import { windUnitLabel } from '@/lib/weather/units';
import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY, DIVIDER } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { WeatherStat } from '../WeatherStat';
import { dayLabel } from './day-label';
import { WeatherEmptyState } from './WeatherEmptyState';
import { getLocalizedConditionLabel } from './condition-label';
import type { WeatherViewProps } from './types';

export default function WeatherTableView({ config, forecast, units, scaledFontSize }: WeatherViewProps) {
  const formattingLocale = useFormattingLocale();
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const tWeather = useTranslate('weather');
  const dayLabels = { today: tCore('today'), tomorrowShort: t('weather.tomorrowShort') };
  const days = forecast.slice(0, config.daysToShow);
  const windUnit = windUnitLabel(units);
  const showHighLow = config.showHighLow !== false;

  return (
    <div className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      {config.showTitle !== false && (
        <h2 className="font-semibold mb-3 shrink-0" style={{ fontSize: '1.125em', opacity: TEXT_OPACITY.heading }}>{t('weather.forecast')}</h2>
      )}
      {days.length === 0 ? (
        <WeatherEmptyState message={t('weather.noForecastData')} />
      ) : (
        <div className="flex flex-col flex-1 min-h-0 justify-around">
          {/* Header row */}
          <div className="flex items-center gap-3 pb-1" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary, borderBottom: `1px solid ${DIVIDER.visible}` }}>
            <span className="w-[4em]">{t('weather.tableHeaders.day')}</span>
            <span className="w-[2em]" />
            {showHighLow && <span className="w-[5em] text-center">{t('weather.tableHeaders.temp')}</span>}
            {config.showPrecipitation !== false && <span className="w-[3em] text-center">{t('weather.tableHeaders.rain')}</span>}
            {config.showHumidity && <span className="w-[3em] text-center">{t('weather.tableHeaders.humidity')}</span>}
            {config.showWind && <span className="w-[4em] text-center">{t('weather.tableHeaders.wind')}</span>}
          </div>

          {/* Data rows */}
          {days.map((day, i) => {
            const Icon = getWeatherIcon(day.icon, config.iconSet);
            return (
              <div key={i} className="flex items-center gap-3" style={{ fontSize: '0.85em' }}>
                <span className="w-[3.5em]" style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.secondary }}>{dayLabel(day.date, formattingLocale, dayLabels)}</span>
                <Icon size="1.4em" strokeWidth={1.5} className="shrink-0" aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
                {showHighLow && (
                  <div className="flex gap-1 w-[5em] justify-center">
                    <span className="font-medium">{Math.round(day.high)}&deg;</span>
                    <span style={{ opacity: TEXT_OPACITY.dim }}>{Math.round(day.low)}&deg;</span>
                  </div>
                )}
                <WeatherStat icon={CloudRain} value={day.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                {config.showPrecipAmount && day.precipAmount != null && day.precipAmount > 0 && (
                  <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{day.precipAmount.toFixed(1)}&quot;</span>
                )}
                <WeatherStat icon={Droplets} value={day.humidity} unit="%" visible={config.showHumidity} />
                <WeatherStat icon={Wind} value={day.windSpeed} unit={` ${windUnit}`} visible={config.showWind} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
