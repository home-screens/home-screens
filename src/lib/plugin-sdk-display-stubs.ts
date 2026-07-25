import { logger } from '@/lib/logger';
import type { HsSdk } from '@/types/plugins';

const log = logger('plugin');

/**
 * Display-side implementations of the two SDK members whose real behavior is
 * editor-only.
 *
 * They exist so `startAuth` and `setPluginSettings` are *always present* on
 * `window.__HS_SDK__`, on every surface. A plugin can then call them without
 * feature-detecting: on a kiosk they warn and no-op instead of being
 * `undefined`. `ModuleErrorBoundary` now contains a render-time throw to the one
 * widget, but these are still worth having: a boundary turns a crash into a
 * visible "could not be shown" placeholder, whereas a present-but-inert stub
 * lets the rest of the plugin keep working. They also cover throws the boundary
 * cannot catch — an event handler or an async callback firing after render.
 *
 * PluginGlobals installs these as part of the base SDK; PluginGlobalsEditor
 * overwrites them with the real implementations while the editor is mounted and
 * restores these on unmount.
 */
export const DISPLAY_SDK_STUBS: Pick<HsSdk, 'startAuth' | 'setPluginSettings'> = {
  startAuth: () => {
    log.warn('__HS_SDK__.startAuth is editor-only — ignored on the display');
  },
  setPluginSettings: async () => {
    log.warn('__HS_SDK__.setPluginSettings is editor-only — ignored on the display');
    return { ok: false, error: 'setPluginSettings is editor-only' };
  },
};
