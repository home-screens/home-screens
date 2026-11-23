'use client';

import { useEffect, useRef } from 'react';
import type { FullscreenPhotoTransition, LivePhotoMotion, MediaListItem } from '@/types/config';
import type { PictureBox } from '@/lib/media-paths';
import VideoLayer from './VideoLayer';
import { LivePhotoMotionLayer } from './LivePhotoMotion';
import { useSlideImage, readyWhenDecoded, type LayerIndex } from './useCrossfadeLayers';

/** The longest a video slide plays before the slideshow moves on, when the module sets none. */
export const DEFAULT_MAX_VIDEO_DURATION_MS = 60_000;

/** The largest scale either Ken Burns keyframe reaches. */
const KEN_BURNS_MAX_SCALE = 1.18;

/** The two slow pans a slide alternates between; a module that offers the effect mounts this once in a `<style>`. */
export const KEN_BURNS_CSS = `
@keyframes kb-a {
  0%   { transform: scale(1)    translate(0, 0); }
  100% { transform: scale(1.15) translate(-2%, -1%); }
}
@keyframes kb-b {
  0%   { transform: scale(1.05) translate(1%, 0); }
  100% { transform: scale(1.18) translate(-1%, -2%); }
}
`;

/** How long a transition that moves the picture (rather than fading it) keeps it moving. */
const SLIDE_MS = 800;
const ZOOM_MS = 1000;
const ZOOM_FADE_MS = 600;

/**
 * How a layer arrives and leaves, on the frame around the picture (the pan
 * runs on the picture inside it, so the two never fight over one transform).
 * Slide and zoom are keyframes (`hs-slide-in`, `hs-slide-out`, `hs-zoom-in`
 * in globals.css) rather than transitions: each layer takes turns arriving
 * and leaving, and a keyframe always starts from its own first frame, so the
 * next picture always comes in from the right while the last one leaves to
 * the left, even when a layer is handed back the picture it already held.
 */
function transitionStyle(transition: FullscreenPhotoTransition, active: boolean, fadeMs: number): React.CSSProperties {
  switch (transition) {
    case 'fade':
      // The arriving picture fades in on top while the one before stays
      // whole under it, then goes: two pictures fading at once showed the
      // dark behind them, the screen dimming to three quarters mid-change.
      // It goes with a short fade of its own, for a letterboxed picture
      // whose edges it still shows around.
      return active
        ? { transition: `opacity ${fadeMs}ms ease-in-out` }
        : { transition: `opacity ${Math.round(fadeMs / 2)}ms ease-in-out ${fadeMs}ms` };
    case 'slide':
      // The leaving picture stays painted until it is all the way out, so no
      // gap opens beside the one coming in.
      return active
        ? { animation: `hs-slide-in ${SLIDE_MS}ms ease-in-out both` }
        : { animation: `hs-slide-out ${SLIDE_MS}ms ease-in-out both`, transition: `opacity 0s linear ${SLIDE_MS}ms` };
    case 'zoom':
      // Only the arriving picture moves, fading in over the one before,
      // which stays whole under it until it has.
      return active
        ? { animation: `hs-zoom-in ${ZOOM_MS}ms ease-out both`, transition: `opacity ${ZOOM_FADE_MS}ms ease-in-out` }
        : { transition: `opacity ${ZOOM_FADE_MS / 2}ms ease-in-out ${ZOOM_FADE_MS}ms` };
    default:
      return {};
  }
}

interface SlideImageProps {
  src: string;
  /** The module's size in canvas pixels, for a library photo's sized copy. */
  box?: PictureBox;
  active: boolean;
  objectFit?: React.CSSProperties['objectFit'];
  transition: FullscreenPhotoTransition;
  /** How long a `fade` takes. */
  fadeMs: number;
  kenBurns?: boolean;
  /** Which of the two layers this is; they pan in different directions. */
  layerIndex?: LayerIndex;
  /** The image for `src` is painted; the crossfade may bring this layer up. */
  onReady?: () => void;
  /** The image for `src` could not be fetched or decoded. */
  onFailed?: () => void;
}

/**
 * One picture layer of a slideshow, fetched through displayFetch for auth.
 * The <img> stays mounted while the blob loads so the CSS transition fires
 * on a style change rather than on mount (a hard pop instead of a fade). It
 * is never the previous slide's picture: the layer holds the next slide
 * while it loads and stays hidden until its own image is ready, and it
 * reports load and failure so the crossfade only brings it up once painted.
 */
export function SlideImage({ src, box, active, objectFit, transition, fadeMs, kenBurns = false, layerIndex = 0, onReady, onFailed }: SlideImageProps) {
  // Ken Burns zooms in by up to 18%, so it asks for a copy that much larger
  // to stay sharp at the end of the pan.
  const sizedBox = box && kenBurns ? { w: box.w * KEN_BURNS_MAX_SCALE, h: box.h * KEN_BURNS_MAX_SCALE } : box;
  const { url: authSrc, status } = useSlideImage(src, sizedBox);
  const onFailedRef = useRef(onFailed);
  onFailedRef.current = onFailed;
  useEffect(() => {
    if (status === 'failed') onFailedRef.current?.();
  }, [status, src]);

  return (
    <div
      data-slide-layer={layerIndex}
      className="absolute inset-0"
      style={{
        zIndex: active ? 1 : 0,
        visibility: authSrc ? 'visible' : 'hidden',
        opacity: active && authSrc ? 1 : 0,
        ...transitionStyle(transition, active, fadeMs),
      }}
    >
      <img
        src={authSrc || undefined}
        alt=""
        className="absolute inset-0 w-full h-full"
        style={{
          objectFit,
          // The pan holds still where it is while the picture leaves, rather
          // than snapping back to its first frame as it fades or slides out;
          // a hidden layer's held pan costs nothing to draw.
          ...(kenBurns ? {
            animation: `${layerIndex === 0 ? 'kb-a' : 'kb-b'} 20s ease-in-out alternate infinite`,
            animationPlayState: active ? 'running' : 'paused',
          } : {}),
        }}
        onLoad={(e) => readyWhenDecoded(e.currentTarget, onReady, onFailed)}
        onError={onFailed}
      />
    </div>
  );
}

interface SlideLayerProps extends Omit<SlideImageProps, 'src'> {
  item: MediaListItem | null | undefined;
  /** Whether a video slide plays (a real display) or shows its poster (the editor). */
  playVideos: boolean;
  /** A video that is the only slide plays round and round. */
  loopVideo: boolean;
  maxVideoDurationMs?: number;
  /** A video slide finished. */
  onEnded: () => void;
  /**
   * What to do with a Live Photo's movement (an image item with a
   * `liveUrl`), and how long the slide stays up. Absent plays nothing.
   */
  live?: { motion: LivePhotoMotion; slideMs: number };
}

/** One of a slideshow's two layers: a picture, a muted video, or nothing yet. */
export function SlideLayer({ item, playVideos, loopVideo, maxVideoDurationMs, onEnded, live, ...image }: SlideLayerProps) {
  if (!item) return null;
  if (item.type === 'video') {
    return (
      <VideoLayer
        src={item.url}
        posterSrc={item.posterUrl}
        active={image.active}
        autoPlay={playVideos}
        objectFit={image.objectFit}
        muted
        loop={loopVideo}
        maxDurationMs={maxVideoDurationMs ?? DEFAULT_MAX_VIDEO_DURATION_MS}
        onEnded={onEnded}
      />
    );
  }
  const motion = item.liveUrl && live && live.motion !== 'still' ? live.motion : null;
  // A picture always renders as this same pair, with or without movement,
  // so a Live Photo turning active or inactive never remounts the <img>:
  // that would throw away the decoded picture and land it at its final
  // opacity, a cut where the transition should be.
  return (
    <>
      <SlideImage
        src={item.url}
        {...image}
        // A photo that moves does not also pan. The clip is drawn as it was
        // filmed, so a zoomed still under it jumps whenever it fades in or
        // out, and a decoder on top of a running animation is the load the
        // video slides avoid on a Pi.
        kenBurns={image.kenBurns && !motion}
      />
      {motion && item.liveUrl && playVideos && image.active && (
        <LivePhotoMotionLayer
          // A fresh element per slide, so the played-once state cannot
          // carry over to the next picture on this layer.
          key={item.url}
          src={item.liveUrl}
          objectFit={image.objectFit}
          motion={motion}
          slideMs={live!.slideMs}
          // The clip is drawn where the picture lands, so a picture that
          // slides or zooms in is left to land first; one that fades in is
          // kept pace with instead.
          startAfterMs={image.transition === 'slide' ? SLIDE_MS : image.transition === 'zoom' ? ZOOM_MS : 0}
          fadeInMs={image.transition === 'fade' ? image.fadeMs : undefined}
        />
      )}
    </>
  );
}
