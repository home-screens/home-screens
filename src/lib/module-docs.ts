import type { BuiltinModuleType, ModuleType } from '@/types/config';

const DOCS_BASE = 'https://homescreens.dev/docs/module-reference';

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
  'sticky-note': 'sticky-note',
  greeting: 'greeting',
  todoist: 'todoist',
  'garbage-day': 'garbage-day',
  affirmations: 'affirmations',
  'meal-planner': 'meal-planner',
  'chore-chart': 'chore-chart',
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
 * Deep link to a module's section of the docs, or null for a plugin (whose
 * documentation lives with the plugin, not on the Module Reference page).
 */
export function moduleDocsUrl(type: ModuleType): string | null {
  const anchor = (MODULE_DOCS_ANCHOR as Record<string, string | undefined>)[type];
  return anchor ? `${DOCS_BASE}#${anchor}` : null;
}
