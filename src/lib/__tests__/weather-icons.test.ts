import { describe, it, expect } from 'vitest';
import { getWeatherIconLabel } from '../weather-icons';

describe('getWeatherIconLabel', () => {
  it('returns "Sunny" for sun icon', () => {
    expect(getWeatherIconLabel('sun')).toBe('Sunny');
  });

  it('returns "Clear night" for moon icon', () => {
    expect(getWeatherIconLabel('moon')).toBe('Clear night');
  });

  it('returns "Cloudy" for cloud icon', () => {
    expect(getWeatherIconLabel('cloud')).toBe('Cloudy');
  });

  it('returns "Partly cloudy" for cloud-sun', () => {
    expect(getWeatherIconLabel('cloud-sun')).toBe('Partly cloudy');
  });

  it('returns "Partly cloudy night" for cloud-moon', () => {
    expect(getWeatherIconLabel('cloud-moon')).toBe('Partly cloudy night');
  });

  it('returns "Rain" for cloud-rain', () => {
    expect(getWeatherIconLabel('cloud-rain')).toBe('Rain');
  });

  it('returns "Drizzle" for cloud-drizzle', () => {
    expect(getWeatherIconLabel('cloud-drizzle')).toBe('Drizzle');
  });

  it('returns "Snow" for cloud-snow', () => {
    expect(getWeatherIconLabel('cloud-snow')).toBe('Snow');
  });

  it('returns "Thunderstorm" for cloud-lightning', () => {
    expect(getWeatherIconLabel('cloud-lightning')).toBe('Thunderstorm');
  });

  it('returns "Fog" for cloud-fog', () => {
    expect(getWeatherIconLabel('cloud-fog')).toBe('Fog');
  });

  it('returns "Hail" for cloud-hail', () => {
    expect(getWeatherIconLabel('cloud-hail')).toBe('Hail');
  });

  it('returns "Temperature" for thermometer', () => {
    expect(getWeatherIconLabel('thermometer')).toBe('Temperature');
  });

  it('returns "Weather" for unknown icon id', () => {
    expect(getWeatherIconLabel('unknown-icon')).toBe('Weather');
  });

  it('returns "Weather" for empty string', () => {
    expect(getWeatherIconLabel('')).toBe('Weather');
  });
});
