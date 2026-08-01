import {
  findMainDisplay,
  isMainDisplay,
} from '@/lib/display-filter';
import {
  getActiveScreens,
  buildBootstrapMain,
  buildNewDisplay,
} from '@/lib/editor-multi-display';
import { COALESCE_KEYS } from '@/stores/editor-save';
import type { DisplayActions, EditorGet, MutateConfig } from './types';

/** Display-node CRUD, including the multi-display bootstrap paths. */
export function createDisplaySlice(
  get: EditorGet,
  mutateConfig: MutateConfig,
): DisplayActions {
  return {
    addDisplay: (display) => {
      // Multi-display bootstrap has two paths, both handled below via
      // `buildBootstrapMain` / `buildNewDisplay`:
      //   1. First display added is non-main → auto-seed a sibling `main` from
      //      the existing global screens + profiles so the hub's kiosk keeps
      //      showing what it was showing before multi-display turned on.
      //   2. First display added IS `main` without its own screens → that new
      //      display itself inherits global screens/profiles (can't sibling-seed
      //      because there can only be one `main`).
      //
      // Profiles are per-display in multi-display mode; we deep-clone the legacy
      // shared pool only onto the bootstrapped main, and every subsequent display
      // starts with an empty profile list alongside its empty screens list.
      mutateConfig((config) => {
        const existingDisplays = config.displays ?? [];
        const isFirstDisplay = existingDisplays.length === 0;

        // Path 1: the first display the user adds is NOT `main`. Seed a sibling
        // `main` from the legacy globals so the hub kiosk keeps rendering its
        // existing layout. (An empty display list means there is no `main` yet,
        // so `isFirstDisplay` alone is a sufficient trigger.)
        const seedSiblingMain = isFirstDisplay && !isMainDisplay(display.id);

        // Path 2: the first display added IS `main` and brings no screens of its
        // own. It can't sibling-seed (there is only one `main`), so it inherits
        // the legacy global screens/profiles/activeProfile directly.
        const mainInheritsGlobals =
          isFirstDisplay && isMainDisplay(display.id) && !display.screens;

        const nextDisplays = [...existingDisplays];

        if (seedSiblingMain) {
          nextDisplays.push(buildBootstrapMain(config));
        }

        nextDisplays.push(buildNewDisplay(display, config, mainInheritsGlobals));

        // Keep the editor focused on "main" so the user's existing screens stay
        // visible until they explicitly switch to the newly-added display.
        let newSelectedId = get().selectedDisplayId;
        if (newSelectedId === null && nextDisplays.length > 0) {
          newSelectedId = findMainDisplay(nextDisplays)!.id;
        }

        return {
          config: { ...config, displays: nextDisplays },
          selectedDisplayId: newSelectedId,
        };
      });
    },

    updateDisplay: (id, updates) => {
      mutateConfig((config) => ({
        config: {
          ...config,
          displays: (config.displays ?? []).map((d) =>
            d.id === id ? { ...d, ...updates } : d,
          ),
        },
      }), { coalesce: COALESCE_KEYS.updateDisplay(id) });
    },

    removeDisplay: (id) => {
      // The hub Pi's `main` display is the source of the original
      // single-display layout (auto-created from `config.screens` on first
      // multi-display bootstrap). Removing it would orphan those screens
      // and reset the hub kiosk to an unadopted state, so we hard-block it
      // at the store layer rather than relying on every UI surface to hide
      // its delete affordance. UIs are still free to hide the trash button
      // for clarity, but this guard means a stray call (tests, scripts,
      // future surfaces) can't accidentally delete main.
      if (isMainDisplay(id)) return;
      const { selectedDisplayId, selectedScreenId } = get();
      mutateConfig((config) => {
        // Collapse an empty result back to undefined so a legacy single-display
        // config (where `displays` never existed) does not get promoted to an
        // empty-array "multi-display mode with no displays" state.
        const filtered = (config.displays ?? []).filter((d) => d.id !== id);
        const nextDisplays = filtered.length > 0 ? filtered : undefined;

        // If the currently-selected display is being removed, point the editor
        // back at "main" (or the first remaining display, or null for legacy).
        let nextSelected = selectedDisplayId;
        if (selectedDisplayId === id) {
          nextSelected = findMainDisplay(nextDisplays)?.id ?? null;
        }

        // Re-resolve selectedScreenId against the new active display: the
        // previously-selected screen was owned by the removed display and is
        // not reachable anywhere else, so we'd otherwise leave the editor
        // pointing at a ghost ID until the user manually clicks a tab.
        let nextSelectedScreenId = selectedScreenId;
        if (nextSelected !== selectedDisplayId) {
          const nextConfig = { ...config, displays: nextDisplays };
          const nextActiveScreens = getActiveScreens(nextConfig, nextSelected);
          nextSelectedScreenId = nextActiveScreens[0]?.id ?? null;
        }

        return {
          config: { ...config, displays: nextDisplays },
          selectedDisplayId: nextSelected,
          selectedScreenId: nextSelectedScreenId,
          selectedModuleId: nextSelected !== selectedDisplayId ? null : get().selectedModuleId,
        };
      });
    },
  };
}
