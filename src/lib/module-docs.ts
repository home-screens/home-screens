import type { BuiltinModuleType, ModuleType } from '@/types/config';

const DOCS_ROOT = 'https://homescreens.dev/docs';
const DOCS_BASE = `${DOCS_ROOT}/module-reference`;

/**
 * Module type → its heading anchor on the docs' Module Reference page.
 *
 * The anchors are slugified from the English headings, which don't always
 * match the module type ("news" is "News Headlines", "iframe" is "Web Embed
 * (iFrame)"), so the mapping is written out rather than derived. A unit test
 * holds it complete against the registry.
 */
export const MODULE_DOCS_ANCHOR: Record<BuiltinModuleType, string> = {
  'fullscreen-calendar': 'full-screen-calendar',
  'fullscreen-chore-chart': 'full-screen-chore-chart',
  'fullscreen-meal-planner': 'full-screen-meal-planner',
  'fullscreen-weather': 'full-screen-weather',
  'fullscreen-photo': 'full-screen-photo-viewer',
  'fullscreen-news': 'full-screen-news',
  clock: 'clock',
  calendar: 'calendar',
  countdown: 'countdown',
  date: 'date',
  'year-progress': 'year-progress',
  'multi-month': 'multi-month-calendar',
  weather: 'weather',
  'moon-phase': 'moon-phase',
  'sunrise-sunset': 'sunrise-sunset',
  'air-quality': 'air-quality',
  'rain-map': 'rain-map',
  news: 'news-headlines',
  'stock-ticker': 'stock-ticker',
  crypto: 'crypto-price',
  sports: 'sports-scores',
  standings: 'sports-standings',
  'dad-joke': 'dad-joke',
  quote: 'quote-of-the-day',
  'word-of-day': 'word-of-the-day',
  history: 'this-day-in-history',
  todo: 'to-do-list',
  notes: 'notes',
  'sticky-note': 'sticky-note',
  greeting: 'greeting',
  todoist: 'todoist',
  'garbage-day': 'garbage-day',
  affirmations: 'affirmations',
  'meal-planner': 'meal-planner',
  'chore-chart': 'chore-chart',
  timetable: 'school-timetable',
  text: 'text',
  image: 'image',
  video: 'video',
  'photo-slideshow': 'photo-slideshow',
  'qr-code': 'qr-code',
  iframe: 'web-embed-i-frame',
  icon: 'icon',
  shape: 'shape-and-divider',
  'display-control': 'display-control',
  traffic: 'traffic-commute',
};

/**
 * Module type → a page of its own, for the few modules that have one.
 *
 * The Module Reference is a settings-by-settings list. Four modules are family
 * features with a walkthrough page written for a parent, which is the better
 * place to land somebody who has just asked "what is this?"; the reference
 * section for each of them is still reachable from that page.
 */
export const MODULE_DOCS_PAGE: Partial<Record<BuiltinModuleType, string>> = {
  timetable: `${DOCS_ROOT}/school-timetable`,
  todo: `${DOCS_ROOT}/lists`,
  notes: `${DOCS_ROOT}/notes`,
  'chore-chart': `${DOCS_ROOT}/chores`,
  'meal-planner': `${DOCS_ROOT}/meals`,
};

/**
 * Deep link to a module's own page where it has one, otherwise to its section
 * of the Module Reference, or null for a plugin (whose documentation lives
 * with the plugin, not on the Module Reference page).
 */
export function moduleDocsUrl(type: ModuleType): string | null {
  const page = (MODULE_DOCS_PAGE as Record<string, string | undefined>)[type];
  if (page) return page;
  const anchor = (MODULE_DOCS_ANCHOR as Record<string, string | undefined>)[type];
  return anchor ? `${DOCS_BASE}#${anchor}` : null;
}
