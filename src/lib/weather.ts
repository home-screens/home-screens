import { fetchWithTimeout } from '@/lib/api-utils';

// ── Public types ─────────────────────────────────────────────────────

export interface HourlyWeather {
  time: string;
  temp: number;
  feelsLike?: number;
  humidity?: number;
  icon: string;
  description: string;
  windSpeed?: number;
  precipProbability?: number;
  pressure?: number;       // hPa (from station observations)
  visibility?: number;     // km or miles depending on units
  dewPoint?: number;       // degrees in configured unit
}

export interface ForecastDay {
  date: string;
  high: number;
  low: number;
  icon: string;
  description: string;
  precipProbability?: number;
  precipAmount?: number;
  humidity?: number;
  windSpeed?: number;
  detailedForecast?: string; // NWS narrative forecast (NOAA only)
}

export interface MinutelyPrecip {
  time: number;
  intensity: number;
  probability: number;
  type?: string;
}

export interface WeatherAlert {
  title: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  description: string;
  expires: number;
  uri?: string;
}

interface WeatherProvider {
  getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]>;
  getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]>;
  getMinutely?(lat: number, lon: number, units: string): Promise<MinutelyPrecip[]>;
  getAlerts?(lat: number, lon: number, units: string): Promise<WeatherAlert[]>;
}

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

async function fetchWeatherJSON<T>(url: string, provider: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${provider} API error ${res.status}: ${body}`);
  }
  return res.json();
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
  return {
    date,
    high: Math.round(Math.max(...day.temps)),
    low: Math.round(Math.min(...day.temps)),
    icon: mapIcon(day.icons[Math.floor(day.icons.length / 2)] ?? ''),
    description: day.descs[Math.floor(day.descs.length / 2)] ?? '',
    precipProbability: Math.round(Math.max(...day.pop)),
    precipAmount: units === 'imperial' ? Math.round(day.rain / 25.4 * 100) / 100 : Math.round(day.rain * 10) / 10,
    humidity: Math.round(day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length),
    windSpeed: Math.round(day.wind.reduce((a, b) => a + b, 0) / day.wind.length),
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
    const map: Record<string, string> = {
      '01d': 'sun', '01n': 'moon',
      '02d': 'cloud-sun', '02n': 'cloud-moon',
      '03d': 'cloud', '03n': 'cloud',
      '04d': 'cloud', '04n': 'cloud',
      '09d': 'cloud-rain', '09n': 'cloud-rain',
      '10d': 'cloud-drizzle', '10n': 'cloud-rain',
      '11d': 'cloud-lightning', '11n': 'cloud-lightning',
      '13d': 'snowflake', '13n': 'snowflake',
      '50d': 'cloud-fog', '50n': 'cloud-fog',
    };
    return map[owmIcon] ?? 'thermometer';
  }
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

class PirateWeatherProvider implements WeatherProvider {
  private apiKey: string;
  private fetchPromise: Promise<PWResponse> | null = null;

  constructor(apiKey?: string) {
    if (!apiKey) throw new Error('Pirate Weather API key is not configured. Add it in Settings → Weather.');
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
    return fetchWeatherJSON<PWResponse>(url, 'Pirate Weather');
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const data = await this.fetchAll(lat, lon, units);
    if (!data.hourly?.data) return [];

    // Use hourly data only (hourly[0] is the current hour).
    // Skipping `currently` avoids out-of-order timestamps since
    // currently.time is the exact request time, not hour-aligned.
    const nowEpoch = Math.floor(Date.now() / 1000);
    return data.hourly.data
      .filter((h) => h.time >= nowEpoch - 3600)
      .map((h) => ({
        time: new Date(h.time * 1000).toISOString(),
        temp: h.temperature ?? 0,
        feelsLike: h.apparentTemperature,
        humidity: h.humidity != null ? Math.round(h.humidity * 100) : undefined,
        icon: this.mapIcon(h.icon ?? ''),
        description: h.summary ?? '',
        windSpeed: h.windSpeed,
        precipProbability: h.precipProbability != null ? Math.round(h.precipProbability * 100) : 0,
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
    const map: Record<string, string> = {
      'clear-day': 'sun',
      'clear-night': 'moon',
      'partly-cloudy-day': 'cloud-sun',
      'partly-cloudy-night': 'cloud-moon',
      'cloudy': 'cloud',
      'rain': 'cloud-rain',
      'snow': 'snowflake',
      'sleet': 'cloud-hail',
      'thunderstorm': 'cloud-lightning',
      'fog': 'cloud-fog',
      'wind': 'cloud',
    };
    return map[pwIcon] ?? 'thermometer';
  }
}

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

class NOAAProvider implements WeatherProvider {
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
    const f = shortForecast.toLowerCase();
    if (f.includes('thunder') || f.includes('storm')) return 'cloud-lightning';
    if (f.includes('snow') || f.includes('blizzard') || f.includes('flurr')) return 'snowflake';
    if (f.includes('sleet') || f.includes('ice') || f.includes('freez')) return 'cloud-hail';
    if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return 'cloud-rain';
    if (f.includes('fog') || f.includes('haze') || f.includes('mist')) return 'cloud-fog';
    // "Mostly Sunny", "Mostly Clear", "Partly Sunny", "Partly Cloudy" → partial cloud
    if (f.includes('partly') || f.includes('mostly sunny') || f.includes('mostly clear'))
      return isDaytime ? 'cloud-sun' : 'cloud-moon';
    if (f.includes('cloud') || f.includes('overcast')) return 'cloud';
    if (f.includes('sunny') || f.includes('clear')) return isDaytime ? 'sun' : 'moon';
    return 'thermometer';
  }
}

// ── Open-Meteo API response types ─────────────────────────────────────

interface OMHourlyResponse {
  time: number[];
  temperature_2m: number[];
  apparent_temperature: number[];
  relative_humidity_2m: number[];
  weather_code: number[];
  wind_speed_10m: number[];
  precipitation_probability: number[];
  surface_pressure: number[];
  dew_point_2m: number[];
  is_day: number[];
}

interface OMDailyResponse {
  time: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  weather_code: number[];
  precipitation_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
}

// ── Open-Meteo provider ───────────────────────────────────────────────

/** @internal */
export class OpenMeteoProvider implements WeatherProvider {
  // No API key needed — Open-Meteo is free and open
  constructor() {}

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const isMetric = units === 'metric';
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability,surface_pressure,dew_point_2m,is_day',
      temperature_unit: isMetric ? 'celsius' : 'fahrenheit',
      wind_speed_unit: isMetric ? 'kmh' : 'mph',
      precipitation_unit: isMetric ? 'mm' : 'inch',
      timeformat: 'unixtime',
      forecast_days: '2',
      timezone: 'auto',
    });

    const data = await fetchWeatherJSON<{ hourly: OMHourlyResponse }>(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      'Open-Meteo',
    );
    const h = data.hourly;
    const nowMs = Date.now();

    const results: HourlyWeather[] = [];
    for (let i = 0; i < h.time.length; i++) {
      const timeMs = h.time[i] * 1000;
      if (timeMs < nowMs - 3600000) continue;

      results.push({
        time: new Date(timeMs).toISOString(),
        temp: h.temperature_2m[i],
        feelsLike: h.apparent_temperature[i],
        humidity: h.relative_humidity_2m[i],
        icon: this.mapWMOCode(h.weather_code[i], h.is_day[i] === 1),
        description: this.wmoDescription(h.weather_code[i]),
        windSpeed: h.wind_speed_10m[i],
        precipProbability: h.precipitation_probability[i] ?? 0,
        pressure: h.surface_pressure[i] != null ? Math.round(h.surface_pressure[i]) : undefined,
        dewPoint: h.dew_point_2m[i] != null ? Math.round(h.dew_point_2m[i]) : undefined,
      });
    }
    return results;
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const isMetric = units === 'metric';
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
      temperature_unit: isMetric ? 'celsius' : 'fahrenheit',
      wind_speed_unit: isMetric ? 'kmh' : 'mph',
      precipitation_unit: isMetric ? 'mm' : 'inch',
      timeformat: 'unixtime',
      forecast_days: '7',
      timezone: 'auto',
    });

    const data = await fetchWeatherJSON<{ daily: OMDailyResponse }>(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      'Open-Meteo',
    );
    const d = data.daily;

    return d.time.map((epoch, i) => ({
      date: new Date(epoch * 1000).toISOString().split('T')[0],
      high: Math.round(d.temperature_2m_max[i]),
      low: Math.round(d.temperature_2m_min[i]),
      icon: this.mapWMOCode(d.weather_code[i], true),
      description: this.wmoDescription(d.weather_code[i]),
      precipProbability: d.precipitation_probability_max[i] ?? 0,
      precipAmount: d.precipitation_sum[i] ?? 0,
      windSpeed: d.wind_speed_10m_max[i] != null ? Math.round(d.wind_speed_10m_max[i]) : undefined,
    }));
  }

  private mapWMOCode(code: number, isDay: boolean): string {
    if (code === 0) return isDay ? 'sun' : 'moon';
    if (code <= 2) return isDay ? 'cloud-sun' : 'cloud-moon'; // 1=mainly clear, 2=partly cloudy
    if (code === 3) return 'cloud'; // overcast
    if (code === 45 || code === 48) return 'cloud-fog'; // fog, rime fog
    if (code >= 51 && code <= 57) return 'cloud-drizzle'; // drizzle variants
    if (code >= 61 && code <= 67) return 'cloud-rain'; // rain + freezing rain
    if (code >= 71 && code <= 77) return 'snowflake'; // snow variants
    if (code >= 80 && code <= 82) return 'cloud-rain'; // rain showers
    if (code >= 85 && code <= 86) return 'snowflake'; // snow showers
    if (code >= 95 && code <= 99) return 'cloud-lightning'; // thunderstorms
    return 'thermometer';
  }

  private wmoDescription(code: number): string {
    const descriptions: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      66: 'Light freezing rain', 67: 'Heavy freezing rain',
      71: 'Slight snow fall', 73: 'Moderate snow fall', 75: 'Heavy snow fall',
      77: 'Snow grains',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
    };
    return descriptions[code] ?? 'Unknown';
  }
}

// ── Factory ──────────────────────────────────────────────────────────

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
    default:
      throw new Error(`Unknown weather provider: ${provider}`);
  }
}
