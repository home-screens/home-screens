import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WEATHER_PROVIDER,
  WEATHER_PROVIDER_CAPS,
  WEATHER_PROVIDER_IDS,
  WEATHER_PROVIDER_SECRET,
  configuredWeatherProviders,
  emptyWeatherPayloads,
  isWeatherProviderId,
  weatherProviderCaps,
  weatherProviderSecret,
} from '@/lib/weather-providers';
import { WEATHER_PROVIDER_NAMES } from '@/lib/weather-provider-names';
import { createWeatherProvider } from '@/lib/weather';
import { WEATHER_PROVIDERS } from '@/components/editor/settings/weather/providers';

// The table is the one list of sources. These check it against the things it
// cannot be typed against: the provider classes and the Settings cards.
describe('weather provider table', () => {
  it('names exactly the sources the factory can build, keyed where the class wants a key', () => {
    for (const id of WEATHER_PROVIDER_IDS) {
      const needsKey = WEATHER_PROVIDER_SECRET[id] !== null;
      // With a key every source builds; without one only the keyed ones refuse.
      expect(() => createWeatherProvider(id, 'k')).not.toThrow();
      if (needsKey) expect(() => createWeatherProvider(id)).toThrow(/key/i);
      else expect(() => createWeatherProvider(id)).not.toThrow();
    }
    expect(() => createWeatherProvider('nope')).toThrow(/Unknown weather provider/);
  });

  it('has a name and a Settings card for every source and no extras', () => {
    const ids = [...WEATHER_PROVIDER_IDS].sort();
    expect(Object.keys(WEATHER_PROVIDER_NAMES).sort()).toEqual(ids);
    expect(WEATHER_PROVIDERS.map((p) => p.id).sort()).toEqual(ids);
    for (const card of WEATHER_PROVIDERS) expect(card.secretKey).toBe(WEATHER_PROVIDER_SECRET[card.id]);
  });

  it('flags minute-by-minute rain and warnings exactly where the class sends them', () => {
    for (const id of WEATHER_PROVIDER_IDS) {
      const provider = createWeatherProvider(id, 'k');
      expect(!!WEATHER_PROVIDER_CAPS[id].minutely, `${id} minutely`).toBe(typeof provider.getMinutely === 'function');
      expect(!!WEATHER_PROVIDER_CAPS[id].alerts, `${id} alerts`).toBe(typeof provider.getAlerts === 'function');
    }
  });

  it('offers every keyless source, and a keyed one only once its key is saved', () => {
    expect(configuredWeatherProviders({})).toEqual(['noaa', 'open-meteo', 'yr', 'smhi', 'envcanada']);
    expect(configuredWeatherProviders({ weatherapi_key: true, metoffice_key: false })).toEqual(
      ['weatherapi', 'noaa', 'open-meteo', 'yr', 'smhi', 'envcanada'],
    );
    expect(configuredWeatherProviders({
      openweathermap_key: true, weatherapi_key: true, pirateweather_key: true, metoffice_key: true,
    })).toEqual([...WEATHER_PROVIDER_IDS]);
  });

  it('treats an id it does not know as no source at all', () => {
    expect(isWeatherProviderId('global')).toBe(false);
    expect(isWeatherProviderId(undefined)).toBe(false);
    expect(weatherProviderSecret('global')).toBeNull();
    expect(weatherProviderCaps('global')).toEqual({});
    expect(weatherProviderCaps(undefined)).toEqual({});
    expect(weatherProviderSecret('pirateweather')).toBe('pirateweather_key');
  });

  it('defaults to a source that needs no key, and starts every payload empty', () => {
    expect(WEATHER_PROVIDER_SECRET[DEFAULT_WEATHER_PROVIDER]).toBeNull();
    const empty = emptyWeatherPayloads();
    expect(Object.keys(empty).sort()).toEqual([...WEATHER_PROVIDER_IDS].sort());
    expect(Object.values(empty).every((v) => v === null)).toBe(true);
  });
});
