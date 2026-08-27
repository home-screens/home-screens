'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
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
 *
 * Returns [batch, index, advance] where `batch` is the array actually being
 * walked. A refreshed `items` array is held pending while its `batchKey`
 * (the fetch URL) is unchanged: the current batch runs to completion, and
 * the refresh takes over when the rotation wraps — so a periodic re-shuffle
 * never swaps slides mid-pass or revisits photos early. A changed key (new
 * folder/album/source), a different length, or a one-item batch adopts
 * immediately. Callers that pass no key get length-based adoption instead.
 */
export function useMediaRotation<T extends { type: 'image' | 'video' }>(
  items: T[],
  intervalMs: number,
  shuffle = false,
  playVideos = true,
  batchKey?: string,
): [T[], number, () => void] {
  const pendingRef = useRef(items);
  const keyRef = useRef<string | undefined>(batchKey);
  const builtRef = useRef(false);
  const [active, setActive] = useState<T[]>(items);
  const [order, setOrder] = useState<number[]>([]);
  const [pos, setPos] = useState(0);

  const adopt = useCallback((batch: T[]) => {
    setActive(batch);
    const arr = Array.from({ length: batch.length }, (_, i) => i);
    setOrder(batch.length > 0 && shuffle ? shuffleArray(arr) : arr);
    setPos(0);
  }, [shuffle]);

  // Adopt the incoming batch now, or hold it until the pass wraps. Keyed
  // callers hold same-source refreshes until the pass wraps; without a key
  // the rule is length-based (matching the old count-driven rebuild), since
  // array identity is caller-dependent and cannot drive adoption.
  useEffect(() => {
    pendingRef.current = items;
    const changed = batchKey === undefined
      ? items.length !== active.length
      : keyRef.current !== batchKey || active.length <= 1 || active.length !== items.length;
    if (items.length === 0 || !builtRef.current || changed) {
      keyRef.current = batchKey;
      builtRef.current = true;
      adopt(items);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- active.length is only needed when items change
  }, [items, batchKey]);

  // A held refresh takes over when the pass wraps back to the start.
  useEffect(() => {
    if (pos !== 0 || active.length === 0 || pendingRef.current === active) return;
    keyRef.current = batchKey;
    adopt(pendingRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on wrap commits only
  }, [pos]);

  const count = active.length;

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
  const isEventDriven = playVideos && active[index]?.type === 'video';

  useEffect(() => {
    if (count <= 1 || isEventDriven) return;
    const id = setTimeout(advance, intervalMs);
    return () => clearTimeout(id);
    // `pos` restarts the timer after each slide change, including wrap-around
    // to the same index after a reshuffle.
  }, [count, isEventDriven, pos, index, intervalMs, advance]);

  return [active, index, advance];
}
