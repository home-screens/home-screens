import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AutoUpdateState } from '../auto-update-policy';
import type { AutoUpdateSettingChange } from '../auto-update-state';

const store = vi.hoisted(() => ({
  state: null as AutoUpdateState | null,
  writes: [] as AutoUpdateState[],
  setting: null as AutoUpdateSettingChange | null,
  settings: {} as Record<string, unknown>,
}));

vi.mock('../config-cache', () => ({
  readConfigCached: vi.fn(async () => ({ version: 20, settings: store.settings })),
}));

vi.mock('../auto-update-state', () => ({
  readAutoUpdateState: vi.fn(async () => store.state),
  writeAutoUpdateState: vi.fn(async (next: AutoUpdateState) => {
    store.state = next;
    store.writes.push(next);
  }),
  readAutoUpdateSettingChange: vi.fn(async () => store.setting),
  writeAutoUpdateSettingChange: vi.fn(async (next: AutoUpdateSettingChange) => {
    store.setting = next;
  }),
}));

vi.mock('../upgrade', () => {
  class PreflightError extends Error {
    needsSudoPassword: boolean;
    constructor(message: string, needsSudoPassword: boolean) {
      super(message);
      this.needsSudoPassword = needsSudoPassword;
    }
  }
  return { PreflightError, runUpgrade: vi.fn(async () => {}), isUpgradeRunning: vi.fn(() => false) };
});

vi.mock('../upgrade-failed-state', () => ({ readFailedUpdate: vi.fn(async () => null) }));

vi.mock('../version', () => ({
  getVersionInfo: vi.fn(),
  hasReleaseTarball: vi.fn(async () => true),
  getPackageVersion: vi.fn(async () => '1.13.0-dev.20260921'),
}));

import {
  __resetAutoUpdateSchedulerForTests,
  autoUpdateTick,
  describeAutoUpdateSchedule,
  startAutoUpdateScheduler,
} from '../auto-update-scheduler';
import { resolveAutoUpdateSettings } from '../auto-update-policy';
import { PreflightError, runUpgrade } from '../upgrade';
import { readFailedUpdate } from '../upgrade-failed-state';
import { getVersionInfo } from '../version';

const mockRunUpgrade = vi.mocked(runUpgrade);
const mockInfo = vi.mocked(getVersionInfo);
const mockFailed = vi.mocked(readFailedUpdate);

const NIGHTLY = {
  current: '1.13.0-dev.20260921',
  currentCommit: 'abc',
  currentChannel: 'nightly',
  updateChannel: 'nightly',
  latest: '1.13.0-dev.20260922',
  latestCommit: null,
  updateAvailable: true,
  isDowngrade: false,
  requiredStepFor: null,
  missingStep: null,
  blockedDowngrade: null,
  installedVia: 'tarball',
  branch: 'release',
} as const;

/** Past the 04:00 slot plus the largest possible jitter, in the display timezone (UTC here). */
const DUE = new Date('2026-09-22T04:25:00Z');

function enable(time = '04:00') {
  store.settings = { timezone: 'UTC', updateChannel: 'nightly', autoUpdate: { enabled: true, time } };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetAutoUpdateSchedulerForTests();
  store.state = null;
  store.writes = [];
  store.setting = null;
  store.settings = { timezone: 'UTC', updateChannel: 'nightly' };
  mockInfo.mockResolvedValue({ ...NIGHTLY });
  mockRunUpgrade.mockResolvedValue(undefined);
  mockFailed.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  __resetAutoUpdateSchedulerForTests();
});

describe('autoUpdateTick', () => {
  it('does nothing while the setting is off', async () => {
    await autoUpdateTick(DUE);
    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });

  it('installs the channel\'s newest build once its time comes round', async () => {
    enable();
    await autoUpdateTick(DUE);
    expect(mockInfo).toHaveBeenCalledWith({ channel: 'nightly', localSchema: 20, force: true });
    expect(mockRunUpgrade).toHaveBeenCalledWith('v1.13.0-dev.20260922');
    // Written before the install, since a good one replaces this process.
    expect(store.writes).toEqual([{
      runDate: '2026-09-22',
      at: DUE.toISOString(),
      result: 'installed',
      tag: 'v1.13.0-dev.20260922',
      pending: true,
    }]);
  });

  it('runs once a day however many ticks follow', async () => {
    enable();
    await autoUpdateTick(DUE);
    await autoUpdateTick(new Date('2026-09-22T04:26:00Z'));
    await autoUpdateTick(new Date('2026-09-22T09:00:00Z'));
    expect(mockRunUpgrade).toHaveBeenCalledTimes(1);
  });

  it('runs again the next day', async () => {
    enable();
    await autoUpdateTick(DUE);
    await autoUpdateTick(new Date('2026-09-23T04:25:00Z'));
    expect(mockRunUpgrade).toHaveBeenCalledTimes(2);
  });

  it('waits for the chosen time', async () => {
    enable('05:30');
    await autoUpdateTick(DUE);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('records a skip, and does not check again that day', async () => {
    enable();
    mockInfo.mockResolvedValue({ ...NIGHTLY, latest: NIGHTLY.current, updateAvailable: false });
    await autoUpdateTick(DUE);
    await autoUpdateTick(new Date('2026-09-22T04:30:00Z'));
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(store.state).toEqual({ runDate: '2026-09-22', at: DUE.toISOString(), result: 'skipped', reason: 'up-to-date' });
  });

  it('does not retry a build that did not start here', async () => {
    enable();
    mockFailed.mockResolvedValue({ tag: 'v1.13.0-dev.20260922', reason: 'did-not-start', at: '2026-09-21T09:10:00Z' });
    await autoUpdateTick(DUE);
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    expect(store.state).toMatchObject({ result: 'skipped', reason: 'failed-before', tag: 'v1.13.0-dev.20260922' });
  });

  it('does not install after the setting was switched off during the check', async () => {
    enable();
    // The check takes a network round trip; the owner switches it off inside it.
    mockInfo.mockImplementation(async () => {
      store.settings = { ...store.settings, autoUpdate: { enabled: false, time: '04:00' } };
      return { ...NIGHTLY };
    });
    await autoUpdateTick(DUE);
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    expect(store.state).toMatchObject({ result: 'skipped', reason: 'off', tag: 'v1.13.0-dev.20260922' });
  });

  it('remembers a failed version through a night that could not reach the server', async () => {
    enable();
    store.state = {
      runDate: '2026-09-21',
      at: '2026-09-21T04:00:00Z',
      result: 'failed',
      failure: 'did-not-start',
      tag: 'v1.13.0-dev.20260922',
      failedTags: ['v1.13.0-dev.20260922'],
    };
    // Night one: offline. The record is replaced, but not the memory.
    mockInfo.mockRejectedValueOnce(new Error('offline'));
    await autoUpdateTick(DUE);
    expect(store.state).toMatchObject({ result: 'skipped', reason: 'unreachable', failedTags: ['v1.13.0-dev.20260922'] });
    // Night two: back online, and the same broken build is still on offer.
    store.state = { ...store.state!, runDate: '2026-09-22' };
    await autoUpdateTick(new Date('2026-09-23T04:25:00Z'));
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    expect(store.state).toMatchObject({ result: 'skipped', reason: 'failed-before' });
  });

  it('records a missing password without asking for one', async () => {
    enable();
    mockRunUpgrade.mockRejectedValue(new PreflightError('No passwordless sudo', true));
    await autoUpdateTick(DUE);
    expect(store.state).toMatchObject({
      runDate: '2026-09-22',
      result: 'failed',
      failure: 'needs-password',
      tag: 'v1.13.0-dev.20260922',
      error: 'No passwordless sudo',
    });
    expect(store.state?.pending).toBeUndefined();
  });

  it('keeps the failed versions on every later record', async () => {
    enable();
    store.state = { runDate: '2026-09-21', at: '2026-09-21T04:00:00Z', result: 'skipped', reason: 'up-to-date', failedTags: ['v1.9.9'] };
    await autoUpdateTick(DUE);
    expect(store.state).toMatchObject({ result: 'installed', tag: 'v1.13.0-dev.20260922', failedTags: ['v1.9.9'] });
  });

  it('records any other failure before the restart', async () => {
    enable();
    mockRunUpgrade.mockRejectedValue(new Error('download failed: checksum mismatch'));
    await autoUpdateTick(DUE);
    expect(store.state).toMatchObject({ result: 'failed', failure: 'error', error: 'download failed: checksum mismatch' });
  });

  it('records an unreachable update server', async () => {
    enable();
    mockInfo.mockRejectedValue(new Error('offline'));
    await autoUpdateTick(DUE);
    expect(store.state).toMatchObject({ result: 'skipped', reason: 'unreachable' });
  });

  it('does not restart the wall for the slot it was just switched on past', async () => {
    await autoUpdateTick(new Date('2026-09-22T09:00:00Z'));
    enable();
    await autoUpdateTick(new Date('2026-09-22T09:01:00Z'));
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    // The next slot is tomorrow's, and that one runs.
    await autoUpdateTick(new Date('2026-09-23T04:25:00Z'));
    expect(mockRunUpgrade).toHaveBeenCalledTimes(1);
  });

  it('still waits for tomorrow after a restart', async () => {
    await autoUpdateTick(new Date('2026-09-22T05:00:00Z'));
    enable();
    await autoUpdateTick(new Date('2026-09-22T05:01:00Z'));
    // The hub restarts an hour later, still inside the catch-up window.
    __resetAutoUpdateSchedulerForTests();
    await autoUpdateTick(new Date('2026-09-22T06:00:00Z'));
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    await autoUpdateTick(new Date('2026-09-23T04:25:00Z'));
    expect(mockRunUpgrade).toHaveBeenCalledTimes(1);
  });

  it('picks up a new time without a restart', async () => {
    enable('06:00');
    await autoUpdateTick(new Date('2026-09-22T03:00:00Z'));
    enable('03:30');
    // The next minute's tick notices the change, before the new slot comes round.
    await autoUpdateTick(new Date('2026-09-22T03:01:00Z'));
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    await autoUpdateTick(new Date('2026-09-22T03:55:00Z'));
    expect(mockRunUpgrade).toHaveBeenCalledTimes(1);
  });

  it('catches up a slot missed while the device was off', async () => {
    enable();
    // First tick after boot, five hours late.
    await autoUpdateTick(new Date('2026-09-22T09:00:00Z'));
    expect(mockRunUpgrade).toHaveBeenCalledTimes(1);
  });

  it('keeps the time in the display timezone', async () => {
    store.settings = { timezone: 'America/Chicago', updateChannel: 'nightly', autoUpdate: { enabled: true, time: '04:00' } };
    // 04:25 UTC is 23:25 the evening before in Chicago: not due.
    await autoUpdateTick(DUE);
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    // 09:25 UTC is 04:25 in Chicago.
    await autoUpdateTick(new Date('2026-09-22T09:25:00Z'));
    expect(mockRunUpgrade).toHaveBeenCalledTimes(1);
  });
});

describe('startAutoUpdateScheduler', () => {
  it('does not start outside a production server', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    startAutoUpdateScheduler();
    enable();
    expect(describeAutoUpdateSchedule(resolveAutoUpdateSettings({ enabled: true }), 'UTC', null).nextRun).toBeNull();
  });

  it('does not start with the kill switch set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('HS_DISABLE_AUTO_UPDATE', '1');
    startAutoUpdateScheduler();
    expect(describeAutoUpdateSchedule(resolveAutoUpdateSettings({ enabled: true }), 'UTC', null).nextRun).toBeNull();
  });

  it('settles the install the last process started, then ticks', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-22T09:12:00Z') });
    vi.stubEnv('NODE_ENV', 'production');
    store.state = { runDate: '2026-09-22', at: '2026-09-22T09:07:00Z', result: 'installed', tag: 'v1.13.0-dev.20260921', pending: true };
    enable();
    startAutoUpdateScheduler();
    startAutoUpdateScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.state).toEqual({ runDate: '2026-09-22', at: '2026-09-22T09:07:00Z', result: 'installed', tag: 'v1.13.0-dev.20260921' });
    // The first tick saw today's run already recorded.
    expect(mockRunUpgrade).not.toHaveBeenCalled();
    expect(describeAutoUpdateSchedule(resolveAutoUpdateSettings({ enabled: true }), 'UTC', '2026-09-22').nextRun)
      .toEqual({ date: '2026-09-23', time: '04:00' });
  });
});

describe('describeAutoUpdateSchedule', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.useFakeTimers({ now: new Date('2026-09-22T01:00:00Z') });
    startAutoUpdateScheduler();
  });

  it('says today while today\'s time is ahead', () => {
    const schedule = describeAutoUpdateSchedule(resolveAutoUpdateSettings({ enabled: true, time: '04:00' }), 'UTC', null, new Date('2026-09-22T01:00:00Z'));
    expect(schedule).toEqual({ nextRun: { date: '2026-09-22', time: '04:00' }, today: '2026-09-22' });
  });

  it('says tomorrow once today has run', () => {
    const schedule = describeAutoUpdateSchedule(resolveAutoUpdateSettings({ enabled: true }), 'UTC', '2026-09-22', new Date('2026-09-22T09:00:00Z'));
    expect(schedule.nextRun).toEqual({ date: '2026-09-23', time: '04:00' });
  });

  it('promises nothing while switched off', () => {
    expect(describeAutoUpdateSchedule(resolveAutoUpdateSettings({ enabled: false }), 'UTC', null).nextRun).toBeNull();
  });
});
