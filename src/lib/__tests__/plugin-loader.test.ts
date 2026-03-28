import { describe, it, expect } from 'vitest';
import { deepMergeConfig, compareSemver, applyMigrationToModule } from '../plugin-loader';
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

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('0.16.0', '0.16.0')).toBe(0);
  });

  it('correctly compares major versions', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('correctly compares minor versions', () => {
    expect(compareSemver('1.2.0', '1.1.0')).toBeGreaterThan(0);
    expect(compareSemver('1.1.0', '1.2.0')).toBeLessThan(0);
  });

  it('correctly compares patch versions', () => {
    expect(compareSemver('1.0.2', '1.0.1')).toBeGreaterThan(0);
    expect(compareSemver('1.0.1', '1.0.2')).toBeLessThan(0);
  });

  it('handles double-digit version numbers correctly (not lexicographic)', () => {
    // This was the original bug: "9.0.0" > "10.0.0" is true lexicographically
    expect(compareSemver('9.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareSemver('10.0.0', '9.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareSemver('1.0.9', '1.0.10')).toBeLessThan(0);
  });

  it('handles missing segments gracefully', () => {
    expect(compareSemver('1.0.0', '1')).toBe(0);
    expect(compareSemver('1.2', '1.2.0')).toBe(0);
  });
});

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
