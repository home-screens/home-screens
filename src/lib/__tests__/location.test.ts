import { describe, it, expect } from 'vitest';
import { getLocation, hasValidLocation } from '@/lib/location';
import type { GlobalSettings } from '@/types/config';

function settings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    latitude: 0,
    longitude: 0,
    locationName: '',
    timezone: 'UTC',
    weather: {
      provider: 'openweathermap',
      units: 'metric',
    },
    ...overrides,
  } as GlobalSettings;
}

describe('hasValidLocation', () => {
  it('rejects null/undefined inputs', () => {
    expect(hasValidLocation(null, null)).toBe(false);
    expect(hasValidLocation(undefined, undefined)).toBe(false);
    expect(hasValidLocation(40, undefined)).toBe(false);
    expect(hasValidLocation(undefined, -74)).toBe(false);
  });

  it('rejects (0, 0) as the unset sentinel', () => {
    expect(hasValidLocation(0, 0)).toBe(false);
  });

  it('accepts (0, nonzero) and (nonzero, 0)', () => {
    expect(hasValidLocation(0, -74)).toBe(true);
    expect(hasValidLocation(40, 0)).toBe(true);
  });

  it('accepts populated coordinates', () => {
    expect(hasValidLocation(44.7133, -93.4227)).toBe(true);
  });

  it('accepts negative coordinates', () => {
    expect(hasValidLocation(-33.8688, 151.2093)).toBe(true);
  });
});

describe('getLocation', () => {
  it('returns null for null/undefined settings', () => {
    expect(getLocation(null)).toBeNull();
    expect(getLocation(undefined)).toBeNull();
  });

  it('reads the household pair', () => {
    expect(getLocation(settings({ latitude: 44.7133, longitude: -93.4227 }))).toEqual({ lat: 44.7133, lon: -93.4227 });
  });

  it('treats the (0, 0) seed as unset', () => {
    expect(getLocation(settings())).toBeNull();
  });

  it('treats a half-set pair as unset', () => {
    const s = settings();
    (s as { latitude?: number }).latitude = undefined;
    s.longitude = -93;
    expect(getLocation(s)).toBeNull();
  });
});
