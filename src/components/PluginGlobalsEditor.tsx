'use client';

import { useLayoutEffect } from 'react';
import AccordionSection from '@/components/editor/AccordionSection';
import { useEditorStore } from '@/stores/editor-store';
import { setHostSettings } from '@/lib/plugin-host-settings';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';

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
  const mod = useEditorStore((s) => {
    const screen = s.config?.screens.find((sc) => sc.id === screenId);
    return screen?.modules.find((m) => m.id === moduleId);
  });
  const updateModule = useEditorStore((s) => s.updateModule);

  const config = (mod?.config ?? {}) as T;

  // Read current config from the store at call time to avoid stale closures
  // when set() is called multiple times in the same tick.
  const set = (updates: Partial<T>) => {
    const state = useEditorStore.getState();
    const screen = state.config?.screens.find((sc) => sc.id === screenId);
    const currentMod = screen?.modules.find((m) => m.id === moduleId);
    if (!currentMod) {
      console.warn('[plugin] useModuleConfig: module not found — is this running outside the editor?');
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
  const settings = useEditorStore((s) => s.config?.settings);

  useLayoutEffect(() => {
    if (!window.__HS_SDK__) {
      console.warn('[plugin] PluginGlobalsEditor: __HS_SDK__ not initialized — PluginGlobals must mount first');
      return;
    }

    // Editor-only SDK additions
    window.__HS_SDK__.AccordionSection = AccordionSection;
    window.__HS_SDK__.useModuleConfig = useModuleConfig;

    return () => {
      if (!window.__HS_SDK__) return;
      delete window.__HS_SDK__.AccordionSection;
      delete window.__HS_SDK__.useModuleConfig;
    };
  }, []);

  // Keep host settings in sync with editor config
  useLayoutEffect(() => {
    if (!settings) return;
    const lat = settings.latitude ?? settings.weather?.latitude ?? null;
    const lon = settings.longitude ?? settings.weather?.longitude ?? null;
    setHostSettings({
      timezone: settings.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      units: settings.weather?.units ?? 'imperial',
      latitude: lat,
      longitude: lon,
      displayWidth: settings.displayWidth || DEFAULT_DISPLAY_WIDTH,
      displayHeight: settings.displayHeight || DEFAULT_DISPLAY_HEIGHT,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
    });
  }, [settings]);

  return null;
}
