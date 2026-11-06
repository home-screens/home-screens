'use client';

import { createContext, useContext } from 'react';

/**
 * Whether the wall this module is on has burn-in protection switched on
 * (`settings.pixelShift`). ScreenRotator provides it for a real display and
 * never for its preview; the editor canvas provides nothing, so modules
 * there read false and stay pixel-exact.
 *
 * The display setting means "protect this panel": the rotator shifts the
 * whole wall a few pixels, and a module that draws bright static content
 * with room to move (the Full-Screen Photo Viewer's clock) answers the same
 * switch by wandering inside its own box. There is no per-module switch.
 */
const BurnInProtectionContext = createContext<boolean>(false);

export const BurnInProtectionProvider = BurnInProtectionContext.Provider;

export function useBurnInProtection(): boolean {
  return useContext(BurnInProtectionContext);
}
