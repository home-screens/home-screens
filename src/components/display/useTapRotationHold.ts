'use client';

import { useEffect } from 'react';
import { holdRotationFor } from '@/lib/interaction-hold';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';

/**
 * How long a tap on a control keeps the screen where it is.
 *
 * Deliberate taps come a couple of seconds apart and each one extends the
 * window, so this only has to cover the gap between two of them, not a whole
 * session. Keeping it short also keeps it from outliving an overlay that holds
 * rotation on its own: a wall nobody is standing at is back to normal well
 * inside one screen's dwell.
 */
export const TAP_ROTATION_HOLD_MS = 8_000;

/**
 * How long a touch on a browsing surface keeps the screen where it is: the
 * recipe book, a list scrolled away from home, the grocery list. Someone
 * reading recipes pauses longer than eight seconds between touches, and the
 * screen rotating away took their chip, their search and their place with it.
 * The same minute after which a scrolled list slides home.
 */
export const BROWSE_ROTATION_HOLD_MS = WALL_SCROLL_IDLE_MS;

/** A surface whose every touch earns the browsing minute (`BROWSE_ROTATION_HOLD_MS`). */
export const BROWSE_HOLD_ATTR = { 'data-rotation-hold': 'browse' } as const;
const BROWSE_SELECTOR = '[data-rotation-hold="browse"]';

/**
 * Controls the hold answers to. A tap on the page background is someone
 * brushing past; a tap on a button, a checkbox or a link is someone using the
 * display, which is what earns the screen a moment longer.
 */
const CONTROL_SELECTOR = 'button, [role="button"], [role="checkbox"], [role="switch"], a[href], input, select, textarea, label';

/**
 * The pagination dots are controls too, but tapping one is navigation, and the
 * double-tap on the active dot is the explicit pause. Neither wants a hold
 * layered underneath it.
 */
const EXCLUDED_SELECTOR = '[data-rotation-hold="off"]';

/**
 * Hold the rotation briefly whenever someone taps a control on the display.
 *
 * Measured before this existed: the screen changed at t+56s, the chore chart a
 * finger was heading for became page background, and the tap produced zero API
 * calls. The screen it rotates to has no controls at all, so a kid could not
 * tick anything for about two minutes.
 *
 * Pauses only the rotation timer, never flick navigation: a flick right after
 * a tap is someone asking for the next screen, and the flick is one of the
 * ways a held display is unstuck. No paused pill appears either: this is not
 * the deliberate double-tap pause, and it self-releases.
 */
export function useTapRotationHold(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(EXCLUDED_SELECTOR)) return;
      if (target.closest(BROWSE_SELECTOR)) { holdRotationFor(BROWSE_ROTATION_HOLD_MS); return; }
      if (!target.closest(CONTROL_SELECTOR)) return;
      holdRotationFor(TAP_ROTATION_HOLD_MS);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [enabled]);
}
