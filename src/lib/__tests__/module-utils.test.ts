import { describe, it, expect } from 'vitest';
import {
  countOffCanvasModules,
  totalModuleCount,
  scaleModulesToFit,
  reorderModuleZ,
  stackExtremes,
  appendOnTop,
  stackOrder,
} from '@/lib/module-utils';
import type { ModuleInstance, Screen } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';

function makeScreen(modules: { x: number; y: number; w: number; h: number }[]): Screen {
  return {
    id: 'test',
    name: 'Test',
    backgroundImage: '',
    modules: modules.map((m, i) => ({
      id: `mod-${i}`,
      type: 'text' as const,
      position: { x: m.x, y: m.y },
      size: { w: m.w, h: m.h },
      zIndex: 1,
      config: {},
      style: { ...DEFAULT_MODULE_STYLE },
    })),
  };
}

// ── countOffCanvasModules ────────────────────────────────────────────

describe('countOffCanvasModules', () => {
  it('returns 0 when there are no modules', () => {
    expect(countOffCanvasModules([makeScreen([])], 1920, 1080)).toBe(0);
  });

  it('returns 0 when all modules fit', () => {
    const screen = makeScreen([
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 500, y: 400, w: 200, h: 200 },
    ]);
    expect(countOffCanvasModules([screen], 1920, 1080)).toBe(0);
  });

  it('counts modules that exceed width', () => {
    const screen = makeScreen([
      { x: 1000, y: 0, w: 200, h: 100 }, // right edge = 1200 > 1080
      { x: 0, y: 0, w: 100, h: 100 },     // fits
    ]);
    expect(countOffCanvasModules([screen], 1080, 1920)).toBe(1);
  });

  it('counts modules that exceed height', () => {
    const screen = makeScreen([
      { x: 0, y: 1800, w: 100, h: 300 }, // bottom = 2100 > 1080
    ]);
    expect(countOffCanvasModules([screen], 1920, 1080)).toBe(1);
  });

  it('counts across multiple screens', () => {
    const s1 = makeScreen([{ x: 1800, y: 0, w: 200, h: 100 }]); // right=2000
    const s2 = makeScreen([{ x: 0, y: 0, w: 100, h: 100 }]);     // fits always
    const s3 = makeScreen([{ x: 0, y: 1000, w: 100, h: 200 }]);  // bottom=1200
    // 1920×1080: s1 right=2000>1920 off, s3 bottom=1200>1080 off
    expect(countOffCanvasModules([s1, s2, s3], 1920, 1080)).toBe(2);
    // 1080×1080: s1 right=2000>1080 off, s3 bottom=1200>1080 off
    expect(countOffCanvasModules([s1, s2, s3], 1080, 1080)).toBe(2);
    // 2000×1200: all fit
    expect(countOffCanvasModules([s1, s2, s3], 2000, 1200)).toBe(0);
  });

  it('treats module exactly at edge as fitting', () => {
    const screen = makeScreen([{ x: 0, y: 0, w: 1080, h: 1920 }]);
    expect(countOffCanvasModules([screen], 1080, 1920)).toBe(0);
  });

  it('returns 0 for empty screens array', () => {
    expect(countOffCanvasModules([], 1920, 1080)).toBe(0);
  });
});

// ── totalModuleCount ─────────────────────────────────────────────────

describe('totalModuleCount', () => {
  it('counts modules across screens', () => {
    const s1 = makeScreen([{ x: 0, y: 0, w: 100, h: 100 }]);
    const s2 = makeScreen([
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 100, y: 0, w: 100, h: 100 },
    ]);
    expect(totalModuleCount([s1, s2])).toBe(3);
  });

  it('returns 0 for empty screens', () => {
    expect(totalModuleCount([makeScreen([])])).toBe(0);
  });

  it('returns 0 for empty screens array', () => {
    expect(totalModuleCount([])).toBe(0);
  });
});

// ── scaleModulesToFit ────────────────────────────────────────────────

describe('scaleModulesToFit', () => {
  it('scales positions and sizes uniformly', () => {
    // Portrait 1080x1920 → Landscape 1920x1080
    // scale = min(1920/1080, 1080/1920) = min(1.78, 0.5625) = 0.5625
    const screen = makeScreen([{ x: 0, y: 0, w: 1080, h: 1920 }]);
    const result = scaleModulesToFit([screen], 1080, 1920, 1920, 1080);
    const mod = result[0].modules[0];
    // 1080 * 0.5625 = 607.5 → snapped to 600; 1920 * 0.5625 = 1080 → 1080
    expect(mod.size.w).toBe(600);
    expect(mod.size.h).toBe(1080);
    expect(mod.position.x).toBe(0);
    expect(mod.position.y).toBe(0);
  });

  it('snaps results to grid (multiples of 20)', () => {
    const screen = makeScreen([{ x: 100, y: 300, w: 500, h: 400 }]);
    const result = scaleModulesToFit([screen], 1080, 1920, 1920, 1080);
    const mod = result[0].modules[0];
    expect(mod.position.x % 20).toBe(0);
    expect(mod.position.y % 20).toBe(0);
    expect(mod.size.w % 20).toBe(0);
    expect(mod.size.h % 20).toBe(0);
  });

  it('clamps modules to stay on canvas', () => {
    // Module near the bottom — after scaling position, ensure it stays on-canvas
    const screen = makeScreen([{ x: 900, y: 1700, w: 100, h: 100 }]);
    const result = scaleModulesToFit([screen], 1080, 1920, 1920, 1080);
    const mod = result[0].modules[0];
    expect(mod.position.x + mod.size.w).toBeLessThanOrEqual(1920);
    expect(mod.position.y + mod.size.h).toBeLessThanOrEqual(1080);
  });

  it('enforces minimum size of 60px', () => {
    const screen = makeScreen([{ x: 0, y: 0, w: 60, h: 60 }]);
    // Scale factor will try to make these smaller
    const result = scaleModulesToFit([screen], 1920, 1080, 320, 180);
    const mod = result[0].modules[0];
    expect(mod.size.w).toBeGreaterThanOrEqual(60);
    expect(mod.size.h).toBeGreaterThanOrEqual(60);
  });

  it('preserves screen metadata (id, name, etc.)', () => {
    const screen = makeScreen([{ x: 0, y: 0, w: 200, h: 200 }]);
    screen.name = 'My Screen';
    screen.backgroundImage = '/bg.jpg';
    const result = scaleModulesToFit([screen], 1080, 1920, 1920, 1080);
    expect(result[0].name).toBe('My Screen');
    expect(result[0].backgroundImage).toBe('/bg.jpg');
  });

  it('handles empty screens without error', () => {
    const screen = makeScreen([]);
    const result = scaleModulesToFit([screen], 1080, 1920, 1920, 1080);
    expect(result[0].modules).toHaveLength(0);
  });

  it('identity scale (same dimensions) preserves positions', () => {
    const screen = makeScreen([{ x: 100, y: 200, w: 400, h: 300 }]);
    const result = scaleModulesToFit([screen], 1080, 1920, 1080, 1920);
    const mod = result[0].modules[0];
    expect(mod.position).toEqual({ x: 100, y: 200 });
    expect(mod.size).toEqual({ w: 400, h: 300 });
  });

  it('scales up to a larger canvas', () => {
    // 1080x1920 → 2160x3840, scale = min(2, 2) = 2
    const screen = makeScreen([{ x: 100, y: 200, w: 400, h: 300 }]);
    const result = scaleModulesToFit([screen], 1080, 1920, 2160, 3840);
    const mod = result[0].modules[0];
    expect(mod.position).toEqual({ x: 200, y: 400 });
    expect(mod.size).toEqual({ w: 800, h: 600 });
  });

  it('scales multiple modules on the same screen independently', () => {
    const screen = makeScreen([
      { x: 0, y: 0, w: 1040, h: 200 },
      { x: 0, y: 1600, w: 1040, h: 300 },
    ]);
    // Portrait 1080x1920 → Landscape 1920x1080, scale = 0.5625
    const result = scaleModulesToFit([screen], 1080, 1920, 1920, 1080);
    expect(result[0].modules).toHaveLength(2);
    for (const mod of result[0].modules) {
      expect(mod.position.x + mod.size.w).toBeLessThanOrEqual(1920);
      expect(mod.position.y + mod.size.h).toBeLessThanOrEqual(1080);
    }
  });

  it('clamps module at canvas boundary after scale-down', () => {
    // Module touching right and bottom edges
    const screen = makeScreen([{ x: 980, y: 1820, w: 100, h: 100 }]);
    const result = scaleModulesToFit([screen], 1080, 1920, 1920, 1080);
    const mod = result[0].modules[0];
    expect(mod.position.x + mod.size.w).toBeLessThanOrEqual(1920);
    expect(mod.position.y + mod.size.h).toBeLessThanOrEqual(1080);
  });
});

// ── z-order helpers ──────────────────────────────────────────────────

function makeModules(zIndexes: number[]): ModuleInstance[] {
  return zIndexes.map((z, i) => ({
    id: `mod-${i}`,
    type: 'text' as const,
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: z,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
  }));
}

const zOrder = (mods: ModuleInstance[]) => mods.map((m) => m.zIndex);

describe('reorderModuleZ', () => {
  it('brings a module to the front, renormalizing to 1..n', () => {
    // Legacy config: everything tied at 1, visual order = array order.
    const mods = makeModules([1, 1, 1]);
    const result = reorderModuleZ(mods, 'mod-0', 'front');
    expect(zOrder(result)).toEqual([3, 1, 2]);
  });

  it('sends a module to the back, renormalizing to 1..n', () => {
    const mods = makeModules([1, 1, 1]);
    const result = reorderModuleZ(mods, 'mod-2', 'back');
    expect(zOrder(result)).toEqual([2, 3, 1]);
  });

  it('preserves array-order stacking for tied zIndex values', () => {
    // mod-1 → front; mod-0 and mod-2 keep their relative order (0 under 2).
    const mods = makeModules([1, 1, 1]);
    const result = reorderModuleZ(mods, 'mod-1', 'front');
    expect(zOrder(result)).toEqual([1, 3, 2]);
  });

  it('renormalizes sparse hand-edited values', () => {
    const mods = makeModules([7, 3, 42]);
    const result = reorderModuleZ(mods, 'mod-2', 'back');
    // Visual order was 3,7,42 → mod-2 to back → mod-2, mod-1, mod-0
    expect(zOrder(result)).toEqual([3, 2, 1]);
  });

  it('does not reorder the config array, only zIndex values', () => {
    const mods = makeModules([1, 1, 1]);
    const result = reorderModuleZ(mods, 'mod-0', 'front');
    expect(result.map((m) => m.id)).toEqual(['mod-0', 'mod-1', 'mod-2']);
  });

  it('keeps object identity for modules whose zIndex is unchanged', () => {
    const mods = makeModules([1, 2, 3]);
    const result = reorderModuleZ(mods, 'mod-2', 'front');
    // Already normalized and mod-2 already on top: nothing changes.
    expect(result[0]).toBe(mods[0]);
    expect(result[1]).toBe(mods[1]);
    expect(result[2]).toBe(mods[2]);
  });

  it('returns the array untouched for an unknown module id', () => {
    const mods = makeModules([1, 1]);
    expect(reorderModuleZ(mods, 'nope', 'front')).toBe(mods);
  });

  it('handles a single module', () => {
    const mods = makeModules([5]);
    expect(zOrder(reorderModuleZ(mods, 'mod-0', 'front'))).toEqual([1]);
    expect(zOrder(reorderModuleZ(mods, 'mod-0', 'back'))).toEqual([1]);
  });
});

describe('stackExtremes', () => {
  it('detects front and back on tied values via array order', () => {
    const mods = makeModules([1, 1, 1]);
    expect(stackExtremes(mods, 'mod-2')).toEqual({ atFront: true, atBack: false });
    expect(stackExtremes(mods, 'mod-0')).toEqual({ atFront: false, atBack: true });
    expect(stackExtremes(mods, 'mod-1')).toEqual({ atFront: false, atBack: false });
  });

  it('follows zIndex over array order when values differ', () => {
    const mods = makeModules([5, 1, 3]);
    expect(stackExtremes(mods, 'mod-0')).toEqual({ atFront: true, atBack: false });
    expect(stackExtremes(mods, 'mod-1')).toEqual({ atFront: false, atBack: true });
  });

  it('treats a single module as both extremes', () => {
    expect(stackExtremes(makeModules([1]), 'mod-0')).toEqual({ atFront: true, atBack: true });
  });

  it('reports both extremes for an unknown module id', () => {
    expect(stackExtremes(makeModules([1]), 'nope')).toEqual({ atFront: true, atBack: true });
  });
});

describe('appendOnTop', () => {
  const withZ = (mods: ModuleInstance[], id: string, z: number): ModuleInstance[] =>
    mods.map((m) => (m.id === id ? { ...m, zIndex: z } : m));

  it('appends the new module one above the module count', () => {
    const mods = makeModules([1, 1]);
    const added = { ...makeModules([0])[0], id: 'new' };
    const result = appendOnTop(mods, added);
    expect(result.map((m) => m.id)).toEqual(['mod-0', 'mod-1', 'new']);
    expect(zOrder(result)).toEqual([1, 2, 3]);
  });

  it('renormalizes sparse values so zIndex stays bounded by module count', () => {
    // Sparse leftovers from add/delete cycles: 3, 7, 42 → 1, 2, 3, new = 4.
    const mods = makeModules([3, 7, 42]);
    const added = { ...makeModules([0])[0], id: 'new' };
    expect(zOrder(appendOnTop(mods, added))).toEqual([1, 2, 3, 4]);
  });

  it('heals a non-numeric zIndex from a hand-edited or imported config', () => {
    const mods = withZ(makeModules([1, 1]), 'mod-1', undefined as unknown as number);
    const added = { ...makeModules([0])[0], id: 'new' };
    // Missing zIndex coerces to 0, sorting mod-1 to the bottom; all finite after.
    const result = appendOnTop(mods, added);
    expect(zOrder(result)).toEqual([2, 1, 3]);
    expect(result.every((m) => Number.isFinite(m.zIndex))).toBe(true);
  });

  it('starts at 1 on an empty screen', () => {
    const added = { ...makeModules([0])[0], id: 'new' };
    expect(zOrder(appendOnTop([], added))).toEqual([1]);
  });
});

describe('stackOrder with invalid zIndex', () => {
  it('stays deterministic when a zIndex is missing (no NaN comparator cycles)', () => {
    // A(z=1,i=0), B(z missing,i=1), C(z=0,i=2): with NaN in the comparator this
    // was a strict cycle and sort output was implementation-defined. Coerced to
    // 0, the order is well-defined: B(0,i=1), C(0,i=2), A(1).
    const mods = makeModules([1, 0, 0]);
    mods[1] = { ...mods[1], zIndex: undefined as unknown as number };
    expect(stackOrder(mods).map((m) => m.id)).toEqual(['mod-1', 'mod-2', 'mod-0']);
  });
});
