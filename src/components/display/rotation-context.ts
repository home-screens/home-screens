'use client';

import { createContext, useContext } from 'react';
import type { DockScreen } from '@/lib/screen-dock';

/**
 * The rotation a module is part of, for modules that show or steer it (the
 * Display Control dock). ScreenRotator provides the live rotation list and
 * the showing screen; the editor canvas provides the active display's screens
 * and the selected tab, so the dock in the editor shows the real screens.
 *
 * `goToScreen` jumps this very rotation (no hub round trip). Null where
 * nothing rotates: unit tests and the background-provider layer.
 */
export interface RotationState {
  screens: readonly DockScreen[];
  activeIndex: number;
  goToScreen: (index: number) => void;
}

const RotationContext = createContext<RotationState | null>(null);

export const RotationProvider = RotationContext.Provider;

export function useRotation(): RotationState | null {
  return useContext(RotationContext);
}
