'use client';
import { useState, useEffect, useCallback } from 'react';
import { shuffleArray } from '@/lib/shuffle';

/**
 * Cycles through indices 0..itemCount-1 on a timer.
 * Returns 0 and does not start a timer when itemCount <= 1.
 */
export function useRotatingIndex(itemCount: number, intervalMs: number): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (itemCount <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % itemCount);
    }, intervalMs);
    return () => clearInterval(id);
  }, [itemCount, intervalMs]);

  return index;
}

/**
 * Rotation for mixed photo/video lists, where per-item duration replaces the
 * fixed interval: photo slides auto-advance after `intervalMs` (the timeout
 * resets on index change), video slides advance only when the caller invokes
 * `advance()` — wired to VideoLayer's onEnded, which already folds in error,
 * stall, and max-duration force-advance.
 *
 * `playVideos: false` (editor preview — videos show a poster and never play)
 * treats every slide as timed so the rotation still moves.
 */
export function useMediaRotation(
  items: Array<{ type: 'image' | 'video' }>,
  intervalMs: number,
  shuffle = false,
  playVideos = true,
): [number, () => void] {
  const count = items.length;
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);

  // Build or rebuild the visit order whenever count or shuffle changes
  useEffect(() => {
    if (count <= 0) {
      setOrder([]);
      setPos(0);
      return;
    }
    const arr = Array.from({ length: count }, (_, i) => i);
    setOrder(shuffle ? shuffleArray(arr) : arr);
    setPos(0);
  }, [count, shuffle]);

  const advance = useCallback(() => {
    if (count <= 1) return;
    setPos((prev) => {
      const next = prev + 1;
      if (next >= count) {
        if (shuffle) setOrder((prevOrder) => shuffleArray(prevOrder));
        return 0;
      }
      return next;
    });
  }, [count, shuffle]);

  const index = order.length > 0 ? (order[pos % order.length] ?? 0) : 0;
  const isEventDriven = playVideos && items[index]?.type === 'video';

  useEffect(() => {
    if (count <= 1 || isEventDriven) return;
    const id = setTimeout(advance, intervalMs);
    return () => clearTimeout(id);
    // `pos` restarts the timer after each slide change, including wrap-around
    // to the same index after a reshuffle.
  }, [count, isEventDriven, pos, index, intervalMs, advance]);

  return [index, advance];
}
