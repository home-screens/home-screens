import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';

// ── WeatherAPI response types ────────────────────────────────────────

interface WACondition {
  text: string;
  code: number;
}

interface WAHour {
  time: string;
  time_epoch: number;
  temp_c: number;
  temp_f: number;
  feelslike_c: number;
  feelslike_f: number;
  humidity: number;
  wind_kph: number;
  wind_mph: number;
  condition: WACondition;
  chance_of_rain: number;
}

interface WADay {
  maxtemp_c: number;
  maxtemp_f: number;
  mintemp_c: number;
  mintemp_f: number;
  avghumidity: number;
  maxwind_kph: number;
  maxwind_mph: number;
  totalprecip_mm: number;
  totalprecip_in: number;
  daily_chance_of_rain: number;
  condition: WACondition;
}

interface WAForecastDay {
  date: string;
  day: WADay;
  hour: WAHour[];
}

interface WAForecastResponse {
  current: { is_day: number };
  forecast: { forecastday: WAForecastDay[] };
}

// ── WeatherAPI provider ──────────────────────────────────────────────

/** @internal */
export class WeatherAPIProvider implements WeatherProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) throw new Error('WeatherAPI key is not configured. Add it in Settings → Weather.');
    this.apiKey = apiKey;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.apiKey}&q=${lat},${lon}&days=2&aqi=no`;
    const data = await fetchWeatherJSON<WAForecastResponse>(url, 'WeatherAPI');
    const isCelsius = units === 'metric';
    const isDay = data.current?.is_day === 1;

    const allHours = data.forecast.forecastday.flatMap((d) => d.hour);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const hours = allHours.filter((h) => h.time_epoch >= nowEpoch);
    return hours.map((h) => ({
      time: h.time,
      temp: isCelsius ? h.temp_c : h.temp_f,
      feelsLike: isCelsius ? h.feelslike_c : h.feelslike_f,
      humidity: h.humidity,
      icon: this.mapConditionToIcon(h.condition.code, isDay),
      description: h.condition.text ?? '',
      windSpeed: isCelsius ? h.wind_kph : h.wind_mph,
      precipProbability: h.chance_of_rain ?? 0,
    }));
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.apiKey}&q=${lat},${lon}&days=7&aqi=no`;
    const data = await fetchWeatherJSON<WAForecastResponse>(url, 'WeatherAPI');
    const isCelsius = units === 'metric';

    return data.forecast.forecastday.map((d) => ({
      date: d.date,
      high: isCelsius ? d.day.maxtemp_c : d.day.maxtemp_f,
      low: isCelsius ? d.day.mintemp_c : d.day.mintemp_f,
      icon: this.mapConditionToIcon(d.day.condition.code, true),
      description: d.day.condition.text ?? '',
      precipProbability: d.day.daily_chance_of_rain ?? 0,
      precipAmount: isCelsius ? (d.day.totalprecip_mm ?? 0) : (d.day.totalprecip_in ?? 0),
      humidity: d.day.avghumidity,
      windSpeed: isCelsius ? d.day.maxwind_kph : d.day.maxwind_mph,
    }));
  }

  private static readonly CONDITION_ICON: Record<number, string> = {
    // Clear
    1000: 'clear',
    // Partly cloudy
    1003: 'partly-cloudy',
    // Cloudy / Overcast
    1006: 'cloud', 1009: 'cloud',
    // Mist / Fog / Freezing fog
    1030: 'cloud-fog', 1117: 'cloud-fog', 1135: 'cloud-fog', 1147: 'cloud-fog',
    // Drizzle / Light rain
    1063: 'cloud-drizzle', 1150: 'cloud-drizzle', 1153: 'cloud-drizzle',
    1180: 'cloud-drizzle', 1183: 'cloud-drizzle',
    // Rain
    1186: 'cloud-rain', 1189: 'cloud-rain', 1192: 'cloud-rain', 1195: 'cloud-rain',
    1240: 'cloud-rain', 1243: 'cloud-rain', 1246: 'cloud-rain',
    // Snow
    1066: 'snowflake', 1114: 'snowflake', 1210: 'snowflake', 1213: 'snowflake',
    1216: 'snowflake', 1219: 'snowflake', 1222: 'snowflake', 1225: 'snowflake',
    1255: 'snowflake', 1258: 'snowflake',
    // Sleet / Hail / Freezing rain
    1069: 'cloud-hail', 1072: 'cloud-hail', 1168: 'cloud-hail', 1171: 'cloud-hail',
    1198: 'cloud-hail', 1201: 'cloud-hail', 1204: 'cloud-hail', 1207: 'cloud-hail',
    1237: 'cloud-hail', 1249: 'cloud-hail', 1252: 'cloud-hail',
    // Thunder
    1087: 'cloud-lightning', 1273: 'cloud-lightning', 1276: 'cloud-lightning',
    1279: 'cloud-lightning', 1282: 'cloud-lightning',
  };

  private mapConditionToIcon(code: number, isDay: boolean): string {
    const icon = WeatherAPIProvider.CONDITION_ICON[code];
    if (!icon) return 'thermometer';
    if (icon === 'clear') return isDay ? 'sun' : 'moon';
    if (icon === 'partly-cloudy') return isDay ? 'cloud-sun' : 'cloud-moon';
    return icon;
  }
}
