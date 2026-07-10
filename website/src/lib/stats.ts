// Single source of truth for product counts referenced across the website
// (marketing pages, docs, React components, and Markdoc body text via the
// `$stats` variable wired in `src/markdoc/config.js`).
//
// These numbers are hand-typed but verified by a Vitest test in the main
// repo at `src/lib/__tests__/website-stats.test.ts`, which imports this
// file and asserts every value matches the live registry / source files.
// Bump a number here, run `npm test` at the repo root, and the failing
// assertion tells you exactly what to update.

export const MODULE_COUNT = 42;
export const MODULE_CATEGORY_COUNT = 8;
export const WEATHER_PROVIDER_COUNT = 9;
export const STANDINGS_LEAGUE_COUNT = 12;
export const CLOCK_VIEW_COUNT = 18;
export const WEATHER_VIEW_COUNT = 8;
export const SHAPE_VIEW_COUNT = 15;
export const LOCALE_COUNT = 7;

// Native names in the order they ship; rendered as a single dotted string
// on the marketing site so visitors recognize their own language at a glance.
export const LOCALE_NATIVE_NAMES = [
  'English',
  'Deutsch',
  'Français',
  'Español',
  'Nederlands',
  'Português',
  'Dansk',
] as const;

export const stats = {
  moduleCount: MODULE_COUNT,
  categoryCount: MODULE_CATEGORY_COUNT,
  weatherProviderCount: WEATHER_PROVIDER_COUNT,
  standingsLeagueCount: STANDINGS_LEAGUE_COUNT,
  clockViewCount: CLOCK_VIEW_COUNT,
  weatherViewCount: WEATHER_VIEW_COUNT,
  shapeViewCount: SHAPE_VIEW_COUNT,
  localeCount: LOCALE_COUNT,
} as const;
