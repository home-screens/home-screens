export type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert, WeatherProvider } from './types';
export { OpenWeatherMapProvider } from './openweathermap';
export { WeatherAPIProvider } from './weatherapi';
export { PirateWeatherProvider } from './pirateweather';
export { NOAAProvider } from './noaa';
export { OpenMeteoProvider } from './open-meteo';
export { YrProvider } from './yr';
export { SMHIProvider } from './smhi';
export { MetOfficeProvider } from './metoffice';

import type { WeatherProvider } from './types';
import { OpenWeatherMapProvider } from './openweathermap';
import { WeatherAPIProvider } from './weatherapi';
import { PirateWeatherProvider } from './pirateweather';
import { NOAAProvider } from './noaa';
import { OpenMeteoProvider } from './open-meteo';
import { YrProvider } from './yr';
import { SMHIProvider } from './smhi';
import { MetOfficeProvider } from './metoffice';

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
    case 'yr':
      return new YrProvider();
    case 'smhi':
      return new SMHIProvider();
    case 'metoffice':
      return new MetOfficeProvider(apiKey);
    default:
      throw new Error(`Unknown weather provider: ${provider}`);
  }
}
