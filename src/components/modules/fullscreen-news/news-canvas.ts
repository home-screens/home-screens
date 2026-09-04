import type { TranslateFn } from '@/i18n';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { colorWithAlpha } from '@/lib/module-style';
import type { NewsDisplayItem } from '@/lib/news/types';
import type { FullscreenNewsConfig, NewsTapAction, TimeFormat } from '@/types/config';

/** The historical news accent: a user colour or a theme accent still wins. */
export const NEWS_ACCENT = '#F43F5E';

/** Stories per Front Page: one lead plus a five-story grid. */
export const FRONT_PAGE_SIZE = 6;

export type NewsOrientation = 'portrait' | 'landscape';

/**
 * Canvas units for the full-screen news views. `bu` is one percent of the
 * short edge (10.8px on a 1080x1920 display) and sizes structure; `s` is the
 * same unit times the typography multiplier and sizes type, so a larger
 * typography setting buys bigger text without padding growing alongside it.
 */
export interface NewsScale {
  bu: number;
  s: number;
  width: number;
  height: number;
  orientation: NewsOrientation;
}

export function buildNewsScale(width: number, height: number, typoMul: number): NewsScale {
  const bu = Math.max(1, Math.min(width, height) / 100);
  return {
    bu,
    s: bu * typoMul,
    width,
    height,
    orientation: width > height ? 'landscape' : 'portrait',
  };
}

/** Display toggles every view reads, with the registry defaults applied. */
export interface NewsDisplayOptions {
  showDescription: boolean;
  showSource: boolean;
  showTimestamp: boolean;
  showImages: boolean;
  showTime: boolean;
  tapAction: NewsTapAction;
}

export function resolveDisplayOptions(config: FullscreenNewsConfig): NewsDisplayOptions {
  return {
    showDescription: config.showDescription ?? true,
    showSource: config.showSource ?? true,
    showTimestamp: config.showTimestamp ?? true,
    showImages: config.showImages ?? true,
    showTime: config.showTime ?? true,
    tapAction: config.tapAction ?? 'qr',
  };
}

/** Props both views share; the module resolves them once. */
export interface NewsViewContext {
  items: NewsDisplayItem[];
  scale: NewsScale;
  theme: FullscreenThemeTokens;
  accent: string;
  options: NewsDisplayOptions;
  t: TranslateFn;
  locale: string;
  /** The real current instant, ticking once a minute, for story ages. */
  now: number;
  /** Present only when a tap does something. */
  onTap?: (item: NewsDisplayItem) => void;
  timezone?: string;
  timeFormat: TimeFormat;
  /** Names of feeds that did not answer this refresh; empty when all replied. */
  unavailable: string[];
}

/**
 * The theme background at a given alpha, for scrims that must match the
 * theme (dark themes darken the story image, light themes lighten it).
 * Theme backgrounds are hex, so this always resolves; anything else is
 * returned untouched.
 */
export function themeBgAlpha(theme: FullscreenThemeTokens, alpha: number): string {
  return colorWithAlpha(theme.bg, alpha);
}

/** The colour behind a source initial: the feed colour, else the accent. */
export function sourceTint(item: NewsDisplayItem, accent: string): string {
  return item.sourceColor ?? accent;
}

/** Masthead title: the first feed's label, else the translated "News". */
export function mastheadTitle(config: FullscreenNewsConfig, t: TranslateFn): string {
  const first = Array.isArray(config.feeds) ? config.feeds.find((f) => f?.url?.trim()) : undefined;
  return first?.label?.trim() || t('news.header');
}
