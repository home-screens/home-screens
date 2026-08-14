import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach } from 'vitest';
import crypto from 'crypto';
import { sanitizePluginId } from '@/lib/plugin-utils';
import { __resetPackageVersionCacheForTests } from '@/lib/version';
import {
  validateManifest,
  installExternalPlugin,
  installPlugin,
  registerDevPlugin,
  setPluginSettings,
  getPluginSettings,
  getInstalledPlugins,
} from '@/lib/plugins';
import type { RegistryPlugin, PluginManifest } from '@/types/plugins';

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

  // A rejection asserts the message names the rule that fired, not just
  // non-null: if a refactor makes an earlier check subsume a later one, the
  // wrong-message failure is what surfaces the now-dead rule.
  it('accepts a valid manifest', () => {
    expect(validateManifest(validManifest)).toBeNull();
  });

  it('rejects null', () => {
    expect(validateManifest(null)).toContain('must be a JSON object');
  });

  it('rejects undefined', () => {
    expect(validateManifest(undefined)).toContain('must be a JSON object');
  });

  it('rejects non-object', () => {
    expect(validateManifest('string')).toContain('must be a JSON object');
    expect(validateManifest(42)).toContain('must be a JSON object');
  });

  it('rejects missing id', () => {
    expect(validateManifest({ ...validManifest, id: '' })).toContain('"id"');
    expect(validateManifest({ ...validManifest, id: undefined })).toContain('"id"');
  });

  // Regression: a manifest ID containing slashes/dots used to pass validation,
  // then collide with another plugin's directory after sanitizePluginId stripped
  // the unsafe chars. validateManifest now enforces the on-disk format directly.
  it('rejects ids with characters that would collide after sanitization', () => {
    expect(validateManifest({ ...validManifest, id: 'foo/bar' })).toContain('"id"');
    expect(validateManifest({ ...validManifest, id: 'foo.bar' })).toContain('"id"');
    expect(validateManifest({ ...validManifest, id: '../etc/passwd' })).toContain('"id"');
    expect(validateManifest({ ...validManifest, id: 'foo bar' })).toContain('"id"');
    expect(validateManifest({ ...validManifest, id: 'foo!' })).toContain('"id"');
  });

  it('rejects missing name', () => {
    expect(validateManifest({ ...validManifest, name: '' })).toContain('"name"');
  });

  it('rejects missing moduleType', () => {
    expect(validateManifest({ ...validManifest, moduleType: '' })).toContain('"moduleType"');
    expect(validateManifest({ ...validManifest, moduleType: undefined })).toContain('"moduleType"');
  });

  it('rejects invalid version', () => {
    expect(validateManifest({ ...validManifest, version: undefined })).toContain('"version"');
    expect(validateManifest({ ...validManifest, version: 123 })).toContain('"version"');
  });

  it('rejects empty category', () => {
    expect(validateManifest({ ...validManifest, category: '' })).toContain('"category"');
  });

  it('rejects missing category', () => {
    expect(validateManifest({ ...validManifest, category: undefined })).toContain('"category"');
  });

  it('accepts all built-in categories', () => {
    const categories = [
      'Time & Date', 'Weather & Environment', 'News & Finance',
      'Knowledge & Fun', 'Personal', 'Media & Display', 'Travel',
    ];
    for (const category of categories) {
      expect(validateManifest({ ...validManifest, category }), `Failed for: ${category}`).toBeNull();
    }
  });

  it('accepts custom category strings', () => {
    expect(validateManifest({ ...validManifest, category: 'Smart Home' })).toBeNull();
    expect(validateManifest({ ...validManifest, category: 'My Custom Category' })).toBeNull();
  });

  describe('auth config', () => {
    const oauthManifest = {
      ...validManifest,
      secrets: [
        { key: 'client_id', label: 'Client ID', required: true },
        { key: 'client_secret', label: 'Client Secret', required: true },
      ],
      allowedDomains: ['api.spotify.com'],
      auth: {
        type: 'oauth2',
        flow: 'authorization_code',
        authorizationUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        scopes: ['user-read-playback-state'],
        tokenPlacement: 'header',
        tokenTargetDomains: ['api.spotify.com'],
        secrets: { clientId: 'client_id', clientSecret: 'client_secret' },
      },
    };

    it('accepts a valid oauth2 authorization_code manifest', () => {
      expect(validateManifest(oauthManifest)).toBeNull();
    });

    it('rejects oauth2 with no tokenTargetDomains declared', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, tokenTargetDomains: undefined } };
      expect(validateManifest(m)).toContain('"auth.tokenTargetDomains" is required');
    });

    it('rejects oauth2 with an empty tokenTargetDomains', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, tokenTargetDomains: [] } };
      expect(validateManifest(m)).toContain('"auth.tokenTargetDomains" is required');
    });

    it('accepts oauth2 client_credentials without an authorizationUrl', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, flow: 'client_credentials', authorizationUrl: undefined } };
      expect(validateManifest(m)).toBeNull();
    });

    it('rejects authorization_code / device_code missing an authorizationUrl', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, authorizationUrl: undefined } };
      expect(validateManifest(m)).toContain('"auth.authorizationUrl"');
    });

    it('rejects oauth2 with an unknown flow', () => {
      expect(validateManifest({ ...oauthManifest, auth: { ...oauthManifest.auth, flow: 'implicit' } })).toContain('"auth.flow"');
    });

    it('rejects oauth2 whose clientId does not reference a declared secret', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, secrets: { clientId: 'nope' } } };
      expect(validateManifest(m)).toContain('"auth.secrets.clientId"');
    });

    it('rejects query token placement without a tokenParamName', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, tokenPlacement: 'query' } };
      expect(validateManifest(m)).toContain('"auth.tokenParamName"');
    });

    // The check whose silent death would be a credential leak: the message must
    // name the rogue domain so the subset rule is provably the one that fired.
    it('rejects tokenTargetDomains outside allowedDomains', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, tokenTargetDomains: ['evil.example.com'] } };
      expect(validateManifest(m)).toContain('"evil.example.com"');
      expect(validateManifest(m)).toContain('not one of the manifest\'s "allowedDomains"');
    });

    // A literal `undefined` element is unreachable via JSON.parse but the
    // validator is exported and independently callable — a find()-based check
    // once let this exact shape through.
    it('rejects tokenTargetDomains containing a non-string element', () => {
      const m = { ...oauthManifest, auth: { ...oauthManifest.auth, tokenTargetDomains: ['api.spotify.com', undefined] } };
      expect(validateManifest(m)).toContain('"allowedDomains"');
      const n = { ...oauthManifest, auth: { ...oauthManifest.auth, tokenTargetDomains: ['api.spotify.com', null] } };
      expect(validateManifest(n)).toContain('"allowedDomains"');
    });

    it('accepts a garmin manifest that declares a garmin.com domain', () => {
      const m = { ...validManifest, allowedDomains: ['connectapi.garmin.com'], auth: { type: 'garmin' } };
      expect(validateManifest(m)).toBeNull();
    });

    it('rejects a garmin manifest with no garmin.com domain', () => {
      const m = { ...validManifest, allowedDomains: ['api.example.com'], auth: { type: 'garmin' } };
      expect(validateManifest(m)).toContain('garmin.com');
    });

    it('rejects a garmin manifest carrying extra fields', () => {
      const m = { ...validManifest, allowedDomains: ['connectapi.garmin.com'], auth: { type: 'garmin', tokenUrl: 'x' } };
      expect(validateManifest(m)).toContain('no other fields');
    });

    it('rejects an unknown auth type', () => {
      expect(validateManifest({ ...validManifest, auth: { type: 'saml' } })).toContain('"auth.type"');
    });
  });

  describe('settingsSchema', () => {
    it('accepts a well-formed settingsSchema', () => {
      const m = {
        ...validManifest,
        settingsSchema: { type: 'object', properties: { haUrl: { type: 'string', title: 'Server' } } },
      };
      expect(validateManifest(m)).toBeNull();
    });

    it('rejects null', () => {
      expect(validateManifest({ ...validManifest, settingsSchema: null })).toContain('"settingsSchema"');
    });

    it('rejects a non-object', () => {
      expect(validateManifest({ ...validManifest, settingsSchema: 'nope' })).toContain('"settingsSchema"');
    });

    it('rejects type other than "object"', () => {
      const m = { ...validManifest, settingsSchema: { type: 'array', properties: {} } };
      expect(validateManifest(m)).toContain('"settingsSchema"');
    });

    it('rejects missing properties', () => {
      expect(validateManifest({ ...validManifest, settingsSchema: { type: 'object' } })).toContain('"settingsSchema"');
    });

    it('rejects properties given as an array', () => {
      const m = { ...validManifest, settingsSchema: { type: 'object', properties: [] } };
      expect(validateManifest(m)).toContain('"settingsSchema"');
    });
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
    // getPackageVersion memoizes for the process lifetime, which is correct
    // under a running server (cwd is fixed, and an upgrade restarts the
    // process) but wrong across tests that swap cwd per case — a version
    // cached from one temp dir would leak into the next one's assertions.
    __resetPackageVersionCacheForTests();
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

  it('rejects a manifest whose minAppVersion exceeds the app version', async () => {
    await fs.writeFile(path.join(tmpCwd, 'package.json'), JSON.stringify({ version: '1.7.1' }));
    const buf = await makePluginTarball({ ...baseManifest, minAppVersion: '999.0.0' });
    await expect(
      installExternalPlugin('https://example.com/p.tar.gz', buf),
    ).rejects.toThrow(/needs Home Screens 999\.0\.0/);
  });

  it('installs when the app version cannot be read (fail open)', async () => {
    // The sandboxed cwd has no package.json, so getPackageVersion() rejects.
    const buf = await makePluginTarball({ ...baseManifest, minAppVersion: '999.0.0' });
    await installExternalPlugin('https://example.com/p.tar.gz', buf);
    expect((await getInstalledPlugins()).plugins).toHaveLength(1);
  });

  it('installs when minAppVersion is unparsable (no constraint)', async () => {
    await fs.writeFile(path.join(tmpCwd, 'package.json'), JSON.stringify({ version: '1.7.1' }));
    const buf = await makePluginTarball({ ...baseManifest, minAppVersion: 'v999.0.0' });
    await installExternalPlugin('https://example.com/p.tar.gz', buf);
    expect((await getInstalledPlugins()).plugins).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// Settings carry-forward across install/register + the 32KB settings cap.
// Each test runs in an isolated tmp cwd (fresh installed.json mtime busts the
// module-level installedCache), mirroring the installExternalPlugin block.
// ---------------------------------------------------------------------------

const settingsBaseManifest = {
  id: 'foo',
  name: 'Foo',
  version: '1.0.0',
  description: 'x',
  author: 'x',
  license: 'MIT',
  minAppVersion: '0.0.0',
  moduleType: 'foo',
  category: 'Personal',
  icon: 'Package',
  defaultConfig: {},
  defaultSize: { w: 100, h: 100 },
  exports: { component: 'default' },
};

const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

async function seedInstalledFile(cwd: string, plugins: unknown[]): Promise<void> {
  await fs.writeFile(
    path.join(cwd, 'data', 'plugins', 'installed.json'),
    JSON.stringify({ schemaVersion: 1, plugins }),
  );
}

describe('plugin settings persistence', () => {
  const origCwd = process.cwd();
  let tmpCwd: string;

  beforeEach(async () => {
    tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-settings-cwd-'));
    await fs.mkdir(path.join(tmpCwd, 'data', 'plugins'), { recursive: true });
    process.chdir(tmpCwd);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpCwd, { recursive: true, force: true });
  });

  it('installPlugin carries settings forward and records previousVersion', async () => {
    await seedInstalledFile(tmpCwd, [{
      id: 'foo', version: '1.0.0', installedAt: '2026-01-01',
      enabled: true, moduleType: 'foo', settings: { apiKey: 'secret' },
    }]);

    const buf = await makePluginTarball(settingsBaseManifest);
    await installPlugin({ id: 'foo' } as unknown as RegistryPlugin, '2.0.0', buf, sha256(buf));

    const record = (await getInstalledPlugins()).plugins.find((p) => p.id === 'foo')!;
    expect(record.settings).toEqual({ apiKey: 'secret' });
    expect(record.previousVersion).toBe('1.0.0');
    expect(record.version).toBe('2.0.0');
  });

  it('installExternalPlugin carries settings forward and records previousVersion', async () => {
    await seedInstalledFile(tmpCwd, [{
      id: 'foo', version: '1.0.0', installedAt: '2026-01-01',
      enabled: true, moduleType: 'foo', source: 'external',
      externalUrl: 'https://example.com/v1.0.0/p.tar.gz',
      settings: { token: 'abc' },
    }]);

    const buf = await makePluginTarball({ ...settingsBaseManifest, version: '2.0.0' });
    await installExternalPlugin('https://example.com/v2.0.0/p.tar.gz', buf);

    const record = (await getInstalledPlugins()).plugins.find((p) => p.id === 'foo')!;
    expect(record.settings).toEqual({ token: 'abc' });
    expect(record.previousVersion).toBe('1.0.0');
    expect(record.version).toBe('2.0.0');
  });

  it('registerDevPlugin carries settings forward and never sets previousVersion', async () => {
    await seedInstalledFile(tmpCwd, [{
      id: 'foo', version: '1.0.0', installedAt: '2026-01-01',
      enabled: true, moduleType: 'foo', settings: { apiKey: 'secret' },
    }]);

    await registerDevPlugin({ ...settingsBaseManifest, version: '2.0.0' } as unknown as PluginManifest);

    const record = (await getInstalledPlugins()).plugins.find((p) => p.id === 'foo')!;
    expect(record.settings).toEqual({ apiKey: 'secret' });
    expect(record.version).toBe('2.0.0');
    expect(record.previousVersion).toBeUndefined();
  });

  it('fresh install has no settings', async () => {
    const buf = await makePluginTarball(settingsBaseManifest);
    await installPlugin({ id: 'foo' } as unknown as RegistryPlugin, '1.0.0', buf, sha256(buf));

    const record = (await getInstalledPlugins()).plugins.find((p) => p.id === 'foo')!;
    expect(record.settings).toBeUndefined();
    expect(record.previousVersion).toBeUndefined();
  });

  it('installing a beta version records channel: beta', async () => {
    const buf = await makePluginTarball({ ...settingsBaseManifest, version: '2.0.0' });
    const registryEntry = {
      id: 'foo',
      versions: [{
        version: '2.0.0',
        channel: 'beta',
        minAppVersion: '0.0.0',
        releaseDate: '2026-01-01',
        downloadUrl: 'https://example.com/v2.0.0/p.tar.gz',
        sha256: sha256(buf),
      }],
    } as unknown as RegistryPlugin;

    await installPlugin(registryEntry, '2.0.0', buf, sha256(buf));

    const record = (await getInstalledPlugins()).plugins.find((p) => p.id === 'foo')!;
    expect(record.channel).toBe('beta');
  });

  it('installing records channel: beta from the plugin-level registry channel even when the version row has none', async () => {
    const buf = await makePluginTarball({ ...settingsBaseManifest, version: '2.0.0' });
    const registryEntry = {
      id: 'foo',
      channel: 'beta',
      versions: [{
        version: '2.0.0',
        minAppVersion: '0.0.0',
        releaseDate: '2026-01-01',
        downloadUrl: 'https://example.com/v2.0.0/p.tar.gz',
        sha256: sha256(buf),
      }],
    } as unknown as RegistryPlugin;

    await installPlugin(registryEntry, '2.0.0', buf, sha256(buf));

    const record = (await getInstalledPlugins()).plugins.find((p) => p.id === 'foo')!;
    expect(record.channel).toBe('beta');
  });

  it('installing a stable version clears a prior beta channel opt-in', async () => {
    await seedInstalledFile(tmpCwd, [{
      id: 'foo', version: '1.0.0', installedAt: '2026-01-01',
      enabled: true, moduleType: 'foo', channel: 'beta',
    }]);

    const buf = await makePluginTarball({ ...settingsBaseManifest, version: '2.0.0' });
    const registryEntry = {
      id: 'foo',
      versions: [{
        version: '2.0.0',
        minAppVersion: '0.0.0',
        releaseDate: '2026-01-01',
        downloadUrl: 'https://example.com/v2.0.0/p.tar.gz',
        sha256: sha256(buf),
      }],
    } as unknown as RegistryPlugin;

    await installPlugin(registryEntry, '2.0.0', buf, sha256(buf));

    const record = (await getInstalledPlugins()).plugins.find((p) => p.id === 'foo')!;
    expect(record.channel).toBeUndefined();
  });
});

describe('setPluginSettings — 32KB cap', () => {
  const origCwd = process.cwd();
  let tmpCwd: string;

  beforeEach(async () => {
    tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-settings-cap-cwd-'));
    await fs.mkdir(path.join(tmpCwd, 'data', 'plugins'), { recursive: true });
    process.chdir(tmpCwd);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await fs.rm(tmpCwd, { recursive: true, force: true });
  });

  it('rejects an oversized payload and writes nothing', async () => {
    // registerDevPlugin writes both the on-disk manifest.json (with the
    // settingsSchema the mutator reads) and the installed.json entry.
    await registerDevPlugin({
      ...settingsBaseManifest,
      settingsSchema: { type: 'object', properties: { blob: { type: 'string' } } },
    } as unknown as PluginManifest);

    await expect(
      setPluginSettings('foo', { blob: 'x'.repeat(40 * 1024) }),
    ).rejects.toThrow(/Settings payload too large/);

    // Nothing was persisted.
    expect(await getPluginSettings('foo')).toEqual({});
  });
});
