import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach } from 'vitest';
import { sanitizePluginId } from '@/lib/plugin-utils';
import { validateManifest, installExternalPlugin, getInstalledPlugins } from '@/lib/plugins';

describe('sanitizePluginId', () => {
  it('allows valid characters', () => {
    expect(sanitizePluginId('weather-radar')).toBe('weather-radar');
    expect(sanitizePluginId('my_plugin_123')).toBe('my_plugin_123');
  });

  // Reject (don't strip) — `foo/bar` and `foobar` must not resolve to the same
  // on-disk directory or a malicious manifest can overwrite a sibling plugin.
  it('rejects directory traversal characters', () => {
    expect(() => sanitizePluginId('../../etc/passwd')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('../foo')).toThrow('Invalid plugin ID');
  });

  it('rejects slashes', () => {
    expect(() => sanitizePluginId('foo/bar')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('foo\\bar')).toThrow('Invalid plugin ID');
  });

  it('rejects dots', () => {
    expect(() => sanitizePluginId('foo.bar')).toThrow('Invalid plugin ID');
  });

  it('rejects empty input', () => {
    expect(() => sanitizePluginId('...')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('///')).toThrow('Invalid plugin ID');
  });

  it('rejects special characters', () => {
    expect(() => sanitizePluginId('hello world!')).toThrow('Invalid plugin ID');
    expect(() => sanitizePluginId('plugin@1.0')).toThrow('Invalid plugin ID');
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

  // Regression: a manifest ID containing slashes/dots used to pass validation,
  // then collide with another plugin's directory after sanitizePluginId stripped
  // the unsafe chars. validateManifest now enforces the on-disk format directly.
  it('rejects ids with characters that would collide after sanitization', () => {
    expect(validateManifest({ ...validManifest, id: 'foo/bar' })).toBe(false);
    expect(validateManifest({ ...validManifest, id: 'foo.bar' })).toBe(false);
    expect(validateManifest({ ...validManifest, id: '../etc/passwd' })).toBe(false);
    expect(validateManifest({ ...validManifest, id: 'foo bar' })).toBe(false);
    expect(validateManifest({ ...validManifest, id: 'foo!' })).toBe(false);
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

/** Build a minimal valid plugin tarball in a temp dir, return its buffer. */
async function makePluginTarball(manifest: Record<string, unknown>): Promise<Buffer> {
  const stageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-ext-test-'));
  const pkgDir = path.join(stageRoot, 'pkg');
  await fs.mkdir(path.join(pkgDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(pkgDir, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(pkgDir, 'dist', 'bundle.js'), 'window.__HS_PLUGIN__={default:()=>null};');
  const tarPath = path.join(stageRoot, 'out.tar.gz');
  execFileSync('tar', ['-czf', tarPath, '-C', stageRoot, 'pkg']);
  const buffer = await fs.readFile(tarPath);
  await fs.rm(stageRoot, { recursive: true, force: true });
  return buffer;
}

describe('installExternalPlugin', () => {
  // Redirect the plugin install directory to an isolated tmp dir per test.
  const origCwd = process.cwd();
  let tmpCwd: string;

  beforeEach(async () => {
    tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-ext-cwd-'));
    await fs.mkdir(path.join(tmpCwd, 'data', 'plugins'), { recursive: true });
    process.chdir(tmpCwd);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpCwd, { recursive: true, force: true });
  });

  const baseManifest = {
    id: 'ext-test',
    name: 'Ext Test',
    version: '1.0.0',
    description: 'x',
    author: 'x',
    license: 'MIT',
    minAppVersion: '0.0.0',
    moduleType: 'ext-test',
    category: 'Personal',
    icon: 'Package',
    defaultConfig: {},
    defaultSize: { w: 100, h: 100 },
    exports: { component: 'default' },
  };

  it('installs a valid external tarball', async () => {
    const buf = await makePluginTarball(baseManifest);
    await installExternalPlugin('https://example.com/v1.0.0/p.tar.gz', buf);

    const installed = await getInstalledPlugins();
    expect(installed.plugins).toHaveLength(1);
    expect(installed.plugins[0]).toMatchObject({
      id: 'ext-test',
      version: '1.0.0',
      source: 'external',
      externalUrl: 'https://example.com/v1.0.0/p.tar.gz',
      enabled: true,
    });
  });

  it('rejects when ID collides with a marketplace plugin', async () => {
    // Seed installed.json with a marketplace entry
    const installedPath = path.join(tmpCwd, 'data', 'plugins', 'installed.json');
    await fs.writeFile(installedPath, JSON.stringify({
      schemaVersion: 1,
      plugins: [{
        id: 'ext-test', version: '0.9.0', installedAt: new Date().toISOString(),
        enabled: true, moduleType: 'ext-test', source: 'marketplace',
      }],
    }));

    const buf = await makePluginTarball(baseManifest);
    await expect(
      installExternalPlugin('https://example.com/p.tar.gz', buf),
    ).rejects.toThrow(/marketplace plugin.*already installed/i);
  });

  it('allows replacing an existing external plugin (update path)', async () => {
    const buf1 = await makePluginTarball(baseManifest);
    await installExternalPlugin('https://example.com/v1.0.0/p.tar.gz', buf1);

    const buf2 = await makePluginTarball({ ...baseManifest, version: '1.1.0' });
    await installExternalPlugin('https://example.com/v1.1.0/p.tar.gz', buf2);

    const installed = await getInstalledPlugins();
    expect(installed.plugins).toHaveLength(1);
    expect(installed.plugins[0].version).toBe('1.1.0');
    expect(installed.plugins[0].previousVersion).toBe('1.0.0');
    expect(installed.plugins[0].externalUrl).toBe('https://example.com/v1.1.0/p.tar.gz');
  });

  it('rejects a tarball with invalid manifest', async () => {
    const buf = await makePluginTarball({ ...baseManifest, id: '' });
    await expect(
      installExternalPlugin('https://example.com/p.tar.gz', buf),
    ).rejects.toThrow(/manifest is invalid/i);
  });

  // Security regression: a manifest ID like "foo/bar" must NOT silently install
  // over a legitimate "foobar" plugin's directory. Before the fix, validateManifest
  // accepted any non-empty string ID, the early collision check used the raw ID
  // (so "foo/bar" didn't match installed "foobar"), and then promotePluginDir
  // sanitized to "foobar" and `fs.rm`'d the legitimate plugin's files.
  it('rejects a manifest whose ID would collide with another plugin after sanitization', async () => {
    // Seed a legitimate plugin's directory + installed.json entry.
    const legitDir = path.join(tmpCwd, 'data', 'plugins', 'foobar');
    await fs.mkdir(path.join(legitDir, 'dist'), { recursive: true });
    await fs.writeFile(path.join(legitDir, 'manifest.json'), JSON.stringify({ ...baseManifest, id: 'foobar' }));
    await fs.writeFile(path.join(legitDir, 'dist', 'bundle.js'), '/* legit */');

    const installedPath = path.join(tmpCwd, 'data', 'plugins', 'installed.json');
    await fs.writeFile(installedPath, JSON.stringify({
      schemaVersion: 1,
      plugins: [{
        id: 'foobar', version: '1.0.0', installedAt: new Date().toISOString(),
        enabled: true, moduleType: 'foobar', source: 'external',
        externalUrl: 'https://example.com/orig.tar.gz',
      }],
    }));

    // Attacker ships a tarball whose manifest declares id "foo/bar".
    const attackerBuf = await makePluginTarball({ ...baseManifest, id: 'foo/bar' });
    await expect(
      installExternalPlugin('https://attacker.com/evil.tar.gz', attackerBuf),
    ).rejects.toThrow(/manifest is invalid/i);

    // The legitimate plugin's bundle must still be on disk untouched.
    const bundle = await fs.readFile(path.join(legitDir, 'dist', 'bundle.js'), 'utf-8');
    expect(bundle).toBe('/* legit */');

    // installed.json must be unchanged: only the legitimate entry remains.
    const installed = await getInstalledPlugins();
    expect(installed.plugins).toHaveLength(1);
    expect(installed.plugins[0].id).toBe('foobar');
    expect(installed.plugins[0].externalUrl).toBe('https://example.com/orig.tar.gz');
  });

  it('rejects non-gzip data', async () => {
    const buf = Buffer.from('not a real tarball');
    await expect(
      installExternalPlugin('https://example.com/p.tar.gz', buf),
    ).rejects.toThrow();
  });
});
