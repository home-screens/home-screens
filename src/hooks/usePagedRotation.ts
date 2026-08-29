'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A rotating index that can also be driven by hand. Auto-advances every
 * `intervalMs`; `next` / `prev` / `goTo` move immediately and restart the
 * timer so a tap is never followed by an auto-advance a moment later.
 * Resets to 0 when `count` changes. Never starts a timer for count <= 1.
 */
export function usePagedRotation(count: number, intervalMs: number): {
  index: number;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
} {
  const [index, setIndex] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % countRef.current);
    }, Math.max(500, intervalMs));
    return () => clearInterval(id);
  }, [count, intervalMs, epoch]);

  const bump = useCallback(() => setEpoch((e) => e + 1), []);
  const next = useCallback(() => {
    if (countRef.current <= 1) return;
    setIndex((prev) => (prev + 1) % countRef.current);
    bump();
  }, [bump]);
  const prev = useCallback(() => {
    if (countRef.current <= 1) return;
    setIndex((prev) => (prev - 1 + countRef.current) % countRef.current);
    bump();
  }, [bump]);
  const goTo = useCallback((i: number) => {
    const c = countRef.current;
    if (c <= 0) return;
    setIndex(((Math.round(i) % c) + c) % c);
    bump();
  }, [bump]);

  return { index: count > 0 ? index % count : 0, next, prev, goTo };
}
