/**
 * Migration 017: the superseded fields are retired.
 *
 * Six values used to be read through a fallback at render time because the
 * field that replaced them was never written back. Each is settled here once
 * so the readers can drop their fallbacks:
 *
 * - `settings.weather.latitude` / `longitude` were a second copy of the
 *   household location. The top level wins where it is set (a 0 counts as
 *   set, as the readers' `??` always treated it); only an absent top-level
 *   pair takes the weather copy. The weather copy is removed.
 * - `settings.calendar.googleCalendarId` was the single calendar from before
 *   several could be picked. It becomes the one entry of an empty
 *   `googleCalendarIds` and is removed.
 * - A clock's `format24h` toggle was read only while `hourFormat` was absent.
 *   Such a clock gets `hourFormat` pinned to what its toggle said, so it keeps
 *   showing the same clock; the toggle is removed everywhere.
 * - A full-screen calendar's `showWeather` was read only while
 *   `weatherPlacement` was absent: `false` meant off, anything else the
 *   header pill. The placement is written and the toggle removed.
 * - `darkMode` on the full-screen calendar and chore chart was the last word
 *   on a module with no `theme` of its own and no display theme to inherit:
 *   `true` painted Charcoal, `false` Linen. The registry now carries each
 *   type's own default theme (Charcoal for the chore chart, Linen for the
 *   calendar), so `theme` is written only where the boolean picked the other
 *   palette and nothing else was deciding; a module that already inherits a
 *   display theme keeps inheriting it. A module without the boolean at all
 *   takes the type default. The boolean is removed.
 * - A font stored as one of the raw CSS stacks the picker wrote before fonts
 *   had ids (a module's Style font or a Text module's own) becomes the id.
 *   Any other raw stack is a hand-edited choice and stays.
 */

import type { ScreenConfiguration, GlobalSettings } from '@/types/config';
import { mapConfigModules } from './module-walk';

/** What the boolean painted, and the palette each type now defaults to. */
const DARK_MODE_THEME = (darkMode: unknown): string => (darkMode ? 'charcoal' : 'linen');
const TYPE_DEFAULT_THEME: Record<string, string> = {
  'fullscreen-chore-chart': 'charcoal',
  'fullscreen-calendar': 'linen',
};

/** The raw CSS stacks older pickers stored, and the registry id each became. */
const LEGACY_FONT_STACK_TO_ID: Record<string, string> = {
  'Inter, system-ui, sans-serif': 'inter',
  'Georgia, serif': 'georgia',
  'monospace': 'mono',
  'system-ui, sans-serif': 'system-ui',
  'ui-monospace, "SF Mono", Menlo, monospace': 'mono',
  'system-ui, -apple-system, "Segoe UI", sans-serif': 'system-ui',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function legacyFontId(value: unknown): string | undefined {
  return typeof value === 'string' ? LEGACY_FONT_STACK_TO_ID[value.trim()] : undefined;
}

function migrateSettings(settings: GlobalSettings): GlobalSettings {
  if (!isRecord(settings)) return settings;
  let next: Record<string, unknown> = settings;

  const weather = next.weather;
  if (isRecord(weather) && ('latitude' in weather || 'longitude' in weather)) {
    const { latitude, longitude, ...rest } = weather;
    next = { ...next, weather: rest };
    if (next.latitude == null && next.longitude == null && latitude != null && longitude != null) {
      next = { ...next, latitude, longitude };
    }
  }

  const calendar = next.calendar;
  if (isRecord(calendar) && 'googleCalendarId' in calendar) {
    const { googleCalendarId, ...rest } = calendar;
    const ids = Array.isArray(rest.googleCalendarIds) ? rest.googleCalendarIds : [];
    const single = typeof googleCalendarId === 'string' && googleCalendarId ? [googleCalendarId] : [];
    next = { ...next, calendar: { ...rest, googleCalendarIds: ids.length ? ids : single } };
  }

  return next as unknown as GlobalSettings;
}

export const v16ToV17 = {
  version: 17,
  description: 'Superseded fields retired: weather location copy, single Google calendar id, clock format24h, calendar showWeather, darkMode, raw font stacks',
  up: (config: ScreenConfiguration): ScreenConfiguration => {
    const settings = migrateSettings(config.settings);
    const sharedTheme = isRecord(settings) ? settings.fullscreenTheme : undefined;

    const modules = mapConfigModules(config, (mod, site) => {
      let next = mod;

      if (isRecord(mod.style) && legacyFontId(mod.style.fontFamily)) {
        next = { ...next, style: { ...mod.style, fontFamily: legacyFontId(mod.style.fontFamily)! } };
      }

      if (!isRecord(mod.config)) return next;
      const cfg = mod.config as Record<string, unknown>;
      let out: Record<string, unknown> | null = null;
      const edit = () => (out ??= { ...cfg });

      if (mod.type === 'text' && legacyFontId(cfg.fontFamily)) {
        edit().fontFamily = legacyFontId(cfg.fontFamily)!;
      }

      if (mod.type === 'clock' && 'format24h' in cfg) {
        if (cfg.hourFormat === undefined) edit().hourFormat = cfg.format24h ? '24h' : '12h';
        delete edit().format24h;
      }

      if (mod.type === 'fullscreen-calendar' && 'showWeather' in cfg) {
        if (cfg.weatherPlacement === undefined) edit().weatherPlacement = cfg.showWeather === false ? 'off' : 'header';
        delete edit().showWeather;
      }

      const typeDefault = TYPE_DEFAULT_THEME[mod.type as string];
      if (typeDefault && 'darkMode' in cfg) {
        const inherited = site.display?.settings?.fullscreenTheme ?? sharedTheme;
        if (cfg.theme === undefined && !inherited && cfg.darkMode !== undefined && DARK_MODE_THEME(cfg.darkMode) !== typeDefault) {
          edit().theme = DARK_MODE_THEME(cfg.darkMode);
        }
        delete edit().darkMode;
      }

      return out ? { ...next, config: out as typeof mod.config } : next;
    });

    return { ...config, ...modules, settings, version: 17 };
  },
};
