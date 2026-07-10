'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthImage } from '@/components/display/useAuthImage';
import { stripMediaToken, mediaTokenExpiryMs } from '@/lib/media-url';

/**
 * Shared <video> render path hardened for unattended kiosks. A stalled video
 * never fires `ended` and would freeze a display forever with nobody there to
 * click, so completion is belt-and-suspenders: `ended`, `error`, a stall grace
 * timer, and a hard max-duration cap all funnel into one idempotent finish —
 * "skip and move on" beats "wait and hope" everywhere.
 *
 * No transition styles on purpose: video slides always cut, never fade —
 * crossfading would run two decoders at once, which Pi hardware can't afford.
 */

const STALL_GRACE_MS = 10_000;

/** Swap to a fresh token this long before the held one expires — must exceed
 *  the list re-poll cadence (10 min) so a replacement always arrives first. */
const TOKEN_REFRESH_MARGIN_MS = 30 * 60_000;

export interface VideoLayerProps {
  src: string;
  /** Optional thumbnail (e.g. Immich preview); fetched through useAuthImage. */
  posterSrc?: string;
  /** Inactive layers pause and detach their src, freeing the decoder. */
  active: boolean;
  /** False in the editor preview: poster frame only, never playing. */
  autoPlay: boolean;
  objectFit?: React.CSSProperties['objectFit'];
  /** Default true — unmuted playback additionally needs the kiosk launcher flag. */
  muted?: boolean;
  loop?: boolean;
  /** Force-advance cap in ms; 0/undefined = uncapped. */
  maxDurationMs?: number;
  /**
   * Fired once per activation on `ended`, decode/network error, a stall
   * lasting past the grace window, or the max-duration cap — whichever comes
   * first. When omitted, finishing pauses the video instead.
   */
  onEnded?: () => void;
}

export default function VideoLayer({
  src,
  posterSrc,
  active,
  autoPlay,
  objectFit,
  muted = true,
  loop = false,
  maxDurationMs,
  onEnded,
}: VideoLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterUrl = useAuthImage(posterSrc);

  // List endpoints re-mint the `mt` token on every poll, so `src` churns even
  // when the asset is unchanged — and any src swap aborts the decoder and
  // restarts playback from frame 0. Hold the current src across token-only
  // changes; adopt the incoming one only when the asset itself changed or the
  // held token is close enough to expiry that Chromium's next range request
  // could 401. (Render-time state adjustment, per React's derive-from-props
  // pattern.)
  const [heldSrc, setHeldSrc] = useState(src);
  if (src !== heldSrc) {
    const sameAsset = stripMediaToken(src) === stripMediaToken(heldSrc);
    const heldExpiry = mediaTokenExpiryMs(heldSrc);
    const nearExpiry = heldExpiry !== null && heldExpiry - Date.now() < TOKEN_REFRESH_MARGIN_MS;
    if (!sameAsset || nearExpiry) setHeldSrc(src);
  }

  const playing = active && autoPlay;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const finishedRef = useRef(false);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (onEndedRef.current) onEndedRef.current();
    else videoRef.current?.pause();
  }, []);

  const clearStall = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const armStall = useCallback(() => {
    if (!playingRef.current || finishedRef.current || stallTimerRef.current) return;
    stallTimerRef.current = setTimeout(finish, STALL_GRACE_MS);
  }, [finish]);

  useEffect(() => {
    finishedRef.current = false;
    const video = videoRef.current;
    if (!video) return;
    // React doesn't reliably sync the muted attribute after mount; set the
    // DOM property directly so a config toggle takes effect.
    video.muted = muted;

    if (!playing) {
      video.pause();
      return;
    }

    // Autoplay after a src swap can be finicky; an explicit play() call with
    // the rejection routed into the stall path keeps the wall moving even
    // when playback never starts. (Optional chain: jsdom's play() returns
    // undefined instead of a promise.)
    video.play()?.catch(() => armStall());

    const capTimer = maxDurationMs && maxDurationMs > 0 ? setTimeout(finish, maxDurationMs) : null;
    return () => {
      if (capTimer) clearTimeout(capTimer);
      clearStall();
    };
  }, [playing, heldSrc, muted, maxDurationMs, finish, armStall, clearStall]);

  return (
    <video
      ref={videoRef}
      src={active ? heldSrc : undefined}
      poster={posterUrl || undefined}
      autoPlay={playing}
      muted={muted}
      loop={loop}
      playsInline
      preload={autoPlay ? 'auto' : 'metadata'}
      className="absolute inset-0 w-full h-full"
      style={{
        objectFit,
        zIndex: active ? 1 : 0,
        visibility: active ? 'visible' : 'hidden',
      }}
      onEnded={loop ? undefined : finish}
      onError={finish}
      onStalled={armStall}
      onWaiting={armStall}
      onPlaying={clearStall}
      onTimeUpdate={clearStall}
    />
  );
}
