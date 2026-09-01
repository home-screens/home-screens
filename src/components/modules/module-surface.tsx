'use client';

import { createContext, useContext } from 'react';

/**
 * Which surface a module is rendering on. The editor canvas provides
 * `'editor'`; everything else (the kiosk, the background-provider layer,
 * tests) falls through to the `'display'` default.
 *
 * Read this only for presentation that has no data-shaped equivalent: a
 * setup card that becomes a link in the editor, sample numbers that are fine
 * in a preview but must never reach the wall. Data differences between the
 * two surfaces still go through `buildModuleProps`.
 */
const ModuleSurfaceContext = createContext<'display' | 'editor'>('display');

export const ModuleSurfaceProvider = ModuleSurfaceContext.Provider;

export function useModuleSurface(): 'display' | 'editor' {
  return useContext(ModuleSurfaceContext);
}
