'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import SectionHeading from '@/components/ui/SectionHeading';
import ViewSelect from '@/components/editor/ViewSelect';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import { NewsSourcesFields } from './news/NewsSourcesFields';
import { NewsFiltersFields } from './news/NewsFiltersFields';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, NewsConfig, NewsTickerSeparator, NewsView } from '@/types/config';

type Config = Partial<NewsConfig>;

export function NewsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);

  const NEWS_VIEWS: { value: NewsView; label: string }[] = [
    { value: 'headline', label: t('configSections.news.viewHeadline') },
    { value: 'list', label: t('configSections.news.viewList') },
    { value: 'ticker', label: t('configSections.news.viewTicker') },
    { value: 'compact', label: t('configSections.news.viewCompact') },
    { value: 'cards', label: t('configSections.news.viewCards') },
  ];
  const SEPARATORS: { value: NewsTickerSeparator; label: string }[] = [
    { value: 'dot', label: t('configSections.news.separatorDot') },
    { value: 'pipe', label: t('configSections.news.separatorPipe') },
    { value: 'slash', label: t('configSections.news.separatorSlash') },
  ];

  const view = c.view ?? 'headline';
  const hasImages = view === 'list' || view === 'cards' || view === 'headline';
  // Every view that pages, and so has something to count.
  const hasCounter = view === 'headline' || view === 'list' || view === 'cards';
  // Ticker and compact draw no heading, so the title controls would do nothing.
  const hasHeader = view === 'headline' || view === 'list' || view === 'cards';

  return (
    <>
      <NewsSourcesFields config={c} set={set} />

      <ViewSelect value={view} onChange={(v) => set({ view: v })} options={NEWS_VIEWS} />

      {view === 'headline' && (
        <>
          <Slider
            label={t('configSections.news.rotateHeadlines')}
            value={(c.rotateIntervalMs ?? 10000) / 1000}
            min={3}
            max={30}
            onChange={(v) => set({ rotateIntervalMs: v * 1000 })}
          />
        </>
      )}

      {hasCounter && (
        <Toggle
          label={t('configSections.news.showCounter')}
          checked={c.showCounter !== false}
          onChange={(v) => set({ showCounter: v })}
        />
      )}

      {view !== 'headline' && (
        <Slider
          label={t('configSections.news.maxItems')}
          value={c.maxItems ?? 10}
          min={3}
          max={24}
          onChange={(v) => set({ maxItems: v })}
        />
      )}

      {hasImages && (
        <>
          <Toggle
            label={t('configSections.news.showImages')}
            checked={c.showImages !== false}
            onChange={(v) => set({ showImages: v })}
          />
          <Toggle
            label={t('common.showDescription')}
            checked={c.showDescription ?? false}
            onChange={(v) => set({ showDescription: v })}
          />
          {c.showDescription && (
            <Slider
              label={t('configSections.news.descriptionLines')}
              value={c.descriptionLines ?? 2}
              min={1}
              max={4}
              onChange={(v) => set({ descriptionLines: v })}
            />
          )}
          <Toggle
            label={t('configSections.news.singleLineTitles')}
            checked={c.singleLineTitles === true}
            onChange={(v) => set({ singleLineTitles: v })}
          />
        </>
      )}

      {view === 'list' && (
        <ColorPicker
          label={t('configSections.news.bulletColor')}
          value={c.accentColor ?? ''}
          onChange={(v) => set({ accentColor: v || undefined })}
        />
      )}

      {view === 'ticker' && (
        <>
          <Slider
            label={t('configSections.news.tickerSpeed')}
            value={c.tickerSpeed ?? 5}
            min={1}
            max={15}
            onChange={(v) => set({ tickerSpeed: v })}
          />
          <LabeledSelect
            label={t('configSections.news.tickerSeparator')}
            value={c.tickerSeparator ?? 'dot'}
            onChange={(v) => set({ tickerSeparator: v })}
            options={SEPARATORS}
          />
        </>
      )}

      {view === 'cards' && (
        <Slider
          label={t('configSections.news.cardColumns')}
          value={c.cardColumns ?? 2}
          min={1}
          max={3}
          onChange={(v) => set({ cardColumns: v })}
        />
      )}

      <SectionHeading>{t('configSections.news.details')}</SectionHeading>
      {hasHeader && (
        <>
          {c.showTitle !== false && (
            <LabeledInput
              label={t('configSections.news.headerText')}
              value={c.title ?? ''}
              onChange={(v) => set({ title: v || undefined })}
              placeholder={t('configSections.news.headerTextPlaceholder')}
            />
          )}
        </>
      )}
      <Toggle
        label={t('configSections.news.showSource')}
        checked={c.showSource !== false}
        onChange={(v) => set({ showSource: v })}
      />
      <Toggle
        label={t('configSections.news.showTimestamp')}
        checked={c.showTimestamp ?? false}
        onChange={(v) => set({ showTimestamp: v })}
      />
      <Toggle
        label={t('configSections.news.highlightBreaking')}
        checked={c.highlightBreaking === true}
        onChange={(v) => set({ highlightBreaking: v })}
      />
      <Toggle
        label={t('configSections.news.showNewMarker')}
        checked={c.showNewMarker === true}
        onChange={(v) => set({ showNewMarker: v })}
      />

      <NewsFiltersFields config={c} set={set} />

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
