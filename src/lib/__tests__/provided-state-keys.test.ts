import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ModuleInstance, ModuleType, Screen } from '@/types/config';
import { collectProvidedStateKeys, isStateProducerType } from '../provided-state-keys';

// Definitions are controlled per-test; malformed shapes must be testable
// here even though registerPluginModule filters them on the real path
// (built-in defs and the dev-plugin path do not go through validateManifest).
const { defs } = vi.hoisted(() => ({
  defs: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/lib/module-registry', () => ({
  getModuleDefinition: (type: string) => defs.get(type),
  getAllModuleDefinitions: () => Array.from(defs.values()),
}));

let nextId = 0;
function makeModule(overrides: Partial<ModuleInstance> & { type: string }): ModuleInstance {
  return {
    id: `mod-${nextId++}`,
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: {} as ModuleInstance['style'],
    backgroundProvider: true,
    ...overrides,
    type: overrides.type as ModuleType,
  };
}

function screensWith(...modules: ModuleInstance[]): Screen[] {
  return [{ id: 's1', name: 's1', backgroundImage: '', modules }];
}

describe('collectProvidedStateKeys', () => {
  beforeEach(() => {
    defs.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('aggregates static keys from backgroundProvider instances', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:ha' })));
    expect(keys).toEqual([{ key: 'plugin:ha:door', label: 'Door' }]);
  });

  it('dedupes by key with first label winning', () => {
    defs.set('plugin:a', { providesState: [{ key: 'shared.key', label: 'First' }] });
    defs.set('plugin:b', { providesState: [{ key: 'shared.key', label: 'Second' }] });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:a' }),
      makeModule({ type: 'plugin:b' }),
    ));
    expect(keys).toEqual([{ key: 'shared.key', label: 'First' }]);
  });

  it('skips non-backgroundProvider and disabled instances', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'k', label: 'K' }] });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:ha', backgroundProvider: undefined }),
      makeModule({ type: 'plugin:ha', enabled: false }),
    ));
    expect(keys).toEqual([]);
  });

  it('resolves config-driven keys via deriveProvidedKeys', () => {
    defs.set('plugin:ha', {
      deriveProvidedKeys: (config: Record<string, unknown>) =>
        (config.entities as string[]).map((e) => ({ key: `plugin:ha:${e}`, label: e })),
    });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:ha', config: { entities: ['door', 'temp'] } }),
    ));
    expect(keys.map((k) => k.key)).toEqual(['plugin:ha:door', 'plugin:ha:temp']);
  });

  it('a throwing deriver warns and never breaks the panel', () => {
    defs.set('plugin:bad', {
      deriveProvidedKeys: () => { throw new Error('third-party bug'); },
    });
    defs.set('plugin:good', { providesState: [{ key: 'ok', label: 'OK' }] });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:bad' }),
      makeModule({ type: 'plugin:good' }),
    ));
    expect(keys).toEqual([{ key: 'ok', label: 'OK' }]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('tolerates malformed providesState and non-array deriver results', () => {
    defs.set('plugin:string', { providesState: 'not-an-array' });
    defs.set('plugin:noniter', { providesState: { length: 1 }, deriveProvidedKeys: () => 'nope' });
    const keys = collectProvidedStateKeys(screensWith(
      makeModule({ type: 'plugin:string' }),
      makeModule({ type: 'plugin:noniter' }),
    ));
    expect(keys).toEqual([]);
  });

  it('skips unregistered module types', () => {
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:missing' })));
    expect(keys).toEqual([]);
  });

  it('surfaces a demand-driven plugin\'s keys with zero on-screen instances', () => {
    defs.set('plugin:strava', {
      hasStateProvider: true,
      providesState: [{ key: 'plugin:strava:current_streak', label: 'Current streak' }],
    });
    const keys = collectProvidedStateKeys([]);
    expect(keys).toEqual([{ key: 'plugin:strava:current_streak', label: 'Current streak' }]);
  });

  it('does not surface a non-demand-driven plugin with no on-screen instance', () => {
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys([]);
    expect(keys).toEqual([]);
  });

  it('demand-driven keys win dedup over an on-screen instance of the same plugin', () => {
    defs.set('plugin:strava', {
      hasStateProvider: true,
      providesState: [{ key: 'plugin:strava:current_streak', label: 'Current streak (provider)' }],
    });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:strava' })));
    expect(keys).toEqual([{ key: 'plugin:strava:current_streak', label: 'Current streak (provider)' }]);
  });

  it('merges demand-driven and on-screen sources without duplicates', () => {
    defs.set('plugin:strava', {
      hasStateProvider: true,
      providesState: [{ key: 'plugin:strava:current_streak', label: 'Current streak' }],
    });
    defs.set('plugin:ha', { providesState: [{ key: 'plugin:ha:door', label: 'Door' }] });
    const keys = collectProvidedStateKeys(screensWith(makeModule({ type: 'plugin:ha' })));
    expect(keys).toEqual([
      { key: 'plugin:strava:current_streak', label: 'Current streak' },
      { key: 'plugin:ha:door', label: 'Door' },
    ]);
  });
});

describe('isStateProducerType', () => {
  beforeEach(() => {
    defs.clear();
  });

  it('true for a non-empty providesState array', () => {
    defs.set('plugin:a', { providesState: [{ key: 'k', label: 'K' }] });
    expect(isStateProducerType('plugin:a' as ModuleType)).toBe(true);
  });

  it('true for a deriveProvidedKeys function', () => {
    defs.set('plugin:b', { deriveProvidedKeys: () => [] });
    expect(isStateProducerType('plugin:b' as ModuleType)).toBe(true);
  });

  it('false for empty array, malformed shapes, and unregistered types', () => {
    defs.set('plugin:empty', { providesState: [] });
    defs.set('plugin:string', { providesState: 'truthy-with-length' });
    expect(isStateProducerType('plugin:empty' as ModuleType)).toBe(false);
    expect(isStateProducerType('plugin:string' as ModuleType)).toBe(false);
    expect(isStateProducerType('plugin:missing' as ModuleType)).toBe(false);
  });
});
