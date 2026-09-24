// ── Public types ─────────────────────────────────────────────────────

export interface HourlyWeather {
  /**
   * The instant this entry is for, as an ISO 8601 timestamp with a zone
   * designator ("2026-09-23T19:00:00.000Z"). Every provider sends a real
   * instant, never a zone-less wall time, so `new Date(time)` is safe to
   * format in the display zone and to do arithmetic with.
   */
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
  /** 0-11+ UV index. Only providers that expose a forecast UV value set this;
   *  consumers must treat `undefined` as "this source doesn't offer UV". */
  uvIndex?: number;
}

export interface ForecastDay {
  /** The day on the forecast location's own calendar, `YYYY-MM-DD`. A calendar
   *  date, not an instant: never shift it into another zone. */
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

export interface WeatherProvider {
  getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]>;
  getForecast(lat: number, lon: number, units: string, timezone?: string): Promise<ForecastDay[]>;
  getMinutely?(lat: number, lon: number, units: string): Promise<MinutelyPrecip[]>;
  getAlerts?(lat: number, lon: number, units: string): Promise<WeatherAlert[]>;
}
