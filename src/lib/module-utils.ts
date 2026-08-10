import type { ModuleInstance, Screen } from '@/types/config';
import { GRID_SIZE, snapToGrid } from '@/lib/constants';

const MIN_SIZE = 60;

/**
 * Count how many modules across all screens would extend beyond the given
 * canvas dimensions.  A module is "off-canvas" if any part of it exceeds
 * the new width or height.
 */
export function countOffCanvasModules(
  screens: Screen[],
  newWidth: number,
  newHeight: number,
): number {
  let count = 0;
  for (const screen of screens) {
    for (const mod of screen.modules) {
      if (
        mod.position.x + mod.size.w > newWidth ||
        mod.position.y + mod.size.h > newHeight
      ) {
        count++;
      }
    }
  }
  return count;
}

/** Total module count across all screens. */
export function totalModuleCount(screens: Screen[]): number {
  return screens.reduce((sum, s) => sum + s.modules.length, 0);
}

/**
 * zIndex coerced to a finite number. Hand-edited configs and imported layouts
 * are never validated for zIndex, so a missing/invalid value must not poison
 * the sort comparator (NaN makes it non-transitive) or Math.max.
 */
function zOf(m: ModuleInstance): number {
  return Number.isFinite(m.zIndex) ? m.zIndex : 0;
}

/**
 * Stacking order of a screen's modules: ascending zIndex, array index breaking
 * ties. For configs where every module is tied at the same zIndex this equals
 * array order, which is exactly how browsers paint the tie (DOM order).
 */
export function stackOrder(modules: ModuleInstance[]): ModuleInstance[] {
  return modules
    .map((m, i) => ({ m, i }))
    .sort((a, b) => zOf(a.m) - zOf(b.m) || a.i - b.i)
    .map((e) => e.m);
}

/**
 * Reassign zIndex 1..n following `order`, preserving object identity for
 * modules whose value is already correct. Array order is untouched — only
 * zIndex values change.
 */
function assignZ(modules: ModuleInstance[], order: ModuleInstance[]): ModuleInstance[] {
  const zById = new Map(order.map((m, i) => [m.id, i + 1]));
  return modules.map((m) =>
    m.zIndex === zById.get(m.id) ? m : { ...m, zIndex: zById.get(m.id)! },
  );
}

/**
 * Move one module to the front or back of its screen's stacking order.
 * Renormalizes every module's zIndex to a compact 1..n sequence so values
 * stay bounded by module count and never go negative (a negative zIndex
 * would paint behind the screen's background image).
 */
export function reorderModuleZ(
  modules: ModuleInstance[],
  moduleId: string,
  to: 'front' | 'back',
): ModuleInstance[] {
  const order = stackOrder(modules);
  const idx = order.findIndex((m) => m.id === moduleId);
  if (idx === -1) return modules;
  const [target] = order.splice(idx, 1);
  if (to === 'front') order.push(target);
  else order.unshift(target);
  return assignZ(modules, order);
}

/**
 * Whether the module sits at the front and/or back of the stack — one sort
 * answers both PropertyPanel buttons, and sharing stackOrder guarantees the
 * disabled states can never disagree with what reorderModuleZ would do.
 * An unknown module id reports both extremes (buttons disabled).
 */
export function stackExtremes(
  modules: ModuleInstance[],
  moduleId: string,
): { atFront: boolean; atBack: boolean } {
  const order = stackOrder(modules);
  const idx = order.findIndex((m) => m.id === moduleId);
  if (idx === -1) return { atFront: true, atBack: true };
  return { atFront: idx === order.length - 1, atBack: idx === 0 };
}

/**
 * Append a new module on top of the stack. Existing modules are renormalized
 * to 1..n first (healing sparse or invalid values left by deletes and
 * hand-edits) and the new module gets n+1 — so every creation path maintains
 * the same dense zIndex space the reorder buttons do, and values can never
 * climb past the module count toward the display chrome's z range.
 */
export function appendOnTop(
  modules: ModuleInstance[],
  mod: Omit<ModuleInstance, 'zIndex'>,
): ModuleInstance[] {
  return [
    ...assignZ(modules, stackOrder(modules)),
    { ...mod, zIndex: modules.length + 1 },
  ];
}

/**
 * Uniformly scale every module's position and size so the entire layout
 * fits within `newWidth × newHeight`.  Uses `min(scaleX, scaleY)` so
 * relative proportions are preserved.  Results are snapped to the grid
 * and clamped to stay fully on-canvas.
 */
export function scaleModulesToFit(
  screens: Screen[],
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): Screen[] {
  const scale = Math.min(newWidth / oldWidth, newHeight / oldHeight);

  return screens.map((screen) => ({
    ...screen,
    modules: screen.modules.map((m) => {
      let w = snapToGrid(Math.max(MIN_SIZE, Math.round(m.size.w * scale)));
      let h = snapToGrid(Math.max(MIN_SIZE, Math.round(m.size.h * scale)));
      let x = snapToGrid(Math.round(m.position.x * scale));
      let y = snapToGrid(Math.round(m.position.y * scale));

      // Clamp size to display bounds (at least one grid cell)
      w = Math.min(w, newWidth);
      h = Math.min(h, newHeight);

      // Ensure w and h are at least MIN_SIZE after clamping, snapped to grid
      if (w < MIN_SIZE) w = Math.min(Math.ceil(MIN_SIZE / GRID_SIZE) * GRID_SIZE, newWidth);
      if (h < MIN_SIZE) h = Math.min(Math.ceil(MIN_SIZE / GRID_SIZE) * GRID_SIZE, newHeight);

      // Clamp position so module stays fully on-canvas
      x = Math.max(0, Math.min(x, newWidth - w));
      y = Math.max(0, Math.min(y, newHeight - h));

      return { ...m, position: { x, y }, size: { w, h } };
    }),
  }));
}
