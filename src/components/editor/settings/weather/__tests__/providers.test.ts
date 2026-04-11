import { describe, it, expect } from 'vitest';
import { getProviderStatus, WEATHER_PROVIDERS } from '../providers';

describe('getProviderStatus', () => {
  it('returns Default · Ready when default and free', () => {
    expect(getProviderStatus(true, true, true)).toEqual({
      label: 'Default · Ready',
      type: 'default-ready',
    });
  });

  it('returns Default · Configured when default, paid, and key saved', () => {
    expect(getProviderStatus(true, true, false)).toEqual({
      label: 'Default · Configured',
      type: 'default-configured',
    });
  });

  it('returns Default · Needs setup when default, paid, and key missing', () => {
    expect(getProviderStatus(true, false, false)).toEqual({
      label: 'Default · Needs setup',
      type: 'default-needs-setup',
    });
  });

  it('returns Ready when not default and free', () => {
    expect(getProviderStatus(false, true, true)).toEqual({
      label: 'Ready',
      type: 'ready',
    });
  });

  it('returns Configured when not default, paid, and key saved', () => {
    expect(getProviderStatus(false, true, false)).toEqual({
      label: 'Configured',
      type: 'configured',
    });
  });

  it('returns Needs setup when not default, paid, and key missing', () => {
    expect(getProviderStatus(false, false, false)).toEqual({
      label: 'Needs setup',
      type: 'needs-setup',
    });
  });
});

describe('WEATHER_PROVIDERS metadata', () => {
  it('contains exactly the five known providers in fixed order', () => {
    expect(WEATHER_PROVIDERS.map((p) => p.id)).toEqual([
      'open-meteo',
      'weatherapi',
      'openweathermap',
      'pirateweather',
      'noaa',
    ]);
  });

  it('marks free providers with secretKey === null', () => {
    const free = WEATHER_PROVIDERS.filter((p) => p.secretKey === null).map((p) => p.id);
    expect(free.sort()).toEqual(['noaa', 'open-meteo']);
  });

  it('gives every paid provider a unique secretKey', () => {
    const paid = WEATHER_PROVIDERS.filter((p) => p.secretKey !== null);
    const keys = paid.map((p) => p.secretKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
