import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Override process.cwd to use a temp directory for tests
let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Dynamic import to ensure process.cwd override is in effect before module loads
async function loadSecrets() {
  // Clear module cache to pick up the new cwd each time
  const mod = await import('../secrets');
  return mod;
}

describe('readSecrets', () => {
  it('returns empty object when file does not exist', async () => {
    const { readSecrets } = await loadSecrets();
    const secrets = await readSecrets();
    expect(secrets).toEqual({});
  });

  it('returns parsed JSON when file exists', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const store = { openweathermap_key: 'abc123', weatherapi_key: 'xyz789' };
    await fs.writeFile(path.join(dataDir, 'secrets.json'), JSON.stringify(store));

    const { readSecrets } = await loadSecrets();
    const secrets = await readSecrets();
    expect(secrets).toEqual(store);
  });

  it('throws on invalid JSON instead of silently returning empty', async () => {
    // A corrupt secrets.json must fail loudly — falling back to {} means the
    // next write would wipe every stored API key.
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'secrets.json'), '{{not valid json!!');

    const { readSecrets } = await loadSecrets();
    await expect(readSecrets()).rejects.toThrow();
  });
});

describe('writeSecrets', () => {
  it('writes valid JSON to the file', async () => {
    const { writeSecrets } = await loadSecrets();
    const store = { openweathermap_key: 'key1', unsplash_access_key: 'key2' };
    await writeSecrets(store);

    const filePath = path.join(tmpDir, 'data', 'secrets.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(store);
  });

  it('creates the data directory if it does not exist', async () => {
    const { writeSecrets } = await loadSecrets();
    await writeSecrets({ todoist_token: 'tok' });

    const stat = await fs.stat(path.join(tmpDir, 'data'));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('getSecret', () => {
  it('returns the value when key exists', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: 'my-key' })
    );

    const { getSecret } = await loadSecrets();
    const value = await getSecret('openweathermap_key');
    expect(value).toBe('my-key');
  });

  it('returns null when key does not exist', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: 'my-key' })
    );

    const { getSecret } = await loadSecrets();
    const value = await getSecret('weatherapi_key');
    expect(value).toBeNull();
  });

  it('returns null when secrets file is empty', async () => {
    const { getSecret } = await loadSecrets();
    const value = await getSecret('openweathermap_key');
    expect(value).toBeNull();
  });
});

describe('setSecret', () => {
  it('adds a new key to existing secrets', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: 'existing' })
    );

    const { setSecret, readSecrets } = await loadSecrets();
    await setSecret('weatherapi_key', 'new-key');

    const secrets = await readSecrets();
    expect(secrets.openweathermap_key).toBe('existing');
    expect(secrets.weatherapi_key).toBe('new-key');
  });

  it('updates an existing key', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: 'old-value' })
    );

    const { setSecret, readSecrets } = await loadSecrets();
    await setSecret('openweathermap_key', 'new-value');

    const secrets = await readSecrets();
    expect(secrets.openweathermap_key).toBe('new-value');
  });

  it('creates file if it did not exist', async () => {
    const { setSecret, readSecrets } = await loadSecrets();
    await setSecret('google_maps_key', 'gm-key');

    const secrets = await readSecrets();
    expect(secrets.google_maps_key).toBe('gm-key');

    // Verify the file was actually written to disk
    const filePath = path.join(tmpDir, 'data', 'secrets.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.google_maps_key).toBe('gm-key');
  });
});

describe('deleteSecret', () => {
  it('removes a key from secrets', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: 'val1', weatherapi_key: 'val2' })
    );

    const { deleteSecret, readSecrets } = await loadSecrets();
    await deleteSecret('openweathermap_key');

    const secrets = await readSecrets();
    expect(secrets).toEqual({ weatherapi_key: 'val2' });
    expect(secrets.openweathermap_key).toBeUndefined();
  });

  it('does nothing if key does not exist (no error)', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: 'val1' })
    );

    const { deleteSecret, readSecrets } = await loadSecrets();
    await deleteSecret('weatherapi_key');

    const secrets = await readSecrets();
    expect(secrets).toEqual({ openweathermap_key: 'val1' });
  });
});

describe('getSecretStatus', () => {
  it('returns all keys as false when no secrets set', async () => {
    const { getSecretStatus } = await loadSecrets();
    const status = await getSecretStatus();

    expect(status.openweathermap_key).toBe(false);
    expect(status.weatherapi_key).toBe(false);
    expect(status.unsplash_access_key).toBe(false);
    expect(status.todoist_token).toBe(false);
    expect(status.google_maps_key).toBe(false);
    expect(status.tomtom_key).toBe(false);
    expect(status.immich_url).toBe(false);
    expect(status.immich_api_key).toBe(false);
  });

  it('returns correct boolean map for mixed set/unset keys', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: 'abc', todoist_token: 'tok' })
    );

    const { getSecretStatus } = await loadSecrets();
    const status = await getSecretStatus();

    expect(status.openweathermap_key).toBe(true);
    expect(status.todoist_token).toBe(true);
    expect(status.weatherapi_key).toBe(false);
    expect(status.unsplash_access_key).toBe(false);
    expect(status.google_maps_key).toBe(false);
    expect(status.tomtom_key).toBe(false);
  });

  it('treats empty string values as false', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'secrets.json'),
      JSON.stringify({ openweathermap_key: '', weatherapi_key: 'valid' })
    );

    const { getSecretStatus } = await loadSecrets();
    const status = await getSecretStatus();

    expect(status.openweathermap_key).toBe(false);
    expect(status.weatherapi_key).toBe(true);
  });
});
