'use client';

import { useState, useEffect, useCallback } from 'react';
import Slider from '@/components/ui/Slider';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import { ImmichPhotoSourceSection } from './ImmichPhotoSourceSection';
import type { ModuleInstance } from '@/types/config';

const PHOTO_SOURCES = [
  { value: 'local', label: 'Local Photos' },
  { value: 'immich', label: 'Immich' },
] as const;

const TRANSITIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'none', label: 'None' },
] as const;

const OBJECT_FITS = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'fill', label: 'Fill' },
] as const;

export function PhotoSlideshowConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ source?: string; directory?: string; intervalMs?: number; transition?: string; objectFit?: string }>(mod, screenId);
  const [showBrowser, setShowBrowser] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [hasImmichKey, setHasImmichKey] = useState(false);

  const source = (c.source as string) || 'local';
  const directory = (c.directory as string) || '';

  useEffect(() => {
    editorFetch('/api/secrets').then(async (res) => {
      if (res.ok) {
        const data: Record<string, boolean> = await res.json();
        setHasImmichKey(!!data.immich_api_key && !!data.immich_url);
      }
    }).catch(() => {});
  }, []);

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
          label="Photo Source"
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
            <span className="text-xs text-hs-text-muted">Folder</span>
            <div className="flex gap-1.5 mt-1">
              <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                {directory || 'All Photos (root)'}
              </div>
              <Button size="sm" onClick={() => setShowBrowser(true)}>
                Browse...
              </Button>
            </div>
            {/* Photo count + preview strip */}
            {photoCount > 0 && (
              <div className="mt-1.5">
                <span className="text-[10px] text-hs-text-faint">
                  {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
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
              <p className="text-[10px] text-hs-text-faint mt-1">No photos in this folder</p>
            )}
          </div>
        </>
      )}

      <Slider
        label="Slide Interval (seconds)"
        value={(c.intervalMs ?? 30000) / 1000}
        min={5}
        max={300}
        step={5}
        onChange={(v) => set({ intervalMs: v * 1000 })}
      />

      <div className="flex gap-2">
        <LabeledSelect
          label="Transition"
          value={(c.transition as string) || 'fade'}
          onChange={(v) => set({ transition: v })}
          options={TRANSITIONS}
          fieldClassName="flex-1"
        />
        <LabeledSelect
          label="Object Fit"
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
