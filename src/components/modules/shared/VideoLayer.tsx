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
  /** Inactive layers pause and unload their clip, freeing the decoder. */
  active: boolean;
  /** False in the editor preview: poster frame only, never playing. */
  autoPlay: boolean;
  objectFit?: React.CSSProperties['objectFit'];
  /** Default true — unmuted playback additionally needs the kiosk launcher flag. */
  muted?: boolean;
  loop?: boolean;
  /**
   * Bump to play the clip again from the top without remounting.
   *
   * Remounting is the obvious way to replay and the expensive one: tearing
   * an element down and building another destroys and recreates a
   * compositing layer, and every element sampling a backdrop has to
   * re-sample when the layer tree changes. Seeking a mounted element leaves
   * the tree alone.
   */
  restartSignal?: number;
  /** The clip has started showing frames. Used to fade a layer in on first play. */
  onPlaying?: () => void;
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
  restartSignal,
  onPlaying,
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

  // True only while the element is being emptied on purpose. Whatever it
  // reports in that moment is about the unloading, not about the clip, and
  // must not end the slide or arm the stall timer.
  const releasingRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current || releasingRef.current) return;
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
    if (!playingRef.current || finishedRef.current || releasingRef.current || stallTimerRef.current) return;
    stallTimerRef.current = setTimeout(finish, STALL_GRACE_MS);
  }, [finish]);

  // Replay in place. Skipped on the first render so this never fights the
  // element's own autoplay.
  //
  // A replay is a fresh run, so it clears the finished latch and any armed
  // stall timer. Without that, `finish` has already fired once and returns
  // early for every later end: the caller never hears the second clip
  // finish, and on a Live Photo that leaves the clip's last frame sitting
  // over the still Apple chose. The stall and duration guards hang off the
  // same latch, so they would be dead for the replay too.
  // Compared against the last value rather than a once-only flag: under
  // StrictMode the doubled effect would use the flag up and the second run
  // would seek on mount, fighting the element's own autoplay.
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const video = videoRef.current;
    if (!video || restartSignal === undefined) return;
    clearStall();
    finishedRef.current = false;
    try {
      video.currentTime = 0;
      void video.play()?.catch(() => {});
    } catch {
      // A seek on an element that has lost its data is not worth a crash;
      // the slide keeps its still either way.
    }
  }, [restartSignal, clearStall]);

  // The element's src is set and taken away here rather than in the markup,
  // because taking it away is only half of letting a clip go. An element
  // whose src attribute is removed keeps everything it had loaded, decoder
  // included, until it is told to load again with nothing to load. On a Pi
  // that is a hardware decoder held by a layer nobody can see, for as long
  // as the other layer keeps showing pictures. So a layer that goes inactive
  // or unmounts, and one swapping to another clip, pauses, drops the src and
  // loads the nothing that is left.
  //
  // Declared before the playback effect below so the src is in place when
  // that effect calls play(), and so this cleanup's unloading happens before
  // that one's timers are cleared.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;
    video.setAttribute('src', heldSrc);
    return () => {
      releasingRef.current = true;
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // An element already torn down has nothing left to let go of.
      } finally {
        releasingRef.current = false;
      }
    };
  }, [active, heldSrc]);

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
      onPlaying={() => { clearStall(); onPlaying?.(); }}
      onTimeUpdate={clearStall}
    />
  );
}
