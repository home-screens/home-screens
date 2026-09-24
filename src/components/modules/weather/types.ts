import type { TimeFormat, WeatherConfig } from '@/types/config';
import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';

export interface WeatherViewProps {
  config: WeatherConfig;
  hourly: HourlyWeather[];
  forecast: ForecastDay[];
  minutely?: MinutelyPrecip[];
  alerts?: WeatherAlert[];
  units: 'metric' | 'imperial';
  timezone?: string;
  /** Household 12/24-hour clock, resolved by WeatherModule. Hour labels and
   *  alert expiry follow it, same as the clock. */
  timeFormat: TimeFormat;
  scaledFontSize: number;
}
