import { createContext, useContext } from 'react';

/**
 * True inside a full-screen module's pre-content state (loading, not
 * updating, failed). Those are read across a room on a canvas-sized ground,
 * so the shared states draw their quiet lines in a stronger ink there than
 * on a card, where they stay out of the way.
 */
export const FullscreenStateContext = createContext(false);

export function useFullscreenState(): boolean {
  return useContext(FullscreenStateContext);
}
