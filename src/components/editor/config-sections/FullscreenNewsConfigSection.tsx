'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { NewsSourcesFields } from './news/NewsSourcesFields';
import { NewsFiltersFields } from './news/NewsFiltersFields';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import { mastheadTitle } from '@/components/modules/fullscreen-news/news-canvas';
import type { FullscreenNewsConfig, FullscreenNewsView, ModuleInstance } from '@/types/config';

type Config = Partial<FullscreenNewsConfig>;

export function FullscreenNewsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const tModules = useTranslate('modules');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const typographySizeOptions = useTypographySizeOptions();

  const VIEWS: { value: FullscreenNewsView; label: string }[] = [
    { value: 'story', label: t('configSections.fullscreen-news.viewStory') },
    { value: 'front-page', label: t('configSections.fullscreen-news.viewFrontPage') },
  ];

  return (
    <>
      <NewsSourcesFields config={c} set={set} />

      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey="configSections.fullscreen-news.themeDefault"
      />

      <LabeledSelect
        label={t('configSections.fullscreen-news.view')}
        value={c.view ?? 'story'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Only the front page has a masthead. */}
      {c.view === 'front-page' && (
        <LabeledInput
          label={t('configSections.news.headerText')}
          value={c.title ?? ''}
          onChange={(v) => set({ title: v || undefined })}
          // What the page is headed with when the box is left empty: the one feed's name, or News for several.
          placeholder={mastheadTitle({ feeds: c.feeds ?? [] }, tModules)}
        />
      )}

      <Slider
        // The front page turns pages of stories, in the news tile's words; the story view changes its one story.
        label={c.view === 'front-page' ? t('configSections.sports.rotateSeconds') : t('configSections.fullscreen-news.rotateSeconds')}
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
        label={t('configSections.news.highlightBreaking')}
        checked={c.highlightBreaking !== false}
        onChange={(v) => set({ highlightBreaking: v })}
      />
      <Toggle
        label={t('configSections.news.showNewMarker')}
        checked={c.showNewMarker === true}
        onChange={(v) => set({ showNewMarker: v })}
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
          swatches="accent"
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
