import { v4 as uuidv4 } from 'uuid';
import type { ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE as defaultStyle } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import { defaultPresetForLocale } from '@/lib/news-presets';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT, GRID_SIZE } from '@/lib/constants';
import {
  getActiveScreens,
  withActiveScreens,
  getActiveDimensions,
  updateModuleInConfig,
  updateScreenModulesInConfig,
} from '@/lib/editor-multi-display';
import { scaleModulesToFit, reorderModuleZ, appendOnTop, stackOrder, modulesOverlap } from '@/lib/module-utils';
import { findFreePosition } from '@/lib/free-position';
import { COALESCE_KEYS } from '@/stores/editor-save';
import type { EditorGet, ModuleActions, MutateConfig } from './types';

/** Module CRUD, geometry, and bulk rescaling on the active display's screens. */
/**
 * For a full-screen module: make it fill the canvas (a no-op when it does)
 * and say the move or resize is dealt with. False for every other module.
 */
function fillCanvasInstead(get: EditorGet, mutateConfig: MutateConfig, screenId: string, moduleId: string): boolean {
  const { config, selectedDisplayId } = get();
  if (!config) return false;
  const mod = getActiveScreens(config, selectedDisplayId)
    .find((s) => s.id === screenId)?.modules.find((m) => m.id === moduleId);
  if (!mod || !getModuleDefinition(mod.type)?.fillsCanvas) return false;
  const dims = getActiveDimensions(config, selectedDisplayId);
  const fills = mod.position.x === 0 && mod.position.y === 0 && mod.size.w === dims.width && mod.size.h === dims.height;
  if (!fills) {
    mutateConfig((current) => ({
      config: updateModuleInConfig(current, selectedDisplayId, screenId, moduleId, (m) => ({
        ...m,
        position: { x: 0, y: 0 },
        size: { w: dims.width, h: dims.height },
      })),
    }));
  }
  return true;
}

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
      // The registry's default news feed is English; a household on another
      // locale should start on a feed written in its own language.
      const moduleConfig = { ...def.defaultConfig };
      if (type === 'news' || type === 'fullscreen-news') {
        const preset = defaultPresetForLocale(cfg?.settings?.locale);
        moduleConfig.feeds = [{ id: `default-${preset.id}`, url: preset.url, label: preset.publisher }];
      }
      const size = fillsCanvas ? { w: dims.width, h: dims.height } : { ...def.defaultSize };
      // No drop point (palette click / Enter) — take the next free spot on the
      // target screen so the new module never lands hidden under another one.
      const resolvedPosition = fillsCanvas
        ? { x: 0, y: 0 }
        : position ?? findFreePosition(
            (cfg ? getActiveScreens(cfg, state.selectedDisplayId) : []).find((s) => s.id === screenId)?.modules ?? [],
            size,
            dims,
          );
      // zIndex is assigned by appendOnTop against the target screen's modules
      // inside the mutation, so it is computed from the same list it lands in.
      const newModule: Omit<ModuleInstance, 'zIndex'> = {
        id: uuidv4(),
        type,
        position: resolvedPosition,
        size,
        config: moduleConfig,
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

    duplicateModule: (screenId, moduleId) => {
      const state = get();
      const cfg = state.config;
      if (!cfg) return;
      const dims = getActiveDimensions(cfg, state.selectedDisplayId);
      const src = getActiveScreens(cfg, state.selectedDisplayId)
        .find((s) => s.id === screenId)?.modules.find((m) => m.id === moduleId);
      if (!src) return;
      const fillsCanvas = getModuleDefinition(src.type)?.fillsCanvas;
      const copy: Omit<ModuleInstance, 'zIndex'> = {
        ...structuredClone(src),
        id: uuidv4(),
        // A module shown on every screen is drawn once for the whole
        // display; its copy starts as an ordinary module of this screen.
        showOnEveryScreen: undefined,
        // One grid step down-right so the copy is visibly its own module;
        // fillsCanvas modules stay pinned at the origin.
        position: fillsCanvas
          ? { ...src.position }
          : {
              x: Math.max(0, Math.min(dims.width - src.size.w, src.position.x + GRID_SIZE)),
              y: Math.max(0, Math.min(dims.height - src.size.h, src.position.y + GRID_SIZE)),
            },
      };
      mutateConfig((config) => ({
        config: updateScreenModulesInConfig(config, state.selectedDisplayId, screenId, (modules) =>
          appendOnTop(modules, copy),
        ),
        selectedModuleId: copy.id,
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
    //
    // A full-screen module has one place to be: the whole canvas. It has no
    // Position & Size fields, so one that was dragged or resized could only
    // be put back with undo. Moving or resizing it lands it filling the
    // canvas, which changes nothing for one that already does and is the way
    // back for one an older version let out of place.
    moveModule: (screenId, moduleId, position, opts) => {
      const { selectedDisplayId } = get();
      if (fillCanvasInstead(get, mutateConfig, screenId, moduleId)) return;
      mutateConfig((config) => {
        const dims = getActiveDimensions(config, selectedDisplayId);
        // A drag delivers many moves that clamp or snap to the position the
        // module already has. Each one would otherwise cost a full editor
        // render and an autosave; an empty result is a no-op in applyMutation.
        let changed = false;
        const next = updateScreenModulesInConfig(config, selectedDisplayId, screenId, (modules) => {
          const moved = modules.map((m) => {
            if (m.id !== moduleId) return m;
            const x = Math.max(0, Math.min(dims.width - m.size.w, position.x));
            const y = Math.max(0, Math.min(dims.height - m.size.h, position.y));
            if (x === m.position.x && y === m.position.y) return m;
            changed = true;
            return { ...m, position: { x, y } };
          });
          // Drag drops raise the module above anything it now overlaps.
          // Without this, a module dropped onto a larger one vanishes
          // behind it with only the selection ring left. Deliberate
          // layering (Send to Back, then nudge via the typed X/Y fields or
          // arrow keys) doesn't pass the flag and stays put.
          if (!opts?.raiseOnOverlap) return moved;
          const order = stackOrder(moved);
          const idx = order.findIndex((m) => m.id === moduleId);
          if (idx === -1) return moved;
          const covered = order.slice(idx + 1).some((m) => modulesOverlap(order[idx], m));
          if (!covered) return moved;
          changed = true;
          return reorderModuleZ(moved, moduleId, 'front');
        });
        return changed ? { config: next } : {};
      }, { coalesce: COALESCE_KEYS.moveModule(moduleId) });
    },

    resizeModule: (screenId, moduleId, size) => {
      const { selectedDisplayId } = get();
      if (fillCanvasInstead(get, mutateConfig, screenId, moduleId)) return;
      mutateConfig((config) => {
        const dims = getActiveDimensions(config, selectedDisplayId);
        // Same as moveModule: a handle drag with snap on lands on the current
        // size most of the time, and an unchanged size must not write.
        let changed = false;
        const next = updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => {
          const w = Math.max(1, Math.min(dims.width - m.position.x, size.w));
          const h = Math.max(1, Math.min(dims.height - m.position.y, size.h));
          if (w === m.size.w && h === m.size.h) return m;
          changed = true;
          return { ...m, size: { w, h } };
        });
        return changed ? { config: next } : {};
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

    scaleAllModules: (displayId, oldWidth, oldHeight, newWidth, newHeight) => {
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          displayId,
          scaleModulesToFit(
            getActiveScreens(config, displayId),
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
