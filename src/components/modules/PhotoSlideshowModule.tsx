'use client';

import { useTranslate } from '@/i18n';
import type { PhotoSlideshowConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { usePhotoList } from './shared/usePhotoList';
import { SlideLayer, KEN_BURNS_CSS } from './shared/SlideImage';
import type { LayerIndex } from './shared/useCrossfadeLayers';
import type { PictureBox } from '@/lib/media-paths';
import { emptyStateFor, normalizePhotoSource, type PhotoSourceEmptyReason, defaultPhotoSource } from '@/lib/photo-source';
import PhotoCredit from './shared/PhotoCredit';

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

/** What an empty slideshow says, by why it is empty (`emptyStateFor`). */
const EMPTY_MESSAGE: Record<PhotoSourceEmptyReason, string> = {
  addPhotos: 'photo-slideshow.empty',
  pickPictures: 'photo-slideshow.emptyPicked',
  checkFilters: 'photo-slideshow.emptyImmich',
  checkLink: 'photo-slideshow.emptyICloud',
  checkFolder: 'photo-slideshow.emptyOneDrive',
  checkSearch: 'photo-slideshow.emptyUnsplash',
  checkArt: 'photo-slideshow.emptyArt',
  tryLater: 'photo-slideshow.emptyNasa',
};

export default function PhotoSlideshowModule({ config, style, screenId, moduleId, boxSize }: PhotoSlideshowModuleProps) {
  const t = useTranslate('modules');
  const playVideos = !!(screenId && moduleId);

  const { data, error, items, batch, advance, sources, activeLayer, layerReady, layerFailed } = usePhotoList('photo-slideshow', config, { moduleId, playVideos });

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('photo-slideshow.loading'),
    // Say where the fix is (a bad iCloud link, an empty OneDrive folder,
    // search words that found nothing) instead of a generic "no photos".
    empty: items.length === 0 && t(EMPTY_MESSAGE[emptyStateFor(normalizePhotoSource(config.photoSource) ?? defaultPhotoSource('library'))]),
  });
  if (gate) return gate;

  // Cut (never animate) when either neighbor of the transition is a video:
  // a transition would run two decoders at once, which Pi hardware can't
  // afford. Ken Burns (a CSS transform on a decoding surface) is skipped too.
  const videoAdjacent = sources.some((s) => s?.type === 'video');
  const kenBurns = (config.kenBurns ?? false) && !videoAdjacent;

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
    />
  );

  return (
    <ModuleWrapper style={{ ...style, padding: 0 }}>
      <div className="relative w-full h-full" style={{ borderRadius: `${style.borderRadius}px`, overflow: 'hidden' }}>
        {config.kenBurns && <style>{KEN_BURNS_CSS}</style>}
        {renderLayer(0)}
        {renderLayer(1)}
        <PhotoCredit item={sources[activeLayer]} box={boxSize} />
      </div>
    </ModuleWrapper>
  );
}
