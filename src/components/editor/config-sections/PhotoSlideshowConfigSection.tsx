'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslate } from '@/i18n';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorData } from '@/hooks/useEditorData';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import { ImmichPhotoSourceSection } from './ImmichPhotoSourceSection';
import type { ModuleInstance } from '@/types/config';

export function PhotoSlideshowConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const PHOTO_SOURCES = [
    { value: 'local', label: t('configSections.photo-slideshow.sourceLocal') },
    { value: 'immich', label: t('configSections.photo-slideshow.sourceImmich') },
  ] as const;

  const TRANSITIONS = [
    { value: 'fade', label: t('configSections.photo-slideshow.transitionFade') },
    { value: 'none', label: t('configSections.photo-slideshow.transitionNone') },
  ] as const;

  const OBJECT_FITS = [
    { value: 'cover', label: t('common.objectFitCover') },
    { value: 'contain', label: t('common.objectFitContain') },
    { value: 'fill', label: t('common.objectFitFill') },
  ] as const;

  const { config: c, set } = useModuleConfig<{ source?: string; directory?: string; intervalMs?: number; transition?: string; objectFit?: string }>(mod, screenId);
  const [showBrowser, setShowBrowser] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const { data: secrets } = useEditorData<Record<string, boolean>>('/api/secrets');
  const hasImmichKey = !!secrets?.immich_api_key && !!secrets?.immich_url;

  const source = (c.source as string) || 'local';
  const directory = (c.directory as string) || '';

  // Fetch preview images when directory changes
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
    if (source === 'local') fetchPreviews(directory);
  }, [directory, fetchPreviews, source]);

  return (
    <>
      {/* Source selector — only show if Immich is configured */}
      {hasImmichKey && (
        <LabeledSelect
          label={t('configSections.photo-slideshow.photoSource')}
          value={source}
          onChange={(v) => set({ source: v })}
          options={PHOTO_SOURCES}
        />
      )}

      {source === 'immich' ? (
        <ImmichPhotoSourceSection config={c as Record<string, unknown>} set={set} />
      ) : (
        <>
          {/* Folder picker */}
          <div>
            <span className="text-xs text-hs-text-muted">{t('configSections.photo-slideshow.folder')}</span>
            <div className="flex gap-1.5 mt-1">
              <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                {directory || t('configSections.photo-slideshow.allPhotosRoot')}
              </div>
              <Button size="sm" onClick={() => setShowBrowser(true)}>
                {t('configSections.photo-slideshow.browse')}
              </Button>
            </div>
            {/* Photo count + preview strip */}
            {photoCount > 0 && (
              <div className="mt-1.5">
                <span className="text-[10px] text-hs-text-faint">
                  {photoCount === 1
                    ? t('configSections.photo-slideshow.photoCountOne', { count: photoCount })
                    : t('configSections.photo-slideshow.photoCountOther', { count: photoCount })}
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
              <p className="text-[10px] text-hs-text-faint mt-1">{t('configSections.photo-slideshow.noPhotosInFolder')}</p>
            )}
          </div>
        </>
      )}

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
          value={(c.transition as string) || 'fade'}
          onChange={(v) => set({ transition: v })}
          options={TRANSITIONS}
          fieldClassName="flex-1"
        />
        <LabeledSelect
          label={t('common.objectFit')}
          value={(c.objectFit as string) || 'cover'}
          onChange={(v) => set({ objectFit: v })}
          options={OBJECT_FITS}
          fieldClassName="flex-1"
        />
      </div>

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
    </>
  );
}
