'use client';

import { useEffect, useRef, useState } from 'react';
import type { LivePhotoMotion } from '@/types/config';
import VideoLayer from './VideoLayer';

/** About how long an iPhone's Live Photo clip runs: 1.5s either side of the shutter. */
const LIVE_CLIP_MS = 3000;

/** How long the clip takes to fade back out to its still. */
const MOTION_FADE_MS = 450;

/**
 * The moving half of a Live Photo, played over its own still.
 *
 * Deliberately NOT a video slide. A video entry ends the slide when it
 * ends, and a Live Photo runs about three seconds, so treating one as
 * a video would turn a ten second slide into a one second one. The still
 * owns the slide and keeps the timer; this plays on top of it and gets out
 * of the way.
 *
 * `SlideLayer` mounts it only while its layer is the active one, so a
 * crossfade never has two decoders running, which is why video slides cut
 * instead of fading.
 *
 * Two different exits. When the clip ends on its own it fades out, because
 * its last frame is not the frame Apple chose as the photo and cutting
 * between the two twitches. When the slide moves on it is unmounted with
 * its layer, which is a cut: a looping clip is always mid-play then, and
 * holding it through the fade would mean two decoders again.
 */
export function LivePhotoMotionLayer({ src, objectFit, motion, slideMs, startAfterMs = 0, fadeInMs = MOTION_FADE_MS }: {
  src: string;
  objectFit?: React.CSSProperties['objectFit'];
  /**
   * How long the clip takes to come up: the slide's own crossfade, so the
   * clip on top does not finish the change of picture sooner than the
   * picture under it would.
   */
  fadeInMs?: number;
  /** Hold the clip back this long: the picture under it is still moving into place. */
  startAfterMs?: number;
  /** Once, twice or loop; `still` never mounts this. */
  motion: Exclude<LivePhotoMotion, 'still'>;
  /** How long the slide stays up, which times the second play and caps a run. */
  slideMs: number;
}) {
  const loop = motion === 'loop';
  // Halfway through the slide: a thirty second photo moves at the start and
  // again at fifteen seconds. At the shortest slide (5s) half is 2.5s, which
  // lands while the clip is still playing and would visibly jump, so a slide
  // that short plays once.
  const replayAtMs = motion === 'twice' && slideMs / 2 >= startAfterMs + LIVE_CLIP_MS ? Math.round(slideMs / 2) : undefined;

  const [finished, setFinished] = useState(false);
  // Faded in rather than mounted at full strength: the still is still
  // crossfading in when this arrives, and a clip appearing the instant its
  // first frame decodes would cut that fade short.
  const [shown, setShown] = useState(false);
  // `run` is a signal, not a key. Keying it remounts the element, which
  // rebuilds a compositing layer and makes every backdrop-filter card on
  // the screen re-sample; seeking the mounted element costs none of that.
  const [run, setRun] = useState(0);
  // Done with for good: the decoder is let go so the Pi is not holding one
  // for a clip nobody will see again this slide.
  const [released, setReleased] = useState(false);
  const [started, setStarted] = useState(startAfterMs <= 0);
  useEffect(() => {
    if (started) return undefined;
    const id = setTimeout(() => setStarted(true), startAfterMs);
    return () => clearTimeout(id);
  }, [started, startAfterMs]);

  // The clip has ended, failed or stalled, and only a replay brings it back.
  // A clip that stalled past VideoLayer's grace window and then found its
  // data would otherwise fire `playing`, fade back in and play to an `ended`
  // that VideoLayer's finished latch swallows, leaving its last frame over
  // the still for the rest of the slide.
  const doneRef = useRef(false);
  const replayPendingRef = useRef(replayAtMs !== undefined);

  useEffect(() => {
    if (replayAtMs === undefined) return undefined;
    // Once, not on a cadence: an interval could start a third play just
    // before the slide left, and a slideshow paused from the phone would
    // repeat for as long as it stayed paused.
    const id = setTimeout(() => {
      replayPendingRef.current = false;
      doneRef.current = false;
      // `finished` is cleared when the clip actually starts again
      // (onPlaying), not here: clearing it now would fade the last frame
      // back in while the seek is still landing.
      setRun((n) => n + 1);
    }, replayAtMs);
    return () => clearTimeout(id);
  }, [replayAtMs]);

  useEffect(() => {
    if (!finished || replayPendingRef.current) return undefined;
    // After the fade-out, so the last frame is not blanked while visible.
    const id = setTimeout(() => setReleased(true), MOTION_FADE_MS);
    return () => clearTimeout(id);
  }, [finished]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      data-testid="live-photo-motion"
      // Above the still, which sits at 1 while it is the active layer, and
      // below the module's own overlays (credit, clock) at 10.
      style={{
        zIndex: 2,
        opacity: finished || !shown ? 0 : 1,
        transition: `opacity ${finished ? MOTION_FADE_MS : fadeInMs}ms ease-in-out`,
      }}
    >
      <VideoLayer
        onPlaying={() => {
          if (doneRef.current) return;
          setShown(true);
          setFinished(false);
        }}
        restartSignal={run}
        src={src}
        // Not loaded until it starts, so a held clip costs no decoder either.
        active={started && !released}
        autoPlay
        objectFit={objectFit}
        muted
        loop={loop}
        // A cap only makes sense for a clip that is meant to stop. Looping
        // is meant to run until the slide moves on.
        maxDurationMs={loop ? undefined : slideMs}
        // Fires on ended, on a decode error and on a stall, so a movie that
        // will not play reveals the photo instead of hanging over it.
        // VideoLayer ignores a real `ended` while looping, so there this
        // only fires on a stall or a decode error; without it a looping clip
        // that dies leaves its last frame over the still.
        onEnded={() => {
          doneRef.current = true;
          setFinished(true);
        }}
      />
    </div>
  );
}
