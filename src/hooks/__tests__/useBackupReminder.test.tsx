// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  attachCustomIcons: vi.fn(),
  downloadBlob: vi.fn(),
}));
vi.mock('@/lib/custom-icon-backup', () => ({ attachCustomIcons: mocks.attachCustomIcons }));
vi.mock('@/lib/download', () => ({ downloadBlob: mocks.downloadBlob }));

import { useBackupReminder } from '../useBackupReminder';

/** A backup date the reminder treats as stale: 30 days before whatever `Date.now()` says when called. */
function staleBackupDate(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString();
}

/** A hub whose last backup is `lastBackupDate`, read when the hook asks, so a frozen clock is honoured. */
function fetchFnWith(lastBackupDate: () => string) {
  return function fetchFn(url: string): Promise<Response> {
    if (url === '/api/backup/reminder') {
      return Promise.resolve(new Response(JSON.stringify({ lastBackupDate: lastBackupDate(), lastDismissedDate: null })));
    }
    return Promise.resolve(new Response(JSON.stringify({ _type: 'home-screens-backup' })));
  };
}

const fetchFn = fetchFnWith(staleBackupDate);

/** Node's own localStorage shadows jsdom's here, so the choice gets a plain in-memory one. */
function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
}

beforeEach(() => {
  mocks.attachCustomIcons.mockReset();
  mocks.downloadBlob.mockReset();
  vi.stubGlobal('localStorage', makeLocalStorage());
});

async function mounted() {
  const hook = renderHook(() => useBackupReminder({ enabled: true, intervalDays: 7, fetchFn }));
  await waitFor(() => expect(hook.result.current.shouldShow).toBe(true));
  return hook;
}

describe('useBackupReminder with the family icons', () => {
  it('saves the rest but keeps the reminder up when the icons could not be added', async () => {
    mocks.attachCustomIcons.mockRejectedValue(new Error('HTTP 500'));
    const { result } = await mounted();
    let ok = false;
    await act(async () => { ok = await result.current.handleBackup(); });
    expect(ok).toBe(true);
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    expect(result.current.iconsLeftOut).toBe(true);
    expect(result.current.shouldShow).toBe(true);

    // A retry that carries them clears it.
    mocks.attachCustomIcons.mockImplementation(async (bundle: object) => ({ ...bundle, customIcons: { icons: [], files: {} } }));
    await act(async () => { await result.current.handleBackup(); });
    expect(result.current.iconsLeftOut).toBe(false);
    expect(result.current.shouldShow).toBe(false);
  });

  it('dismisses as before when the icons made it in', async () => {
    mocks.attachCustomIcons.mockImplementation(async (bundle: object) => bundle);
    const { result } = await mounted();
    await act(async () => { await result.current.handleBackup(); });
    expect(result.current.iconsLeftOut).toBe(false);
    expect(result.current.shouldShow).toBe(false);
  });
});

describe('useBackupReminder file name', () => {
  afterEach(() => { vi.useRealTimers(); });

  async function backUpInChicago() {
    // 8 pm on Tuesday 22 September in Chicago is already the 23rd in UTC.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T01:00:00Z'));
    mocks.attachCustomIcons.mockImplementation(async (bundle: object) => bundle);
    const hook = renderHook(() => useBackupReminder({ enabled: true, intervalDays: 7, fetchFn, timezone: 'America/Chicago' }));
    await waitFor(() => expect(hook.result.current.shouldShow).toBe(true));
    await act(async () => { await hook.result.current.handleBackup(); });
    return hook;
  }

  it("dates the file with the household's day, not the UTC one", async () => {
    window.localStorage.setItem('hs-backup-pictures', 'off');
    await backUpInChicago();
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'home-screens-backup-2026-09-22.json');
  });

  it('saves a zip when the remembered choice carries pictures (the default)', async () => {
    const hook = await backUpInChicago();
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'home-screens-backup-2026-09-22.zip');
    expect(hook.result.current.picturesLeftOut).toBe(false);
  });

  it('falls back to the JSON file and keeps the reminder up when the zip could not be made', async () => {
    const failingArchive = (url: string): Promise<Response> => url === '/api/backup/archive'
      ? Promise.resolve(new Response('no', { status: 500 }))
      : fetchFn(url);
    mocks.attachCustomIcons.mockImplementation(async (bundle: object) => bundle);
    const hook = renderHook(() => useBackupReminder({ enabled: true, intervalDays: 7, fetchFn: failingArchive }));
    await waitFor(() => expect(hook.result.current.shouldShow).toBe(true));
    await act(async () => { await hook.result.current.handleBackup(); });
    expect(mocks.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.json$/));
    expect(hook.result.current.picturesLeftOut).toBe(true);
    expect(hook.result.current.shouldShow).toBe(true);
  });
});
