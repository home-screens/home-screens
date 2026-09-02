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

    duplicateScreen: (id) => {
      const { config, selectedDisplayId } = get();
      if (!config) return;
      const src = getActiveScreens(config, selectedDisplayId).find((s) => s.id === id);
      if (!src) return;
      // Fresh ids throughout: the screen id so profiles/rules never see two
      // screens sharing one id, and module ids so per-module state keyed by
      // id (todo taps, selection) can't bleed between the two copies.
      const cloned = structuredClone(src);
      const copy: Screen = {
        ...cloned,
        id: uuidv4(),
        name: `${src.name} copy`,
        modules: cloned.modules.map((m) => ({ ...m, id: uuidv4() })),
      };
      mutateConfig((cfg) => {
        const screens = getActiveScreens(cfg, selectedDisplayId);
        const idx = screens.findIndex((s) => s.id === id);
        const next = [...screens];
        next.splice(idx === -1 ? screens.length : idx + 1, 0, copy);
        return {
          config: withActiveScreens(cfg, selectedDisplayId, next),
          selectedScreenId: copy.id,
          selectedModuleId: null,
        };
      });
      syncEditorUrl({ screen: copy.id });
    },

    copyScreensFromDisplay: (sourceDisplayId) => {
      const { config, selectedDisplayId } = get();
      if (!config || !selectedDisplayId || sourceDisplayId === selectedDisplayId) return;
      const source = config.displays?.find((d) => d.id === sourceDisplayId);
      if (!source || source.screens.length === 0) return;
      // Fresh ids throughout, exactly as duplicateScreen does: two displays
      // sharing a screen id would make profiles, rules and per-module state
      // (todo taps, selection) collide across displays.
      const copies: Screen[] = structuredClone(source.screens).map((screen) => ({
        ...screen,
        id: uuidv4(),
        modules: screen.modules.map((m) => ({ ...m, id: uuidv4() })),
      }));
      mutateConfig((cfg) => ({
        config: withActiveScreens(
          cfg,
          selectedDisplayId,
          [...getActiveScreens(cfg, selectedDisplayId), ...copies],
        ),
        selectedScreenId: copies[0].id,
        selectedModuleId: null,
      }));
      syncEditorUrl({ screen: copies[0].id });
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
