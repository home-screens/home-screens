'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, NewsConfig, NewsView } from '@/types/config';

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
  const t = useTranslate('editor');
  const NEWS_VIEWS: { value: NewsView; label: string }[] = [
    { value: 'headline', label: t('configSections.news.viewHeadline') },
    { value: 'list', label: t('configSections.news.viewList') },
    { value: 'ticker', label: t('configSections.news.viewTicker') },
    { value: 'compact', label: t('configSections.news.viewCompact') },
  ];
  const { config: c, set } = useModuleConfig<Partial<NewsConfig>>(mod, screenId);

  const feedUrl = (c.feedUrl as string) || '';
  const isCustom = feedUrl !== '' && !PRESET_URLS.has(feedUrl);
  const view = c.view ?? 'headline';

  return (
    <>
      <LabeledField label={t('configSections.news.feedSource')}>
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
          <option value="__custom__">{t('configSections.news.customUrlOption')}</option>
        </select>
      </LabeledField>
      {isCustom && (
        <LabeledInput
          label={t('configSections.news.customRssFeedUrl')}
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
      {(view === 'headline' || view === 'list') && (
        <Toggle label={t('common.showTitle')} checked={c.showTitle !== false} onChange={(v) => set({ showTitle: v })} />
      )}
      {view === 'headline' && (
        <Slider
          label={t('configSections.news.rotateHeadlines')}
          value={(c.rotateIntervalMs ?? 10000) / 1000}
          min={3}
          max={30}
          onChange={(v) => set({ rotateIntervalMs: v * 1000 })}
        />
      )}
      {view !== 'headline' && (
        <Slider
          label={t('configSections.news.maxItems')}
          value={c.maxItems ?? 10}
          min={3}
          max={20}
          onChange={(v) => set({ maxItems: v })}
        />
      )}
      {view === 'ticker' && (
        <Slider
          label={t('configSections.news.tickerSpeed')}
          value={c.tickerSpeed ?? 5}
          min={1}
          max={15}
          onChange={(v) => set({ tickerSpeed: v })}
        />
      )}
      {(view === 'list' || view === 'compact') && (
        <Toggle
          label={t('configSections.news.showTimestamp')}
          checked={c.showTimestamp ?? false}
          onChange={(v) => set({ showTimestamp: v })}
        />
      )}
      {view === 'list' && (
        <Toggle
          label={t('common.showDescription')}
          checked={c.showDescription ?? false}
          onChange={(v) => set({ showDescription: v })}
        />
      )}
      {view === 'list' && (
        <ColorPicker
          label={t('configSections.news.bulletColor')}
          value={c.accentColor ?? ''}
          onChange={(v) => set({ accentColor: v || undefined })}
        />
      )}
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="news"
        fallbackMs={300_000}
        unit="seconds"
        min={60}
        max={3600}
        step={60}
      />
    </>
  );
}
