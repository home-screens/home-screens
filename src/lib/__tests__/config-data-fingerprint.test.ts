import { describe, it, expect } from 'vitest';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { dataFingerprint } from '../config-data-fingerprint';

function makeModule(overrides: Partial<ModuleInstance> = {}): ModuleInstance {
  return {
    id: 'mod-1',
    type: 'weather' as ModuleInstance['type'],
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 1,
    config: { view: 'current' },
    style: { ...DEFAULT_MODULE_STYLE },
    ...overrides,
  };
}

function makeConfig(modules: ModuleInstance[], overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  const screen: Screen = { id: 's1', name: 'S1', backgroundImage: '', modules };
  return {
    screens: [screen],
    settings: { rotationIntervalMs: 5_000 } as ScreenConfiguration['settings'],
    ...overrides,
  } as ScreenConfiguration;
}

describe('dataFingerprint', () => {
  it.each([
    ['position', { position: { x: 500, y: 500 } }],
    ['size', { size: { w: 400, h: 300 } }],
    ['zIndex', { zIndex: 9 }],
    ['style', { style: { ...DEFAULT_MODULE_STYLE, borderRadius: 24 } }],
    ['schedule', { schedule: { startTime: '08:00', endTime: '20:00' } }],
    ['visibility', { visibility: { conditions: [{ kind: 'state' as const, sourceKey: 'plugin:ha:door', equals: 'on' }] } }],
    ['enabled', { enabled: false }],
  ] satisfies [string, Partial<ModuleInstance>][])(
    'is unchanged when only a module\'s %s changes',
    (_field, change) => {
      const before = makeConfig([makeModule()]);
      const after = makeConfig([makeModule(change)]);
      expect(dataFingerprint(after)).toBe(dataFingerprint(before));
    },
  );

  it('changes when a module\'s config changes', () => {
    const before = makeConfig([makeModule()]);
    const after = makeConfig([makeModule({ config: { view: 'forecast' } })]);
    expect(dataFingerprint(after)).not.toBe(dataFingerprint(before));
  });

  it('changes when global settings change', () => {
    const before = makeConfig([makeModule()]);
    const after = {
      ...before,
      settings: { ...before.settings, timezone: 'America/Chicago' },
    } as ScreenConfiguration;
    expect(dataFingerprint(after)).not.toBe(dataFingerprint(before));
  });

  it('changes when a module is added or removed', () => {
    const one = makeConfig([makeModule()]);
    const two = makeConfig([makeModule(), makeModule({ id: 'mod-2' })]);
    expect(dataFingerprint(two)).not.toBe(dataFingerprint(one));
  });

  it('strips presentational fields inside multi-display screen lists too', () => {
    const displayScreens: Screen[] = [
      { id: 'd1s1', name: 'D1', backgroundImage: '', modules: [makeModule()] },
    ];
    const base = makeConfig([]);
    const before = {
      ...base,
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: displayScreens }],
    } as ScreenConfiguration;
    const after = {
      ...base,
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [{ ...displayScreens[0], modules: [makeModule({ position: { x: 42, y: 42 } })] }],
      }],
    } as ScreenConfiguration;
    expect(dataFingerprint(after)).toBe(dataFingerprint(before));

    const configChanged = {
      ...base,
      displays: [{
        id: 'kitchen',
        name: 'Kitchen',
        screens: [{ ...displayScreens[0], modules: [makeModule({ config: { view: 'forecast' } })] }],
      }],
    } as ScreenConfiguration;
    expect(dataFingerprint(configChanged)).not.toBe(dataFingerprint(before));
  });

  it('changes when a non-stripped display field changes', () => {
    // Guards the "strips too much" failure mode: everything outside the
    // seven per-module presentational fields must still move the fingerprint.
    const base = makeConfig([]);
    const withDisplay = (displayWidth: number) => ({
      ...base,
      displays: [{ id: 'kitchen', name: 'Kitchen', screens: [], displayWidth }],
    } as ScreenConfiguration);
    expect(dataFingerprint(withDisplay(1080))).not.toBe(dataFingerprint(withDisplay(1920)));
  });

  it('is key-order independent (stableStringify underneath)', () => {
    const a = makeConfig([makeModule({ config: { view: 'current', units: 'imperial' } })]);
    const b = makeConfig([makeModule({ config: { units: 'imperial', view: 'current' } })]);
    expect(dataFingerprint(a)).toBe(dataFingerprint(b));
  });
});
