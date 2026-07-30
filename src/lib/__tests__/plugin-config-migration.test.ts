import { describe, it, expect } from 'vitest';
import { deepMergeConfig, applyMigrationToModule, migrateConfigModules } from '../plugin-config-migration';
import type { ScreenConfiguration, Screen } from '@/types/config';
import type { PluginManifest } from '@/types/plugins';

/** Build a minimal manifest stub for testing migrations. */
function stubManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test',
    version: '2.0.0',
    moduleType: 'test',
    icon: 'box',
    defaultConfig: {},
    defaultSize: { w: 200, h: 200 },
    exports: { component: 'default' },
    ...overrides,
  } as PluginManifest;
}

describe('deepMergeConfig', () => {
  it('adds missing keys from source', () => {
    const target = { a: 1 };
    const source = { a: 99, b: 2 };
    const result = deepMergeConfig(target, source);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('preserves existing values in target', () => {
    const target = { a: 1, b: 'hello' };
    const source = { a: 99, b: 'world' };
    const result = deepMergeConfig(target, source);
    expect(result).toEqual({ a: 1, b: 'hello' });
  });

  it('deep-merges nested objects', () => {
    const target = { nested: { a: 1 } };
    const source = { nested: { a: 99, b: 2 } };
    const result = deepMergeConfig(target, source);
    expect(result).toEqual({ nested: { a: 1, b: 2 } });
  });

  it('preserves arrays without merging them recursively', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMergeConfig(target, source);
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('adds new arrays from source', () => {
    const target = {};
    const source = { items: [1, 2] };
    const result = deepMergeConfig(target, source);
    expect(result).toEqual({ items: [1, 2] });
  });

  it('handles null values in target (preserves them)', () => {
    const target = { a: null };
    const source = { a: { nested: true } };
    const result = deepMergeConfig(target, source);
    // null is not an object, so target value is preserved
    expect(result).toEqual({ a: null });
  });

  it('handles null values in source (adds them as new keys)', () => {
    const target = {};
    const source = { a: null };
    const result = deepMergeConfig(target, source);
    expect(result).toEqual({ a: null });
  });

  it('handles empty objects', () => {
    expect(deepMergeConfig({}, {})).toEqual({});
    expect(deepMergeConfig({ a: 1 }, {})).toEqual({ a: 1 });
    expect(deepMergeConfig({}, { a: 1 })).toEqual({ a: 1 });
  });

  it('handles deeply nested structures', () => {
    const target = { l1: { l2: { l3: { existing: true } } } };
    const source = { l1: { l2: { l3: { existing: false, newField: 42 }, newL3: 'hello' } } };
    const result = deepMergeConfig(target, source);
    expect(result).toEqual({
      l1: { l2: { l3: { existing: true, newField: 42 }, newL3: 'hello' } },
    });
  });

  it('does not mutate the original target', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    deepMergeConfig(target, source);
    expect(target).toEqual({ a: 1 });
  });

  it('does not mutate the original source', () => {
    const target = {};
    const source = { a: { nested: 1 } };
    const result = deepMergeConfig(target, source);
    // Shallow copy means the nested ref is shared — that's fine for read-only defaults
    expect(source).toEqual({ a: { nested: 1 } });
    expect(result).toEqual({ a: { nested: 1 } });
  });
});

describe('applyMigrationToModule', () => {
  it('deep-merges with defaultConfig when no migrations exist', () => {
    const manifest = stubManifest({ defaultConfig: { color: 'red', size: 10 } });
    const result = applyMigrationToModule({ color: 'blue' }, manifest, '1.0.0');
    expect(result).toEqual({ color: 'blue', size: 10 });
  });

  it('applies rename migration', () => {
    const manifest = stubManifest({
      version: '2.0.0',
      defaultConfig: { newKey: 'default' },
      configMigrations: {
        '1.1.0': { renames: { oldKey: 'newKey' } },
      },
    });
    const result = applyMigrationToModule({ oldKey: 'value' }, manifest, '1.0.0');
    expect(result.newKey).toBe('value');
    expect(result.oldKey).toBeUndefined();
  });

  it('skips rename when new key already exists', () => {
    const manifest = stubManifest({
      version: '2.0.0',
      defaultConfig: {},
      configMigrations: {
        '1.1.0': { renames: { oldKey: 'newKey' } },
      },
    });
    const result = applyMigrationToModule({ oldKey: 'old', newKey: 'existing' }, manifest, '1.0.0');
    expect(result.newKey).toBe('existing');
    expect(result.oldKey).toBe('old');
  });

  it('applies default migration for missing keys', () => {
    const manifest = stubManifest({
      version: '2.0.0',
      defaultConfig: {},
      configMigrations: {
        '1.1.0': { defaults: { theme: 'dark' } },
      },
    });
    const result = applyMigrationToModule({}, manifest, '1.0.0');
    expect(result.theme).toBe('dark');
  });

  it('skips default when key already exists', () => {
    const manifest = stubManifest({
      version: '2.0.0',
      defaultConfig: {},
      configMigrations: {
        '1.1.0': { defaults: { theme: 'dark' } },
      },
    });
    const result = applyMigrationToModule({ theme: 'light' }, manifest, '1.0.0');
    expect(result.theme).toBe('light');
  });

  it('only applies migrations in the (oldVersion, manifest.version] range', () => {
    const manifest = stubManifest({
      version: '3.0.0',
      defaultConfig: {},
      configMigrations: {
        '0.9.0': { defaults: { tooOld: true } },     // below oldVersion — excluded
        '1.0.0': { defaults: { atOld: true } },      // introduced by the version the config was
                                                     // written at, so already applied — excluded
        '1.5.0': { defaults: { inRange: true } },    // in range — included
        '3.0.0': { defaults: { atTarget: true } },   // introduced by the version being installed
                                                     // — INCLUDED, this is the whole point
        '4.0.0': { defaults: { tooNew: true } },     // above manifest.version — excluded
      },
    });
    const result = applyMigrationToModule({}, manifest, '1.0.0');
    expect(result.tooOld).toBeUndefined();
    expect(result.atOld).toBeUndefined();
    expect(result.inRange).toBe(true);
    expect(result.atTarget).toBe(true);
    expect(result.tooNew).toBeUndefined();
  });

  // Regression: the upper bound used to be strict, so a migration keyed at the
  // version that introduced it never ran on a one-step update — the single most
  // common case. A plugin going 1.0.0 -> 1.1.0 with a `"1.1.0"` entry applied
  // nothing at all.
  it('runs a migration keyed at manifest.version on a single-step update', () => {
    const manifest = stubManifest({
      version: '1.1.0',
      defaultConfig: {},
      configMigrations: {
        '1.1.0': { renames: { oldKey: 'newKey' }, defaults: { added: true } },
      },
    });
    const result = applyMigrationToModule({ oldKey: 'value' }, manifest, '1.0.0');
    expect(result.newKey).toBe('value');
    expect(result.oldKey).toBeUndefined();
    expect(result.added).toBe(true);
  });

  // Regression: keying migrations by the version they migrate *from* silently
  // skipped anyone whose installed version fell between two keys, because a
  // migration entry is normally added retroactively and cannot be expected to
  // line up with every released patch version. Keying by the introducing
  // version makes the result independent of the path a user took to get here.
  it('applies a migration regardless of which intermediate version the user is on', () => {
    const manifest = stubManifest({
      version: '1.1.0',
      defaultConfig: {},
      configMigrations: {
        '1.1.0': { renames: { oldKey: 'newKey' } },
      },
    });
    // 1.0.1 was a bugfix release that changed no config shape, so nothing is
    // keyed at it. The user still needs 1.1.0's rename.
    for (const from of ['1.0.0', '1.0.1', '1.0.9']) {
      const result = applyMigrationToModule({ oldKey: 'value' }, manifest, from);
      expect(result.newKey, `updating from ${from}`).toBe('value');
      expect(result.oldKey, `updating from ${from}`).toBeUndefined();
    }
  });

  // The exact example published in website/src/app/docs/plugins/page.md.
  it('matches the documented 1.0.0 to 1.2.0 example', () => {
    const manifest = stubManifest({
      version: '1.2.0',
      defaultConfig: {},
      configMigrations: {
        '1.1.0': { renames: { oldFieldName: 'newFieldName' }, defaults: { newFeatureEnabled: true } },
        '1.2.0': { defaults: { anotherNewField: 'default-value' } },
      },
    });
    const result = applyMigrationToModule({ oldFieldName: 'kept' }, manifest, '1.0.0');
    expect(result).toEqual({
      newFieldName: 'kept',
      newFeatureEnabled: true,
      anotherNewField: 'default-value',
    });
  });

  it('applies nothing when the plugin is reinstalled at the same version', () => {
    const manifest = stubManifest({
      version: '1.1.0',
      defaultConfig: {},
      configMigrations: {
        '1.1.0': { defaults: { shouldNotRun: true } },
      },
    });
    const result = applyMigrationToModule({}, manifest, '1.1.0');
    expect(result.shouldNotRun).toBeUndefined();
  });

  // Splitting an update into steps must not double-apply or skip anything.
  it('applies each migration exactly once across a split update', () => {
    const migrations = {
      '1.1.0': { defaults: { a: 1 } },
      '1.2.0': { defaults: { b: 2 } },
    };
    const step1 = applyMigrationToModule(
      {},
      stubManifest({ version: '1.1.0', defaultConfig: {}, configMigrations: migrations }),
      '1.0.0',
    );
    expect(step1).toEqual({ a: 1 });

    const step2 = applyMigrationToModule(
      step1,
      stubManifest({ version: '1.2.0', defaultConfig: {}, configMigrations: migrations }),
      '1.1.0',
    );
    expect(step2).toEqual({ a: 1, b: 2 });

    // ...and the same end state as jumping straight there.
    const direct = applyMigrationToModule(
      {},
      stubManifest({ version: '1.2.0', defaultConfig: {}, configMigrations: migrations }),
      '1.0.0',
    );
    expect(direct).toEqual(step2);
  });

  it('applies multiple migrations in version order', () => {
    const manifest = stubManifest({
      version: '3.0.0',
      defaultConfig: {},
      configMigrations: {
        '2.0.0': { renames: { temp: 'final' } },
        '1.5.0': { renames: { original: 'temp' } },
      },
    });
    // Should apply 1.5.0 first (original→temp), then 2.0.0 (temp→final)
    const result = applyMigrationToModule({ original: 'value' }, manifest, '1.0.0');
    expect(result.final).toBe('value');
    expect(result.temp).toBeUndefined();
    expect(result.original).toBeUndefined();
  });

  it('does not mutate the original config', () => {
    const manifest = stubManifest({
      version: '2.0.0',
      defaultConfig: { added: true },
      configMigrations: {
        '1.1.0': { renames: { a: 'b' } },
      },
    });
    const original = { a: 1 };
    applyMigrationToModule(original, manifest, '1.0.0');
    expect(original).toEqual({ a: 1 });
  });
});

describe('migrateConfigModules', () => {
  const MIGRATING_MANIFEST = stubManifest({
    version: '2.0.0',
    moduleType: 'test',
    defaultConfig: {},
    configMigrations: { '1.1.0': { renames: { oldKey: 'newKey' } } },
  });

  function screenWith(modConfig: Record<string, unknown>): Screen {
    return {
      id: 's1',
      name: 'Screen 1',
      modules: [{ id: 'm1', type: 'plugin:test', x: 0, y: 0, w: 2, h: 2, config: modConfig }],
    } as unknown as Screen;
  }

  function baseConfig(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
    return {
      version: 4,
      screens: [],
      settings: {},
      ...overrides,
    } as unknown as ScreenConfiguration;
  }

  it('migrates modules in the legacy global screen pool', () => {
    const config = baseConfig({ screens: [screenWith({ oldKey: 'value' })] });
    const changed = migrateConfigModules(config, MIGRATING_MANIFEST, '1.0.0');
    expect(changed).toBe(true);
    expect(config.screens[0].modules[0].config).toEqual({ newKey: 'value' });
  });

  // The bug this function exists to fix: walking only `config.screens` skipped
  // every instance on every display the user added, because `config.screens`
  // becomes a frozen snapshot once multi-display is enabled.
  it('migrates modules owned by a display', () => {
    const config = baseConfig({
      screens: [],
      displays: [
        { id: 'main', name: 'Main', screens: [screenWith({ oldKey: 'a' })] },
        { id: 'kitchen', name: 'Kitchen', screens: [screenWith({ oldKey: 'b' })] },
      ],
    } as unknown as Partial<ScreenConfiguration>);

    const changed = migrateConfigModules(config, MIGRATING_MANIFEST, '1.0.0');

    expect(changed).toBe(true);
    expect(config.displays![0].screens[0].modules[0].config).toEqual({ newKey: 'a' });
    expect(config.displays![1].screens[0].modules[0].config).toEqual({ newKey: 'b' });
  });

  it('migrates the global pool and every display in one pass', () => {
    const config = baseConfig({
      screens: [screenWith({ oldKey: 'pool' })],
      displays: [{ id: 'main', name: 'Main', screens: [screenWith({ oldKey: 'owned' })] }],
    } as unknown as Partial<ScreenConfiguration>);

    expect(migrateConfigModules(config, MIGRATING_MANIFEST, '1.0.0')).toBe(true);
    expect(config.screens[0].modules[0].config).toEqual({ newKey: 'pool' });
    expect(config.displays![0].screens[0].modules[0].config).toEqual({ newKey: 'owned' });
  });

  it('reports no change when nothing needed migrating', () => {
    const config = baseConfig({
      displays: [{ id: 'main', name: 'Main', screens: [screenWith({ newKey: 'already' })] }],
    } as unknown as Partial<ScreenConfiguration>);
    expect(migrateConfigModules(config, MIGRATING_MANIFEST, '1.0.0')).toBe(false);
  });

  it('ignores modules belonging to other plugins', () => {
    const other = {
      id: 's1',
      name: 'Screen 1',
      modules: [{ id: 'm1', type: 'plugin:other', x: 0, y: 0, w: 2, h: 2, config: { oldKey: 'x' } }],
    } as unknown as Screen;
    const config = baseConfig({ screens: [other] });
    expect(migrateConfigModules(config, MIGRATING_MANIFEST, '1.0.0')).toBe(false);
    expect(config.screens[0].modules[0].config).toEqual({ oldKey: 'x' });
  });

  it('tolerates displays and screens with no modules array', () => {
    const config = baseConfig({
      displays: [{ id: 'main', name: 'Main', screens: [{ id: 's', name: 'S' }] }],
    } as unknown as Partial<ScreenConfiguration>);
    expect(() => migrateConfigModules(config, MIGRATING_MANIFEST, '1.0.0')).not.toThrow();
  });
});
