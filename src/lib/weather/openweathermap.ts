import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchKeyedWeatherJSON } from './fetch';
import { SetupError } from '@/lib/api-utils';
import { OWM_ICON_MAP, FALLBACK_ICON } from './icons';
import { average } from './daily';
import { msToWindUnit } from './units';

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
    windSpeed: Math.round(windToUnit(average(day.wind) ?? 0, units)),
  };
}

/** OWM wind: m/s under `metric`, mph under `imperial`. Modules expect km/h or mph. */
function windToUnit(speed: number, units: string): number {
  return units === 'metric' ? msToWindUnit(speed, true) : speed;
}

// ── OpenWeatherMap provider ──────────────────────────────────────────

/** @internal */
export class OpenWeatherMapProvider implements WeatherProvider {
  private apiKey: string;

  /** Memoised per instance; `createWeatherProvider` builds a fresh provider per
   *  request, so this dedupes the two calls a single refresh makes and never
   *  serves a stale payload across requests. Mirrors PirateWeatherProvider. */
  private forecastPromise?: Promise<OWMForecastResponse>;

  constructor(apiKey?: string) {
    if (!apiKey) throw new SetupError('OpenWeatherMap API key is not configured. Add it in Settings > Weather.', 'key', 'OpenWeatherMap', 'weather');
    this.apiKey = apiKey;
  }

  /**
   * The 5day/3hour forecast: 40 timestamps, 120h at 3-hour steps, free tier.
   *
   * `getHourly` and `getForecast` both need it, and a single refresh calls
   * both — so without this memo every refresh fetched the identical URL twice.
   */
  private fetchForecast(lat: number, lon: number, units: string): Promise<OWMForecastResponse> {
    if (!this.forecastPromise) {
      this.forecastPromise = fetchKeyedWeatherJSON<OWMForecastResponse>(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${this.apiKey}`,
        'OpenWeatherMap',
      );
    }
    return this.forecastPromise;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const [currentData, forecastData] = await Promise.all([
      fetchKeyedWeatherJSON<OWMCurrentResponse>(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${this.apiKey}`,
        'OpenWeatherMap',
      ),
      // Previously capped with `cnt=8` (24h), which threw away 96 hours the
      // very same URL was already returning to `getForecast`.
      this.fetchForecast(lat, lon, units),
    ]);

    // OWM's `units=metric` reports wind in m/s (imperial is already mph);
    // every other provider hands modules km/h, so match them here.
    const wind = (speed: number) => windToUnit(speed, units);
    const current: HourlyWeather = {
      time: new Date(currentData.dt * 1000).toISOString(),
      temp: currentData.main.temp,
      feelsLike: currentData.main.feels_like,
      humidity: currentData.main.humidity,
      icon: this.mapIcon(currentData.weather[0]?.icon ?? ''),
      description: currentData.weather[0]?.description ?? '',
      windSpeed: wind(currentData.wind.speed),
      precipProbability: 0,
    };

    const forecast = forecastData.list.map((h) => ({
      time: new Date(h.dt * 1000).toISOString(),
      temp: h.main.temp,
      feelsLike: h.main.feels_like,
      humidity: h.main.humidity,
      icon: this.mapIcon(h.weather[0]?.icon ?? ''),
      description: h.weather[0]?.description ?? '',
      windSpeed: wind(h.wind.speed),
      precipProbability: (h.pop ?? 0) * 100,
    }));

    return [current, ...forecast];
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const data = await this.fetchForecast(lat, lon, units);
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
