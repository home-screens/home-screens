import { getAllScreens } from '@/lib/display-filter';
import { resolveProvider } from '@/lib/module-props';
import { DEFAULT_WEATHER_PROVIDER } from '@/lib/weather-providers';
import type { ScreenConfiguration } from '@/types/config';

/** Weather providers whose payloads are needed by the editor canvas. */
export function previewWeatherProviders(
  config: ScreenConfiguration | null | undefined,
): string[] {
  if (!config) return [];

  const globalProvider = config.settings.weather.provider ?? DEFAULT_WEATHER_PROVIDER;
  const providers = new Set<string>([globalProvider]);

  // Every weather-bound module may name its own source; the rest resolve to
  // the household source, which is already in the set.
  for (const screen of getAllScreens(config)) {
    for (const mod of screen.modules) {
      providers.add(resolveProvider(mod, globalProvider));
    }
  }

  return Array.from(providers).sort();
}