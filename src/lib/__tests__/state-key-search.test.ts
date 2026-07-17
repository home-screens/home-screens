import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeDescriptors,
  searchStateKeysAcrossPlugins,
  pluginHasStateKeySearch,
} from '../state-key-search';
import { usePluginStore } from '@/stores/plugin-store';
import type { PluginManifest, SearchStateKeys } from '@/types/plugins';

/**
 * The aggregation layer is the panel's only defense against third-party
 * search implementations: a plugin that throws, hangs, or returns garbage
 * must contribute nothing — never an exception, never a malformed entry.
 */

function makeManifest(id: string, name = id): PluginManifest {
  return {
    id,
    name,
    version: '1.0.0',
    description: '',
    author: '',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType: id,
    category: 'Personal',
    icon: 'Home',
    defaultConfig: {},
    defaultSize: { w: 100, h: 100 },
    exports: { component: 'default' },
  };
}

const FakeComponent = () => null;

function register(id: string, searchStateKeys?: SearchStateKeys): void {
  usePluginStore.getState().registerPlugin(
    `plugin:${id}`,
    FakeComponent,
    makeManifest(id, `Nice ${id}`),
    undefined,
    undefined,
    searchStateKeys,
  );
}

beforeEach(() => {
  usePluginStore.getState().clearPlugins();
  usePluginStore.getState().setPluginSettingsMap(new Map());
});

describe('sanitizeDescriptors', () => {
  it('returns [] for non-array garbage', () => {
    expect(sanitizeDescriptors(null)).toEqual([]);
    expect(sanitizeDescriptors('nope')).toEqual([]);
    expect(sanitizeDescriptors({ key: 'plugin:x:y' })).toEqual([]);
  });

  it('drops entries whose key the bus would reject, keeps valid ones', () => {
    const result = sanitizeDescriptors([
      { key: 'plugin:ha:binary_sensor.door', label: 'Door', valueType: 'enum', valueOptions: [{ value: 'on', label: 'Open' }] },
      { key: 'Plugin:HA:Upper.Case', label: 'Bad key' },
      { key: 42, label: 'Not a string' },
      null,
      'string entry',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'plugin:ha:binary_sensor.door', label: 'Door', valueType: 'enum' });
  });

  it('falls back to the key as label and to string valueType on malformed fields', () => {
    const [d] = sanitizeDescriptors([
      { key: 'plugin:ha:sensor.x', label: 7, valueType: 'fancy', unit: 3, currentValue: 12 },
    ]);
    expect(d).toEqual({
      key: 'plugin:ha:sensor.x',
      label: 'plugin:ha:sensor.x',
      group: undefined,
      valueType: 'string',
      valueOptions: undefined,
      unit: undefined,
      currentValue: undefined,
    });
  });

  it('degrades an enum with no usable options to free text', () => {
    const [d] = sanitizeDescriptors([
      { key: 'plugin:ha:sensor.x', label: 'X', valueType: 'enum', valueOptions: [{ label: 'no raw value' }, 'junk'] },
    ]);
    expect(d.valueType).toBe('string');
    expect(d.valueOptions).toBeUndefined();
  });

  it('strips malformed value options but keeps well-formed ones', () => {
    const [d] = sanitizeDescriptors([
      {
        key: 'plugin:ha:lock.front',
        label: 'Front Lock',
        valueType: 'enum',
        valueOptions: [{ value: 'locked', label: 'Locked' }, { value: 'unlocked' }, { value: 9 }, null],
      },
    ]);
    expect(d.valueOptions).toEqual([
      { value: 'locked', label: 'Locked' },
      { value: 'unlocked', label: undefined },
    ]);
  });

  it('caps the number of results at the limit', () => {
    const raw = Array.from({ length: 40 }, (_, i) => ({ key: `plugin:ha:sensor.s${i}`, label: `S${i}` }));
    expect(sanitizeDescriptors(raw, 10)).toHaveLength(10);
  });

  it('drops an over-long enum option value and an over-long currentValue', () => {
    const huge = 'x'.repeat(1025); // one past the 1024 bus value cap
    const [d] = sanitizeDescriptors([
      {
        key: 'plugin:ha:sensor.x',
        label: 'X',
        valueType: 'enum',
        valueOptions: [{ value: huge, label: 'Too big' }, { value: 'ok', label: 'Fine' }],
        currentValue: huge,
      },
    ]);
    // The oversized option is dropped; the well-formed one survives.
    expect(d.valueOptions).toEqual([{ value: 'ok', label: 'Fine' }]);
    // The oversized currentValue degrades to undefined rather than passing through.
    expect(d.currentValue).toBeUndefined();
  });

  it('keeps a value/currentValue exactly at the 1024 cap', () => {
    const atCap = 'y'.repeat(1024);
    const [d] = sanitizeDescriptors([
      {
        key: 'plugin:ha:sensor.y',
        label: 'Y',
        valueType: 'enum',
        valueOptions: [{ value: atCap }],
        currentValue: atCap,
      },
    ]);
    expect(d.valueOptions).toEqual([{ value: atCap, label: undefined }]);
    expect(d.currentValue).toBe(atCap);
  });
});

describe('pluginHasStateKeySearch', () => {
  it('is true only for a function-valued searchStateKeys', () => {
    expect(pluginHasStateKeySearch({ searchStateKeys: undefined })).toBe(false);
    expect(pluginHasStateKeySearch({ searchStateKeys: async () => [] })).toBe(true);
    register('plain');
    register('searchy', async () => []);
    const plugins = Array.from(usePluginStore.getState().plugins.values());
    expect(plugins.filter(pluginHasStateKeySearch).map((p) => p.manifest.id)).toEqual(['searchy']);
  });
});

describe('searchStateKeysAcrossPlugins', () => {
  it('merges results from every searchable plugin, tagged with the plugin name', async () => {
    register('ha', async () => [{ key: 'plugin:ha:sensor.a', label: 'A', valueType: 'string' }]);
    register('garmin', async () => [{ key: 'plugin:garmin:steps', label: 'Steps', valueType: 'numeric' }]);
    const results = await searchStateKeysAcrossPlugins('a');
    expect(results.map((r) => r.key).sort()).toEqual(['plugin:garmin:steps', 'plugin:ha:sensor.a']);
    expect(results.find((r) => r.key === 'plugin:ha:sensor.a')?.pluginName).toBe('Nice ha');
  });

  it('a throwing plugin contributes nothing and does not sink the others', async () => {
    register('broken', async () => { throw new Error('boom'); });
    register('ha', async () => [{ key: 'plugin:ha:sensor.a', label: 'A', valueType: 'string' }]);
    const results = await searchStateKeysAcrossPlugins('a');
    expect(results.map((r) => r.key)).toEqual(['plugin:ha:sensor.a']);
  });

  it('a synchronously-throwing search function is also contained', async () => {
    register('sync-broken', (() => { throw new Error('sync boom'); }) as unknown as SearchStateKeys);
    register('ha', async () => [{ key: 'plugin:ha:sensor.a', label: 'A', valueType: 'string' }]);
    const results = await searchStateKeysAcrossPlugins('a');
    expect(results.map((r) => r.key)).toEqual(['plugin:ha:sensor.a']);
  });

  it('a hanging plugin is cut off by the timeout', async () => {
    register('hanging', () => new Promise(() => {}));
    register('ha', async () => [{ key: 'plugin:ha:sensor.a', label: 'A', valueType: 'string' }]);
    const results = await searchStateKeysAcrossPlugins('a', { timeoutMs: 20 });
    expect(results.map((r) => r.key)).toEqual(['plugin:ha:sensor.a']);
  });

  it('garbage results are sanitized away rather than reaching the panel', async () => {
    register('garbage', (async () => 'not an array') as unknown as SearchStateKeys);
    const results = await searchStateKeysAcrossPlugins('x');
    expect(results).toEqual([]);
  });

  it('dedupes identical keys across plugins (first plugin wins)', async () => {
    register('one', async () => [{ key: 'plugin:shared:k', label: 'From one', valueType: 'string' }]);
    register('two', async () => [{ key: 'plugin:shared:k', label: 'From two', valueType: 'string' }]);
    const results = await searchStateKeysAcrossPlugins('k');
    expect(results).toHaveLength(1);
  });

  it('passes the query, limit, and the plugin\'s own settings through', async () => {
    const search = vi.fn(async () => []);
    register('ha', search);
    usePluginStore.getState().setPluginSettingsMap(new Map([['ha', { haUrl: 'http://ha.local' }]]));
    await searchStateKeysAcrossPlugins('door', { limit: 7 });
    expect(search).toHaveBeenCalledExactlyOnceWith('door', { limit: 7, settings: { haUrl: 'http://ha.local' } });
  });

  it('resolves to [] when no plugin implements search', async () => {
    register('plain');
    expect(await searchStateKeysAcrossPlugins('anything')).toEqual([]);
  });
});
