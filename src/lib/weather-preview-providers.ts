import { getAllScreens } from '@/lib/display-filter';
import { resolveProvider } from '@/lib/module-props';
import type { ScreenConfiguration } from '@/types/config';

/** Weather providers whose payloads are needed by the editor canvas. */
export function previewWeatherProviders(
  config: ScreenConfiguration | null | undefined,
): string[] {
  if (!config) return [];

  const globalProvider = config.settings.weather.provider ?? 'open-meteo';
  const providers = new Set<string>([globalProvider]);

  for (const screen of getAllScreens(config)) {
    for (const mod of screen.modules) {
      if (mod.type === 'weather') {
        providers.add(resolveProvider(mod, globalProvider));
      }
    }
  }

  return Array.from(providers).sort();
}