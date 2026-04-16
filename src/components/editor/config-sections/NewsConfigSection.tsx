'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, NewsView } from '@/types/config';

const NEWS_VIEWS: { value: NewsView; label: string }[] = [
  { value: 'headline', label: 'Headline (Rotating)' },
  { value: 'list', label: 'List' },
  { value: 'ticker', label: 'Ticker (Scrolling)' },
  { value: 'compact', label: 'Compact' },
];

const NEWS_FEED_PRESETS = [
  { label: 'BBC News', url: '' },
  { label: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
  { label: 'Associated Press', url: 'https://feedx.net/rss/ap.xml' },
  { label: 'Reuters', url: 'https://news.google.com/rss/search?q=source:reuters&hl=en-US&gl=US&ceid=US:en' },
  { label: 'ABC News', url: 'https://feeds.abcnews.com/abcnews/topstories' },
  { label: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main' },
  { label: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { label: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories' },
];

const PRESET_URLS = new Set(NEWS_FEED_PRESETS.map((p) => p.url));

export function NewsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    feedUrl?: string; view?: NewsView; refreshIntervalMs?: number; rotateIntervalMs?: number;
    maxItems?: number; showTimestamp?: boolean; showDescription?: boolean; tickerSpeed?: number;
    accentColor?: string;
  }>(mod, screenId);

  const feedUrl = (c.feedUrl as string) || '';
  const isCustom = feedUrl !== '' && !PRESET_URLS.has(feedUrl);
  const view = c.view ?? 'headline';

  return (
    <>
      <LabeledField label="Feed Source">
        <select
          value={isCustom ? '__custom__' : feedUrl}
          onChange={(e) => {
            const val = e.target.value;
            set({ feedUrl: val === '__custom__' ? 'https://' : val });
          }}
          className={INPUT_CLASS}
        >
          {NEWS_FEED_PRESETS.map((p) => (
            <option key={p.url} value={p.url}>{p.label}</option>
          ))}
          <option value="__custom__">Custom URL…</option>
        </select>
      </LabeledField>
      {isCustom && (
        <LabeledInput
          label="Custom RSS Feed URL"
          value={feedUrl}
          onChange={(v) => set({ feedUrl: v })}
          placeholder="https://example.com/feed.xml"
        />
      )}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={NEWS_VIEWS}
      />
      {view === 'headline' && (
        <Slider
          label="Rotate Headlines (seconds)"
          value={(c.rotateIntervalMs ?? 10000) / 1000}
          min={3}
          max={30}
          onChange={(v) => set({ rotateIntervalMs: v * 1000 })}
        />
      )}
      {view !== 'headline' && (
        <Slider
          label="Max Items"
          value={c.maxItems ?? 10}
          min={3}
          max={20}
          onChange={(v) => set({ maxItems: v })}
        />
      )}
      {view === 'ticker' && (
        <Slider
          label="Ticker Speed (sec/item)"
          value={c.tickerSpeed ?? 5}
          min={1}
          max={15}
          onChange={(v) => set({ tickerSpeed: v })}
        />
      )}
      {(view === 'list' || view === 'compact') && (
        <Toggle
          label="Show Timestamp"
          checked={c.showTimestamp ?? false}
          onChange={(v) => set({ showTimestamp: v })}
        />
      )}
      {view === 'list' && (
        <Toggle
          label="Show Description"
          checked={c.showDescription ?? false}
          onChange={(v) => set({ showDescription: v })}
        />
      )}
      {view === 'list' && (
        <ColorPicker
          label="Bullet Color"
          value={c.accentColor ?? ''}
          onChange={(v) => set({ accentColor: v || undefined })}
        />
      )}
      <Slider
        label="Refresh (seconds)"
        value={(c.refreshIntervalMs ?? 300000) / 1000}
        min={60}
        max={3600}
        step={60}
        onChange={(v) => set({ refreshIntervalMs: v * 1000 })}
      />
    </>
  );
}
