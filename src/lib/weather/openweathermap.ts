import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';
import { OWM_ICON_MAP, FALLBACK_ICON } from './icons';
import { average } from './daily';

// ── OpenWeatherMap API response types ────────────────────────────────

interface OWMWeatherEntry {
  id: number;
  main: string;
  description: string;
  icon: string;
}

interface OWMMain {
  temp: number;
  feels_like: number;
  humidity: number;
  temp_min: number;
  temp_max: number;
  pressure: number;
}

interface OWMWind {
  speed: number;
  deg: number;
}

interface OWMCurrentResponse {
  dt: number;
  main: OWMMain;
  weather: OWMWeatherEntry[];
  wind: OWMWind;
}

interface OWMForecastEntry {
  dt: number;
  main: OWMMain;
  weather: OWMWeatherEntry[];
  wind: OWMWind;
  pop: number;
  rain?: { '3h'?: number };
}

interface OWMForecastResponse {
  list: OWMForecastEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────

interface DayAccumulator {
  temps: number[];
  icons: string[];
  descs: string[];
  humidity: number[];
  wind: number[];
  pop: number[];
  rain: number;
}

function groupByDate(entries: OWMForecastEntry[]): Map<string, DayAccumulator> {
  const dayMap = new Map<string, DayAccumulator>();
  for (const entry of entries) {
    const date = new Date(entry.dt * 1000).toISOString().split('T')[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, { temps: [], icons: [], descs: [], humidity: [], wind: [], pop: [], rain: 0 });
    }
    const day = dayMap.get(date)!;
    day.temps.push(entry.main.temp);
    day.humidity.push(entry.main.humidity);
    day.wind.push(entry.wind?.speed ?? 0);
    day.pop.push((entry.pop ?? 0) * 100);
    day.rain += entry.rain?.['3h'] ?? 0;
    const weather = entry.weather?.[0];
    day.icons.push(weather?.icon ?? '');
    day.descs.push(weather?.description ?? '');
  }
  return dayMap;
}

function aggregateDay(date: string, day: DayAccumulator, units: string, mapIcon: (icon: string) => string): ForecastDay {
  // Unlike the hourly-timeseries providers (yr/smhi, see daily.ts), OWM's
  // 3-hourly data uses the middle-of-day entry as the representative
  // icon/description rather than the most frequent symbol — deliberate, since
  // with ≤8 samples/day the midday entry beats a frequency count.
  return {
    date,
    high: Math.round(Math.max(...day.temps)),
    low: Math.round(Math.min(...day.temps)),
    icon: mapIcon(day.icons[Math.floor(day.icons.length / 2)] ?? ''),
    description: day.descs[Math.floor(day.descs.length / 2)] ?? '',
    precipProbability: Math.round(Math.max(...day.pop)),
    precipAmount: units === 'imperial' ? Math.round(day.rain / 25.4 * 100) / 100 : Math.round(day.rain * 10) / 10,
    humidity: Math.round(average(day.humidity) ?? 0),
    windSpeed: Math.round(average(day.wind) ?? 0),
  };
}

// ── OpenWeatherMap provider ──────────────────────────────────────────

/** @internal */
export class OpenWeatherMapProvider implements WeatherProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) throw new Error('OpenWeatherMap API key is not configured. Add it in Settings → Weather.');
    this.apiKey = apiKey;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const [currentData, forecastData] = await Promise.all([
      fetchWeatherJSON<OWMCurrentResponse>(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${this.apiKey}`,
        'OpenWeatherMap',
      ),
      fetchWeatherJSON<OWMForecastResponse>(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&cnt=8&appid=${this.apiKey}`,
        'OpenWeatherMap',
      ),
    ]);

    const current: HourlyWeather = {
      time: new Date(currentData.dt * 1000).toISOString(),
      temp: currentData.main.temp,
      feelsLike: currentData.main.feels_like,
      humidity: currentData.main.humidity,
      icon: this.mapIcon(currentData.weather[0]?.icon ?? ''),
      description: currentData.weather[0]?.description ?? '',
      windSpeed: currentData.wind.speed,
      precipProbability: 0,
    };

    const forecast = forecastData.list.map((h) => ({
      time: new Date(h.dt * 1000).toISOString(),
      temp: h.main.temp,
      feelsLike: h.main.feels_like,
      humidity: h.main.humidity,
      icon: this.mapIcon(h.weather[0]?.icon ?? ''),
      description: h.weather[0]?.description ?? '',
      windSpeed: h.wind.speed,
      precipProbability: (h.pop ?? 0) * 100,
    }));

    return [current, ...forecast];
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${this.apiKey}`;
    const data = await fetchWeatherJSON<OWMForecastResponse>(url, 'OpenWeatherMap');
    const dayMap = groupByDate(data.list ?? []);

    const days: ForecastDay[] = [];
    for (const [date, day] of dayMap) {
      days.push(aggregateDay(date, day, units, (icon) => this.mapIcon(icon)));
    }
    return days.slice(0, 7);
  }

  private mapIcon(owmIcon: string): string {
    return OWM_ICON_MAP[owmIcon] ?? FALLBACK_ICON;
  }
}
