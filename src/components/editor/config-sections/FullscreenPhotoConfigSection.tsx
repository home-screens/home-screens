'use client';

import { useState, useEffect, useCallback } from 'react';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorData } from '@/hooks/useEditorData';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import { ImmichPhotoSourceSection } from './ImmichPhotoSourceSection';
import { MediaTypesFields } from './MediaTypesFields';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, FullscreenPhotoConfig, FullscreenPhotoTransition } from '@/types/config';

type Config = Partial<FullscreenPhotoConfig>;

export function FullscreenPhotoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');

  const SOURCE_OPTIONS = [
    { value: 'local', label: t('configSections.fullscreen-photo.sourceLocal') },
    { value: 'immich', label: t('configSections.fullscreen-photo.sourceImmich') },
  ] as const;

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
  const [showBrowser, setShowBrowser] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const { data: secrets } = useEditorData<Record<string, boolean>>('/api/secrets');
  const hasImmichKey = !!secrets?.immich_api_key && !!secrets?.immich_url;

  const source = (c.source as string) || 'local';
  const directory = (c.directory as string) || '';
  const isSinglePhoto = c.file !== undefined;

  const fetchPreviews = useCallback(async (dir: string) => {
    try {
      const url = dir
        ? `/api/backgrounds?directory=${encodeURIComponent(dir)}`
        : '/api/backgrounds';
      const res = await editorFetch(url);
      if (res.ok) {
        const data = await res.json();
        const images = Array.isArray(data) ? data : [];
        setPhotoCount(images.length);
        setPreviewImages(images.slice(0, 4));
      }
    } catch {
      setPreviewImages([]);
      setPhotoCount(0);
    }
  }, []);

  useEffect(() => {
    if (source === 'local' && !isSinglePhoto) fetchPreviews(directory);
  }, [directory, fetchPreviews, source, isSinglePhoto]);

  return (
    <>
      {/* Theme Override */}
      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey="configSections.fullscreen-photo.themeDefaultMidnight"
      />

      {/* Source selector — only show if Immich is configured */}
      {hasImmichKey && (
        <LabeledSelect
          label={t('configSections.fullscreen-photo.photoSource')}
          value={source as 'local' | 'immich'}
          onChange={(v) => set({ source: v })}
          options={SOURCE_OPTIONS}
        />
      )}

      {source === 'immich' ? (
        <ImmichPhotoSourceSection config={c as Record<string, unknown>} set={set} />
      ) : (
        <>
          {/* Mode toggle: Slideshow vs Single Photo */}
          <LabeledSelect
            label={t('configSections.fullscreen-photo.mode')}
            value={isSinglePhoto ? 'single' : 'slideshow'}
            onChange={(v) => {
              if (v === 'single') {
                set({ file: '', directory: '' });
              } else {
                set({ file: undefined });
              }
            }}
            options={MODE_OPTIONS}
          />

          {isSinglePhoto ? (
            /* Single photo picker */
            <div>
              <span className="text-xs text-hs-text-muted">{t('configSections.fullscreen-photo.photo')}</span>
              <div className="flex gap-1.5 mt-1">
                <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                  {c.file ? c.file.replace(/.*[/\\]/, '').replace(/\.[^.]+$/, '') : t('configSections.fullscreen-photo.noneSelected')}
                </div>
                <Button size="sm" onClick={() => setShowPhotoPicker(true)}>
                  {t('configSections.fullscreen-photo.choose')}
                </Button>
              </div>
              {c.file && (
                <div className="mt-1.5">
                  <img
                    src={c.file}
                    alt=""
                    loading="lazy"
                    className="w-full max-h-32 rounded object-cover border border-hs-border-strong"
                  />
                </div>
              )}
            </div>
          ) : (
            /* Folder picker (existing slideshow UI) */
            <div>
              <span className="text-xs text-hs-text-muted">{t('configSections.fullscreen-photo.photoFolder')}</span>
              <div className="flex gap-1.5 mt-1">
                <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                  {directory || t('configSections.fullscreen-photo.allPhotosRoot')}
                </div>
                <Button size="sm" onClick={() => setShowBrowser(true)}>
                  {t('configSections.fullscreen-photo.browse')}
                </Button>
              </div>
              {photoCount > 0 && (
                <div className="mt-1.5">
                  <span className="text-[10px] text-hs-text-faint">
                    {photoCount === 1
                      ? t('configSections.fullscreen-photo.photoCountSingular', { count: photoCount })
                      : t('configSections.fullscreen-photo.photoCountPlural', { count: photoCount })}
                  </span>
                  <div className="flex gap-1 mt-1 overflow-x-auto">
                    {previewImages.map((img) => (
                      <img
                        key={img}
                        src={img}
                        alt=""
                        loading="lazy"
                        className="w-12 h-12 rounded object-cover flex-shrink-0 border border-hs-border-strong"
                      />
                    ))}
                  </div>
                </div>
              )}
              {photoCount === 0 && (
                <p className="text-[10px] text-hs-text-faint mt-1">{t('configSections.fullscreen-photo.noPhotosInFolder')}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Photos / videos mix — only for slideshow mode */}
      {!isSinglePhoto && (
        <MediaTypesFields config={c as Record<string, unknown>} set={set} />
      )}

      {/* Slide interval — only for slideshow mode */}
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
        checked={c.showClock ?? true}
        onChange={(v) => set({ showClock: v })}
      />

      {/* Mobile hint */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.fullscreen-photo.mobileHintPrefix')}{' '}
        <span className="text-hs-text-muted">{typeof window !== 'undefined' ? `${window.location.origin}/remote` : '/remote'}</span>
      </p>

      {showBrowser && (
        <ImageBrowserModal
          mode="manage-directory"
          initialDirectory={directory}
          onSelectDirectory={(dir) => {
            set({ directory: dir });
            fetchPreviews(dir);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}

      {showPhotoPicker && (
        <ImageBrowserModal
          mode="pick-image"
          initialDirectory={directory}
          onSelectImage={(serveUrl) => {
            set({ file: serveUrl });
          }}
          onClose={() => setShowPhotoPicker(false)}
        />
      )}
    </>
  );
}
