import { getActiveScreens } from '@/lib/editor-multi-display';
import { syncEditorUrl } from '@/stores/editor-url';
import type { EditorGet, EditorSet, SelectionActions } from './types';

/** Display/screen/module selection and the snap toggle. */
export function createSelectionSlice(set: EditorSet, get: EditorGet): SelectionActions {
  return {
    setSelectedDisplay: (id) => {
      const { config } = get();
      if (!config) return;
      // Pick a sensible first screen for the newly-selected display.
      const activeScreens = getActiveScreens(config, id);
      const firstId = activeScreens[0]?.id ?? null;
      set({
        selectedDisplayId: id,
        selectedScreenId: firstId,
        selectedModuleId: null,
      });
      // Sync the URL so refreshes land back on the same display.
      syncEditorUrl({ display: id ?? null, screen: firstId ?? null });
    },

    selectScreen: (id) => {
      set({ selectedScreenId: id, selectedModuleId: null });
      syncEditorUrl({ screen: id });
    },

    selectModule: (id) => set({ selectedModuleId: id }),

    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  };
}
