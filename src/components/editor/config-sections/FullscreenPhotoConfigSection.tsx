'use client';

import { useState, useEffect, useCallback } from 'react';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import LabeledField from '@/components/ui/LabeledField';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { ImmichPhotoSourceSection } from './ImmichPhotoSourceSection';
import type { ModuleInstance, FullscreenPhotoConfig, FullscreenPhotoTransition } from '@/types/config';

type Config = Partial<FullscreenPhotoConfig>;

const SOURCE_OPTIONS = [
  { value: 'local', label: 'Local Photos' },
  { value: 'immich', label: 'Immich' },
] as const;

const MODE_OPTIONS = [
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'single', label: 'Single Photo' },
] as const;

const TRANSITION_OPTIONS: { value: FullscreenPhotoTransition; label: string }[] = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'none', label: 'None' },
];

const OBJECT_FIT_OPTIONS: { value: 'cover' | 'contain' | 'fill'; label: string }[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'fill', label: 'Fill' },
];

export function FullscreenPhotoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [hasImmichKey, setHasImmichKey] = useState(false);

  const source = (c.source as string) || 'local';
  const directory = (c.directory as string) || '';
  const isSinglePhoto = c.file !== undefined;

  useEffect(() => {
    editorFetch('/api/secrets').then(async (res) => {
      if (res.ok) {
        const data: Record<string, boolean> = await res.json();
        setHasImmichKey(!!data.immich_api_key && !!data.immich_url);
      }
    }).catch(() => {});
  }, []);

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
      <LabeledField label="Theme">
        <select
          value={c.theme ?? ''}
          onChange={(e) => set({ theme: e.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">Default (Midnight)</option>
          {FULLSCREEN_THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.group})</option>
          ))}
        </select>
      </LabeledField>

      {/* Source selector — only show if Immich is configured */}
      {hasImmichKey && (
        <LabeledSelect
          label="Photo Source"
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
            label="Mode"
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
              <span className="text-xs text-hs-text-muted">Photo</span>
              <div className="flex gap-1.5 mt-1">
                <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                  {c.file ? c.file.replace(/.*[/\\]/, '').replace(/\.[^.]+$/, '') : 'None selected'}
                </div>
                <Button size="sm" onClick={() => setShowPhotoPicker(true)}>
                  Choose...
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
              <span className="text-xs text-hs-text-muted">Photo Folder</span>
              <div className="flex gap-1.5 mt-1">
                <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
                  {directory || 'All Photos (root)'}
                </div>
                <Button size="sm" onClick={() => setShowBrowser(true)}>
                  Browse...
                </Button>
              </div>
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
          )}
        </>
      )}

      {/* Slide interval — only for slideshow mode */}
      {!isSinglePhoto && (
        <Slider
          label="Slide Interval (seconds)"
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
            label="Transition"
            value={c.transition ?? 'fade'}
            onChange={(v) => set({ transition: v })}
            options={TRANSITION_OPTIONS}
            fieldClassName="flex-1"
          />
        )}
        <LabeledSelect
          label="Object Fit"
          value={c.objectFit ?? 'cover'}
          onChange={(v) => set({ objectFit: v })}
          options={OBJECT_FIT_OPTIONS}
          fieldClassName="flex-1"
        />
      </div>

      {/* Toggles */}
      {!isSinglePhoto && (
        <Toggle
          label="Shuffle Order"
          checked={c.shuffle ?? false}
          onChange={(v) => set({ shuffle: v })}
        />
      )}
      <Toggle
        label="Ken Burns Effect"
        checked={c.kenBurns ?? false}
        onChange={(v) => set({ kenBurns: v })}
      />
      <Toggle
        label="Show Clock Overlay"
        checked={c.showClock ?? true}
        onChange={(v) => set({ showClock: v })}
      />

      {/* Mobile hint */}
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        Upload photos from your phone via the Photos tab at{' '}
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
