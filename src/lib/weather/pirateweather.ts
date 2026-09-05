import type { HourlyWeather, ForecastDay, MinutelyPrecip, WeatherAlert, WeatherProvider } from './types';
import { fetchKeyedWeatherJSON } from './fetch';
import { SetupError } from '@/lib/api-utils';
import { PIRATE_ICON_MAP, FALLBACK_ICON } from './icons';

// ── Pirate Weather API response types ────────────────────────────────

interface PWDataPoint {
  time: number;
  summary?: string;
  icon?: string;
  precipIntensity?: number;
  precipProbability?: number;
  precipType?: string;
  temperature?: number;
  apparentTemperature?: number;
  dewPoint?: number;
  humidity?: number;
  pressure?: number;
  windSpeed?: number;
  windGust?: number;
  windBearing?: number;
  cloudCover?: number;
  uvIndex?: number;
  visibility?: number;
}

interface PWDailyDataPoint extends PWDataPoint {
  temperatureHigh?: number;
  temperatureLow?: number;
  precipAccumulation?: number;
  moonPhase?: number;
  sunriseTime?: number;
  sunsetTime?: number;
}

interface PWMinutelyDataPoint {
  time: number;
  precipIntensity?: number;
  precipProbability?: number;
  precipType?: string;
}

interface PWAlert {
  title: string;
  severity: string;
  description: string;
  expires: number;
  uri?: string;
}

interface PWResponse {
  currently?: PWDataPoint;
  minutely?: { data: PWMinutelyDataPoint[] };
  hourly?: { data: PWDataPoint[] };
  daily?: { data: PWDailyDataPoint[] };
  alerts?: PWAlert[];
}

// ── Pirate Weather provider ──────────────────────────────────────────

/** @internal */
export class PirateWeatherProvider implements WeatherProvider {
  private apiKey: string;
  private fetchPromise: Promise<PWResponse> | null = null;

  constructor(apiKey?: string) {
    if (!apiKey) throw new SetupError('Pirate Weather API key is not configured. Add it in Settings > Weather.', 'key', 'Pirate Weather', 'weather');
    this.apiKey = apiKey;
  }

  private async fetchAll(lat: number, lon: number, units: string): Promise<PWResponse> {
    if (!this.fetchPromise) {
      this.fetchPromise = this._doFetch(lat, lon, units);
    }
    return this.fetchPromise;
  }

  private async _doFetch(lat: number, lon: number, units: string): Promise<PWResponse> {
    const pwUnits = units === 'imperial' ? 'us' : 'ca';
    const url = `https://api.pirateweather.net/forecast/${this.apiKey}/${lat},${lon}?units=${pwUnits}&version=2`;
    return fetchKeyedWeatherJSON<PWResponse>(url, 'Pirate Weather');
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const data = await this.fetchAll(lat, lon, units);
    if (!data.hourly?.data) return [];

    // Use hourly data only (hourly[0] is the current hour).
    // Skipping `currently` avoids out-of-order timestamps since
    // currently.time is the exact request time, not hour-aligned.
    const nowEpoch = Math.floor(Date.now() / 1000);
    return data.hourly.data
      // A sample with no temperature is dropped, not shown as 0°: the hub
      // records the first sample as today's reading (see today-record.ts).
      .filter((h) => h.time >= nowEpoch - 3600 && h.temperature != null)
      .map((h) => ({
        time: new Date(h.time * 1000).toISOString(),
        temp: h.temperature as number,
        feelsLike: h.apparentTemperature,
        humidity: h.humidity != null ? Math.round(h.humidity * 100) : undefined,
        icon: this.mapIcon(h.icon ?? ''),
        description: h.summary ?? '',
        windSpeed: h.windSpeed,
        precipProbability: h.precipProbability != null ? Math.round(h.precipProbability * 100) : 0,
        uvIndex: h.uvIndex != null ? Math.round(h.uvIndex) : undefined,
        pressure: h.pressure != null ? Math.round(h.pressure) : undefined,
        dewPoint: h.dewPoint != null ? Math.round(h.dewPoint) : undefined,
        visibility: h.visibility != null ? Math.round(h.visibility * 10) / 10 : undefined,
      }));
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const data = await this.fetchAll(lat, lon, units);
    if (!data.daily?.data) return [];

    return data.daily.data.slice(0, 7).map((d) => ({
      date: new Date(d.time * 1000).toISOString().split('T')[0],
      high: Math.round(d.temperatureHigh ?? 0),
      low: Math.round(d.temperatureLow ?? 0),
      icon: this.mapIcon(d.icon ?? ''),
      description: d.summary ?? '',
      precipProbability: d.precipProbability != null ? Math.round(d.precipProbability * 100) : 0,
      precipAmount: d.precipAccumulation ?? 0,
      humidity: d.humidity != null ? Math.round(d.humidity * 100) : undefined,
      windSpeed: d.windSpeed != null ? Math.round(d.windSpeed) : undefined,
    }));
  }

  async getMinutely(lat: number, lon: number, units: string): Promise<MinutelyPrecip[]> {
    const data = await this.fetchAll(lat, lon, units);
    if (!data.minutely?.data) return [];

    return data.minutely.data.map((m) => ({
      time: m.time,
      intensity: m.precipIntensity ?? 0,
      probability: m.precipProbability != null ? Math.round(m.precipProbability * 100) : 0,
      type: m.precipType,
    }));
  }

  async getAlerts(lat: number, lon: number, units: string): Promise<WeatherAlert[]> {
    const data = await this.fetchAll(lat, lon, units);
    if (!data.alerts) return [];

    return data.alerts.map((a) => ({
      title: a.title,
      severity: (['Extreme', 'Severe', 'Moderate', 'Minor'].includes(a.severity)
        ? a.severity
        : 'Unknown') as WeatherAlert['severity'],
      description: a.description,
      expires: a.expires,
      uri: a.uri,
    }));
  }

  private mapIcon(pwIcon: string): string {
    return PIRATE_ICON_MAP[pwIcon] ?? FALLBACK_ICON;
  }
}
