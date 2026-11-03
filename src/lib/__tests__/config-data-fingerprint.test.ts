import { describe, it, expect } from 'vitest';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { dataFingerprintOfParts } from '../config-data-fingerprint';

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

function makeScreens(modules: ModuleInstance[]): Screen[] {
  return [{ id: 's1', name: 'S1', backgroundImage: '', modules }];
}

const settings = { rotationIntervalMs: 5_000 } as ScreenConfiguration['settings'];

/** The wall's call: its screens plus the settings, profiles and rules it was rendered with. */
function fingerprint(
  modules: ModuleInstance[],
  parts: { settings?: unknown; profiles?: unknown; rules?: unknown } = {},
): string {
  return dataFingerprintOfParts(
    makeScreens(modules),
    parts.settings ?? settings,
    parts.profiles ?? [],
    parts.rules ?? [],
  );
}

describe('dataFingerprintOfParts', () => {
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
      expect(fingerprint([makeModule(change)])).toBe(fingerprint([makeModule()]));
    },
  );

  it('changes when a module\'s config changes', () => {
    expect(fingerprint([makeModule({ config: { view: 'forecast' } })])).not.toBe(fingerprint([makeModule()]));
  });

  it('changes when global settings change', () => {
    const changed = { ...settings, timezone: 'America/Chicago' } as ScreenConfiguration['settings'];
    expect(fingerprint([makeModule()], { settings: changed })).not.toBe(fingerprint([makeModule()]));
  });

  it('changes when profiles or rules change', () => {
    const base = fingerprint([makeModule()]);
    expect(fingerprint([makeModule()], { profiles: [{ id: 'p1', name: 'Evening', screenIds: ['s1'] }] })).not.toBe(base);
    expect(fingerprint([makeModule()], { rules: [{ id: 'r1' }] })).not.toBe(base);
  });

  it('changes when a module is added or removed', () => {
    expect(fingerprint([makeModule(), makeModule({ id: 'mod-2' })])).not.toBe(fingerprint([makeModule()]));
  });

  it('changes when a non-stripped screen field changes', () => {
    // Guards the "strips too much" failure mode: everything outside the
    // seven per-module presentational fields must still move the fingerprint.
    const withBackground = (backgroundImage: string) =>
      dataFingerprintOfParts([{ id: 's1', name: 'S1', backgroundImage, modules: [makeModule()] }], settings, [], []);
    expect(withBackground('/a.jpg')).not.toBe(withBackground('/b.jpg'));
  });

  it('is key-order independent (stableStringify underneath)', () => {
    const a = fingerprint([makeModule({ config: { view: 'current', units: 'imperial' } })]);
    const b = fingerprint([makeModule({ config: { units: 'imperial', view: 'current' } })]);
    expect(a).toBe(b);
  });
});
