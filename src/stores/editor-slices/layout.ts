import type { GlobalSettings, ScreenConfiguration } from '@/types/config';
import { pruneDanglingScreenRefs } from '@/lib/display-filter';
import {
  getActiveScreens,
  getActiveDimensions,
  withActiveScreens,
  resolveProfileTarget,
} from '@/lib/editor-multi-display';
import {
  createLayoutExport,
  importLayout as importLayoutCore,
} from '@/lib/layout-export';
import { downloadBlob } from '@/lib/download';
import { syncEditorUrl } from '@/stores/editor-url';
import type { EditorGet, LayoutActions, MutateConfig } from './types';

/** Layout export to file and layout import onto the active display. */
export function createLayoutSlice(
  get: EditorGet,
  mutateConfig: MutateConfig,
): LayoutActions {
  return {
    exportLayout: (options = {}) => {
      const { config, selectedDisplayId } = get();
      if (!config) return;
      // Export operates on the screens the editor is currently working on —
      // a per-display export in multi-display mode, the global pool in legacy.
      const activeScreens = getActiveScreens(config, selectedDisplayId);
      const dims = getActiveDimensions(config, selectedDisplayId);
      // A display that owns its profile list exports THOSE profiles, not the
      // legacy root pool — the root pool can't reference this display's
      // screen IDs, so createLayoutExport's overlap filter would drop
      // everything and the export would ship profile-less.
      const profileTarget = resolveProfileTarget(config, selectedDisplayId);
      const tempConfig: ScreenConfiguration = {
        ...config,
        screens: activeScreens,
        ...(profileTarget.kind === 'display'
          ? { profiles: profileTarget.display.profiles }
          : {}),
        settings: {
          ...config.settings,
          displayWidth: dims.width,
          displayHeight: dims.height,
        },
      };
      const layout = createLayoutExport(tempConfig, options);
      const slug = (options.name ?? 'my-layout')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `home-screens-${slug}.json`);
    },

    importLayoutAction: (layout, options) => {
      const { selectedDisplayId } = get();
      let firstNewId: string | null = null;
      mutateConfig((config) => {
        // Work against a temp single-display view of the active screens so
        // importLayoutCore's existing logic can scale/clamp modules to the
        // target canvas without knowing about displays. When the display owns
        // its profile list, the temp view also swaps in those profiles so
        // add-mode merges against the list this display actually reads,
        // not the legacy root pool.
        const activeScreens = getActiveScreens(config, selectedDisplayId);
        const dims = getActiveDimensions(config, selectedDisplayId);
        const profileTarget = resolveProfileTarget(config, selectedDisplayId);
        const tempConfig: ScreenConfiguration = {
          ...config,
          screens: activeScreens,
          ...(profileTarget.kind === 'display'
            ? { profiles: profileTarget.display.profiles }
            : {}),
          settings: {
            ...config.settings,
            displayWidth: dims.width,
            displayHeight: dims.height,
          },
        };
        const updated = importLayoutCore(layout, tempConfig, options);

        // Apply the screen changes back to the active container, and carry
        // any applyVisual settings/profile changes forward on the root config.
        //
        // In multi-display mode, preserve the ORIGINAL global displayWidth/Height
        // when writing updated.settings back — the temp-config shim set those
        // fields to the active display's dims so importLayoutCore could scale
        // modules against the right canvas, but writing those per-display dims
        // onto the root config would silently corrupt the global fallback for
        // any display that relies on it.
        const nextConfig = withActiveScreens(config, selectedDisplayId, updated.screens);
        const settingsOut: GlobalSettings = selectedDisplayId
          ? {
              ...updated.settings,
              displayWidth: config.settings.displayWidth,
              displayHeight: config.settings.displayHeight,
              ...(config.settings.displayTransform != null
                ? { displayTransform: config.settings.displayTransform }
                : {}),
              // A display-owned import must not touch the global activeProfile
              // (importLayoutCore clears it in replace mode, but that clear
              // belongs to the display, applied below).
              ...(profileTarget.kind === 'display'
                ? { activeProfile: config.settings.activeProfile }
                : {}),
            }
          : updated.settings;

        // Imported profiles land where this display actually reads them:
        // the display's owned `profiles` list when it has one, else the
        // legacy root pool. Writing display-scoped profiles to the root
        // pool would save dead config nothing reads (getDisplayProfiles
        // prefers the owned list).
        let merged: ScreenConfiguration;
        if (profileTarget.kind === 'display') {
          const nextDisplays = [...nextConfig.displays!];
          const displayWithScreens = nextDisplays[profileTarget.idx];
          const nextProfiles = updated.profiles ?? [];
          const activeStillExists = displayWithScreens.activeProfile != null
            && nextProfiles.some((p) => p.id === displayWithScreens.activeProfile);
          nextDisplays[profileTarget.idx] = {
            ...displayWithScreens,
            profiles: nextProfiles,
            // Replace-mode wipes the old owned profiles (new ones get fresh
            // IDs), so a stale activeProfile must be cleared or the config
            // validator rejects the save.
            ...(displayWithScreens.activeProfile != null && !activeStillExists
              ? { activeProfile: undefined }
              : {}),
          };
          merged = { ...nextConfig, displays: nextDisplays, settings: settingsOut };
        } else {
          merged = {
            ...nextConfig,
            settings: settingsOut,
            ...(updated.profiles ? { profiles: updated.profiles } : {}),
          };
        }

        const existingIds = new Set(activeScreens.map((s) => s.id));

        // Replace mode swaps the screen list wholesale but leaves the display's
        // rules untouched, so any `showScreen` rule still points at a now-gone
        // screen id — which `validateDisplayRules` rejects, making the config
        // unsaveable. Blank those targets the same way a screen deletion does,
        // reusing `pruneDanglingScreenRefs` per removed id (add mode removes
        // nothing, so it's skipped entirely).
        let pruned = merged;
        if (options.mode === 'replace') {
          const newIds = new Set(updated.screens.map((s) => s.id));
          for (const removedId of existingIds) {
            if (!newIds.has(removedId)) {
              pruned = pruneDanglingScreenRefs(pruned, removedId, selectedDisplayId);
            }
          }
        }

        firstNewId = updated.screens.find((s) => !existingIds.has(s.id))?.id
          ?? updated.screens[0]?.id ?? null;
        return {
          config: pruned,
          selectedScreenId: firstNewId,
          selectedModuleId: null,
        };
      });
      if (firstNewId) {
        syncEditorUrl({ screen: firstNewId });
      }
    },
  };
}
