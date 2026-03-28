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
    const dir = await setupPlugin('test-plugin', ['API_KEY']);

    await setPluginSecret('test-plugin', 'API_KEY', 'value');
    const secretsPath = path.join(dir, 'secrets.json');
    const stat = await fs.stat(secretsPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
