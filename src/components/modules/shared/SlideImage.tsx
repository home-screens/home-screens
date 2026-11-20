'use client';

import { useEffect, useRef } from 'react';
import type { FullscreenPhotoTransition, MediaListItem } from '@/types/config';
import type { PictureBox } from '@/lib/media-paths';
import VideoLayer from './VideoLayer';
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

function transitionStyle(transition: FullscreenPhotoTransition, active: boolean, fadeMs: number): React.CSSProperties {
  switch (transition) {
    case 'fade':
      return { transition: `opacity ${fadeMs}ms ease-in-out` };
    case 'slide':
      return {
        transform: active ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 800ms ease-in-out, opacity 800ms ease-in-out',
      };
    case 'zoom':
      return {
        transform: active ? 'scale(1)' : 'scale(1.3)',
        transition: 'transform 1000ms ease-out, opacity 600ms ease-in-out',
      };
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
    <img
      src={authSrc || undefined}
      alt=""
      className="absolute inset-0 w-full h-full"
      style={{
        objectFit,
        zIndex: active ? 1 : 0,
        visibility: authSrc ? 'visible' : 'hidden',
        opacity: active && authSrc ? 1 : 0,
        ...transitionStyle(transition, active, fadeMs),
        ...(kenBurns && active ? { animation: `${layerIndex === 0 ? 'kb-a' : 'kb-b'} 20s ease-in-out alternate infinite` } : {}),
      }}
      onLoad={(e) => readyWhenDecoded(e.currentTarget, onReady, onFailed)}
      onError={onFailed}
    />
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
}

/** One of a slideshow's two layers: a picture, a muted video, or nothing yet. */
export function SlideLayer({ item, playVideos, loopVideo, maxVideoDurationMs, onEnded, ...image }: SlideLayerProps) {
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
  return <SlideImage src={item.url} {...image} />;
}
