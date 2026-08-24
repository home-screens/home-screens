/**
 * Migration 008 — the multi-week theme and per-cell cap became grid-wide.
 *
 * `multiWeekTheme` and `multiWeekMaxEventsPerCell` shipped in the v1.11.0
 * release candidates as multi-week-only fields. The month grid now shares the
 * same renderer, so the keys were renamed to `gridTheme` and
 * `gridMaxEventsPerCell`. Without this rename a prerelease install that had
 * picked a theme or a cap would silently fall back to the banner look and the
 * default cap after upgrading, with the old keys left orphaned in config.json.
 *
 * A module that already carries the new key keeps it (a hand edit that moved
 * ahead of the migration wins); the old keys are always removed.
 */

import type { ScreenConfiguration, Screen } from '@/types/config';

const RENAMES: Record<string, string> = {
  multiWeekTheme: 'gridTheme',
  multiWeekMaxEventsPerCell: 'gridMaxEventsPerCell',
};

function migrateScreen(screen: Screen): Screen {
  // Malformed shapes pass through untouched (see v5-to-v6 for why a throw
  // here would take every write path down with it).
  if (!Array.isArray(screen.modules)) return screen;
  let changed = false;
  const modules = screen.modules.map((mod) => {
    if (mod.type !== 'calendar') return mod;
    const cfg = mod.config as Record<string, unknown> | undefined;
    if (!cfg || typeof cfg !== 'object') return mod;
    if (!Object.keys(RENAMES).some((key) => key in cfg)) return mod;
    changed = true;
    const next = { ...cfg };
    for (const [oldKey, newKey] of Object.entries(RENAMES)) {
      if (!(oldKey in next)) continue;
      if (next[newKey] === undefined) next[newKey] = next[oldKey];
      delete next[oldKey];
    }
    return { ...mod, config: next } as typeof mod;
  });
  return changed ? { ...screen, modules } : screen;
}

export const v7ToV8 = {
  version: 8,
  description: 'Rename multiWeekTheme / multiWeekMaxEventsPerCell to gridTheme / gridMaxEventsPerCell',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 8,
    screens: Array.isArray(config.screens) ? config.screens.map(migrateScreen) : config.screens,
    ...(Array.isArray(config.displays)
      ? {
          displays: config.displays.map((d) =>
            Array.isArray(d.screens) ? { ...d, screens: d.screens.map(migrateScreen) } : d,
          ),
        }
      : {}),
  }),
};
