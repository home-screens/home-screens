'use client';

import { useTranslate } from '@/i18n';
import type { PhotoSlideshowConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { usePhotoList, DEFAULT_SLIDE_INTERVAL_MS } from './shared/usePhotoList';
import { SlideLayer, KEN_BURNS_CSS } from './shared/SlideImage';
import type { LayerIndex } from './shared/useCrossfadeLayers';
import type { PictureBox } from '@/lib/media-paths';
import { emptyStateFor, normalizePhotoSource, defaultPhotoSource, PHOTO_EMPTY_KEYS } from '@/lib/photo-source';
import { Images } from 'lucide-react';
import FamilyEmptyState from './FamilyEmptyState';
import PhotoCredit from './shared/PhotoCredit';
import { PhotoControls, photoAlbumName } from './shared/PhotoControls';

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

export default function PhotoSlideshowModule({ config, style, screenId, moduleId, boxSize }: PhotoSlideshowModuleProps) {
  const t = useTranslate('modules');
  const playVideos = !!(screenId && moduleId);

  const { data, error, items, batch, advance, controls, position, sources, activeLayer, layerReady, layerFailed } = usePhotoList('photo-slideshow', config, { moduleId, playVideos });

  const gate = moduleGate({ style, data, error, loadingMessage: t('photo-slideshow.loading') });
  if (gate) return gate;
  if (items.length === 0) {
    // Say where the fix is (the phone for an empty library, a bad iCloud
    // link, an empty OneDrive folder, search words that found nothing) in the
    // words the full-screen photo uses, instead of a generic "no photos".
    const keys = PHOTO_EMPTY_KEYS[emptyStateFor(normalizePhotoSource(config.photoSource) ?? defaultPhotoSource('library'))];
    return (
      <ModuleWrapper style={style}>
        <FamilyEmptyState icon={<Images size="1em" strokeWidth={1.75} aria-hidden="true" />} title={t(keys.title)} hint={t(keys.hint)} />
      </ModuleWrapper>
    );
  }

  // Cut (never animate) when either neighbor of the transition is a video:
  // a transition would run two decoders at once, which Pi hardware can't
  // afford. Ken Burns (a CSS transform on a decoding surface) is skipped too.
  const videoAdjacent = sources.some((s) => s?.type === 'video');
  const kenBurns = (config.kenBurns ?? false) && !videoAdjacent;

  // The slide's own length, the same default `usePhotoList` rotates on.
  const live = { motion: config.livePhotos ?? 'once', slideMs: config.intervalMs ?? DEFAULT_SLIDE_INTERVAL_MS };

  const renderLayer = (layer: LayerIndex) => (
    <SlideLayer
      item={sources[layer]}
      box={boxSize}
      active={activeLayer === layer}
      objectFit={config.objectFit}
      transition={videoAdjacent ? 'none' : config.transition}
      fadeMs={800}
      kenBurns={kenBurns}
      layerIndex={layer}
      playVideos={playVideos}
      loopVideo={batch.length === 1}
      maxVideoDurationMs={config.maxVideoDurationMs}
      onEnded={advance}
      onReady={() => layerReady(layer)}
      onFailed={() => layerFailed(layer)}
      live={live}
    />
  );

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      <div className="relative w-full h-full" style={{ borderRadius: `${style.borderRadius}px`, overflow: 'hidden' }}>
        {config.kenBurns && <style>{KEN_BURNS_CSS}</style>}
        {renderLayer(0)}
        {renderLayer(1)}
        <PhotoCredit item={sources[activeLayer]} box={boxSize} />
        {/* Back, pause and next for a finger, and a swipe on the photo steps it. */}
        <PhotoControls
          controls={controls}
          position={position}
          album={photoAlbumName(normalizePhotoSource(config.photoSource), t('photoControls.allPictures'))}
          box={boxSize ?? { w: 500, h: 400 }}
          enabled={playVideos && config.interactive !== false}
          ownSwipe
        />
      </div>
    </ModuleWrapper>
  );
}
