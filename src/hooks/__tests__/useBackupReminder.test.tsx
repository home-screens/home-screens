// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  attachCustomIcons: vi.fn(),
  downloadBlob: vi.fn(),
}));
vi.mock('@/lib/custom-icon-backup', () => ({ attachCustomIcons: mocks.attachCustomIcons }));
vi.mock('@/lib/download', () => ({ downloadBlob: mocks.downloadBlob }));

import { useBackupReminder } from '../useBackupReminder';

const OLD = new Date(Date.now() - 30 * 86_400_000).toISOString();

function fetchFn(url: string): Promise<Response> {
  if (url === '/api/backup/reminder') {
    return Promise.resolve(new Response(JSON.stringify({ lastBackupDate: OLD, lastDismissedDate: null })));
  }
  return Promise.resolve(new Response(JSON.stringify({ _type: 'home-screens-backup' })));
}

beforeEach(() => {
  mocks.attachCustomIcons.mockReset();
  mocks.downloadBlob.mockReset();
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
