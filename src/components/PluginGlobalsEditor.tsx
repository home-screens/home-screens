'use client';

import { useLayoutEffect } from 'react';
import AccordionSection from '@/components/editor/AccordionSection';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { usePluginStore } from '@/stores/plugin-store';
import { savePluginSettings } from '@/lib/plugin-settings-client';
import { setHostSettings } from '@/lib/plugin-host-settings';
import { DISPLAY_SDK_STUBS } from '@/lib/plugin-sdk-display-stubs';
import { filterConfigForDisplay } from '@/lib/display-filter';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { getLocation } from '@/lib/location';
import { logger } from '@/lib/logger';

const log = logger('plugin');

/**
 * Convenience hook for plugin ConfigSection components.
 *
 * Wraps the editor store to provide typed config access and a setter
 * that merges partial updates into the module's config.
 *
 * Editor-only — calling from a display component returns empty config
 * and a no-op setter with a console warning.
 *
 * @param moduleId - The module instance ID (from ConfigSection props)
 * @param screenId - The screen ID (from ConfigSection props)
 */
function useModuleConfig<T = Record<string, unknown>>(moduleId: string, screenId: string): { config: T; set: (updates: Partial<T>) => void } {
  // Both lookups go through getActiveScreens, matching how `updateModule`
  // writes. Reading the legacy `config.screens` pool while writing display-aware
  // meant that on a multi-display install this helper either found nothing (and
  // silently dropped the user's edit) or merged a stale sibling display's config
  // back over the live module.
  const mod = useEditorStore((s) => {
    if (!s.config) return undefined;
    const screen = getActiveScreens(s.config, s.selectedDisplayId).find((sc) => sc.id === screenId);
    return screen?.modules.find((m) => m.id === moduleId);
  });
  const updateModule = useEditorStore((s) => s.updateModule);

  const config = (mod?.config ?? {}) as T;

  // Read current config from the store at call time to avoid stale closures
  // when set() is called multiple times in the same tick.
  const set = (updates: Partial<T>) => {
    const state = useEditorStore.getState();
    const screen = state.config
      ? getActiveScreens(state.config, state.selectedDisplayId).find((sc) => sc.id === screenId)
      : undefined;
    const currentMod = screen?.modules.find((m) => m.id === moduleId);
    if (!currentMod) {
      log.warn('useModuleConfig: module not found — is this running outside the editor?');
      return;
    }
    updateModule(screenId, moduleId, {
      config: { ...(currentMod.config ?? {}), ...updates as Record<string, unknown> },
    });
  };

  return { config, set };
}

/**
 * Extends the base `window.__HS_SDK__` with editor-only members.
 *
 * Mounted only in the editor layout so that the editor store, AccordionSection,
 * and their transitive dependencies stay out of the display bundle.
 */
export default function PluginGlobalsEditor() {
  // Push host settings from the editor store so plugins can read them
  const config = useEditorStore((s) => s.config);
  const selectedDisplayId = useEditorStore((s) => s.selectedDisplayId);

  useLayoutEffect(() => {
    if (!window.__HS_SDK__) {
      log.warn('PluginGlobalsEditor: __HS_SDK__ not initialized — PluginGlobals must mount first');
      return;
    }

    // Editor-only SDK additions
    window.__HS_SDK__.AccordionSection = AccordionSection;
    window.__HS_SDK__.useModuleConfig = useModuleConfig;
    // Lets a plugin's configSection embed its own "Connect" button with custom
    // placement. Dispatches a window event the Connection panel listens for,
    // keeping the two decoupled (the plugin never imports host components).
    window.__HS_SDK__.startAuth = (pluginId: string) => {
      if (typeof pluginId !== 'string') return;
      window.dispatchEvent(new CustomEvent('hs-plugin-start-auth', { detail: { pluginId } }));
    };
    // Editor-only settings writer, so a plugin's ConfigSection can offer the
    // plugin-level connection form inline (drag module → connect right there)
    // instead of sending the user to the plugin manager. MERGE semantics over
    // the store's current values: a ConfigSection saving one field (haUrl)
    // must not clobber its siblings (fastUpdates, debugLogging). The store
    // push inside savePluginSettings means getPluginSettings reads the new
    // values immediately after the promise resolves.
    window.__HS_SDK__.setPluginSettings = async (
      pluginId: string,
      updates: Record<string, unknown>,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (typeof pluginId !== 'string' || !updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return { ok: false, error: 'invalid arguments' };
      }
      const current = usePluginStore.getState().pluginSettings.get(pluginId.toLowerCase()) ?? {};
      const result = await savePluginSettings(pluginId, { ...current, ...updates });
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    };

    return () => {
      if (!window.__HS_SDK__) return;
      // AccordionSection and useModuleConfig are genuinely editor-only and are
      // typed optional, so they go away entirely.
      delete window.__HS_SDK__.AccordionSection;
      delete window.__HS_SDK__.useModuleConfig;
      // startAuth and setPluginSettings must stay *present* on every surface —
      // restore the display no-ops rather than leaving holes a plugin would hit
      // as a TypeError. See DISPLAY_SDK_STUBS.
      Object.assign(window.__HS_SDK__, DISPLAY_SDK_STUBS);
    };
  }, []);

  // Keep host settings in sync with editor config. Plugins must see the same
  // values here as the display's ScreenRotator pushes on the wall (a plugin's
  // size-tier logic must not disagree between the editor preview and the
  // wall), so this mirrors the wall's inputs exactly: the per-display path
  // resolves settings through filterConfigForDisplay — the same pure function
  // useLiveConfig feeds ScreenRotator — and the legacy path uses the raw
  // globals, which is what the legacy /display route passes through
  // unfiltered. Don't swap this for getActiveDimensions: it orients
  // unconditionally and skips the display.settings merge, so it can diverge
  // from the wall in exactly the cases this exists to keep in sync.
  useLayoutEffect(() => {
    if (!config) return;
    const settings =
      (selectedDisplayId ? filterConfigForDisplay(config, selectedDisplayId)?.settings : null) ??
      config.settings;
    const location = getLocation(settings);
    setHostSettings({
      timezone: settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      units: settings.weather?.units ?? 'imperial',
      latitude: location?.lat ?? null,
      longitude: location?.lon ?? null,
      displayWidth: settings.displayWidth || DEFAULT_DISPLAY_WIDTH,
      displayHeight: settings.displayHeight || DEFAULT_DISPLAY_HEIGHT,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
    });
  }, [config, selectedDisplayId]);

  return null;
}
