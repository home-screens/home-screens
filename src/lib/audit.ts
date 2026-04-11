/**
 * Structured audit logging for security-relevant events.
 *
 * Writes newline-delimited JSON (NDJSON) to `data/audit.log`.
 * Rotates when the file exceeds MAX_SIZE_BYTES (10 MB).
 *
 * All writes are fire-and-forget — audit logging should never block
 * or fail a request. Errors are swallowed with a console.error.
 */

import { promises as fs } from 'fs';
import path from 'path';

/* ─── Constants ──────────────────────────────── */

const AUDIT_FILE = 'data/audit.log';
const ROTATED_FILE = 'data/audit.log.1';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getAuditPath(): string {
  return path.join(process.cwd(), AUDIT_FILE);
}

function getRotatedPath(): string {
  return path.join(process.cwd(), ROTATED_FILE);
}

/* ─── Event types ────────────────────────────── */

type AuditEvent =
  | { action: 'login_success'; ip: string }
  | { action: 'login_failure'; ip: string }
  | { action: 'password_change'; ip: string }
  | { action: 'password_disable'; ip: string }
  | { action: 'display_token_regenerate' }
  | { action: 'plugin_install'; pluginId: string; version: string }
  | { action: 'plugin_uninstall'; pluginId: string }
  | { action: 'plugin_proxy'; pluginId: string; domain: string; method: string; status: number }
  | { action: 'session_revoke_all' }
  | { action: 'ip_allowlist_change'; ip: string; entryCount: number };

type AuditEntry = AuditEvent & { ts: string }; // ISO 8601

/* ─── Serialized write queue ─────────────────── */

/** @internal Exposed for test synchronization. */
export let writeQueue: Promise<void> = Promise.resolve();

/**
 * Appends an audit event to the log file. Fire-and-forget — never throws.
 */
export function audit(event: AuditEvent): void {
  const entry: AuditEntry = { ...event, ts: new Date().toISOString() };
  const line = JSON.stringify(entry) + '\n';

  writeQueue = writeQueue
    .then(() => appendAndRotate(line))
    .catch((err) => {
      console.error('[audit] Failed to write audit log:', err);
    });
}

let dirEnsured = false;

async function appendAndRotate(line: string): Promise<void> {
  const filePath = getAuditPath();
  if (!dirEnsured) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    dirEnsured = true;
  }
  await fs.appendFile(filePath, line, 'utf-8');

  // Check size and rotate if needed
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_SIZE_BYTES) {
      await fs.rename(filePath, getRotatedPath());
    }
  } catch {
    // stat/rename failure is non-critical
  }
}

