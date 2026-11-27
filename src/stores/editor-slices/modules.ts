import { uuid } from '@/lib/uuid';
import type { ModuleInstance } from '@/types/config';
import { addedModuleSize, addsAtOrigin, buildDefaultModule, getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT, GRID_SIZE } from '@/lib/constants';
import {
  getActiveScreens,
  withActiveScreens,
  getActiveDimensions,
  updateModuleInConfig,
  updateScreenModulesInConfig,
} from '@/lib/editor-multi-display';
import { scaleModulesToFit, reorderModuleZ, appendOnTop, stackOrder, modulesOverlap, clampToCanvas } from '@/lib/module-utils';
import { newCardsStartTouchOff, withTouchOff } from '@/lib/touch-all';
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
      const dims = cfg
        ? getActiveDimensions(cfg, state.selectedDisplayId)
        : { width: DEFAULT_DISPLAY_WIDTH, height: DEFAULT_DISPLAY_HEIGHT };
      const size = addedModuleSize(def, dims);
      // No drop point (palette click / Enter) — take the next free spot on the
      // target screen so the new module never lands hidden under another one.
      // A drop point is held inside the canvas for the box actually placed.
      const resolvedPosition = addsAtOrigin(def)
        ? { x: 0, y: 0 }
        : position
          ? clampToCanvas(position, size, dims)
          : findFreePosition(
            (cfg ? getActiveScreens(cfg, state.selectedDisplayId) : []).find((s) => s.id === screenId)?.modules ?? [],
            size,
            dims,
          );
      // zIndex is assigned by appendOnTop against the target screen's modules
      // inside the mutation, so it is computed from the same list it lands in.
      const built = buildDefaultModule(def, type, { dims, locale: cfg?.settings?.locale, position: resolvedPosition });
      // After "All off" in Settings > Screen > Touch, a new card starts with touch off too.
      const startsTouchOff = !!cfg && newCardsStartTouchOff(cfg, state.selectedDisplayId);
      const newModule: Omit<ModuleInstance, 'zIndex'> = {
        id: uuid(),
        ...built,
        ...(startsTouchOff ? { config: withTouchOff(type, built.config) } : {}),
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
        id: uuid(),
        // A module shown on every screen is drawn once for the whole
        // display; its copy starts as an ordinary module of this screen.
        showOnEveryScreen: undefined,
        // One grid step down-right so the copy is visibly its own module;
        // fillsCanvas modules stay pinned at the origin.
        position: fillsCanvas
          ? { ...src.position }
          : clampToCanvas(
              { x: src.position.x + GRID_SIZE, y: src.position.y + GRID_SIZE },
              src.size,
              dims,
            ),
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
    // Position & size fields, so one that was dragged or resized could only
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
            const { x, y } = clampToCanvas(position, m.size, dims);
            if (x === m.position.x && y === m.position.y) return m;
            changed = true;
            return { ...m, position: { x, y } };
          });
          // Drag drops raise the module above anything it now overlaps.
          // Without this, a module dropped onto a larger one vanishes
          // behind it with only the selection ring left. Deliberate
          // layering (Send to back, then nudge via the typed X/Y fields or
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
