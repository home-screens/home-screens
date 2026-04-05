'use client';

import { useState, useEffect, useCallback } from 'react';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import Button from '@/components/ui/Button';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import ImageBrowserModal from '@/components/editor/ImageBrowserModal';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { ImmichPhotoSourceSection } from './ImmichPhotoSourceSection';
import type { ModuleInstance, FullscreenPhotoConfig } from '@/types/config';

type Config = Partial<FullscreenPhotoConfig>;

export function FullscreenPhotoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
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
      {/* Theme Override */}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">Theme</span>
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
      </label>

      {/* Source selector — only show if Immich is configured */}
      {hasImmichKey && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-400">Photo Source</span>
          <select
            value={source}
            onChange={(e) => set({ source: e.target.value })}
            className={INPUT_CLASS}
          >
            <option value="local">Local Photos</option>
            <option value="immich">Immich</option>
          </select>
        </label>
      )}

      {source === 'immich' ? (
        <ImmichPhotoSourceSection config={c as Record<string, unknown>} set={set} />
      ) : (
        <>
          {/* Folder picker */}
          <div>
            <span className="text-xs text-neutral-400">Photo Folder</span>
            <div className="flex gap-1.5 mt-1">
              <div className="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-300 truncate">
                {directory || 'All Photos (root)'}
              </div>
              <Button size="sm" onClick={() => setShowBrowser(true)}>
                Browse...
              </Button>
            </div>
            {photoCount > 0 && (
              <div className="mt-1.5">
                <span className="text-[10px] text-neutral-500">
                  {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
                </span>
                <div className="flex gap-1 mt-1 overflow-x-auto">
                  {previewImages.map((img) => (
                    <img
                      key={img}
                      src={img}
                      alt=""
                      loading="lazy"
                      className="w-12 h-12 rounded object-cover flex-shrink-0 border border-neutral-700"
                    />
                  ))}
                </div>
              </div>
            )}
            {photoCount === 0 && (
              <p className="text-[10px] text-neutral-500 mt-1">No photos in this folder</p>
            )}
          </div>
        </>
      )}

      {/* Slide interval */}
      <Slider
        label="Slide Interval (seconds)"
        value={(c.intervalMs ?? 30000) / 1000}
        min={5}
        max={300}
        step={5}
        onChange={(v) => set({ intervalMs: v * 1000 })}
      />

      {/* Transition & Object Fit row */}
      <div className="flex gap-2">
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-neutral-400">Transition</span>
          <select
            value={c.transition ?? 'fade'}
            onChange={(e) => set({ transition: e.target.value as FullscreenPhotoConfig['transition'] })}
            className={INPUT_CLASS}
          >
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="zoom">Zoom</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="text-xs text-neutral-400">Object Fit</span>
          <select
            value={c.objectFit ?? 'cover'}
            onChange={(e) => set({ objectFit: e.target.value as 'cover' | 'contain' | 'fill' })}
            className={INPUT_CLASS}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="fill">Fill</option>
          </select>
        </label>
      </div>

      {/* Toggles */}
      <Toggle
        label="Shuffle Order"
        checked={c.shuffle ?? false}
        onChange={(v) => set({ shuffle: v })}
      />
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
      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Upload photos from your phone via the Photos tab at{' '}
        <span className="text-neutral-400">{typeof window !== 'undefined' ? `${window.location.origin}/remote` : '/remote'}</span>
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
    </>
  );
}
