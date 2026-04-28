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
      latitude: 0,
      longitude: 0,
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

  it('prefers top-level latitude/longitude', () => {
    const result = getLocation(
      settings({
        latitude: 44.7133,
        longitude: -93.4227,
        weather: {
          provider: 'openweathermap',
          latitude: 1,
          longitude: 2,
          units: 'metric',
        },
      }),
    );
    expect(result).toEqual({ lat: 44.7133, lon: -93.4227 });
  });

  it('falls back to weather.latitude/longitude when top-level is null/undefined', () => {
    const s = settings({
      weather: {
        provider: 'openweathermap',
        latitude: 44.7133,
        longitude: -93.4227,
        units: 'metric',
      },
    });
    (s as { latitude?: number }).latitude = undefined;
    (s as { longitude?: number }).longitude = undefined;
    expect(getLocation(s)).toEqual({ lat: 44.7133, lon: -93.4227 });
  });

  it('does NOT fall back when top-level is 0 (matches the legacy ?? semantic)', () => {
    // The existing call sites use `s.latitude ?? s.weather.latitude`. `??`
    // only falls through for null/undefined, not 0. Real configs keep both
    // fields in sync (toConfigSettings writes both), so this only matters
    // for hand-edited config.json. Documented here so future refactors
    // don't accidentally change behavior.
    const result = getLocation(
      settings({
        latitude: 0,
        longitude: 0,
        weather: {
          provider: 'openweathermap',
          latitude: 44.7133,
          longitude: -93.4227,
          units: 'metric',
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when both top-level and weather coordinates are (0, 0)', () => {
    expect(getLocation(settings())).toBeNull();
  });

  it('returns null when settings.weather is missing and top-level is unset', () => {
    const s = settings();
    delete (s as Partial<GlobalSettings>).weather;
    expect(getLocation(s)).toBeNull();
  });

  it('handles undefined latitude with present longitude (treats as unset)', () => {
    const s = settings();
    (s as { latitude?: number }).latitude = undefined;
    s.longitude = -93;
    if (s.weather) {
      (s.weather as { latitude?: number }).latitude = undefined;
      s.weather.longitude = -93;
    }
    expect(getLocation(s)).toBeNull();
  });
});
