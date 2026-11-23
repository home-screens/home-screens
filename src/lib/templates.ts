import type { ModuleType } from '@/types/config';
import type { LayoutExport } from '@/types/layout-export';

type TemplateOrientation = 'portrait' | 'landscape';

export interface TemplateMeta {
  id: string;
  name: string;
  category: string;
  portrait: string;   // filename for portrait variant
  landscape: string;   // filename for landscape variant
  screenCount: number;
  moduleTypes: ModuleType[];
}

export const TEMPLATE_CATEGORIES = [
  'All',
  'Dashboard',
  'Weather',
  'Productivity',
  'Media',
  'Sports',
  'Finance',
] as const;

export const TEMPLATE_CATALOG: TemplateMeta[] = [
  {
    id: 'family-dashboard',
    name: 'Family Dashboard',
    category: 'Dashboard',
    portrait: 'family-dashboard.json',
    landscape: 'family-dashboard-landscape.json',
    screenCount: 1,
    moduleTypes: ['clock', 'calendar', 'weather', 'chore-chart', 'countdown', 'greeting'],
  },
  {
    id: 'weather-station',
    name: 'Weather Station',
    category: 'Weather',
    portrait: 'weather-station.json',
    landscape: 'weather-station-landscape.json',
    screenCount: 1,
    moduleTypes: ['weather', 'rain-map', 'sunrise-sunset', 'air-quality', 'moon-phase'],
  },
  {
    id: 'minimal-clock',
    name: 'Minimal Clock',
    category: 'Dashboard',
    portrait: 'minimal-clock.json',
    landscape: 'minimal-clock-landscape.json',
    screenCount: 1,
    moduleTypes: ['clock'],
  },
  {
    id: 'info-board',
    name: 'Info Board',
    category: 'Finance',
    portrait: 'info-board.json',
    landscape: 'info-board-landscape.json',
    screenCount: 1,
    moduleTypes: ['news', 'stock-ticker', 'word-of-day', 'history', 'quote'],
  },
  {
    id: 'photo-frame',
    name: 'Photo Frame',
    category: 'Media',
    portrait: 'photo-frame.json',
    landscape: 'photo-frame-landscape.json',
    screenCount: 1,
    moduleTypes: ['photo-slideshow'],
  },
  {
    id: 'sports-hub',
    name: 'Sports Hub',
    category: 'Sports',
    portrait: 'sports-hub.json',
    landscape: 'sports-hub-landscape.json',
    screenCount: 1,
    moduleTypes: ['sports', 'standings'],
  },
  {
    id: 'productivity',
    name: 'Productivity',
    category: 'Productivity',
    portrait: 'productivity.json',
    landscape: 'productivity-landscape.json',
    screenCount: 1,
    moduleTypes: ['todoist', 'calendar', 'countdown', 'year-progress'],
  },
  {
    id: 'morning-dashboard',
    name: 'Morning Dashboard',
    category: 'Dashboard',
    portrait: 'morning-dashboard.json',
    landscape: 'morning-dashboard-landscape.json',
    screenCount: 1,
    moduleTypes: ['weather', 'calendar', 'traffic', 'greeting'],
  },
  {
    id: 'kitchen-display',
    name: 'Kitchen Display',
    category: 'Dashboard',
    portrait: 'kitchen-display.json',
    landscape: 'kitchen-display-landscape.json',
    screenCount: 1,
    moduleTypes: ['meal-planner', 'clock', 'calendar', 'garbage-day', 'sticky-note'],
  },
  {
    id: 'news-finance',
    name: 'News & Finance',
    category: 'Finance',
    portrait: 'news-finance.json',
    landscape: 'news-finance-landscape.json',
    screenCount: 1,
    moduleTypes: ['news', 'stock-ticker', 'crypto'],
  },
];

export function getDisplayOrientation(width: number, height: number): TemplateOrientation {
  return width >= height ? 'landscape' : 'portrait';
}

export async function loadTemplate(
  template: TemplateMeta,
  orientation: TemplateOrientation,
): Promise<LayoutExport> {
  const filename = orientation === 'landscape' ? template.landscape : template.portrait;
  const res = await fetch(`/templates/${filename}`);
  if (!res.ok) throw new Error(`Failed to load template: ${res.status}`);
  return res.json();
}
