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
  it('contains exactly the nine known providers in fixed order', () => {
    expect(WEATHER_PROVIDERS.map((p) => p.id)).toEqual([
      'open-meteo',
      'weatherapi',
      'openweathermap',
      'pirateweather',
      'noaa',
      'yr',
      'smhi',
      'metoffice',
      'envcanada',
    ]);
  });

  it('marks free providers with secretKey === null', () => {
    const free = WEATHER_PROVIDERS.filter((p) => p.secretKey === null).map((p) => p.id);
    expect(free.sort()).toEqual(['envcanada', 'noaa', 'open-meteo', 'smhi', 'yr']);
  });

  it('gives every paid provider a unique secretKey', () => {
    const paid = WEATHER_PROVIDERS.filter((p) => p.secretKey !== null);
    const keys = paid.map((p) => p.secretKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // The SMHI Test button must use Nordic coordinates regardless of the
  // user's configured location — outside the bbox the API returns 404
  // and the test would falsely report the integration as broken.
  it('pins SMHI testCoords inside the Nordic coverage area', () => {
    const smhi = WEATHER_PROVIDERS.find((p) => p.id === 'smhi');
    expect(smhi?.testCoords).toBeDefined();
    // SMHI's pmp3g/snow1g bbox roughly: lat 52.5–70.7, lon -9.5–39.
    expect(smhi!.testCoords!.lat).toBeGreaterThanOrEqual(52.5);
    expect(smhi!.testCoords!.lat).toBeLessThanOrEqual(70.7);
    expect(smhi!.testCoords!.lon).toBeGreaterThanOrEqual(-9.5);
    expect(smhi!.testCoords!.lon).toBeLessThanOrEqual(39);
  });
});
