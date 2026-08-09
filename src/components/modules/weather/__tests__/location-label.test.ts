import { describe, it, expect } from 'vitest';
import { formatCoords, resolveWeatherLocationLabel } from '../location-label';

const COORDS = { lat: 44.7133, lon: -93.4227 };

describe('formatCoords', () => {
  it('rounds to three decimals (~110m)', () => {
    expect(formatCoords(44.7133, -93.4227)).toBe('44.713, -93.423');
  });

  it('pads short decimals so the two halves line up', () => {
    expect(formatCoords(44.7, -93)).toBe('44.700, -93.000');
  });
});

describe('resolveWeatherLocationLabel', () => {
  it('returns null when the option is off, whatever else is available', () => {
    expect(resolveWeatherLocationLabel(
      { showLocation: false, locationLabel: 'Home' },
      'Prior Lake, MN',
      COORDS,
    )).toBeNull();
  });

  it('prefers the custom label over the geocoded name', () => {
    expect(resolveWeatherLocationLabel(
      { showLocation: true, locationLabel: 'Home' },
      'Prior Lake, MN',
      COORDS,
    )).toBe('Home');
  });

  it('trims the custom label', () => {
    expect(resolveWeatherLocationLabel(
      { showLocation: true, locationLabel: '  Home  ' },
      undefined,
      COORDS,
    )).toBe('Home');
  });

  it('falls through to the name when the custom label is whitespace-only', () => {
    expect(resolveWeatherLocationLabel(
      { showLocation: true, locationLabel: '   ' },
      'Prior Lake, MN',
      COORDS,
    )).toBe('Prior Lake, MN');
  });

  it('prefers the geocoded name over coordinates', () => {
    expect(resolveWeatherLocationLabel(
      { showLocation: true },
      'Prior Lake, MN',
      COORDS,
    )).toBe('Prior Lake, MN');
  });

  it('falls back to formatted coordinates when no name is known', () => {
    expect(resolveWeatherLocationLabel({ showLocation: true }, undefined, COORDS))
      .toBe('44.713, -93.423');
  });

  it('falls back to coordinates when the name is whitespace-only', () => {
    expect(resolveWeatherLocationLabel({ showLocation: true }, '   ', COORDS))
      .toBe('44.713, -93.423');
  });

  // Unreachable through the module (WeatherModule short-circuits to its
  // "Location not set" state first), but the helper stays total.
  it('returns null when there is nothing to show', () => {
    expect(resolveWeatherLocationLabel({ showLocation: true }, undefined, null)).toBeNull();
    expect(resolveWeatherLocationLabel({ showLocation: true })).toBeNull();
  });
});
