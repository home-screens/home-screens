'use client';

import type { NewsConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import TickerMarquee from './TickerMarquee';
import { ModuleLoadingState, ModuleEmptyState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { newsUrl } from '@/lib/fetch-keys';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import { useScaledFontSize } from '@/hooks/useScaledFontSize';
import { SectionHeader } from './shared/SectionHeader';
import { MetadataText } from './shared/MetadataText';

interface NewsModuleProps {
  config: NewsConfig;
  style: ModuleStyle;
}

interface NewsItem {
  title: string;
  pubDate: string;
  description: string;
}

function formatTime(pubDate: string): string {
  if (!pubDate) return '';
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Headline view — single rotating headline (original behavior) */
function HeadlineView({ items, rotateMs }: { items: NewsItem[]; rotateMs: number }) {
  const index = useRotatingIndex(items.length, rotateMs);
  const item = items[index % items.length];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <SectionHeader>News</SectionHeader>
      <p className="text-center leading-relaxed">
        {item?.title ?? 'Loading news...'}
      </p>
    </div>
  );
}

/** List view — vertical scrollable list with optional timestamps and descriptions */
function ListView({ items, showTimestamp, showDescription, accentColor }: {
  items: NewsItem[];
  showTimestamp: boolean;
  showDescription: boolean;
  accentColor?: string;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionHeader className="shrink-0 mb-2">News</SectionHeader>
      <div className="flex flex-col gap-2.5 overflow-y-auto min-h-0 pr-1">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2" style={{ fontSize: '0.9em' }}>
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
              style={{ backgroundColor: accentColor ?? 'rgba(255,255,255,0.35)' }}
            />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="leading-snug line-clamp-2">{item.title}</span>
              {showDescription && item.description && (
                <MetadataText className="leading-snug line-clamp-2">
                  {item.description}
                </MetadataText>
              )}
              {showTimestamp && item.pubDate && (
                <MetadataText size="xs">
                  {formatTime(item.pubDate)}
                </MetadataText>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ticker view — horizontal scrolling marquee */
function TickerView({ items, speed }: { items: NewsItem[]; speed: number }) {
  return (
    <TickerMarquee itemCount={items.length} speed={speed} gap={8}>
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-3 whitespace-nowrap" style={{ fontSize: '0.9em' }}>
          <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.35)' }} />
          <span>{item.title}</span>
        </span>
      ))}
    </TickerMarquee>
  );
}

/** Compact view — minimal dense list */
function CompactView({ items, showTimestamp }: { items: NewsItem[]; showTimestamp: boolean }) {
  return (
    <div className="flex flex-col justify-center h-full overflow-hidden gap-1 px-1">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-baseline justify-between gap-2"
          style={{ fontSize: '0.85em' }}
        >
          <span className="truncate leading-snug">{item.title}</span>
          {showTimestamp && item.pubDate && (
            <MetadataText className="shrink-0 tabular-nums">
              {formatTime(item.pubDate)}
            </MetadataText>
          )}
        </div>
      ))}
    </div>
  );
}

export default function NewsModule({ config, style }: NewsModuleProps) {
  const [data, error] = useFetchData<{ items: NewsItem[] }>(
    newsUrl(config),
    config.refreshIntervalMs ?? 300000,
  );
  const allItems = data?.items ?? [];
  const view = config.view ?? 'headline';
  const maxItems = config.maxItems ?? 10;
  const items = view === 'headline' ? allItems : allItems.slice(0, maxItems);
  const { containerRef, scaledFontSize } = useScaledFontSize(style.fontSize, 0.07);

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading news…" error={error} />;
  }

  if (allItems.length === 0) {
    return <ModuleEmptyState style={style} message="No headlines" />;
  }

  return (
    <ModuleWrapper style={style}>
      <div ref={containerRef} className="h-full" style={{ fontSize: `${scaledFontSize}px` }}>
      {view === 'headline' && (
        <HeadlineView items={allItems} rotateMs={config.rotateIntervalMs ?? 10000} />
      )}
      {view === 'list' && (
        <ListView
          items={items}
          showTimestamp={config.showTimestamp ?? false}
          showDescription={config.showDescription ?? false}
          accentColor={config.accentColor}
        />
      )}
      {view === 'ticker' && (
        <TickerView items={items} speed={config.tickerSpeed ?? 5} />
      )}
      {view === 'compact' && (
        <CompactView items={items} showTimestamp={config.showTimestamp ?? false} />
      )}
      </div>
    </ModuleWrapper>
  );
}
