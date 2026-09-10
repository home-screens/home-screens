import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { audit, auditProxyDenied, resetProxyDenialSuppression, writeQueue } from '../audit';

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
  resetProxyDenialSuppression();
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
    audit({ action: 'plugin_proxy_denied', pluginId: 'p1', domain: 'api.example.com', reason: 'domain_not_allowed' });
    audit({ action: 'session_revoke_all' });
    await flush();

    const content = await fs.readFile(AUDIT_PATH, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(9);
  });
});

/* ─── Proxy denials ───────────────────────────────
 * The proxy used to log every successful request, which buried the whole file
 * under one plugin's polling loop. Only refusals are audited now, and a plugin
 * retrying a blocked host must not be able to recreate that.
 */

describe('auditProxyDenied', () => {
  async function readEntries(): Promise<Array<Record<string, unknown>>> {
    await writeQueue;
    const content = await fs.readFile(AUDIT_PATH, 'utf-8').catch(() => '');
    return content.trim() ? content.trim().split('\n').map((l) => JSON.parse(l)) : [];
  }

  it('records the hostname, plugin and reason', async () => {
    auditProxyDenied('p1', 'https://attacker.example/steal?token=abc', 'domain_not_allowed');

    const [entry] = await readEntries();
    expect(entry.action).toBe('plugin_proxy_denied');
    expect(entry.pluginId).toBe('p1');
    expect(entry.domain).toBe('attacker.example');
    expect(entry.reason).toBe('domain_not_allowed');
    // The path and query are plugin-controlled and must not reach the log.
    expect(JSON.stringify(entry)).not.toContain('token=abc');
    expect(JSON.stringify(entry)).not.toContain('steal');
  });

  it('logs an unparseable URL as a placeholder rather than the raw string', async () => {
    auditProxyDenied('p1', 'http://[::bad::url', 'ssrf_blocked');

    const [entry] = await readEntries();
    expect(entry.domain).toBe('(unparseable)');
    expect(JSON.stringify(entry)).not.toContain('bad::url');
  });

  it('suppresses an identical denial inside the quiet window', async () => {
    for (let i = 0; i < 50; i++) {
      auditProxyDenied('p1', 'https://blocked.example/x', 'domain_not_allowed');
    }

    expect(await readEntries()).toHaveLength(1);
  });

  it('logs again once the quiet window has elapsed', async () => {
    let clock = Date.now();
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      auditProxyDenied('p1', 'https://blocked.example/x', 'domain_not_allowed');
      clock += 5 * 60 * 1000 + 1;
      auditProxyDenied('p1', 'https://blocked.example/x', 'domain_not_allowed');
    } finally {
      spy.mockRestore();
    }

    expect(await readEntries()).toHaveLength(2);
  });

  it('does not let one suppressed denial hide a different plugin, host or reason', async () => {
    auditProxyDenied('p1', 'https://blocked.example/x', 'domain_not_allowed');
    auditProxyDenied('p2', 'https://blocked.example/x', 'domain_not_allowed');
    auditProxyDenied('p1', 'https://other.example/x', 'domain_not_allowed');
    auditProxyDenied('p1', 'https://blocked.example/x', 'ssrf_blocked');
    auditProxyDenied('p1', 'https://blocked.example/x', 'redirect_ssrf_blocked');

    expect(await readEntries()).toHaveLength(5);
  });

  it('stays bounded when a plugin walks a list of hostnames', async () => {
    // 600 distinct hosts against a 500-entry cap: the map clears once rather
    // than growing without bound, and every denial is still recorded.
    for (let i = 0; i < 600; i++) {
      auditProxyDenied('p1', `https://host-${i}.example/x`, 'domain_not_allowed');
    }

    expect(await readEntries()).toHaveLength(600);
  });
});
