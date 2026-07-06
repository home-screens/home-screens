'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslate } from '@/i18n';
import type { PhotoSlideshowConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { photoSlideshowUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useRotatingIndex } from '@/hooks/useRotatingIndex';
import { useAuthImage } from '@/components/display/useAuthImage';

/** Renders a single slide layer, fetching API-served images through displayFetch for auth.
 *  The <img> stays mounted while the blob loads so the CSS opacity transition fires on
 *  a style change rather than on mount (which would cause a hard pop instead of a fade). */
function SlideLayer({ src, active, objectFit, isFade }: {
  src: string; active: boolean; objectFit?: React.CSSProperties['objectFit']; isFade: boolean;
}) {
  const authSrc = useAuthImage(src);
  return (
    <img
      src={authSrc || undefined}
      alt=""
      className="absolute inset-0 w-full h-full"
      style={{
        objectFit,
        opacity: active && authSrc ? 1 : 0,
        ...(isFade ? { transition: 'opacity 800ms ease-in-out' } : {}),
        zIndex: active ? 1 : 0,
        visibility: authSrc ? 'visible' : 'hidden',
      }}
    />
  );
}

interface PhotoSlideshowModuleProps {
  config: PhotoSlideshowConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['photo-slideshow']?.ttlMs ?? 600_000;

export default function PhotoSlideshowModule({ config, style }: PhotoSlideshowModuleProps) {
  const t = useTranslate('modules');
  const [data, error] = useFetchData<string[]>(photoSlideshowUrl(config), config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);
  const files = data ?? [];
  const intervalMs = config.intervalMs ?? 30000;
  const index = useRotatingIndex(files.length, intervalMs);

  // Track the active layer (0 or 1) to alternate which img is on top
  const [activeLayer, setActiveLayer] = useState(0);
  const [sources, setSources] = useState<[string, string]>(['', '']);
  const prevIndexRef = useRef(index);

  useEffect(() => {
    if (files.length === 0) return;
    const src = files[index % files.length];

    if (prevIndexRef.current !== index) {
      // Switch to the other layer for the new image
      const nextLayer = activeLayer === 0 ? 1 : 0;
      setSources((prev) => {
        const updated: [string, string] = [...prev] as [string, string];
        updated[nextLayer] = src;
        return updated;
      });
      setActiveLayer(nextLayer);
      prevIndexRef.current = index;
    } else {
      // Initial load — set both layers to the same image
      setSources([src, src]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layer crossfade uses refs (prevIndexRef, activeLayer) that shouldn't trigger re-runs
  }, [index, files]);

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('photo-slideshow.loading'),
    empty: files.length === 0 && t('photo-slideshow.empty'),
  });
  if (gate) return gate;

  const isFade = config.transition === 'fade';

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      <div className="relative w-full h-full" style={{ borderRadius: `${style.borderRadius}px`, overflow: 'hidden' }}>
        {/* Layer 0 */}
        {sources[0] && (
          <SlideLayer src={sources[0]} active={activeLayer === 0} objectFit={config.objectFit} isFade={isFade} />
        )}
        {/* Layer 1 */}
        {sources[1] && (
          <SlideLayer src={sources[1]} active={activeLayer === 1} objectFit={config.objectFit} isFade={isFade} />
        )}
      </div>
    </ModuleWrapper>
  );
}
