import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { audit, readAuditLog, writeQueue } from '../audit';

const AUDIT_PATH = path.join(process.cwd(), 'data', 'audit.log');
const ROTATED_PATH = AUDIT_PATH + '.1';

let originalContent: string | null = null;
let originalRotated: string | null = null;

beforeEach(async () => {
  try { originalContent = await fs.readFile(AUDIT_PATH, 'utf-8'); } catch { originalContent = null; }
  try { originalRotated = await fs.readFile(ROTATED_PATH, 'utf-8'); } catch { originalRotated = null; }
  try { await fs.unlink(AUDIT_PATH); } catch { /* ok */ }
  try { await fs.unlink(ROTATED_PATH); } catch { /* ok */ }
});

afterEach(async () => {
  try { await fs.unlink(AUDIT_PATH); } catch { /* ok */ }
  try { await fs.unlink(ROTATED_PATH); } catch { /* ok */ }
  if (originalContent !== null) {
    await fs.mkdir(path.dirname(AUDIT_PATH), { recursive: true });
    await fs.writeFile(AUDIT_PATH, originalContent, 'utf-8');
  }
  if (originalRotated !== null) {
    await fs.writeFile(ROTATED_PATH, originalRotated, 'utf-8');
  }
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

describe('readAuditLog', () => {
  it('returns empty array when no log exists', async () => {
    const entries = await readAuditLog();
    expect(entries).toEqual([]);
  });

  it('returns entries in most-recent-first order', async () => {
    audit({ action: 'login_success', ip: '1.1.1.1' });
    audit({ action: 'login_failure', ip: '2.2.2.2' });
    audit({ action: 'password_change', ip: '3.3.3.3' });
    await flush();

    const entries = await readAuditLog();
    expect(entries).toHaveLength(3);
    expect(entries[0].action).toBe('password_change');
    expect(entries[1].action).toBe('login_failure');
    expect(entries[2].action).toBe('login_success');
  });

  it('respects the limit parameter', async () => {
    audit({ action: 'login_success', ip: '1.1.1.1' });
    audit({ action: 'login_failure', ip: '2.2.2.2' });
    audit({ action: 'password_change', ip: '3.3.3.3' });
    await flush();

    const entries = await readAuditLog(2);
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe('password_change');
    expect(entries[1].action).toBe('login_failure');
  });
});
