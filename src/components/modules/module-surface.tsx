'use client';

import { createContext, useContext } from 'react';

/**
 * Which surface a module is rendering on. The editor canvas provides
 * `'editor'`, an editor preview window (`/display?preview=1`) provides
 * `'preview'`; everything else (the kiosk, the background-provider layer,
 * tests) falls through to the `'display'` default. A preview looks like the
 * display but must never act on the real one.
 *
 * Read this only for presentation that has no data-shaped equivalent: a
 * setup card that becomes a link in the editor, sample numbers that are fine
 * in a preview but must never reach the wall. Data differences between the
 * two surfaces still go through `buildModuleProps`.
 */
export type ModuleSurface = 'display' | 'editor' | 'preview';

const ModuleSurfaceContext = createContext<ModuleSurface>('display');

export const ModuleSurfaceProvider = ModuleSurfaceContext.Provider;

export function useModuleSurface(): ModuleSurface {
  return useContext(ModuleSurfaceContext);
}
