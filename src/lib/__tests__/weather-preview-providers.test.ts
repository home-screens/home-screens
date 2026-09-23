import { describe, expect, it } from 'vitest';
import { previewWeatherProviders } from '../weather-preview-providers';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';

function weather(provider: string): ModuleInstance {
  return { type: 'weather', config: { provider } } as unknown as ModuleInstance;
}

function screen(...modules: ModuleInstance[]): Screen {
  return { modules } as Screen;
}

function config(
  globalProvider: string,
  screens: Screen[],
  displays?: Array<{ id: string; name: string; screens: Screen[] }>,
): ScreenConfiguration {
  return {
    settings: { weather: { provider: globalProvider } },
    screens,
    displays,
  } as ScreenConfiguration;
}

describe('previewWeatherProviders', () => {
  it('requests only the global provider when modules inherit it', () => {
    const value = config('open-meteo', [screen(weather('global'))]);

    expect(previewWeatherProviders(value)).toEqual(['open-meteo']);
  });

  it('adds explicit module providers without probing unrelated services', () => {
    const value = config('open-meteo', [
      screen(weather('yr'), weather('open-meteo'), { type: 'clock', config: {} } as ModuleInstance),
    ]);

    expect(previewWeatherProviders(value)).toEqual(['open-meteo', 'yr']);
  });

  it('reads display-owned screens instead of the frozen legacy screen pool', () => {
    const value = config(
      'open-meteo',
      [screen(weather('noaa'))],
      [{ id: 'main', name: 'Main', screens: [screen(weather('weatherapi'))] }],
    );

    expect(previewWeatherProviders(value)).toEqual(['open-meteo', 'weatherapi']);
  });

  it('waits until editor configuration is available', () => {
    expect(previewWeatherProviders(null)).toEqual([]);
  });
});