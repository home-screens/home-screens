'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** A tap that settles faster than this still shows its pressed state, so the feedback is visible. */
const MIN_PRESSED_MS = 180;

/**
 * Which tappable key (a todo item, a chore + member) currently has a tap in
 * flight, so its checkbox can draw the pressed state until the request
 * settles. One key at a time: the modules already dedupe repeat taps on the
 * same key, and a second key tapped mid-flight simply takes over the state.
 */
export function usePressedKey(): [string | null, (key: string, action: () => Promise<unknown>) => Promise<void>] {
  const [pressed, setPressed] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const press = useCallback(async (key: string, action: () => Promise<unknown>) => {
    setPressed(key);
    const started = Date.now();
    try {
      await action();
    } finally {
      const remaining = MIN_PRESSED_MS - (Date.now() - started);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (mounted.current) setPressed((current) => (current === key ? null : current));
    }
  }, []);

  return [pressed, press];
}
