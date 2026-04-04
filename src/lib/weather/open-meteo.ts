import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';

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
