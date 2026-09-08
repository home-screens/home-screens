/**
 * Migration 011 — the shipped starter backgrounds moved out of the user
 * backgrounds folder.
 *
 * They lived in `public/backgrounds/themes/`, inside the folder that holds
 * user uploads, so every tool that preserves user files on an upgrade also
 * preserved the old starter set and a Pi never received walls added in a
 * later release. They now ship from `public/starter-backgrounds/`, and a
 * screen that pointed at the old path is repointed so it keeps its wall.
 */

import type { ScreenConfiguration, Screen } from '@/types/config';
import { mapConfigScreens } from './module-walk';

const OLD_PREFIX = '/backgrounds/themes/';
/** Frozen copy of the new location, deliberately not imported from live code. */
const NEW_PREFIX = '/starter-backgrounds/';

/**
 * Exactly the files that shipped under the old path, frozen here rather
 * than read from the live catalog. `themes/` was also a user folder, so a
 * wall that is not in this list (`/backgrounds/themes/family.jpg`, say) is
 * the user's own file, still where it was, and must keep its path.
 */
const SHIPPED_FILES = new Set([
  'aurora.svg', 'blush.svg', 'charcoal.svg', 'cloud.svg', 'copper.svg', 'deep-blue.svg',
  'dusk.svg', 'ember.svg', 'forest.svg', 'ink.svg', 'lavender.svg', 'midnight.svg',
  'moss.svg', 'ocean.svg', 'plum.svg', 'sage.svg', 'sand.svg', 'sunrise.svg',
  'pattern-diagonal.svg', 'pattern-dots.svg', 'pattern-grid.svg', 'pattern-paper.svg',
  'theme-aurora.svg', 'theme-bloom.svg', 'theme-charcoal.svg', 'theme-horizon.svg',
  'theme-linen.svg', 'theme-midnight.svg', 'theme-mist.svg', 'theme-obsidian.svg',
  'theme-paper.svg', 'theme-sandstone.svg', 'theme-slate.svg', 'theme-vellum.svg',
]);

function repoint(screen: Screen): Screen {
  const bg = screen.backgroundImage;
  if (typeof bg !== 'string' || !bg.startsWith(OLD_PREFIX)) return screen;
  const file = bg.slice(OLD_PREFIX.length);
  if (!SHIPPED_FILES.has(file)) return screen;
  return { ...screen, backgroundImage: NEW_PREFIX + file };
}

export const v10ToV11 = {
  version: 11,
  description: 'Starter backgrounds moved to /starter-backgrounds/',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 11,
    ...mapConfigScreens(config, repoint),
  }),
};
