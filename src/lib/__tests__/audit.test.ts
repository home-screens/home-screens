import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { audit, writeQueue } from '../audit';

// Each test gets its own tmp cwd so parallel workers can't race the real
// data/audit.log. The audit module resolves its path lazily via process.cwd(),
// so overriding cwd before each test redirects all writes into the tmp dir.
let tmpDir: string;
let origCwd: () => string;
let AUDIT_PATH: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-audit-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  // Pre-create data/ because audit.ts caches its mkdir at module scope
  // (`dirEnsured`) — without this, runs after the first test would skip the
  // mkdir and ENOENT on appendFile.
  await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
  AUDIT_PATH = path.join(tmpDir, 'data', 'audit.log');
});

afterEach(async () => {
  // Drain in-flight writes before swapping cwd, otherwise queued writes would
  // resolve their path against the next test's tmpDir.
  try { await writeQueue; } catch { /* ok */ }
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

// Helper: wait for the write queue to drain by awaiting the internal promise chain.
async function flush(): Promise<void> {
  await writeQueue;
}

describe('audit', () => {
  it('writes NDJSON entries to the audit log', async () => {
    audit({ action: 'login_success', ip: '192.168.1.5' });
    await flush();

    const content = await fs.readFile(AUDIT_PATH, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.action).toBe('login_success');
    expect(entry.ip).toBe('192.168.1.5');
    expect(entry.ts).toBeTruthy();
    // Verify timestamp is valid ISO 8601
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
  });

  it('appends multiple entries', async () => {
    audit({ action: 'login_failure', ip: '10.0.0.1' });
    audit({ action: 'password_change', ip: '10.0.0.1' });
    audit({ action: 'plugin_install', pluginId: 'test-plugin', version: '1.0.0' });
    await flush();

    const content = await fs.readFile(AUDIT_PATH, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).action).toBe('login_failure');
    expect(JSON.parse(lines[1]).action).toBe('password_change');
    expect(JSON.parse(lines[2]).action).toBe('plugin_install');
  });

  it('handles all event types without error', async () => {
    audit({ action: 'login_success', ip: '1.2.3.4' });
    audit({ action: 'login_failure', ip: '1.2.3.4' });
    audit({ action: 'password_change', ip: '1.2.3.4' });
    audit({ action: 'password_disable', ip: '1.2.3.4' });
    audit({ action: 'display_token_regenerate' });
    audit({ action: 'plugin_install', pluginId: 'p1', version: '2.0.0' });
    audit({ action: 'plugin_uninstall', pluginId: 'p1' });
    audit({ action: 'plugin_proxy', pluginId: 'p1', domain: 'api.example.com', method: 'GET', status: 200 });
    audit({ action: 'session_revoke_all' });
    await flush();

    const content = await fs.readFile(AUDIT_PATH, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(9);
  });
});

