export type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert, WeatherProvider } from './types';
export { OpenWeatherMapProvider } from './openweathermap';
export { WeatherAPIProvider } from './weatherapi';
export { PirateWeatherProvider } from './pirateweather';
export { NOAAProvider } from './noaa';
export { OpenMeteoProvider } from './open-meteo';

import type { WeatherProvider } from './types';
import { OpenWeatherMapProvider } from './openweathermap';
import { WeatherAPIProvider } from './weatherapi';
import { PirateWeatherProvider } from './pirateweather';
import { NOAAProvider } from './noaa';
import { OpenMeteoProvider } from './open-meteo';

export function createWeatherProvider(provider: string, apiKey?: string): WeatherProvider {
  switch (provider) {
    case 'openweathermap':
      return new OpenWeatherMapProvider(apiKey);
    case 'weatherapi':
      return new WeatherAPIProvider(apiKey);
    case 'pirateweather':
      return new PirateWeatherProvider(apiKey);
    case 'noaa':
      return new NOAAProvider();
    case 'open-meteo':
      return new OpenMeteoProvider();
    default:
      throw new Error(`Unknown weather provider: ${provider}`);
  }
}
