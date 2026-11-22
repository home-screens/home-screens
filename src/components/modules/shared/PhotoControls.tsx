'use client';

import { useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Images, Pause, Play } from 'lucide-react';
import { useTranslate } from '@/i18n';
import type { MediaRotationControls } from '@/hooks/useRotatingIndex';
import { BROWSE_ROTATION_HOLD_MS } from '@/components/display/useTapRotationHold';
import { useTouchReveal } from './useTouchReveal';
import { useAutoClose } from './useAutoClose';
import { useOwnedSwipe } from './useOwnedSwipe';
import { WallControlBar, WallControlButton, WALL_CONTROL_BUTTON_PX } from './WallControlBar';

/** How long the controls stay up after the last touch. */
export const PHOTO_CONTROLS_IDLE_MS = 6_000;
/** The bar's width on the 1080 canvas: three buttons, their gaps and the bar's padding. */
const BAR_WIDTH = 3 * WALL_CONTROL_BUTTON_PX.w + 2 * 20 + 2 * 20;

interface PhotoControlsProps {
  /** The slideshow's own back, next and pause (the phone drives the same ones). */
  controls: MediaRotationControls;
  /** Where the slideshow is ("3 of 5"), or null for a single picture. */
  position: { at: number; of: number } | null;
  /** The album or folder the pictures come from, when the source has a name to say. */
  album: string | null;
  /** The module's box in canvas pixels: the bar shrinks to fit a small card. */
  box: { w: number; h: number };
  /** Off draws nothing and takes no touches: the editor, or Tap on the Wall switched off. */
  enabled: boolean;
  /** A sideways swipe on the photo steps it (the card); off where the photo is the whole screen. */
  ownSwipe: boolean;
}

/**
 * Back, pause and next on a photo, for a finger on the wall. A tap anywhere
 * on the photo brings the bar and the album line up for a few seconds (the
 * tap itself never moves the photo, so a kid pointing at something does not
 * skip it); while up, the photo's own buttons work. Pausing holds the photo
 * and leaves a small mark once the bar is gone; it plays again on its own
 * after a minute with nobody touching it. The bar is the timers' wall bar
 * (`WallControlBar`), so every surface a finger controls looks the same.
 */
export function PhotoControls({ controls, position, album, box, enabled, ownSwipe }: PhotoControlsProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const reveal = useTouchReveal({ idleMs: PHOTO_CONTROLS_IDLE_MS, enabled });
  // Paused from the wall (not the phone): it plays again a minute after the
  // last touch, the same minute a tap holds the screen for.
  const pausedHere = useRef(false);
  const resume = useCallback(() => {
    if (!pausedHere.current) return;
    pausedHere.current = false;
    controls.setPaused(false);
  }, [controls]);
  const restartResume = useAutoClose(resume, BROWSE_ROTATION_HOLD_MS, { paused: !controls.paused || !pausedHere.current });
  const touched = useCallback(() => {
    reveal.poke();
    restartResume();
  }, [reveal, restartResume]);
  const swipe = useOwnedSwipe(enabled && ownSwipe && !!position, controls.next, controls.back, restartResume);

  if (!enabled) return null;
  const unit = Math.min(1, (box.w * 0.94) / BAR_WIDTH, (box.h * 0.6) / (WALL_CONTROL_BUTTON_PX.h + 112));
  const togglePause = () => {
    const next = !controls.paused;
    pausedHere.current = next;
    controls.setPaused(next);
  };
  const chip = [album, position ? t('photoControls.position', { at: position.at, count: position.of }) : null].filter(Boolean).join(' · ');

  return (
    <div
      {...swipe}
      data-testid="photo-controls"
      // A tap on the photo holds the screen for a minute, like any list a finger is reading.
      data-rotation-hold="browse"
      data-shown={reveal.shown ? '' : undefined}
      onClick={touched}
      className="absolute inset-0"
      // Above the two slides (0 and 1), a Live Photo's clip (2) and the
      // full-screen photo's clock strip (10), which would otherwise take the
      // tap; the bar covers the clock only while it is up.
      style={{ zIndex: 20, touchAction: ownSwipe ? 'pan-y' : 'manipulation', fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' }}
    >
      {reveal.shown && chip && (
        <div
          data-testid="photo-controls-album"
          className="absolute flex items-center"
          style={{
            left: 32 * unit, top: 32 * unit, gap: 14 * unit, padding: `${12 * unit}px ${24 * unit}px ${12 * unit}px ${18 * unit}px`,
            borderRadius: 999, background: 'rgba(10,14,20,0.62)', color: '#fff', fontSize: 32 * unit, fontWeight: 600,
            maxWidth: `calc(100% - ${64 * unit}px)`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none',
          }}
        >
          <Images size={36 * unit} aria-hidden="true" style={{ flexShrink: 0 }} />
          {chip}
        </div>
      )}
      {reveal.shown && position && (
        <WallControlBar unit={unit} shade="dark" shadeHeight={420} ariaLabel={t('photoControls.label')} testId="photo-controls-bar">
          <WallControlButton icon={<ChevronLeft />} label={tCore('actions.back')} onPress={controls.back} testId="photo-back" />
          <WallControlButton
            icon={controls.paused ? <Play /> : <Pause />}
            label={controls.paused ? t('photoControls.play') : t('photoControls.pause')}
            primary={controls.paused}
            onPress={togglePause}
            testId="photo-pause"
          />
          <WallControlButton icon={<ChevronRight />} label={t('photoControls.next')} onPress={controls.next} testId="photo-next" />
        </WallControlBar>
      )}
      {!reveal.shown && controls.paused && (
        <div
          data-testid="photo-paused-mark"
          aria-label={t('photoControls.play')}
          className="absolute flex items-center justify-center"
          style={{
            right: 24 * unit, top: 24 * unit, width: 84 * unit, height: 84 * unit, borderRadius: '50%',
            background: 'rgba(10,14,20,0.6)', border: `${2 * unit}px solid rgba(255,255,255,0.18)`, color: '#fff', pointerEvents: 'none',
          }}
        >
          <Pause size={38 * unit} fill="currentColor" strokeWidth={0} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/** The name a photo source gives its pictures on the wall's album line, when it has one. */
export function photoAlbumName(source: { kind: string; folder?: string; pictures?: string[] } | null | undefined, allPictures: string): string | null {
  if (!source || source.kind !== 'library') return null;
  if (source.pictures?.length) return null;
  const folder = (source.folder ?? '').replace(/\/+$/, '');
  return folder ? folder.split('/').pop() ?? folder : allPictures;
}
