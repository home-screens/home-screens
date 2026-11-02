'use client';

import { useState } from 'react';
import { isSinglePhotoMode } from '@/lib/fullscreen-photo-mode';
import { photoThemeTokens, inheritedPhotoTheme, defaultClockBackdrop, autoClockBackdropColor } from '@/lib/fullscreen-photo-theme';
import { useActiveFullscreenTheme } from '@/hooks/useFullscreenThemeTokens';
import ColorPicker from '@/components/ui/ColorPicker';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, FullscreenPhotoConfig, FullscreenPhotoTransition } from '@/types/config';
import PhoneSurfaceLinks from '@/components/editor/PhoneSurfaceLinks';
import PicturePicker from '@/components/editor/picture-picker/PicturePicker';
import PhotoSourceFields from '@/components/editor/photo-source/PhotoSourceFields';
import { pictureDisplayName, tileThumbnailUrl } from '@/lib/media-paths';
import { libraryFileFromServeUrl } from '@/lib/library-client';

type Config = Partial<FullscreenPhotoConfig>;

export function FullscreenPhotoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');

  const MODE_OPTIONS = [
    { value: 'slideshow', label: t('configSections.fullscreen-photo.modeSlideshow') },
    { value: 'single', label: t('configSections.fullscreen-photo.modeSingle') },
  ] as const;

  const TRANSITION_OPTIONS: { value: FullscreenPhotoTransition; label: string }[] = [
    { value: 'fade', label: t('configSections.fullscreen-photo.transitionFade') },
    { value: 'slide', label: t('configSections.fullscreen-photo.transitionSlide') },
    { value: 'zoom', label: t('configSections.fullscreen-photo.transitionZoom') },
    { value: 'none', label: t('configSections.fullscreen-photo.transitionNone') },
  ];

  const OBJECT_FIT_OPTIONS: { value: 'cover' | 'contain' | 'fill'; label: string }[] = [
    { value: 'cover', label: t('common.objectFitCover') },
    { value: 'contain', label: t('common.objectFitContain') },
    { value: 'fill', label: t('common.objectFitFill') },
  ];

  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const isSinglePhoto = isSinglePhotoMode(c);

  const showClock = c.showClock ?? true;
  // Unset draws the backdrop's own color and strength, so both controls start
  // there, and landing back on either clears its field so a later theme or
  // color change still moves it. The theme resolves the way the canvas
  // preview resolves it.
  const activeFullscreenTheme = useActiveFullscreenTheme();
  const photoTheme = photoThemeTokens(c.theme, activeFullscreenTheme);
  const autoBackdropColor = autoClockBackdropColor(photoTheme);
  const themeBackdrop = defaultClockBackdrop(photoTheme, c.clockBackdropColor);
  const clockBackdrop = c.clockBackdrop ?? themeBackdrop;

  return (
    <>
      {/* Theme Override */}
      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey={inheritedPhotoTheme(activeFullscreenTheme).fromSettings
          ? 'configSections.fullscreen-photo.themeDefault'
          : 'configSections.fullscreen-photo.themeDefaultMidnight'}
      />

      {/* Slideshow or one picture. A single picture can come from any
          source the Image Library offers, so the mode shows for every source. */}
      <LabeledSelect
        label={t('configSections.fullscreen-photo.mode')}
        value={isSinglePhoto ? 'single' : 'slideshow'}
        onChange={(v) => set({ file: v === 'single' ? '' : undefined })}
        options={MODE_OPTIONS}
      />

      {isSinglePhoto ? (
        <div>
          <span className="text-xs text-hs-text-muted">{t('configSections.fullscreen-photo.photo')}</span>
          <div className="flex gap-1.5 mt-1">
            <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
              {c.file ? pictureDisplayName(libraryFileFromServeUrl(c.file) ?? c.file).replace(/\.[^.]+$/, '') : t('configSections.fullscreen-photo.noneSelected')}
            </div>
            <Button size="sm" onClick={() => setShowPhotoPicker(true)}>
              {t('configSections.fullscreen-photo.choose')}
            </Button>
          </div>
          {c.file && (
            <div className="mt-1.5">
              <img
                src={tileThumbnailUrl(c.file)}
                alt=""
                loading="lazy"
                className="w-full max-h-32 rounded object-cover border border-hs-border-strong"
              />
            </div>
          )}
        </div>
      ) : (
        <PhotoSourceFields use="stream" value={c} onChange={set} />
      )}

      {/* Slide interval, only for slideshow mode */}
      {!isSinglePhoto && (
        <Slider
          label={t('configSections.fullscreen-photo.slideIntervalSeconds')}
          value={(c.intervalMs ?? 30000) / 1000}
          min={5}
          max={300}
          step={5}
          onChange={(v) => set({ intervalMs: v * 1000 })}
        />
      )}

      {/* Transition & Object Fit row */}
      <div className="flex gap-2">
        {!isSinglePhoto && (
          <LabeledSelect
            label={t('configSections.fullscreen-photo.transition')}
            value={c.transition ?? 'fade'}
            onChange={(v) => set({ transition: v })}
            options={TRANSITION_OPTIONS}
            fieldClassName="flex-1"
          />
        )}
        <LabeledSelect
          label={t('common.objectFit')}
          value={c.objectFit ?? 'cover'}
          onChange={(v) => set({ objectFit: v })}
          options={OBJECT_FIT_OPTIONS}
          fieldClassName="flex-1"
        />
      </div>

      {/* Toggles */}
      {!isSinglePhoto && (
        <Toggle
          label={t('configSections.fullscreen-photo.shuffleOrder')}
          checked={c.shuffle ?? false}
          onChange={(v) => set({ shuffle: v })}
        />
      )}
      <Toggle
        label={t('configSections.fullscreen-photo.kenBurnsEffect')}
        checked={c.kenBurns ?? false}
        onChange={(v) => set({ kenBurns: v })}
      />
      <Toggle
        label={t('configSections.fullscreen-photo.showClockOverlay')}
        checked={showClock}
        onChange={(v) => set({ showClock: v })}
      />
      {showClock && (
        <>
          <Slider
            label={t('configSections.fullscreen-photo.clockBackground')}
            value={clockBackdrop}
            min={0}
            max={100}
            displayValue={`${clockBackdrop}%`}
            onChange={(v) => set({ clockBackdrop: v === themeBackdrop ? undefined : v })}
          />
          {/* Plain "Color", read as the Clock Background's by sitting right
              under it: the picker row leaves its label about 95px beside the
              swatch, and "Clock Background Color" wrapped to three lines. */}
          <ColorPicker
            label={t('fields.color')}
            value={c.clockBackdropColor || autoBackdropColor}
            defaultValue={autoBackdropColor}
            resetLabel={t('common.resetToDefault')}
            onChange={(v) => set({ clockBackdropColor: v.toLowerCase() === autoBackdropColor ? undefined : v })}
          />
        </>
      )}

      <PhoneSurfaceLinks context="photos" />

      {showPhotoPicker && (
        <PicturePicker
          mode="pick-image"
          currentValue={c.file || undefined}
          onSelectImage={(serveUrl) => set({ file: serveUrl })}
          onClose={() => setShowPhotoPicker(false)}
        />
      )}
    </>
  );
}
