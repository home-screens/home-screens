'use client';

import { useEffect, useState } from 'react';
import { useTranslate } from '@/i18n';
import type { PhotoSlideshowConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { usePhotoList } from './shared/usePhotoList';
import { SlideLayer, KEN_BURNS_CSS } from './shared/SlideImage';
import VideoLayer from './shared/VideoLayer';
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

/** About how long an iPhone's Live Photo clip runs: 1.5s either side of the shutter. */
const LIVE_CLIP_MS = 3000;

/**
 * The moving half of a Live Photo, played over its own still.
 *
 * Deliberately NOT a video slide. A video entry ends the slide when it
 * ends, and a Live Photo runs about three seconds, so treating one as
 * a video would turn a ten second slide into a one second one. The still
 * owns the slide and keeps the timer; this plays on top of it and gets out
 * of the way.
 *
 * Mounted only while its layer is the active one, so a crossfade never has
 * two decoders running, which is why video slides cut instead of fading.
 *
 * Two different exits. When the clip ends on its own it fades out, because
 * its last frame is not the frame Apple chose as the photo and cutting
 * between the two twitches. When the slide moves on it is unmounted with
 * its layer, which is a cut: a looping clip is always mid-play then, and
 * holding it through the fade would mean two decoders again.
 */
function LivePhotoMotionLayer({ src, objectFit, loop, capMs, repeatEveryMs }: {
  src: string;
  objectFit?: React.CSSProperties['objectFit'];
  loop: boolean;
  capMs?: number;
  /** Come round again on this cadence, measured from the slide arriving. */
  repeatEveryMs?: number;
}) {
  const [finished, setFinished] = useState(false);
  // Faded in rather than mounted at full strength: the still is still
  // crossfading in when this arrives, and a clip appearing the instant its
  // first frame decodes would cut that fade short.
  //
  // The way out is a cut, not a fade. This layer is mounted only while its
  // own layer is the active one, and that flips at the start of the
  // crossfade, so a looping clip is always mid-play when it goes. Holding it
  // mounted and paused through the fade would mean two decoders running
  // during every crossfade, which is the thing video slides avoid.
  const [shown, setShown] = useState(false);
  // Timed from the slide arriving rather than from the last clip ending, so
  // the second play lands on the halfway mark instead of drifting by the
  // clip's own length.
  const [run, setRun] = useState(0);
  useEffect(() => {
    // At the shortest slide (5s) half the interval is 2.5s, which lands while
    // the clip is still playing: the replay would visibly jump. A slide that
    // short already shows the whole clip once, so it just plays once.
    if (!repeatEveryMs || loop || repeatEveryMs < LIVE_CLIP_MS) return undefined;
    // Once, not on a cadence. An interval kept firing: a third play could
    // start just before the slide left and be cut off, and a slideshow
    // paused from the phone repeated for as long as it stayed paused.
    const id = setTimeout(() => {
      // `finished` is cleared when the clip actually starts again (onPlaying),
      // not here: clearing it now would fade the last frame back in while the
      // seek is still landing.
      setRun((n) => n + 1);
    }, repeatEveryMs);
    return () => clearTimeout(id);
  }, [repeatEveryMs, loop]);
  // `run` is a signal, not a key. Keying it remounts the element, which
  // rebuilds a compositing layer and makes every backdrop-filter card on
  // the screen re-sample; seeking the mounted element costs none of that.
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      // Above the still, which sits at 1 while it is the active layer.
      style={{
        zIndex: 2,
        opacity: finished || !shown ? 0 : 1,
        transition: 'opacity 450ms ease-in-out',
      }}
    >
      <VideoLayer
        onPlaying={() => { setShown(true); setFinished(false); }}
        restartSignal={run}
        src={src}
        active
        autoPlay
        objectFit={objectFit}
        muted
        loop={loop}
        // A cap only makes sense for a clip that is meant to stop. Looping
        // is meant to run until the slide moves on.
        maxDurationMs={loop ? undefined : capMs}
        // Fires on ended, on a decode error and on a stall, so a movie that
        // will not play reveals the photo instead of hanging over it.
        // Passed in every mode: VideoLayer ignores a real `ended` while
        // looping, so this only fires on a stall or a decode error. Without
        // it a looping clip that dies leaves its last frame over the still.
        onEnded={() => setFinished(true)}
      />
    </div>
  );
}

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

  // The slide's own length, the same default `usePhotoList` rotates on.
  const intervalMs = config.intervalMs ?? 30000;
  const liveMotion = config.livePhotos ?? 'once';

  const renderLayer = (layer: LayerIndex) => {
    const item = sources[layer];
    const active = activeLayer === layer;
    const slide = (
      <SlideLayer
        item={item}
        box={boxSize}
        active={active}
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
    // A Live Photo is a still slide with movement over it, never a video
    // slide: a video ends the slide when it ends, and three seconds is not
    // a slide. Only on the layer that is showing, so a crossfade never has
    // two decoders running.
    if (!item?.liveUrl || liveMotion === 'still' || !playVideos || !active) return slide;
    return (
      <>
        {slide}
        <LivePhotoMotionLayer
          // A fresh element per slide, so the played-once state cannot
          // carry over to the next picture on this layer.
          key={item.url}
          src={item.liveUrl}
          objectFit={config.objectFit}
          loop={liveMotion === 'loop'}
          capMs={intervalMs}
          // Halfway through the slide: a thirty second photo moves at the
          // start and again at fifteen seconds.
          repeatEveryMs={liveMotion === 'twice' ? Math.round(intervalMs / 2) : undefined}
        />
      </>
    );
  };

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
