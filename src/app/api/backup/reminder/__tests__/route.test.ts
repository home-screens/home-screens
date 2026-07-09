import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Only auth is stubbed; the backup-state store runs for real against the
// sandbox data/ so we exercise the true read-modify-write of the reminder.
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

import { GET, POST } from '@/app/api/backup/reminder/route';
import { readBackupState, writeBackupState } from '@/lib/backup-state';

function getReq(): NextRequest {
  return new NextRequest('http://localhost/api/backup/reminder');
}

function postReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup/reminder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function isIso(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await writeBackupState({ lastBackupDate: null, lastDismissedDate: null });
});

describe('GET /api/backup/reminder', () => {
  it('returns the current backup state', async () => {
    await writeBackupState({
      lastBackupDate: '2026-01-01T00:00:00.000Z',
      lastDismissedDate: null,
    });

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      lastBackupDate: '2026-01-01T00:00:00.000Z',
      lastDismissedDate: null,
    });
  });

  it('returns the default state on a fresh install', async () => {
    const res = await GET(getReq());
    expect(await res.json()).toEqual({ lastBackupDate: null, lastDismissedDate: null });
  });
});

describe('POST /api/backup/reminder', () => {
  it('advances lastDismissedDate on a dismiss, preserving lastBackupDate', async () => {
    await writeBackupState({
      lastBackupDate: '2026-01-01T00:00:00.000Z',
      lastDismissedDate: null,
    });

    const res = await POST(postReq({ action: 'dismiss' }));
    expect(res.status).toBe(200);
    const state = await res.json();

    expect(isIso(state.lastDismissedDate)).toBe(true);
    // The previous backup timestamp is untouched by a dismiss.
    expect(state.lastBackupDate).toBe('2026-01-01T00:00:00.000Z');

    // Persisted, not just echoed back.
    expect(await readBackupState()).toEqual(state);
  });

  it('advances lastBackupDate and clears the dismissal on backed-up', async () => {
    await writeBackupState({
      lastBackupDate: null,
      lastDismissedDate: '2026-01-01T00:00:00.000Z',
    });

    const res = await POST(postReq({ action: 'backed-up' }));
    expect(res.status).toBe(200);
    const state = await res.json();

    expect(isIso(state.lastBackupDate)).toBe(true);
    // A fresh backup supersedes any outstanding dismissal.
    expect(state.lastDismissedDate).toBeNull();
    expect(await readBackupState()).toEqual(state);
  });

  it('clears a prior dismissal when a backup follows it', async () => {
    await POST(postReq({ action: 'dismiss' }));
    expect((await readBackupState()).lastDismissedDate).not.toBeNull();

    await POST(postReq({ action: 'backed-up' }));
    const state = await readBackupState();
    expect(state.lastDismissedDate).toBeNull();
    expect(isIso(state.lastBackupDate)).toBe(true);
  });

  it('rejects an unknown action without mutating state', async () => {
    const res = await POST(postReq({ action: 'nope' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid action/);
    expect(await readBackupState()).toEqual({ lastBackupDate: null, lastDismissedDate: null });
  });

  it('rejects a missing action', async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid action/);
  });

  it('rejects a malformed JSON body', async () => {
    const res = await POST(postReq('not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/);
  });
});
