'use client';

import { useEffect, useRef } from 'react';
import { useTranslate } from '@/i18n';
import type { MediaListItem, PhotoSlideshowConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { photoSlideshowUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useMediaRotation } from '@/hooks/useRotatingIndex';
import { useModuleCommand } from '@/hooks/useModuleCommand';
import { handleSlideshowCommand } from './shared/slideshow-commands';
import VideoLayer from './shared/VideoLayer';
import { useCrossfadeLayers, useSlideImage, readyWhenDecoded, type LayerIndex } from './shared/useCrossfadeLayers';
import type { PictureBox } from '@/lib/media-paths';
import { emptyStateFor, normalizePhotoSource, type PhotoSourceEmptyReason, defaultPhotoSource } from '@/lib/photo-source';
import PhotoCredit from './shared/PhotoCredit';

/** Renders a single slide layer, fetching API-served images through displayFetch for auth.
 *  The <img> stays mounted while the blob loads so the CSS opacity transition fires on
 *  a style change rather than on mount (which would cause a hard pop instead of a fade).
 *  It reports load/failure so the crossfade only brings it up once painted. */
function SlideLayer({ src, box, active, objectFit, isFade, onReady, onFailed }: {
  src: string; box?: PictureBox; active: boolean; objectFit?: React.CSSProperties['objectFit']; isFade: boolean;
  onReady?: () => void; onFailed?: () => void;
}) {
  // Never the previous slide's picture: the layer holds the next slide while
  // it loads and stays hidden until its own image is ready.
  const { url: authSrc, status } = useSlideImage(src, box);
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
      onLoad={(e) => readyWhenDecoded(e.currentTarget, onReady, onFailed)}
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
  /** The card's size in canvas pixels (registry `needsBoxSize`). */
  boxSize?: PictureBox;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['photo-slideshow']?.ttlMs ?? 600_000;
const NO_ITEMS: MediaListItem[] = [];

/** What an empty slideshow says, by why it is empty (`emptyStateFor`). */
const EMPTY_MESSAGE: Record<PhotoSourceEmptyReason, string> = {
  addPhotos: 'photo-slideshow.empty',
  pickPictures: 'photo-slideshow.emptyPicked',
  checkFilters: 'photo-slideshow.emptyImmich',
  checkLink: 'photo-slideshow.emptyICloud',
  checkFolder: 'photo-slideshow.emptyOneDrive',
  checkSearch: 'photo-slideshow.emptyUnsplash',
  tryLater: 'photo-slideshow.emptyNasa',
};
export const DEFAULT_MAX_VIDEO_DURATION_MS = 60_000;

export default function PhotoSlideshowModule({ config, style, screenId, moduleId, boxSize }: PhotoSlideshowModuleProps) {
  const t = useTranslate('modules');
  const playVideos = !!(screenId && moduleId);

  const listUrl = photoSlideshowUrl(config);
  const [data, error] = useFetchData<MediaListItem[]>(listUrl, config.refreshIntervalMs ?? DEFAULT_REFRESH_MS);
  const items = data ?? NO_ITEMS;
  const intervalMs = config.intervalMs ?? 30000;

  // Per-item rotation: photos advance on the timer, videos on onEnded —
  // an all-photo list degenerates to the plain fixed-interval rotation.
  // The list URL keys the batch, so a periodic refresh is held until the
  // current pass completes instead of re-dealing mid-slideshow. The module
  // id carries the position across the screen rotating away and back.
  const [batch, index, advance, controls] = useMediaRotation(items, intervalMs, false, playVideos, listUrl, moduleId);
  // Back, next, pause and play from the phone's Control tab.
  useModuleCommand('photo-slideshow', (action) => handleSlideshowCommand(controls, action));

  // The swap waits for the incoming image: see useCrossfadeLayers.
  const currentItem = batch.length === 0 ? null : batch[index % batch.length] ?? null;
  const { sources, activeLayer, layerReady, layerFailed } = useCrossfadeLayers(currentItem, index, advance);

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('photo-slideshow.loading'),
    // Say where the fix is (a bad iCloud link, an empty OneDrive folder,
    // search words that found nothing) instead of a generic "no photos".
    empty: items.length === 0 && t(EMPTY_MESSAGE[emptyStateFor(normalizePhotoSource(config.photoSource) ?? defaultPhotoSource('library'))]),
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
        box={boxSize}
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
        <PhotoCredit item={sources[activeLayer]} box={boxSize} />
      </div>
    </ModuleWrapper>
  );
}
