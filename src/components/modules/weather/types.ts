import type { WeatherConfig } from '@/types/config';
import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert } from '@/lib/weather';

export interface WeatherViewProps {
  config: WeatherConfig;
  hourly: HourlyWeather[];
  forecast: ForecastDay[];
  minutely?: MinutelyPrecip[];
  alerts?: WeatherAlert[];
  units: 'metric' | 'imperial';
  timezone?: string;
  scaledFontSize: number;
}
