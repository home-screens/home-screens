'use client';

import { Droplets, Wind } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { useElementBox } from '@/hooks/useElementBox';
import { WeatherStat } from '../WeatherStat';
import { WeatherEmptyState } from './WeatherEmptyState';
import { CurrentConditionsHeader } from './CurrentConditionsHeader';
import { HourColumn } from './HourColumn';
import type { WeatherViewProps } from './types';

/**
 * The narrowest an hour column is drawn, in em of the view's size: its widest
 * line is the time ("12 AM") or the rain chance with its icon ("35%").
 */
const HOUR_COLUMN_EM = 2.5;
/** The gap between hour columns, in em. */
const HOUR_GAP_EM = 0.35;

/** How many hour columns a row this wide holds whole. */
export function hoursThatFit(rowWidthPx: number, fontSizePx: number): number {
  if (!(rowWidthPx > 0) || !(fontSizePx > 0)) return Infinity;
  const column = HOUR_COLUMN_EM * fontSizePx;
  const gap = HOUR_GAP_EM * fontSizePx;
  return Math.max(1, Math.floor((rowWidthPx + gap) / (column + gap)));
}

export default function WeatherHourlyView({ config, hourly, forecast, timezone, timeFormat, scaledFontSize }: WeatherViewProps) {
  const hours = hourly.slice(0, config.hoursToShow);
  // Only the hours that fit whole are drawn: the row used to be sliced by the
  // card's edge, with half an hour showing and the rest hidden. The row is
  // measured, and the count follows it as the card is resized.
  const [rowRef, rowBox] = useElementBox<HTMLDivElement>();
  const upcoming = hours.slice(1, 1 + hoursThatFit(rowBox.width, scaledFontSize));
  const t = useTranslate('modules');

  return (
    <div className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      {config.showTitle !== false && (
        <h2 className="font-semibold mb-3 shrink-0" style={{ fontSize: '1.125em', opacity: TEXT_OPACITY.heading }}>{t('weather.hourlyForecast')}</h2>
      )}
      {hours.length === 0 ? (
        <WeatherEmptyState />
      ) : (
        <div className="flex items-center gap-5 flex-1 min-h-0">
          {/* Current weather - large. Only humidity and wind here: the rain
              chance has a chip in every column already. */}
          <CurrentConditionsHeader config={config} current={hours[0]} today={forecast[0]} layout="stacked">
            <WeatherStat icon={Droplets} value={hours[0].humidity} unit="%" visible={config.showHumidity} fontSize="0.85em" />
            <WeatherStat icon={Wind} value={hours[0].windSpeed} visible={config.showWind} fontSize="0.85em" />
          </CurrentConditionsHeader>

          {/* Divider */}
          <div className="self-stretch w-px opacity-30 bg-current shrink-0" />

          {/* Upcoming hours, as many as fit whole. */}
          <div ref={rowRef} className="flex flex-1 min-w-0 min-h-0 items-stretch justify-around gap-x-[0.35em] overflow-hidden" data-testid="weather-hours">
            {upcoming.map((hour, i) => (
              <HourColumn key={i} config={config} hour={hour} timezone={timezone} timeFormat={timeFormat} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
