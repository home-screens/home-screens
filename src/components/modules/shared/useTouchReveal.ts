'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAutoClose } from './useAutoClose';

export interface TouchReveal {
  /** The controls are up. */
  shown: boolean;
  /** A touch: bring the controls up, or keep them up for another full wait. */
  poke: () => void;
  /** Put them away now (an action that ends what they control). */
  hide: () => void;
}

/**
 * Controls that stay out of the way until a finger asks for them: a picture,
 * a running timer or a video fills the wall clean, a tap brings its buttons
 * up, and they go again after `idleMs` with nobody touching. While `pinned`
 * (a paused timer, a paused slideshow) they stay up, since the next thing
 * anyone wants is the button that carries on. While not `enabled` (a step
 * waiting for its own "Done!" tap, a finished timer) they are down and a poke
 * does nothing, so the surface's own tap keeps its meaning.
 */
export function useTouchReveal({ idleMs, pinned = false, enabled = true }: { idleMs: number; pinned?: boolean; enabled?: boolean }): TouchReveal {
  const [raised, setRaised] = useState(false);
  const hide = useCallback(() => setRaised(false), []);
  const restart = useAutoClose(hide, idleMs, { paused: !raised || pinned || !enabled });
  const poke = useCallback(() => {
    if (!enabled) return;
    setRaised(true);
    restart();
  }, [enabled, restart]);
  // Leaving a state where they are off puts them down, so they never pop back
  // up by themselves when it ends (the routine's next step after a "Done!").
  useEffect(() => {
    if (!enabled) setRaised(false);
  }, [enabled]);
  return { shown: enabled && (raised || pinned), poke, hide };
}
