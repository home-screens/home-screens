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
  /** Degrees the wind blows from. */
  wind_degree?: number;
  gust_kph?: number;
  gust_mph?: number;
  condition: WACondition;
  chance_of_rain: number;
  chance_of_snow?: number;
  uv?: number;
  /** 1 between sunrise and sunset at that hour, 0 otherwise. */
  is_day: number;
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
  daily_chance_of_snow?: number;
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

/**
 * WeatherAPI gives rain and snow their own chance. Reading only the rain one
 * put 0% on a day of nothing but snow, so the wall shows the larger of the two.
 */
function precipChance(rain: number | undefined, snow: number | undefined): number {
  return Math.max(rain ?? 0, snow ?? 0);
}

// ── WeatherAPI provider ──────────────────────────────────────────────

/** @internal */
export class WeatherAPIProvider implements WeatherProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) throw new SetupError('WeatherAPI.com key is not configured. Add it in Settings > Weather.', 'key', 'WeatherAPI.com', 'weather');
    this.apiKey = apiKey;
  }

  // One refresh asks for hours and days together. The week's answer holds
  // every hour the two-day one did, so both read one request: half the calls
  // against a key with a monthly allowance. Kept per instance, and the route
  // makes a new instance per refresh.
  private fetches = new Map<string, Promise<WAForecastResponse>>();

  private fetchData(lat: number, lon: number): Promise<WAForecastResponse> {
    const key = `${lat},${lon}`;
    let pending = this.fetches.get(key);
    if (!pending) {
      const url = `https://api.weatherapi.com/v1/forecast.json?key=${this.apiKey}&q=${lat},${lon}&days=7&aqi=no`;
      pending = fetchKeyedWeatherJSON<WAForecastResponse>(url, 'WeatherAPI.com');
      this.fetches.set(key, pending);
    }
    return pending;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const data = await this.fetchData(lat, lon);
    const isCelsius = units === 'metric';

    // Today's and tomorrow's hours, as the two-day request used to send.
    const allHours = data.forecast.forecastday.slice(0, 2).flatMap((d) => d.hour);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const hours = allHours.filter((h) => h.time_epoch >= nowEpoch - 3600);
    return hours.map((h) => ({
      // WeatherAPI's own `time` is the location's wall clock with no zone
      // ("2026-09-23 14:00"). A browser parses that in its own zone, so a Pi
      // on UTC labelled a Chicago 2 PM "9 AM". Send the real instant instead.
      time: new Date(h.time_epoch * 1000).toISOString(),
      temp: isCelsius ? h.temp_c : h.temp_f,
      feelsLike: isCelsius ? h.feelslike_c : h.feelslike_f,
      humidity: h.humidity,
      // Each hour carries its own day flag. Reading `current.is_day` once
      // painted a whole evening with suns when the fetch happened by day.
      icon: this.mapConditionToIcon(h.condition.code, h.is_day === 1),
      description: h.condition.text ?? '',
      windSpeed: isCelsius ? h.wind_kph : h.wind_mph,
      windDirection: h.wind_degree,
      windGust: isCelsius ? h.gust_kph : h.gust_mph,
      precipProbability: precipChance(h.chance_of_rain, h.chance_of_snow),
      uvIndex: h.uv != null ? Math.round(h.uv) : undefined,
    }));
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const data = await this.fetchData(lat, lon);
    const isCelsius = units === 'metric';

    return data.forecast.forecastday.map((d) => ({
      date: d.date,
      high: isCelsius ? d.day.maxtemp_c : d.day.maxtemp_f,
      low: isCelsius ? d.day.mintemp_c : d.day.mintemp_f,
      icon: this.mapConditionToIcon(d.day.condition.code, true),
      description: d.day.condition.text ?? '',
      precipProbability: precipChance(d.day.daily_chance_of_rain, d.day.daily_chance_of_snow),
      precipAmount: isCelsius ? (d.day.totalprecip_mm ?? 0) : (d.day.totalprecip_in ?? 0),
      humidity: d.day.avghumidity,
      windSpeed: isCelsius ? d.day.maxwind_kph : d.day.maxwind_mph,
    }));
  }

  private mapConditionToIcon(code: number, isDay: boolean): string {
    return weatherApiCodeToIcon(code, isDay);
  }
}
