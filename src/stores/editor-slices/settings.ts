import type { DisplayNodeSettings } from '@/types/config';
import { COALESCE_KEYS } from '@/stores/editor-save';
import { pruneCalendarSourceRefs } from '@/lib/calendar-source-refs';
import { applyTouchChanges, type TouchChange } from '@/lib/touch-all';
import type { MutateConfig, SettingsActions } from './types';

/**
 * Global settings and per-display setting overrides. Kept in one slice
 * because they share the `settings` coalesce key: a Save that writes both
 * global and per-display overrides lands as a single undo entry.
 */
export function createSettingsSlice(mutateConfig: MutateConfig): SettingsActions {
  return {
    // A calendar source the new settings no longer have takes the other
    // mentions of it (which calendar modules show it; who owns it, for a
    // removed link) with it in the same edit.
    updateSettings: (settings) => {
      mutateConfig((config) => {
        const next = { ...config, settings: { ...config.settings, ...settings } };
        return { config: pruneCalendarSourceRefs(next, config.settings.calendar) };
      }, { coalesce: COALESCE_KEYS.settings });
    },

    updateDisplaySettings: (displayId, partial) => {
      mutateConfig((config) => {
        const displays = config.displays;
        if (!displays) return {};
        const idx = displays.findIndex((d) => d.id === displayId);
        if (idx === -1) return {};

        // Clone the current override object and merge the partial in. A field
        // set to `undefined` in `partial` is treated as a "reset to inherited"
        // — delete the key so the shallow merge in filterConfigForDisplay
        // falls back to the global value instead of writing `undefined` over it.
        const nextSettings: DisplayNodeSettings = { ...(displays[idx].settings ?? {}) };
        for (const key of Object.keys(partial) as Array<keyof DisplayNodeSettings>) {
          const value = partial[key];
          if (value === undefined) {
            delete nextSettings[key];
          } else {
            (nextSettings as Record<string, unknown>)[key] = value;
          }
        }

        const nextDisplays = [...displays];
        // If the resulting overrides object is empty, strip the `settings`
        // field from the display entirely so the on-disk JSON stays clean
        // and a grep for `"settings":` doesn't surface a noise hit.
        if (Object.keys(nextSettings).length === 0) {
          const { settings: _drop, ...rest } = nextDisplays[idx];
          void _drop;
          nextDisplays[idx] = rest;
        } else {
          nextDisplays[idx] = { ...nextDisplays[idx], settings: nextSettings };
        }

        return { config: { ...config, displays: nextDisplays } };
      }, { coalesce: COALESCE_KEYS.settings });
    },

    applyTouchChanges: (changes: readonly TouchChange[], direction = 'forward') => {
      mutateConfig((config) => {
        const next = applyTouchChanges(config, changes, direction);
        return next === config ? {} : { config: next };
      });
    },
  };
}
