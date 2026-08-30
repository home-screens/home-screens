import type { TranslateFn } from '@/i18n';
import type { NewsConfig, NewsTapAction, NewsTickerSeparator } from '@/types/config';
import type { NewsDisplayItem } from '@/lib/news/types';

/** NewsConfig with every optional display field resolved to its default. */
export interface ResolvedNewsConfig {
  rotateIntervalMs: number;
  showTimestamp: boolean;
  showDescription: boolean;
  tickerSpeed: number;
  accentColor?: string;
  title?: string;
  showTitle: boolean;
  showSource: boolean;
  showImages: boolean;
  descriptionLines: number;
  singleLineTitles: boolean;
  showCounter: boolean;
  highlightBreaking: boolean;
  showNewMarker: boolean;
  cardColumns: number;
  tickerSeparator: NewsTickerSeparator;
  tapAction: NewsTapAction;
}

export function resolveNewsConfig(c: NewsConfig): ResolvedNewsConfig {
  return {
    rotateIntervalMs: Math.max(1000, c.rotateIntervalMs ?? 10_000),
    showTimestamp: c.showTimestamp ?? false,
    showDescription: c.showDescription ?? false,
    tickerSpeed: c.tickerSpeed ?? 5,
    accentColor: c.accentColor || undefined,
    title: c.title?.trim() || undefined,
    showTitle: c.showTitle ?? true,
    showSource: c.showSource ?? true,
    showImages: c.showImages ?? true,
    descriptionLines: Math.min(4, Math.max(1, Math.round(c.descriptionLines ?? 2))),
    singleLineTitles: c.singleLineTitles ?? false,
    showCounter: c.showCounter ?? true,
    highlightBreaking: c.highlightBreaking ?? false,
    showNewMarker: c.showNewMarker ?? false,
    cardColumns: Math.min(3, Math.max(1, Math.round(c.cardColumns ?? 2))),
    tickerSeparator: c.tickerSeparator ?? 'dot',
    tapAction: c.tapAction ?? 'qr',
  };
}

/** A hub / touch command routed to the active view. `seq` makes repeats distinct. */
export interface ViewCommand {
  seq: number;
  action: string;
}

export interface NewsViewProps {
  items: NewsDisplayItem[];
  config: ResolvedNewsConfig;
  t: TranslateFn;
  locale: string;
  newKeys: ReadonlySet<string>;
  /** Present only when a tap does something; views render plain rows otherwise. */
  onTap?: (item: NewsDisplayItem) => void;
  command: ViewCommand | null;
  /** Feed labels that failed this refresh, for the unavailable footer. */
  unavailable: string[];
  /**
   * The module's scaled font size in px. Views that measure their rows
   * (list paging, card rows) re-measure when it changes, since the box
   * itself keeps its size while every row grows.
   */
  fontScaleKey: number;
}
