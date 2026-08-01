import { v4 as uuidv4 } from 'uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { Screen } from '@/types/config';
import { pruneDanglingScreenRefs } from '@/lib/display-filter';
import { getActiveScreens, withActiveScreens } from '@/lib/editor-multi-display';
import { COALESCE_KEYS } from '@/stores/editor-save';
import { syncEditorUrl } from '@/stores/editor-url';
import type { EditorGet, MutateConfig, ScreenActions } from './types';

/** Screen CRUD and ordering on the active display. */
export function createScreenSlice(
  get: EditorGet,
  mutateConfig: MutateConfig,
): ScreenActions {
  return {
    addScreen: () => {
      const { config, selectedDisplayId } = get();
      if (!config) return;
      const currentScreens = getActiveScreens(config, selectedDisplayId);
      const newScreen: Screen = {
        id: uuidv4(),
        name: `Screen ${currentScreens.length + 1}`,
        backgroundImage: '',
        modules: [],
      };
      mutateConfig((cfg) => ({
        config: withActiveScreens(
          cfg,
          selectedDisplayId,
          [...getActiveScreens(cfg, selectedDisplayId), newScreen],
        ),
        selectedScreenId: newScreen.id,
        selectedModuleId: null,
      }));
      syncEditorUrl({ screen: newScreen.id });
    },

    removeScreen: (id) => {
      const { config, selectedScreenId, selectedDisplayId } = get();
      if (!config) return;
      const activeScreens = getActiveScreens(config, selectedDisplayId);
      if (activeScreens.length <= 1) return;
      const screens = activeScreens.filter((s) => s.id !== id);

      // Apply the screen removal first, then cascade-prune any dangling
      // references. Ordering matters — the pruner scans whatever config it's
      // handed, so swapping these would overwrite the removal with the
      // stale pre-removal display list. Centralising the cascade in
      // `pruneDanglingScreenRefs` keeps the "where can a screen id live?"
      // knowledge in one place next to `validateDisplays`.
      const withRemovedScreen = withActiveScreens(config, selectedDisplayId, screens);
      const nextConfig = pruneDanglingScreenRefs(withRemovedScreen, id, selectedDisplayId);

      const newSelectedId = selectedScreenId === id ? screens[0]?.id ?? null : selectedScreenId;
      mutateConfig(() => ({
        config: nextConfig,
        selectedScreenId: newSelectedId,
        selectedModuleId: null,
      }));
      if (newSelectedId) {
        syncEditorUrl({ screen: newSelectedId });
      }
    },

    reorderScreens: (fromIndex: number, toIndex: number) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          arrayMove(getActiveScreens(config, selectedDisplayId), fromIndex, toIndex),
        ),
      }));
    },

    updateScreen: (id, updates) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          getActiveScreens(config, selectedDisplayId).map((s) =>
            s.id === id ? { ...s, ...updates } : s,
          ),
        ),
      }), { coalesce: COALESCE_KEYS.updateScreen(id) });
    },
  };
}
