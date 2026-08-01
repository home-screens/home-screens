import { v4 as uuidv4 } from 'uuid';
import type { ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE as defaultStyle } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import {
  getActiveScreens,
  withActiveScreens,
  getActiveDimensions,
  updateModuleInConfig,
} from '@/lib/editor-multi-display';
import { scaleModulesToFit } from '@/lib/module-utils';
import { COALESCE_KEYS } from '@/stores/editor-save';
import type { EditorGet, ModuleActions, MutateConfig } from './types';

/** Module CRUD, geometry, and bulk rescaling on the active display's screens. */
export function createModuleSlice(
  get: EditorGet,
  mutateConfig: MutateConfig,
): ModuleActions {
  return {
    addModule: (screenId, type, position) => {
      const def = getModuleDefinition(type);
      if (!def) return;
      const state = get();
      const cfg = state.config;
      const fillsCanvas = def.fillsCanvas && cfg;
      const dims = cfg
        ? getActiveDimensions(cfg, state.selectedDisplayId)
        : { width: DEFAULT_DISPLAY_WIDTH, height: DEFAULT_DISPLAY_HEIGHT };
      const newModule: ModuleInstance = {
        id: uuidv4(),
        type,
        position: fillsCanvas ? { x: 0, y: 0 } : (position ?? { x: 100, y: 100 }),
        size: fillsCanvas
          ? { w: dims.width, h: dims.height }
          : { ...def.defaultSize },
        zIndex: 1,
        config: { ...def.defaultConfig },
        style: { ...defaultStyle, ...def.defaultStyle },
      };
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          get().selectedDisplayId,
          getActiveScreens(config, get().selectedDisplayId).map((s) =>
            s.id === screenId ? { ...s, modules: [...s.modules, newModule] } : s,
          ),
        ),
        selectedModuleId: newModule.id,
      }));
    },

    removeModule: (screenId, moduleId) => {
      const { selectedModuleId, selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          getActiveScreens(config, selectedDisplayId).map((s) =>
            s.id === screenId ? { ...s, modules: s.modules.filter((m) => m.id !== moduleId) } : s,
          ),
        ),
        selectedModuleId: selectedModuleId === moduleId ? null : selectedModuleId,
      }));
    },

    updateModule: (screenId, moduleId, updates) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({ ...m, ...updates })),
      }), { coalesce: COALESCE_KEYS.updateModule(moduleId) });
    },

    updateModuleStyle: (screenId, moduleId, style) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({
          ...m,
          style: { ...m.style, ...style },
        })),
      }), { coalesce: COALESCE_KEYS.moduleStyle(moduleId) });
    },

    moveModule: (screenId, moduleId, position) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({ ...m, position })),
      }), { coalesce: COALESCE_KEYS.moveModule(moduleId) });
    },

    resizeModule: (screenId, moduleId, size) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({ ...m, size })),
      }), { coalesce: COALESCE_KEYS.resizeModule(moduleId) });
    },

    scaleAllModules: (oldWidth, oldHeight, newWidth, newHeight) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          scaleModulesToFit(
            getActiveScreens(config, selectedDisplayId),
            oldWidth,
            oldHeight,
            newWidth,
            newHeight,
          ),
        ),
      }));
    },
  };
}
