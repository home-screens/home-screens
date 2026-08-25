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

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from './module-walk';

const RENAMES: Record<string, string> = {
  multiWeekTheme: 'gridTheme',
  multiWeekMaxEventsPerCell: 'gridMaxEventsPerCell',
};

export const v7ToV8 = {
  version: 8,
  description: 'Rename multiWeekTheme / multiWeekMaxEventsPerCell to gridTheme / gridMaxEventsPerCell',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 8,
    ...mapConfigModules(config, (mod) => {
      if (mod.type !== 'calendar') return mod;
      const cfg = mod.config as Record<string, unknown> | undefined;
      if (!cfg || typeof cfg !== 'object') return mod;
      if (!Object.keys(RENAMES).some((key) => key in cfg)) return mod;
      const next = { ...cfg };
      for (const [oldKey, newKey] of Object.entries(RENAMES)) {
        if (!(oldKey in next)) continue;
        if (next[newKey] === undefined) next[newKey] = next[oldKey];
        delete next[oldKey];
      }
      return { ...mod, config: next } as typeof mod;
    }),
  }),
};
