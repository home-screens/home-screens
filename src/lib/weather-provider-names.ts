import { isWeatherProviderId, type WeatherProviderId } from './weather-providers';

/**
 * The one name each weather provider goes by, everywhere it is named: the
 * provider cards on the Weather page, the weather row on the API keys page,
 * the setup card on the wall and the editor's preview errors.
 *
 * A household troubleshooting a key should read the same name on all of them,
 * so nothing else keeps its own table. Deliberately untranslated: these are
 * brand names. Import-safe from server routes and client components alike.
 */
export const WEATHER_PROVIDER_NAMES: Record<WeatherProviderId, string> = {
  openweathermap: 'OpenWeatherMap',
  weatherapi: 'WeatherAPI.com',
  pirateweather: 'Pirate Weather',
  noaa: 'NOAA / NWS',
  'open-meteo': 'Open-Meteo',
  yr: 'Yr.no / MET Norway',
  smhi: 'SMHI',
  metoffice: 'UK Met Office',
  envcanada: 'Environment Canada',
};

export function weatherProviderName(id: string): string {
  return isWeatherProviderId(id) ? WEATHER_PROVIDER_NAMES[id] : id;
}
