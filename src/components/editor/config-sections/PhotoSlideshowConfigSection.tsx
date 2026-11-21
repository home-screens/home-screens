'use client';

import { useTranslate } from '@/i18n';
import Slider from '@/components/ui/Slider';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import PhotoSourceFields from '@/components/editor/photo-source/PhotoSourceFields';
import type { ModuleInstance, PhotoSlideshowConfig } from '@/types/config';

export function PhotoSlideshowConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');

  const TRANSITIONS = [
    { value: 'fade', label: t('configSections.photo-slideshow.transitionFade') },
    { value: 'slide', label: t('configSections.fullscreen-photo.transitionSlide') },
    { value: 'zoom', label: t('configSections.fullscreen-photo.transitionZoom') },
    { value: 'none', label: t('configSections.photo-slideshow.transitionNone') },
  ] as const;

  const OBJECT_FITS = [
    { value: 'cover', label: t('common.objectFitCover') },
    { value: 'contain', label: t('common.objectFitContain') },
    { value: 'fill', label: t('common.objectFitFill') },
  ] as const;

  const { config: c, set } = useModuleConfig<Partial<PhotoSlideshowConfig>>(mod, screenId);

  return (
    <>
      <PhotoSourceFields use="stream" value={c} onChange={set} />

      <Slider
        label={t('configSections.photo-slideshow.slideInterval')}
        value={(c.intervalMs ?? 30000) / 1000}
        min={5}
        max={300}
        step={5}
        onChange={(v) => set({ intervalMs: v * 1000 })}
      />

      <div className="flex gap-2">
        <LabeledSelect
          label={t('configSections.photo-slideshow.transition')}
          value={c.transition || 'fade'}
          onChange={(v) => set({ transition: v })}
          options={TRANSITIONS}
          fieldClassName="flex-1"
        />
        <LabeledSelect
          label={t('common.objectFit')}
          value={c.objectFit || 'cover'}
          onChange={(v) => set({ objectFit: v })}
          options={OBJECT_FITS}
          fieldClassName="flex-1"
        />
      </div>

      <Toggle
        label={t('configSections.fullscreen-photo.shuffleOrder')}
        checked={c.shuffle ?? false}
        onChange={(v) => set({ shuffle: v })}
      />
      <Toggle
        label={t('configSections.fullscreen-photo.kenBurnsEffect')}
        checked={c.kenBurns ?? false}
        onChange={(v) => set({ kenBurns: v })}
      />
    </>
  );
}
