'use client';

import { CloudRain, Droplets, Wind, Gauge, Eye, Thermometer, Sun, Sunrise, Sunset } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { WeatherStat } from '../WeatherStat';
import type { TimeFormat, WeatherConfig } from '@/types/config';
import type { HourlyWeather } from '@/lib/weather';
import { localizedCompassLabel, pressureForUnits, windUnitLabel } from '@/lib/weather/units';
import { formatTimeOfDay } from '@/lib/timezone';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useSunTimes } from './chart-parts';

interface CurrentWeatherStatsProps {
  config: WeatherConfig;
  current: HourlyWeather;
  units: 'metric' | 'imperial';
  fontSize: string;
  /** For the sunrise and sunset chips; without coordinates they stay hidden. */
  latitude?: number;
  longitude?: number;
  timezone?: string;
  timeFormat: TimeFormat;
}

/**
 * What follows the number on a wind chip: the unit, and the compass point
 * the wind is from when the source sends one ("12 mph NW"). A bare number
 * left a metric reader guessing between km/h and m/s.
 */
export function windChipUnit(hour: Pick<HourlyWeather, 'windDirection'>, units: 'metric' | 'imperial', t: (key: string) => string): string {
  const unit = ` ${windUnitLabel(units)}`;
  return hour.windDirection != null ? `${unit} ${localizedCompassLabel(hour.windDirection, t)}` : unit;
}

export function CurrentWeatherStats({ config, current, units, fontSize, latitude, longitude, timezone, timeFormat }: CurrentWeatherStatsProps) {
  const locale = useFormattingLocale();
  const pressure = current.pressure != null ? pressureForUnits(current.pressure, units, locale) : null;
  const t = useTranslate('modules');
  const sun = useSunTimes(config.showSunTimes ? latitude : undefined, config.showSunTimes ? longitude : undefined, timezone);
  const clock = { timezone, locale, timeFormat };
  return (
    <>
      <WeatherStat icon={CloudRain} value={current.precipProbability} unit="%" visible={config.showPrecipitation !== false} fontSize={fontSize} />
      <WeatherStat icon={Droplets} value={current.humidity} unit="%" visible={config.showHumidity} fontSize={fontSize} />
      <WeatherStat icon={Wind} value={current.windSpeed} unit={windChipUnit(current, units, t)} visible={config.showWind} fontSize={fontSize} testId="weather-stat-wind" />
      <WeatherStat icon={Gauge} value={pressure?.value} unit={pressure ? ` ${pressure.unit}` : undefined} visible={config.showPressure} fontSize={fontSize} />
      <WeatherStat icon={Eye} value={current.visibility} unit={units === 'metric' ? ' km' : ' mi'} visible={config.showVisibility} fontSize={fontSize} />
      <WeatherStat icon={Thermometer} value={current.dewPoint} unit="°" visible={config.showDewPoint} fontSize={fontSize} />
      <WeatherStat icon={Sun} value={current.uvIndex != null ? `UV ${Math.round(current.uvIndex)}` : null} visible={config.showUV} fontSize={fontSize} testId="weather-stat-uv" />
      {/* One chip, not two: a row that wraps keeps sunrise and sunset
          together instead of leaving the sunset alone on the next line. */}
      {config.showSunTimes && sun.sunrise && sun.sunset && (
        <span className="flex items-center gap-0.5 whitespace-nowrap" style={{ fontSize, opacity: TEXT_OPACITY.dim }} data-testid="weather-stat-sun-times">
          <Sunrise size="1em" aria-hidden="true" /><span data-testid="weather-stat-sunrise">{formatTimeOfDay(sun.sunrise, clock)}</span>
          <span aria-hidden="true" className="mx-0.5">–</span>
          <Sunset size="1em" aria-hidden="true" /><span data-testid="weather-stat-sunset">{formatTimeOfDay(sun.sunset, clock)}</span>
        </span>
      )}
    </>
  );
}
