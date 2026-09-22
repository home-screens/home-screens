import { describe, it, expect } from 'vitest';
import { autoUpdateWillInstall, lastRunStatus, nextDayWord, pastDayWord } from '../auto-update-status';
import type { AutoUpdateInfo, AutoUpdateState } from '../auto-update-policy';

const RUN: AutoUpdateState = { runDate: '2026-09-22', at: '2026-09-22T09:07:00Z', result: 'skipped', reason: 'up-to-date' };

function info(lastRun: AutoUpdateState | null, enabled = true): { installedVia: 'tarball'; autoUpdate: AutoUpdateInfo } {
  return {
    installedVia: 'tarball',
    autoUpdate: { enabled, lastRun, nextRun: enabled ? { date: '2026-09-23', time: '04:00' } : null, today: '2026-09-22' },
  };
}

describe('lastRunStatus', () => {
  it('names the sentence for each outcome', () => {
    expect(lastRunStatus(null)).toBeNull();
    expect(lastRunStatus({ ...RUN, result: 'installed' })?.key).toBe('installed');
    expect(lastRunStatus(RUN)?.key).toBe('upToDate');
    expect(lastRunStatus({ ...RUN, reason: 'no-download' })?.key).toBe('noDownload');
    expect(lastRunStatus({ ...RUN, result: 'failed', failure: 'did-not-start' })?.key).toBe('didNotStart');
    expect(lastRunStatus({ ...RUN, result: 'failed' })?.key).toBe('failed');
  });

  it('marks the ones that need the owner, and the one that stands alone', () => {
    expect(lastRunStatus({ ...RUN, result: 'failed', failure: 'needs-password' })).toMatchObject({ warning: true, standsAlone: false });
    expect(lastRunStatus(RUN)).toMatchObject({ warning: false, standsAlone: false });
    expect(lastRunStatus({ ...RUN, reason: 'not-installed-build' })).toMatchObject({ standsAlone: true });
  });
});

describe('autoUpdateWillInstall', () => {
  it('is false while the setting is off', () => {
    expect(autoUpdateWillInstall(info(null, false), 'v1.6.0', null)).toBe(false);
  });

  it('is false when no run is scheduled, though the setting is on', () => {
    const noScheduler = info(null);
    noScheduler.autoUpdate.nextRun = null;
    expect(autoUpdateWillInstall(noScheduler, 'v1.6.0', null)).toBe(false);
  });

  it('is false for a hub that was not installed from a release download', () => {
    expect(autoUpdateWillInstall({ ...info(null), installedVia: 'git' }, 'v1.6.0', null)).toBe(false);
    expect(autoUpdateWillInstall({ ...info(null), installedVia: 'unknown' }, 'v1.6.0', null)).toBe(false);
  });

  it('is false when the server says nothing about automatic updates', () => {
    expect(autoUpdateWillInstall({ installedVia: 'tarball' }, 'v1.6.0', null)).toBe(false);
  });

  it('is true for a hub that has run cleanly, or not yet', () => {
    expect(autoUpdateWillInstall(info(null), 'v1.6.0', null)).toBe(true);
    expect(autoUpdateWillInstall(info(RUN), 'v1.6.0', null)).toBe(true);
    expect(autoUpdateWillInstall(info({ ...RUN, result: 'installed', tag: 'v1.5.0' }), 'v1.6.0', null)).toBe(true);
  });

  it('is false when someone has to act', () => {
    for (const failure of ['needs-password', 'did-not-start', 'interrupted', 'error'] as const) {
      expect(autoUpdateWillInstall(info({ ...RUN, result: 'failed', failure, tag: 'v1.6.0' }), 'v1.6.0', null), failure).toBe(false);
    }
    expect(autoUpdateWillInstall(info({ ...RUN, reason: 'not-installed-build' }), 'v1.6.0', null)).toBe(false);
    expect(autoUpdateWillInstall(info({ ...RUN, reason: 'missing-step', tag: 'v2.0.0', step: 'v1.9.0' }), 'v2.0.0', null)).toBe(false);
  });

  it('is false for the exact version it will not take', () => {
    expect(autoUpdateWillInstall(info({ ...RUN, reason: 'no-download', tag: 'v1.6.0' }), 'v1.6.0', null)).toBe(false);
    expect(autoUpdateWillInstall(info({ ...RUN, reason: 'failed-before', tag: 'v1.6.0' }), 'v1.6.0', null)).toBe(false);
    expect(autoUpdateWillInstall(info({ ...RUN, failedTags: ['v1.6.0'] }), 'v1.6.0', null)).toBe(false);
    expect(autoUpdateWillInstall(info(RUN), 'v1.6.0', 'v1.6.0')).toBe(false);
    // A different version with no download says nothing about this one.
    expect(autoUpdateWillInstall(info({ ...RUN, reason: 'no-download', tag: 'v1.5.0' }), 'v1.6.0', null)).toBe(true);
  });
});

describe('day words', () => {
  it('names the day a run happened', () => {
    expect(pastDayWord('2026-09-22', '2026-09-22')).toBe('today');
    expect(pastDayWord('2026-09-21', '2026-09-22')).toBe('yesterday');
    expect(pastDayWord('2026-09-01', '2026-09-22')).toBe('other');
    // Across a month end, where the arithmetic is easiest to get wrong.
    expect(pastDayWord('2026-08-31', '2026-09-01')).toBe('yesterday');
  });

  it('names the day of the next run', () => {
    expect(nextDayWord('2026-09-22', '2026-09-22')).toBe('today');
    expect(nextDayWord('2026-09-23', '2026-09-22')).toBe('tomorrow');
    // A slot carried past midnight belongs to yesterday but runs today.
    expect(nextDayWord('2026-09-21', '2026-09-22')).toBe('today');
  });
});
