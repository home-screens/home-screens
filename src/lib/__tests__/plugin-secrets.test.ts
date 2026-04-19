import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-plugin-secrets-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  // Reset module cache so writeQueue resets between tests
  vi.resetModules();
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

// Helper to create a plugin with a manifest declaring secret keys
async function setupPlugin(pluginId: string, secretKeys: string[]) {
  const dir = path.join(tmpDir, 'data', 'plugins', pluginId);
  await fs.mkdir(dir, { recursive: true });
  const manifest = {
    id: pluginId,
    name: `Test ${pluginId}`,
    version: '1.0.0',
    moduleType: 'widget',
    entrypoint: 'index.js',
    secrets: secretKeys.map((key) => ({ key, label: key, description: `${key} desc` })),
  };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

describe('plugin-secrets', () => {
  it('getPluginSecret returns null when no secrets file exists', async () => {
    const { getPluginSecret } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['API_KEY']);
    const value = await getPluginSecret('test-plugin', 'API_KEY');
    expect(value).toBeNull();
  });

  it('setPluginSecret writes and getPluginSecret reads a secret', async () => {
    const { setPluginSecret, getPluginSecret } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['API_KEY']);

    await setPluginSecret('test-plugin', 'API_KEY', 'my-secret-123');
    const value = await getPluginSecret('test-plugin', 'API_KEY');
    expect(value).toBe('my-secret-123');
  });

  it('setPluginSecret rejects undeclared secret keys', async () => {
    const { setPluginSecret } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['API_KEY']);

    await expect(setPluginSecret('test-plugin', 'UNDECLARED', 'value')).rejects.toThrow(
      'Secret key "UNDECLARED" is not declared in plugin manifest',
    );
  });

  it('deletePluginSecret removes a secret', async () => {
    const { setPluginSecret, getPluginSecret, deletePluginSecret } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['API_KEY']);

    await setPluginSecret('test-plugin', 'API_KEY', 'value');
    await deletePluginSecret('test-plugin', 'API_KEY');
    const value = await getPluginSecret('test-plugin', 'API_KEY');
    expect(value).toBeNull();
  });

  it('deletePluginSecret is a no-op for nonexistent key', async () => {
    const { deletePluginSecret } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['API_KEY']);
    // Should not throw
    await deletePluginSecret('test-plugin', 'API_KEY');
  });

  it('getPluginSecretStatus returns configured status for all declared secrets', async () => {
    const { setPluginSecret, getPluginSecretStatus } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['KEY_A', 'KEY_B', 'KEY_C']);

    await setPluginSecret('test-plugin', 'KEY_A', 'configured');
    // KEY_B and KEY_C left unset
    const status = await getPluginSecretStatus('test-plugin');
    expect(status).toEqual({
      KEY_A: true,
      KEY_B: false,
      KEY_C: false,
    });
  });

  it('getPluginSecretStatus returns empty object for plugin without secrets', async () => {
    const { getPluginSecretStatus } = await import('../plugin-secrets');
    await setupPlugin('no-secrets', []);
    const status = await getPluginSecretStatus('no-secrets');
    expect(status).toEqual({});
  });

  it('deleteAllPluginSecrets removes the secrets file', async () => {
    const { setPluginSecret, deleteAllPluginSecrets, getPluginSecret } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['API_KEY']);

    await setPluginSecret('test-plugin', 'API_KEY', 'value');
    await deleteAllPluginSecrets('test-plugin');
    const value = await getPluginSecret('test-plugin', 'API_KEY');
    expect(value).toBeNull();
  });

  it('secrets file has restricted permissions (0600)', async () => {
    const { setPluginSecret } = await import('../plugin-secrets');
    await setupPlugin('test-plugin', ['API_KEY']);

    await setPluginSecret('test-plugin', 'API_KEY', 'value');
    const secretsPath = path.join(tmpDir, 'data', 'plugin-secrets', 'test-plugin.json');
    const stat = await fs.stat(secretsPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('secrets file lives outside the plugin directory so upgrades cannot wipe it', async () => {
    const { setPluginSecret } = await import('../plugin-secrets');
    const dir = await setupPlugin('test-plugin', ['API_KEY']);

    await setPluginSecret('test-plugin', 'API_KEY', 'value');
    await expect(fs.stat(path.join(dir, 'secrets.json'))).rejects.toThrow();
    await expect(
      fs.stat(path.join(tmpDir, 'data', 'plugin-secrets', 'test-plugin.json')),
    ).resolves.toBeDefined();
  });

  it('getPluginSecret falls back to the legacy in-plugin-dir path', async () => {
    const { getPluginSecret } = await import('../plugin-secrets');
    const dir = await setupPlugin('test-plugin', ['API_KEY']);
    await fs.writeFile(path.join(dir, 'secrets.json'), JSON.stringify({ API_KEY: 'legacy' }));

    expect(await getPluginSecret('test-plugin', 'API_KEY')).toBe('legacy');
  });

  it('writing a secret migrates and removes the legacy file', async () => {
    const { setPluginSecret, getPluginSecret } = await import('../plugin-secrets');
    const dir = await setupPlugin('test-plugin', ['API_KEY']);
    const legacyPath = path.join(dir, 'secrets.json');
    await fs.writeFile(legacyPath, JSON.stringify({ API_KEY: 'legacy' }));

    await setPluginSecret('test-plugin', 'API_KEY', 'fresh');

    expect(await getPluginSecret('test-plugin', 'API_KEY')).toBe('fresh');
    await expect(fs.stat(legacyPath)).rejects.toThrow();
  });

  it('migrateLegacyPluginSecrets moves legacy secrets to the new location', async () => {
    const { migrateLegacyPluginSecrets, getPluginSecret } = await import('../plugin-secrets');
    const dir = await setupPlugin('test-plugin', ['API_KEY']);
    const legacyPath = path.join(dir, 'secrets.json');
    await fs.writeFile(legacyPath, JSON.stringify({ API_KEY: 'legacy' }));

    await migrateLegacyPluginSecrets('test-plugin');

    await expect(fs.stat(legacyPath)).rejects.toThrow();
    expect(await getPluginSecret('test-plugin', 'API_KEY')).toBe('legacy');
  });

  it('migrateLegacyPluginSecrets preserves the newer value when the new path already exists', async () => {
    const { setPluginSecret, migrateLegacyPluginSecrets, getPluginSecret } = await import(
      '../plugin-secrets'
    );
    const dir = await setupPlugin('test-plugin', ['API_KEY']);
    // User saved a fresh value after upgrading (now path populated)...
    await setPluginSecret('test-plugin', 'API_KEY', 'newer');
    // ...then a legacy secrets.json somehow shows up (downgrade, restore, etc.).
    const legacyPath = path.join(dir, 'secrets.json');
    await fs.writeFile(legacyPath, JSON.stringify({ API_KEY: 'stale' }));

    await migrateLegacyPluginSecrets('test-plugin');

    expect(await getPluginSecret('test-plugin', 'API_KEY')).toBe('newer');
    await expect(fs.stat(legacyPath)).rejects.toThrow();
  });

  it('deleteAllPluginSecrets clears both new and legacy paths', async () => {
    const { setPluginSecret, deleteAllPluginSecrets, getPluginSecret } = await import(
      '../plugin-secrets'
    );
    const dir = await setupPlugin('test-plugin', ['API_KEY']);
    await setPluginSecret('test-plugin', 'API_KEY', 'value');
    // Simulate a leftover legacy file (possible if a pre-fix install dropped
    // one after the migration already ran).
    await fs.writeFile(path.join(dir, 'secrets.json'), JSON.stringify({ API_KEY: 'stale' }));

    await deleteAllPluginSecrets('test-plugin');

    expect(await getPluginSecret('test-plugin', 'API_KEY')).toBeNull();
    await expect(fs.stat(path.join(dir, 'secrets.json'))).rejects.toThrow();
    await expect(
      fs.stat(path.join(tmpDir, 'data', 'plugin-secrets', 'test-plugin.json')),
    ).rejects.toThrow();
  });
});
