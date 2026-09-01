/** Human-readable names for the weather provider ids, for setup messages. */
export const WEATHER_PROVIDER_NAMES: Record<string, string> = {
  openweathermap: 'OpenWeatherMap',
  weatherapi: 'WeatherAPI',
  pirateweather: 'Pirate Weather',
  noaa: 'NOAA',
  'open-meteo': 'Open-Meteo',
  yr: 'Yr.no',
  smhi: 'SMHI',
  metoffice: 'Met Office',
  envcanada: 'Environment Canada',
};

export function weatherProviderName(id: string): string {
  return WEATHER_PROVIDER_NAMES[id] ?? id;
}
