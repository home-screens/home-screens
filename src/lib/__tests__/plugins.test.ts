import { describe, it, expect } from 'vitest';
import { sanitizePluginId } from '@/lib/plugin-utils';
import { validateManifest } from '@/lib/plugins';

describe('sanitizePluginId', () => {
  it('allows valid characters', () => {
    expect(sanitizePluginId('weather-radar')).toBe('weather-radar');
    expect(sanitizePluginId('my_plugin_123')).toBe('my_plugin_123');
  });

  it('strips directory traversal characters', () => {
    expect(sanitizePluginId('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizePluginId('../foo')).toBe('foo');
  });

  it('strips slashes', () => {
    expect(sanitizePluginId('foo/bar')).toBe('foobar');
    expect(sanitizePluginId('foo\\bar')).toBe('foobar');
  });

  it('strips dots', () => {
    expect(sanitizePluginId('foo.bar')).toBe('foobar');
  });

  it('throws on input that sanitizes to empty string', () => {
    expect(() => sanitizePluginId('...')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('///')).toThrow('Invalid plugin ID');
  });

  it('strips special characters', () => {
    expect(sanitizePluginId('hello world!')).toBe('helloworld');
    expect(sanitizePluginId('plugin@1.0')).toBe('plugin10');
  });
});

describe('validateManifest', () => {
  const validManifest = {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'tester',
    license: 'MIT',
    minAppVersion: '0.16.0',
    moduleType: 'test-widget',
    category: 'Weather & Environment',
    icon: 'Radar',
    defaultConfig: {},
    defaultSize: { w: 400, h: 300 },
    exports: { component: 'default' },
  };

  it('accepts a valid manifest', () => {
    expect(validateManifest(validManifest)).toBe(true);
  });

  it('rejects null', () => {
    expect(validateManifest(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateManifest(undefined)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateManifest('string')).toBe(false);
    expect(validateManifest(42)).toBe(false);
  });

  it('rejects missing id', () => {
    expect(validateManifest({ ...validManifest, id: '' })).toBe(false);
    expect(validateManifest({ ...validManifest, id: undefined })).toBe(false);
  });

  it('rejects missing name', () => {
    expect(validateManifest({ ...validManifest, name: '' })).toBe(false);
  });

  it('rejects missing moduleType', () => {
    expect(validateManifest({ ...validManifest, moduleType: '' })).toBe(false);
    expect(validateManifest({ ...validManifest, moduleType: undefined })).toBe(false);
  });

  it('rejects invalid version', () => {
    expect(validateManifest({ ...validManifest, version: undefined })).toBe(false);
    expect(validateManifest({ ...validManifest, version: 123 })).toBe(false);
  });

  it('rejects empty category', () => {
    expect(validateManifest({ ...validManifest, category: '' })).toBe(false);
  });

  it('rejects missing category', () => {
    expect(validateManifest({ ...validManifest, category: undefined })).toBe(false);
  });

  it('accepts all built-in categories', () => {
    const categories = [
      'Time & Date', 'Weather & Environment', 'News & Finance',
      'Knowledge & Fun', 'Personal', 'Media & Display', 'Travel',
    ];
    for (const category of categories) {
      expect(validateManifest({ ...validManifest, category }), `Failed for: ${category}`).toBe(true);
    }
  });

  it('accepts custom category strings', () => {
    expect(validateManifest({ ...validManifest, category: 'Smart Home' })).toBe(true);
    expect(validateManifest({ ...validManifest, category: 'My Custom Category' })).toBe(true);
  });
});
