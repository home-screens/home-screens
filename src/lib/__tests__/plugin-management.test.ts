import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// We test getInstalledPlugins, uninstallPlugin, setPluginEnabled, getPluginHash,
// clearPreviousVersion, and getPluginBundlePath. installPlugin requires tar/crypto
// and is better suited for integration tests.

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-plugin-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  // Reset module-level caches
  vi.resetModules();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

// Lazy import to pick up process.cwd override per test
async function loadModule() {
  return await import('../plugins');
}

async function seedInstalled(plugins: unknown[]) {
  const dir = path.join(tmpDir, 'data', 'plugins');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'installed.json'),
    JSON.stringify({ schemaVersion: 1, plugins }),
  );
}

// ---------------------------------------------------------------------------
// getInstalledPlugins
// ---------------------------------------------------------------------------
describe('getInstalledPlugins', () => {
  it('returns empty when installed.json does not exist', async () => {
    const { getInstalledPlugins } = await loadModule();
    const result = await getInstalledPlugins();
    expect(result.schemaVersion).toBe(1);
    expect(result.plugins).toEqual([]);
  });

  it('reads installed plugins from file', async () => {
    await seedInstalled([
      { id: 'weather-radar', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'radar' },
    ]);

    const { getInstalledPlugins } = await loadModule();
    const result = await getInstalledPlugins();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].id).toBe('weather-radar');
    expect(result.plugins[0].enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// setPluginEnabled
// ---------------------------------------------------------------------------
describe('setPluginEnabled', () => {
  it('toggles plugin enabled state', async () => {
    await seedInstalled([
      { id: 'test-plugin', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'test' },
    ]);

    const { setPluginEnabled, getInstalledPlugins } = await loadModule();
    await setPluginEnabled('test-plugin', false);

    const result = await getInstalledPlugins();
    expect(result.plugins[0].enabled).toBe(false);
  });

  it('throws when plugin is not found', async () => {
    await seedInstalled([]);
    const { setPluginEnabled } = await loadModule();
    await expect(setPluginEnabled('nonexistent', true)).rejects.toThrow('not found');
  });
});

// ---------------------------------------------------------------------------
// clearPreviousVersion
// ---------------------------------------------------------------------------
describe('clearPreviousVersion', () => {
  it('removes previousVersion field from a plugin', async () => {
    await seedInstalled([
      { id: 'p1', version: '2.0.0', previousVersion: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'widget' },
    ]);

    const { clearPreviousVersion, getInstalledPlugins } = await loadModule();
    await clearPreviousVersion('p1');

    const result = await getInstalledPlugins();
    expect(result.plugins[0].previousVersion).toBeUndefined();
  });

  it('is a no-op when plugin has no previousVersion', async () => {
    await seedInstalled([
      { id: 'p1', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'widget' },
    ]);

    const { clearPreviousVersion, getInstalledPlugins } = await loadModule();
    await clearPreviousVersion('p1');

    const result = await getInstalledPlugins();
    expect(result.plugins[0].version).toBe('1.0.0');
  });

  it('is a no-op when plugin does not exist', async () => {
    await seedInstalled([]);
    const { clearPreviousVersion } = await loadModule();
    // Should not throw
    await clearPreviousVersion('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// getPluginBundlePath
// ---------------------------------------------------------------------------
describe('getPluginBundlePath', () => {
  it('returns correct path for a plugin', async () => {
    const { getPluginBundlePath } = await loadModule();
    const bundlePath = getPluginBundlePath('weather-radar');
    expect(bundlePath).toContain('weather-radar');
    expect(bundlePath).toContain(path.join('dist', 'bundle.js'));
  });
});

// ---------------------------------------------------------------------------
// getPluginHash
// ---------------------------------------------------------------------------
describe('getPluginHash', () => {
  it('returns a hex hash string', async () => {
    await seedInstalled([
      { id: 'p1', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'widget' },
    ]);

    const { getPluginHash } = await loadModule();
    const hash = await getPluginHash();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('changes when plugin list changes', async () => {
    await seedInstalled([
      { id: 'p1', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'widget' },
    ]);

    const mod1 = await loadModule();
    const hash1 = await mod1.getPluginHash();

    // Add a second plugin
    await seedInstalled([
      { id: 'p1', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'widget' },
      { id: 'p2', version: '2.0.0', installedAt: '2026-01-02', enabled: true, moduleType: 'chart' },
    ]);

    vi.resetModules();
    const mod2 = await loadModule();
    const hash2 = await mod2.getPluginHash();

    expect(hash1).not.toBe(hash2);
  });

  it('returns consistent hash for same input', async () => {
    await seedInstalled([
      { id: 'p1', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'widget' },
    ]);

    const mod = await loadModule();
    const hash1 = await mod.getPluginHash();
    const hash2 = await mod.getPluginHash();
    expect(hash1).toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// uninstallPlugin
// ---------------------------------------------------------------------------
describe('uninstallPlugin', () => {
  it('removes plugin from installed.json and deletes directory', async () => {
    await seedInstalled([
      { id: 'remove-me', version: '1.0.0', installedAt: '2026-01-01', enabled: true, moduleType: 'widget' },
    ]);

    // Create a fake plugin directory
    const pluginPath = path.join(tmpDir, 'data', 'plugins', 'remove-me');
    await fs.mkdir(pluginPath, { recursive: true });
    await fs.writeFile(path.join(pluginPath, 'manifest.json'), '{}');

    const { uninstallPlugin, getInstalledPlugins } = await loadModule();
    await uninstallPlugin('remove-me');

    const result = await getInstalledPlugins();
    expect(result.plugins).toHaveLength(0);

    // Directory should be removed
    await expect(fs.access(pluginPath)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateManifest — additional edge cases beyond plugins.test.ts
// ---------------------------------------------------------------------------
describe('validateManifest — secrets and allowedDomains', () => {
  const base = {
    id: 'test',
    name: 'Test',
    version: '1.0.0',
    moduleType: 'widget',
    category: 'Personal',
  };

  it('accepts manifest with valid secrets array', async () => {
    const { validateManifest } = await loadModule();
    expect(validateManifest({
      ...base,
      secrets: [
        { key: 'api_key', label: 'API Key', required: true },
        { key: 'token-123', label: 'Token', required: false },
      ],
    })).toBe(true);
  });

  it('rejects secrets with invalid key format', async () => {
    const { validateManifest } = await loadModule();
    expect(validateManifest({
      ...base,
      secrets: [{ key: 'has spaces', label: 'Bad', required: true }],
    })).toBe(false);
  });

  it('rejects secrets with non-boolean required', async () => {
    const { validateManifest } = await loadModule();
    expect(validateManifest({
      ...base,
      secrets: [{ key: 'key', label: 'Label', required: 'yes' }],
    })).toBe(false);
  });

  it('rejects non-array secrets', async () => {
    const { validateManifest } = await loadModule();
    expect(validateManifest({ ...base, secrets: 'not-array' })).toBe(false);
  });

  it('accepts manifest with valid allowedDomains', async () => {
    const { validateManifest } = await loadModule();
    expect(validateManifest({
      ...base,
      allowedDomains: ['api.example.com', 'cdn.example.com'],
    })).toBe(true);
  });

  it('rejects non-array allowedDomains', async () => {
    const { validateManifest } = await loadModule();
    expect(validateManifest({ ...base, allowedDomains: 'example.com' })).toBe(false);
  });

  it('rejects allowedDomains with non-string entries', async () => {
    const { validateManifest } = await loadModule();
    expect(validateManifest({ ...base, allowedDomains: [123, 'example.com'] })).toBe(false);
  });
});
