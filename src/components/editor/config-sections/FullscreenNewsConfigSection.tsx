'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { NewsSourcesFields } from './news/NewsSourcesFields';
import { NewsFiltersFields } from './news/NewsFiltersFields';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { FullscreenNewsConfig, FullscreenNewsView, ModuleInstance } from '@/types/config';

type Config = Partial<FullscreenNewsConfig>;

export function FullscreenNewsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const typographySizeOptions = useTypographySizeOptions();

  const VIEWS: { value: FullscreenNewsView; label: string }[] = [
    { value: 'story', label: t('configSections.fullscreen-news.viewStory') },
    { value: 'front-page', label: t('configSections.fullscreen-news.viewFrontPage') },
  ];

  return (
    <>
      <NewsSourcesFields config={c} set={set} />

      <LabeledSelect
        label={t('configSections.fullscreen-news.view')}
        value={c.view ?? 'story'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      <Slider
        label={t('configSections.fullscreen-news.rotateSeconds')}
        value={(c.rotateIntervalMs ?? 15000) / 1000}
        min={5}
        max={60}
        onChange={(v) => set({ rotateIntervalMs: v * 1000 })}
      />

      <Slider
        label={t('configSections.fullscreen-news.maxItems')}
        value={c.maxItems ?? 12}
        min={3}
        max={24}
        onChange={(v) => set({ maxItems: v })}
      />

      <Toggle
        label={t('configSections.news.showImages')}
        checked={c.showImages !== false}
        onChange={(v) => set({ showImages: v })}
      />
      <Toggle
        label={t('common.showDescription')}
        checked={c.showDescription !== false}
        onChange={(v) => set({ showDescription: v })}
      />
      <Toggle
        label={t('configSections.news.showSource')}
        checked={c.showSource !== false}
        onChange={(v) => set({ showSource: v })}
      />
      <Toggle
        label={t('configSections.news.showTimestamp')}
        checked={c.showTimestamp !== false}
        onChange={(v) => set({ showTimestamp: v })}
      />
      <Toggle
        label={t('configSections.fullscreen-news.showTime')}
        checked={c.showTime !== false}
        onChange={(v) => set({ showTime: v })}
      />

      <LabeledSelect
        label={t('configSections.fullscreen-news.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={typographySizeOptions}
      />

      {/* An empty accentColor means "follow the theme". The picker can only
          ever write a colour, so the way back to empty is its own toggle. */}
      <Toggle
        label={t('configSections.fullscreen-news.accentTheme')}
        checked={!c.accentColor}
        onChange={(auto) => set({ accentColor: auto ? '' : '#f59e0b' })}
      />
      {c.accentColor ? (
        <ColorPicker
          label={t('configSections.fullscreen-news.accentColor')}
          value={c.accentColor}
          onChange={(v) => set({ accentColor: v })}
        />
      ) : null}

      <NewsFiltersFields config={c} set={set} />

      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="fullscreen-news"
        fallbackMs={300_000}
        unit="seconds"
        min={60}
        max={3600}
        step={60}
      />
    </>
  );
}
