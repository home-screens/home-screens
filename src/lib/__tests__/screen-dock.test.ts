import { describe, it, expect } from 'vitest';
import { dominantModuleType, dockTileColor, DOCK_PALETTE, toDockScreen } from '@/lib/screen-dock';
import type { ModuleInstance } from '@/types/config';

const mod = (type: ModuleInstance['type'], w: number, h: number): ModuleInstance => ({
  id: `${type}-${w}x${h}`, type, position: { x: 0, y: 0 }, size: { w, h }, zIndex: 0, config: {}, style: {} as ModuleInstance['style'],
});

describe('dominantModuleType', () => {
  it('picks the biggest module by area, the earlier one on a tie', () => {
    expect(dominantModuleType({ modules: [mod('clock', 200, 100), mod('calendar', 400, 300), mod('weather', 300, 400)] })).toBe('calendar');
  });
  it('still counts a module that is switched off', () => {
    expect(dominantModuleType({ modules: [{ ...mod('calendar', 400, 300), enabled: false }, mod('clock', 100, 100)] })).toBe('calendar');
  });
  it('ignores a module shown on every screen and a hidden background copy', () => {
    expect(dominantModuleType({ modules: [
      { ...mod('display-control', 1040, 150), showOnEveryScreen: true },
      { ...mod('weather', 900, 900), backgroundProvider: true },
      mod('calendar', 400, 300),
    ] })).toBe('calendar');
    expect(dominantModuleType({ modules: [{ ...mod('display-control', 1040, 150), showOnEveryScreen: true }] })).toBeNull();
  });
  it('is null for an empty screen', () => {
    expect(dominantModuleType({ modules: [] })).toBeNull();
    expect(toDockScreen({ id: 's', name: 'Empty', modules: [] })).toEqual({ id: 's', name: 'Empty', iconType: null });
  });
});

describe('dockTileColor', () => {
  it('cycles the palette by position', () => {
    expect(dockTileColor(0)).toBe(DOCK_PALETTE[0]);
    expect(dockTileColor(DOCK_PALETTE.length)).toBe(DOCK_PALETTE[0]);
    expect(dockTileColor(3)).toBe(DOCK_PALETTE[3]);
  });
});
