/**
 * The backgrounds that ship with Home Screens.
 *
 * A fresh install used to open the background picker on Unsplash, dead-end in
 * "add a free API key", and offer nothing else, so the first thing anyone
 * wants to change ("make the wall not black") needed a signup first. These
 * walls live in `public/backgrounds/themes/` as tiny SVGs, need no key, and
 * paint at any display size.
 *
 * Three groups:
 *  - `theme`   one wall per fullscreen theme, painted from the theme's own
 *              `bg` + `bgImage` tokens so a regular screen can sit next to a
 *              fullscreen screen without a visible seam.
 *  - `color`   gradients, half of them light.
 *  - `pattern` quiet textures.
 *
 * The SVG files are generated from this catalog by
 * `npm run backgrounds:build` (`scripts/build-starter-backgrounds.ts`); a
 * unit test fails when a committed file no longer matches its entry here, so
 * the picker thumbnail (which is the same file) and the wall can never
 * disagree, and a new theme cannot ship without its wall.
 */

import { FULLSCREEN_THEMES } from './fullscreen-themes';
import type { WallPaint } from './starter-background-svg';

export type StarterBackgroundGroup = 'theme' | 'color' | 'pattern';

export interface StarterBackground {
  /** Stable id; also the picker's test id suffix and the i18n key for named walls. */
  id: string;
  group: StarterBackgroundGroup;
  /** File name under `public/backgrounds/themes/`. */
  file: string;
  /** The path stored in `Screen.backgroundImage`. */
  path: string;
  /** Theme walls only: the fullscreen theme this wall is painted from. */
  themeId?: string;
  paint: WallPaint;
}

export const STARTER_BACKGROUNDS_DIR = 'public/backgrounds/themes';

function entry(id: string, group: StarterBackgroundGroup, paint: WallPaint, themeId?: string): StarterBackground {
  const file = `${id}.svg`;
  return { id, group, file, path: `/backgrounds/themes/${file}`, paint, ...(themeId ? { themeId } : {}) };
}

/**
 * A two- or three-stop gradient from the top-left corner down to two thirds
 * of the way across the bottom edge, in fractions of the box, so it leans
 * the same way on every wall. This is the vector the first eight walls
 * shipped with; it is not a CSS angle, because a CSS angle would render at a
 * different slope on portrait and landscape displays.
 */
function slope(...stops: string[]): WallPaint {
  return { bg: stops[0].split(' ')[0], vector: [0, 0, 0.65, 1], stops };
}

const THEME_WALLS: StarterBackground[] = FULLSCREEN_THEMES.map((theme) =>
  entry(`theme-${theme.id}`, 'theme', { bg: theme.tokens.bg, bgImage: theme.tokens.bgImage }, theme.id),
);

// The first eight keep the ids and paths they shipped with, so existing
// configs that point at `/backgrounds/themes/dusk.svg` keep their wall.
const COLOR_WALLS: StarterBackground[] = [
  entry('midnight', 'color', slope('#0f2027', '#203a43 55%', '#2c5364')),
  entry('dusk', 'color', slope('#3a1c71', '#d76d77 60%', '#ffaf7b')),
  entry('forest', 'color', slope('#134e5e', '#71b280')),
  entry('deep-blue', 'color', slope('#1e3c72', '#2a5298')),
  entry('charcoal', 'color', slope('#232526', '#414345')),
  entry('sunrise', 'color', slope('#ff7e5f', '#feb47b')),
  entry('plum', 'color', slope('#41295a', '#2f0743')),
  entry('aurora', 'color', slope('#0f3443', '#34e89e')),
  entry('ocean', 'color', slope('#0b2a45', '#155e75 55%', '#3ba7b3')),
  entry('ember', 'color', slope('#1f0a0a', '#7a1f1f 55%', '#d9652b')),
  entry('ink', 'color', slope('#04060d', '#0d1430 60%', '#1b2a5a')),
  entry('moss', 'color', slope('#14261a', '#2f5233 60%', '#5a8a4a')),
  entry('copper', 'color', slope('#2b1a10', '#7a4a26 60%', '#c98a4b')),
  entry('lavender', 'color', slope('#4a3b7a', '#8a78c2 60%', '#cbbdea')),
  entry('cloud', 'color', slope('#f4f7fb', '#dbe3ee 60%', '#c3cfdf')),
  entry('sand', 'color', slope('#f7efe2', '#e8d7bd 60%', '#d5bd99')),
  entry('sage', 'color', slope('#eef3ea', '#cfdcc8 60%', '#a9bfa0')),
  entry('blush', 'color', slope('#fdf1f2', '#f6d4d8 60%', '#e9b3ba')),
];

const PATTERN_WALLS: StarterBackground[] = [
  // Sized for a wall seen from across a room, not for the thumbnail.
  entry('pattern-dots', 'pattern', { pattern: 'dots', bg: '#121212', ink: 'rgba(255,255,255,0.18)', pitch: 32 }),
  entry('pattern-grid', 'pattern', { pattern: 'grid', bg: '#14161c', ink: 'rgba(255,255,255,0.09)', pitch: 48 }),
  entry('pattern-diagonal', 'pattern', { pattern: 'diagonal', bg: '#1c1c1e', ink: 'rgba(255,255,255,0.07)', pitch: 28 }),
  entry('pattern-paper', 'pattern', { pattern: 'dots', bg: '#f3f0ea', ink: 'rgba(0,0,0,0.12)', pitch: 32 }),
];

export const STARTER_BACKGROUNDS: StarterBackground[] = [...THEME_WALLS, ...COLOR_WALLS, ...PATTERN_WALLS];

export function starterBackgroundsIn(group: StarterBackgroundGroup): StarterBackground[] {
  return STARTER_BACKGROUNDS.filter((bg) => bg.group === group);
}

/** The wall painted from `themeId`, or undefined for an unknown theme. */
export function starterBackgroundForTheme(themeId: string | undefined): StarterBackground | undefined {
  return themeId ? THEME_WALLS.find((bg) => bg.themeId === themeId) : undefined;
}
