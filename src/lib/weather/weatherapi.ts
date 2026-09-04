import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchKeyedWeatherJSON } from './fetch';
import { SetupError } from '@/lib/api-utils';
import { weatherApiCodeToIcon } from './icons';

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
  uv?: number;
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
    if (!apiKey) throw new SetupError('WeatherAPI.com key is not configured. Add it in Settings > Weather.', 'key', 'WeatherAPI.com', 'weather');
    this.apiKey = apiKey;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.apiKey}&q=${lat},${lon}&days=2&aqi=no`;
    const data = await fetchKeyedWeatherJSON<WAForecastResponse>(url, 'WeatherAPI.com');
    const isCelsius = units === 'metric';
    const isDay = data.current?.is_day === 1;

    const allHours = data.forecast.forecastday.flatMap((d) => d.hour);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const hours = allHours.filter((h) => h.time_epoch >= nowEpoch);
    return hours.map((h) => ({
      time: h.time,
      // `time` is location-local with no zone designator — safe to format,
      // unsafe to parse for arithmetic. Consumers doing time math (calendar
      // per-event weather) key off this instant instead.
      timeEpoch: h.time_epoch,
      temp: isCelsius ? h.temp_c : h.temp_f,
      feelsLike: isCelsius ? h.feelslike_c : h.feelslike_f,
      humidity: h.humidity,
      icon: this.mapConditionToIcon(h.condition.code, isDay),
      description: h.condition.text ?? '',
      windSpeed: isCelsius ? h.wind_kph : h.wind_mph,
      precipProbability: h.chance_of_rain ?? 0,
      uvIndex: h.uv != null ? Math.round(h.uv) : undefined,
    }));
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.apiKey}&q=${lat},${lon}&days=7&aqi=no`;
    const data = await fetchKeyedWeatherJSON<WAForecastResponse>(url, 'WeatherAPI.com');
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

  private mapConditionToIcon(code: number, isDay: boolean): string {
    return weatherApiCodeToIcon(code, isDay);
  }
}
