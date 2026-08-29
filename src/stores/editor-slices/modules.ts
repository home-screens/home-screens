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
  updateScreenModulesInConfig,
} from '@/lib/editor-multi-display';
import { scaleModulesToFit, reorderModuleZ, appendOnTop } from '@/lib/module-utils';
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
      // Title fields only render inside ModuleWrapper's card, which plugins
      // and cardless builtins never mount — drop them from a manifest/registry
      // defaultStyle so placed instances never carry an invisible title the
      // editor offers no way to see or clear.
      const moduleDefaultStyle = { ...def.defaultStyle };
      if (type.startsWith('plugin:') || def.cardless) {
        delete moduleDefaultStyle.title;
        delete moduleDefaultStyle.titleFontSize;
      }
      // zIndex is assigned by appendOnTop against the target screen's modules
      // inside the mutation, so it is computed from the same list it lands in.
      const newModule: Omit<ModuleInstance, 'zIndex'> = {
        id: uuidv4(),
        type,
        position: fillsCanvas ? { x: 0, y: 0 } : (position ?? { x: 100, y: 100 }),
        size: fillsCanvas
          ? { w: dims.width, h: dims.height }
          : { ...def.defaultSize },
        config: { ...def.defaultConfig },
        style: { ...defaultStyle, ...moduleDefaultStyle },
      };
      mutateConfig((config) => ({
        config: updateScreenModulesInConfig(config, get().selectedDisplayId, screenId, (modules) =>
          appendOnTop(modules, newModule),
        ),
        selectedModuleId: newModule.id,
      }));
    },

    removeModule: (screenId, moduleId) => {
      const { selectedModuleId, selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: updateScreenModulesInConfig(config, selectedDisplayId, screenId, (modules) =>
          modules.filter((m) => m.id !== moduleId),
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

    // Both geometry actions keep the module inside the canvas. They are the
    // single write path for the drag ghost, the resize handle, and the typed
    // X/Y/W/H fields, so the clamp lives here rather than in each caller. A
    // module allowed past the edge is a module the editor loses: the canvas
    // clips at its border, so the resize handle at the module's far corner
    // becomes unreachable and the drag clamp (which assumes the module fits)
    // pins it in place.
    moveModule: (screenId, moduleId, position) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => {
        const dims = getActiveDimensions(config, selectedDisplayId);
        return {
          config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({
            ...m,
            position: {
              x: Math.max(0, Math.min(dims.width - m.size.w, position.x)),
              y: Math.max(0, Math.min(dims.height - m.size.h, position.y)),
            },
          })),
        };
      }, { coalesce: COALESCE_KEYS.moveModule(moduleId) });
    },

    resizeModule: (screenId, moduleId, size) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => {
        const dims = getActiveDimensions(config, selectedDisplayId);
        return {
          config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({
            ...m,
            size: {
              w: Math.max(1, Math.min(dims.width - m.position.x, size.w)),
              h: Math.max(1, Math.min(dims.height - m.position.y, size.h)),
            },
          })),
        };
      }, { coalesce: COALESCE_KEYS.resizeModule(moduleId) });
    },

    reorderModule: (screenId, moduleId, to) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: updateScreenModulesInConfig(config, selectedDisplayId, screenId, (modules) =>
          reorderModuleZ(modules, moduleId, to),
        ),
      }));
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
