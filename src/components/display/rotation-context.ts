'use client';

import { createContext, useContext } from 'react';
import type { DockScreen } from '@/lib/screen-dock';

/**
 * The rotation a module is part of, for modules that show or steer it (the
 * Display Control dock). ScreenRotator provides the live rotation list, every
 * switched-on screen of the display, and the showing screen; the editor
 * canvas provides the active display's screens and the selected tab, so the
 * dock in the editor shows the real screens.
 *
 * `showScreen` shows a screen by id on this very rotation (no hub round
 * trip): a jump when the screen is rotating, a pinned stay when it is not.
 * Null where nothing rotates: unit tests and the background-provider layer.
 */
export interface RotationState {
  /** The rotation as it stands, in order. */
  screens: readonly DockScreen[];
  /** Every switched-on screen of the display, rotating or not, in editor order. */
  allScreens: readonly DockScreen[];
  /** The screen in front of the viewer; null when nothing shows. */
  activeScreenId: string | null;
  showScreen: (screenId: string) => void;
}

const RotationContext = createContext<RotationState | null>(null);

export const RotationProvider = RotationContext.Provider;

export function useRotation(): RotationState | null {
  return useContext(RotationContext);
}
