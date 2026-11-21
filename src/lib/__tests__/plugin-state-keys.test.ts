import { describe, it, expect } from 'vitest';
import { parsePluginStateKey, pluginStatePrefix, pluginStateKey } from '../plugin-state-keys';

describe('pluginStatePrefix', () => {
  it('builds the canonical lowercase namespace', () => {
    expect(pluginStatePrefix('ha')).toBe('plugin:ha:');
  });

  it('lowercases mixed-case plugin ids (PLUGIN_ID_PATTERN is case-insensitive)', () => {
    expect(pluginStatePrefix('MyPlugin')).toBe('plugin:myplugin:');
  });
});

describe('pluginStateKey', () => {
  it('prefixes a bare key', () => {
    expect(pluginStateKey('ha', 'door')).toBe('plugin:ha:door');
  });

  it('lowercases the namespace but not the key rest', () => {
    // The rest stays as-is so the store's charset warning fires visibly
    // instead of silently mangling a plugin's key.
    expect(pluginStateKey('MyPlugin', 'Door')).toBe('plugin:myplugin:Door');
  });

  it('leaves an already-canonical key unchanged', () => {
    expect(pluginStateKey('ha', 'plugin:ha:door')).toBe('plugin:ha:door');
  });

  it('strips a case-variant own prefix before re-prefixing', () => {
    expect(pluginStateKey('MyPlugin', 'plugin:MyPlugin:door')).toBe('plugin:myplugin:door');
    expect(pluginStateKey('myplugin', 'plugin:MYPLUGIN:door')).toBe('plugin:myplugin:door');
  });

  it('double-prefixes a key targeting another plugin namespace (no spoofing)', () => {
    expect(pluginStateKey('ha', 'plugin:other:door')).toBe('plugin:ha:plugin:other:door');
  });
});

describe('parsePluginStateKey', () => {
  it('splits a plugin key into its id as written and the rest', () => {
    expect(parsePluginStateKey('plugin:ha:door.front')).toEqual({ pluginId: 'ha', rest: 'door.front' });
    expect(parsePluginStateKey('plugin:MyPlugin:a:b')).toEqual({ pluginId: 'MyPlugin', rest: 'a:b' });
  });

  it('keeps an empty rest, which the callers that need a key turn away', () => {
    expect(parsePluginStateKey('plugin:ha:')).toEqual({ pluginId: 'ha', rest: '' });
  });

  it.each(['weather.condition', 'plugin:ha', 'plugin::key', 'xplugin:ha:key', ''])('answers null for %j', (key) => {
    expect(parsePluginStateKey(key)).toBeNull();
  });
});
