import type { HourlyWeather, ForecastDay, WeatherAlert, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';
import { inferIconFromText } from './icons';

// ── NOAA/NWS API response types ──────────────────────────────────────

interface NOAAPointProperties {
  gridId: string;
  gridX: number;
  gridY: number;
  observationStations: string;
  timeZone: string;
}

interface NOAAForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation: { unitCode: string; value: number | null };
  dewpoint: { unitCode: string; value: number | null };
  relativeHumidity: { unitCode: string; value: number | null };
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
}

interface NOAAForecastResponse {
  properties: { periods: NOAAForecastPeriod[] };
}

interface NOAAObservation {
  textDescription: string;
  temperature: { value: number | null; unitCode: string };
  dewpoint: { value: number | null; unitCode: string };
  relativeHumidity: { value: number | null; unitCode: string };
  windSpeed: { value: number | null; unitCode: string };
  barometricPressure: { value: number | null; unitCode: string };
  visibility: { value: number | null; unitCode: string };
  windChill: { value: number | null; unitCode: string };
  heatIndex: { value: number | null; unitCode: string };
}

interface NOAAAlertFeature {
  properties: {
    event: string;
    severity: string;
    description: string;
    expires: string;
    uri?: string;
  };
}

/** Enrich an hourly entry with real station observations (pressure, visibility, dewpoint, feels-like). */
function enrichWithObservation(result: HourlyWeather, obs: NOAAObservation, isMetric: boolean): void {
  const toUnit = (c: number) => isMetric ? Math.round(c) : Math.round(c * 9 / 5 + 32);

  if (obs.barometricPressure?.value != null) {
    result.pressure = Math.round(obs.barometricPressure.value / 100); // Pa → hPa
  }
  if (obs.visibility?.value != null) {
    result.visibility = isMetric
      ? Math.round(obs.visibility.value / 1000 * 10) / 10    // m → km
      : Math.round(obs.visibility.value / 1609.34 * 10) / 10; // m → miles
  }
  if (obs.dewpoint?.value != null) {
    result.dewPoint = toUnit(obs.dewpoint.value);
  }
  // Prefer observed feels-like (wind chill or heat index)
  if (obs.windChill?.value != null) {
    result.feelsLike = toUnit(obs.windChill.value);
  } else if (obs.heatIndex?.value != null) {
    result.feelsLike = toUnit(obs.heatIndex.value);
  }
}

// ── NOAA/NWS provider ────────────────────────────────────────────────

/** @internal */
export class NOAAProvider implements WeatherProvider {
  private static USER_AGENT = '(home-screens, github.com/home-screens/home-screens)';
  private static gridCache = new Map<string, { data: NOAAPointProperties; ts: number }>();
  private static GRID_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private static MAX_CACHE = 20;

  // No API key needed — NOAA is free and public
  constructor() {}

  private static fetchInit = { headers: { 'User-Agent': NOAAProvider.USER_AGENT } };

  private async getGridPoint(lat: number, lon: number): Promise<NOAAPointProperties> {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const cached = NOAAProvider.gridCache.get(key);
    if (cached && Date.now() - cached.ts < NOAAProvider.GRID_TTL) return cached.data;

    const data = await fetchWeatherJSON<{ properties: NOAAPointProperties }>(
      `https://api.weather.gov/points/${lat},${lon}`,
      'NOAA',
      NOAAProvider.fetchInit,
    );
    const grid = data.properties;
    NOAAProvider.gridCache.set(key, { data: grid, ts: Date.now() });
    // Evict oldest entry if cache is full
    if (NOAAProvider.gridCache.size > NOAAProvider.MAX_CACHE) {
      const oldest = NOAAProvider.gridCache.keys().next().value;
      if (oldest) NOAAProvider.gridCache.delete(oldest);
    }
    return grid;
  }

  private async getObservation(grid: NOAAPointProperties): Promise<NOAAObservation | null> {
    try {
      const stations = await fetchWeatherJSON<{ features: { properties: { stationIdentifier: string } }[] }>(
        grid.observationStations,
        'NOAA',
        NOAAProvider.fetchInit,
      );
      const stationId = stations.features?.[0]?.properties?.stationIdentifier;
      if (!stationId) return null;
      const obs = await fetchWeatherJSON<{ properties: NOAAObservation }>(
        `https://api.weather.gov/stations/${stationId}/observations/latest`,
        'NOAA',
        NOAAProvider.fetchInit,
      );
      return obs.properties;
    } catch {
      return null; // Observation data is optional
    }
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const grid = await this.getGridPoint(lat, lon);
    const [forecastData, observation] = await Promise.all([
      fetchWeatherJSON<NOAAForecastResponse>(
        `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}/forecast/hourly`,
        'NOAA',
        NOAAProvider.fetchInit,
      ),
      this.getObservation(grid),
    ]);

    const isMetric = units === 'metric';
    const nowMs = Date.now();

    return forecastData.properties.periods
      .filter((p) => new Date(p.startTime).getTime() >= nowMs - 3600000)
      .map((p, i) => {
        const temp = this.convertTemp(p.temperature, p.temperatureUnit, isMetric);
        const dewC = p.dewpoint?.value;
        const dewPoint = dewC != null ? (isMetric ? dewC : dewC * 9 / 5 + 32) : undefined;

        const result: HourlyWeather = {
          time: p.startTime,
          temp,
          humidity: p.relativeHumidity?.value ?? undefined,
          icon: this.mapForecast(p.shortForecast, p.isDaytime),
          description: p.shortForecast,
          windSpeed: this.parseWindSpeed(p.windSpeed, isMetric),
          precipProbability: p.probabilityOfPrecipitation?.value ?? 0,
          dewPoint: dewPoint != null ? Math.round(dewPoint) : undefined,
        };

        if (i === 0 && observation) {
          enrichWithObservation(result, observation, isMetric);
        }

        return result;
      });
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const grid = await this.getGridPoint(lat, lon);
    const data = await fetchWeatherJSON<NOAAForecastResponse>(
      `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}/forecast`,
      'NOAA',
      NOAAProvider.fetchInit,
    );

    const isMetric = units === 'metric';
    const periods = data.properties.periods;
    const days: ForecastDay[] = [];

    // Pair daytime + nighttime periods into full days.
    // After sunset, the first period is nighttime — emit a partial
    // "tonight" entry so forecast[0] still represents today.
    let startIdx = 0;
    if (periods.length > 0 && !periods[0].isDaytime) {
      const tonight = periods[0];
      const low = this.convertTemp(tonight.temperature, tonight.temperatureUnit, isMetric);
      days.push({
        date: tonight.startTime.split('T')[0],
        high: Math.round(low), // no daytime data available
        low: Math.round(low),
        icon: this.mapForecast(tonight.shortForecast, false),
        description: tonight.shortForecast,
        detailedForecast: tonight.detailedForecast,
        precipProbability: tonight.probabilityOfPrecipitation?.value ?? 0,
        humidity: tonight.relativeHumidity?.value ?? undefined,
        windSpeed: this.parseWindSpeed(tonight.windSpeed, isMetric),
      });
      startIdx = 1;
    }

    for (let i = startIdx; i < periods.length; i++) {
      const p = periods[i];
      if (!p.isDaytime) continue;

      // Verify the next period is actually the nighttime companion
      const next = periods[i + 1];
      const night = (next && !next.isDaytime) ? next : undefined;
      const high = this.convertTemp(p.temperature, p.temperatureUnit, isMetric);
      const low = night
        ? this.convertTemp(night.temperature, night.temperatureUnit, isMetric)
        : high;

      days.push({
        date: p.startTime.split('T')[0],
        high: Math.round(high),
        low: Math.round(low),
        icon: this.mapForecast(p.shortForecast, true),
        description: p.shortForecast,
        detailedForecast: p.detailedForecast,
        precipProbability: Math.max(
          p.probabilityOfPrecipitation?.value ?? 0,
          night?.probabilityOfPrecipitation?.value ?? 0,
        ),
        humidity: p.relativeHumidity?.value ?? undefined,
        windSpeed: this.parseWindSpeed(p.windSpeed, isMetric),
      });
    }

    return days.slice(0, 7);
  }

  async getAlerts(lat: number, lon: number, _units: string): Promise<WeatherAlert[]> {
    const data = await fetchWeatherJSON<{ features: NOAAAlertFeature[] }>(
      `https://api.weather.gov/alerts/active?point=${lat},${lon}`,
      'NOAA',
      NOAAProvider.fetchInit,
    );

    return (data.features ?? []).map((f) => ({
      title: f.properties.event,
      severity: (['Extreme', 'Severe', 'Moderate', 'Minor'].includes(f.properties.severity)
        ? f.properties.severity
        : 'Unknown') as WeatherAlert['severity'],
      description: f.properties.description,
      expires: Math.floor(new Date(f.properties.expires).getTime() / 1000),
      uri: f.properties.uri,
    }));
  }

  private convertTemp(temp: number, fromUnit: string, toMetric: boolean): number {
    if (fromUnit === 'F' && toMetric) return (temp - 32) * 5 / 9;
    if (fromUnit === 'C' && !toMetric) return temp * 9 / 5 + 32;
    return temp;
  }

  private parseWindSpeed(windStr: string, isMetric: boolean): number | undefined {
    // "Calm" means 0 mph
    if (/calm/i.test(windStr)) return 0;
    // Formats: "5 mph", "10 to 15 mph", "5 to 10 mph, with gusts as high as 25 mph"
    // Strip gust clause to avoid reporting gust speed as sustained wind
    const sustained = windStr.replace(/,?\s*with gusts.*/i, '');
    const matches = sustained.match(/(\d+)/g);
    if (!matches || matches.length === 0) return undefined;
    const speed = Math.max(...matches.map(Number));
    // NOAA always returns mph
    return isMetric ? Math.round(speed * 1.60934) : speed;
  }

  private mapForecast(shortForecast: string, isDaytime: boolean): string {
    return inferIconFromText(shortForecast, isDaytime);
  }
}
