'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslate } from '@/i18n';
import type { MediaListItem, PhotoSlideshowConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { photoSlideshowUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useMediaRotation } from '@/hooks/useRotatingIndex';
import { useAuthImageState } from '@/components/display/useAuthImage';
import VideoLayer from './shared/VideoLayer';
import { useCrossfadeLayers, type LayerIndex } from './shared/useCrossfadeLayers';

/** Renders a single slide layer, fetching API-served images through displayFetch for auth.
 *  The <img> stays mounted while the blob loads so the CSS opacity transition fires on
 *  a style change rather than on mount (which would cause a hard pop instead of a fade).
 *  It reports load/failure so the crossfade only brings it up once painted. */
function SlideLayer({ src, active, objectFit, isFade, onReady, onFailed }: {
  src: string; active: boolean; objectFit?: React.CSSProperties['objectFit']; isFade: boolean;
  onReady?: () => void; onFailed?: () => void;
}) {
  // Never render the previous slide's blob here: the layer holds the next
  // slide while it loads and stays hidden until its own image is ready.
  const { url: authSrc, status } = useAuthImageState(src, { holdPrevious: false });
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  useEffect(() => {
    if (status === 'failed') onFailedRef.current?.();
  }, [status, src]);
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
      onLoad={onReady}
      onError={onFailed}
    />
  );
}

interface PhotoSlideshowModuleProps {
  config: PhotoSlideshowConfig;
  style: ModuleStyle;
  // Threaded by ScreenRenderer on real displays only; the editor preview gets
  // neither, so video slides show posters and rotate on the photo timer there.
  screenId?: string;
  moduleId?: string;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['photo-slideshow']?.ttlMs ?? 600_000;
export const DEFAULT_MAX_VIDEO_DURATION_MS = 60_000;

export default function PhotoSlideshowModule({ config, style, screenId, moduleId }: PhotoSlideshowModuleProps) {
  const t = useTranslate('modules');
  const playVideos = !!(screenId && moduleId);

  // Photo-only configs receive the legacy string[] response; normalize both
  // shapes into MediaListItem so the render path below is uniform.
  const listUrl = photoSlideshowUrl(config);
  const [data, error] = useFetchData<string[] | MediaListItem[]>(listUrl, config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);
  const items = useMemo<MediaListItem[]>(
    () => (data ?? []).map((entry) => (typeof entry === 'string' ? { url: entry, type: 'image' as const } : entry)),
    [data],
  );
  const intervalMs = config.intervalMs ?? 30000;

  // Per-item rotation: photos advance on the timer, videos on onEnded —
  // an all-photo list degenerates to the plain fixed-interval rotation.
  // The list URL keys the batch, so a periodic refresh is held until the
  // current pass completes instead of re-dealing mid-slideshow.
  const [batch, index, advance] = useMediaRotation(items, intervalMs, false, playVideos, listUrl);

  // The swap waits for the incoming image: see useCrossfadeLayers.
  const currentItem = batch.length === 0 ? null : batch[index % batch.length] ?? null;
  const { sources, activeLayer, layerReady, layerFailed } = useCrossfadeLayers(currentItem, index, advance);

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('photo-slideshow.loading'),
    // An empty iCloud album usually means a bad link or the album's public
    // website being off; an empty OneDrive folder points back at the
    // editor's folder picker — say so instead of a generic "no photos".
    empty: items.length === 0
      && t(
        config.source === 'icloud' ? 'photo-slideshow.emptyICloud'
          : config.source === 'onedrive' ? 'photo-slideshow.emptyOneDrive'
            : 'photo-slideshow.empty',
      ),
  });
  if (gate) return gate;

  // Cut (never fade) when either neighbor of the transition is a video —
  // crossfading would run two decoders at once, which Pi hardware can't afford.
  const videoAdjacent = sources.some((s) => s?.type === 'video');
  const isFade = config.transition === 'fade' && !videoAdjacent;

  const renderLayer = (layer: LayerIndex) => {
    const item = sources[layer];
    if (!item) return null;
    const active = activeLayer === layer;
    if (item.type === 'video') {
      return (
        <VideoLayer
          src={item.url}
          posterSrc={item.posterUrl}
          active={active}
          autoPlay={playVideos}
          objectFit={config.objectFit}
          muted
          loop={batch.length === 1}
          maxDurationMs={config.maxVideoDurationMs ?? DEFAULT_MAX_VIDEO_DURATION_MS}
          onEnded={advance}
        />
      );
    }
    return (
      <SlideLayer
        src={item.url}
        active={active}
        objectFit={config.objectFit}
        isFade={isFade}
        onReady={() => layerReady(layer)}
        onFailed={() => layerFailed(layer)}
      />
    );
  };

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      <div className="relative w-full h-full" style={{ borderRadius: `${style.borderRadius}px`, overflow: 'hidden' }}>
        {renderLayer(0)}
        {renderLayer(1)}
      </div>
    </ModuleWrapper>
  );
}
