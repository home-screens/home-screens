import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { sanitizePluginId, pluginDir, pluginsDir, getPluginManifest } from '../plugin-utils';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-plugin-utils-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('sanitizePluginId', () => {
  it('passes through valid alphanumeric IDs', () => {
    expect(sanitizePluginId('my-plugin')).toBe('my-plugin');
    expect(sanitizePluginId('plugin_v2')).toBe('plugin_v2');
    expect(sanitizePluginId('CamelCase123')).toBe('CamelCase123');
  });

  it('strips directory traversal characters', () => {
    expect(sanitizePluginId('../etc/passwd')).toBe('etcpasswd');
    expect(sanitizePluginId('../../secret')).toBe('secret');
  });

  it('strips slashes and dots', () => {
    expect(sanitizePluginId('plugin/../../hack')).toBe('pluginhack');
    expect(sanitizePluginId('a.b.c')).toBe('abc');
  });

  it('strips spaces and special characters', () => {
    expect(sanitizePluginId('my plugin!')).toBe('myplugin');
    expect(sanitizePluginId('test@#$%^&*')).toBe('test');
  });

  it('throws on empty result', () => {
    expect(() => sanitizePluginId('')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('...')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('////')).toThrow('Invalid plugin ID');
  });
});

describe('pluginsDir', () => {
  it('returns path under data/plugins', () => {
    expect(pluginsDir()).toBe(path.join(tmpDir, 'data', 'plugins'));
  });
});

describe('pluginDir', () => {
  it('returns sanitized path for a plugin', () => {
    expect(pluginDir('my-plugin')).toBe(path.join(tmpDir, 'data', 'plugins', 'my-plugin'));
  });

  it('sanitizes dangerous IDs', () => {
    expect(pluginDir('../etc')).toBe(path.join(tmpDir, 'data', 'plugins', 'etc'));
  });
});

describe('getPluginManifest', () => {
  it('returns null when plugin directory does not exist', async () => {
    const result = await getPluginManifest('nonexistent');
    expect(result).toBeNull();
  });

  it('reads and parses manifest.json', async () => {
    const dir = path.join(tmpDir, 'data', 'plugins', 'test-plugin');
    await fs.mkdir(dir, { recursive: true });
    const manifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      moduleType: 'test-widget',
      entrypoint: 'index.js',
    };
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));

    const result = await getPluginManifest('test-plugin');
    expect(result).toEqual(manifest);
  });

  it('returns null for invalid JSON', async () => {
    const dir = path.join(tmpDir, 'data', 'plugins', 'bad-json');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'manifest.json'), 'not valid json {{{');

    const result = await getPluginManifest('bad-json');
    expect(result).toBeNull();
  });
});
