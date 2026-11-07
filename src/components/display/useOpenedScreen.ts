'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The quiet time of a screen that shows only when opened: `onBack` runs
 * `quietMs` after the screen came up, or after the last touch on it. A
 * touch is any `pointerdown` on the page (a scroll, a recipe card, a
 * search), caught in the capture phase so a module that stops the event
 * still counts. `0` means the screen stays until someone moves on, so no
 * clock runs. Nothing runs while `screenId` is null (no opened screen is in
 * front).
 *
 * While `paused` (a recipe card or another overlay holds the display) the
 * clock stops and starts again in full when the overlay goes, so a card that
 * promises to stay ten minutes is not cut off by the screen's two. A new
 * `restartKey` (the screen asked for again while it is up) starts it again.
 *
 * Returns when the display will go back (epoch ms), or null while no clock
 * runs, so the back chip can show the last seconds draining.
 *
 * `onBack` lives in a ref so a parent re-render never resets the clock;
 * only a touch, a change of screen, or a change of its quiet time does.
 */
export function useOpenedScreen(
  screenId: string | null,
  quietMs: number,
  onBack: () => void,
  paused = false,
  restartKey: number = 0,
): number | null {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (!screenId || quietMs <= 0 || paused) {
      setDeadline(null);
      return;
    }
    let timer = setTimeout(() => onBackRef.current(), quietMs);
    setDeadline(Date.now() + quietMs);
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onBackRef.current(), quietMs);
      setDeadline(Date.now() + quietMs);
    };
    document.addEventListener('pointerdown', restart, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', restart, true);
    };
  }, [screenId, quietMs, paused, restartKey]);
  return deadline;
}
