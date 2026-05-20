import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;
let origCwd: () => string;

// Re-imported per test so the internal writeQueue is reset between cases.
// Without vi.resetModules() each test, a failed write in one test could
// poison the queue and make later tests behave unpredictably.
let mod: typeof import('../update-notification-state');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-update-notif-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;

  vi.resetModules();
  mod = await import('../update-notification-state');
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readUpdateNotificationState', () => {
  it('returns the default when the file is absent (ENOENT)', async () => {
    const state = await mod.readUpdateNotificationState();
    expect(state).toEqual({ lastDismissedVersion: null });
  });
});

describe('writeUpdateNotificationState + readUpdateNotificationState', () => {
  it('round-trips the written value', async () => {
    await mod.writeUpdateNotificationState({ lastDismissedVersion: 'v1.6.0' });
    const state = await mod.readUpdateNotificationState();
    expect(state).toEqual({ lastDismissedVersion: 'v1.6.0' });
  });

  it('persists the value on disk so a re-import reads it back', async () => {
    await mod.writeUpdateNotificationState({ lastDismissedVersion: 'v2.0.0' });

    // Reset modules and re-import to simulate a fresh module load,
    // then read from disk to confirm persistence is not in-memory only.
    vi.resetModules();
    const freshMod = await import('../update-notification-state');
    const state = await freshMod.readUpdateNotificationState();
    expect(state).toEqual({ lastDismissedVersion: 'v2.0.0' });
  });
});
