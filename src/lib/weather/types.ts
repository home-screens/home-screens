// ── Public types ─────────────────────────────────────────────────────

export interface HourlyWeather {
  time: string;
  /**
   * Unix seconds for this entry, when the provider supplies one. WeatherAPI's
   * `time` is a zone-less location-local wall time — fine to format, unsafe
   * to parse for arithmetic — so consumers doing time math must prefer this.
   */
  timeEpoch?: number;
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
  getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]>;
  getMinutely?(lat: number, lon: number, units: string): Promise<MinutelyPrecip[]>;
  getAlerts?(lat: number, lon: number, units: string): Promise<WeatherAlert[]>;
}
