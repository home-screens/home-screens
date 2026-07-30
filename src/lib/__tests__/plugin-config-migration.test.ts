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

  it('only applies migrations in the (oldVersion, manifest.version) range', () => {
    const manifest = stubManifest({
      version: '3.0.0',
      defaultConfig: {},
      configMigrations: {
        '1.0.0': { defaults: { tooOld: true } },   // at oldVersion boundary — excluded
        '1.5.0': { defaults: { inRange: true } },   // in range — included
        '3.0.0': { defaults: { atTarget: true } },  // at manifest.version boundary — excluded
        '4.0.0': { defaults: { tooNew: true } },    // above manifest.version — excluded
      },
    });
    const result = applyMigrationToModule({}, manifest, '1.0.0');
    expect(result.tooOld).toBeUndefined();
    expect(result.inRange).toBe(true);
    expect(result.atTarget).toBeUndefined();
    expect(result.tooNew).toBeUndefined();
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
