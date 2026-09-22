import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUTO_UPDATE_TIME,
  MAX_JITTER_MINUTES,
  decideAutoUpdate,
  dueSlot,
  blockedTags,
  jitterMinutesFor,
  resolveAutoUpdateSettings,
  settleAfterRestart,
  slotsAround,
  upcomingSlot,
  wallClockMinutes,
  wallDateKey,
  type AutoUpdateDecisionInput,
  type AutoUpdateState,
  type RunTiming,
} from '../auto-update-policy';

const CHICAGO = 'America/Chicago';

/** Wall minutes for a clock reading, independent of any timezone. */
function wall(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00Z`) / 60_000;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function timing(overrides: Partial<RunTiming>): RunTiming {
  return {
    wallNow: wall('2026-09-22', '04:30'),
    minutes: minutesOf('04:00'),
    jitter: 0,
    lastRunDate: null,
    changedAt: null,
    ...overrides,
  };
}

describe('resolveAutoUpdateSettings', () => {
  it('is off at the default time when nothing is saved', () => {
    expect(resolveAutoUpdateSettings(undefined)).toEqual({ enabled: false, time: DEFAULT_AUTO_UPDATE_TIME, minutes: 240 });
  });

  it('keeps a valid time', () => {
    expect(resolveAutoUpdateSettings({ enabled: true, time: '23:45' })).toEqual({ enabled: true, time: '23:45', minutes: 1425 });
  });

  it.each(['25:00', '4am', '', '12:60'])('falls back to the default for a malformed time %j', (time) => {
    expect(resolveAutoUpdateSettings({ enabled: true, time })).toEqual({ enabled: true, time: '04:00', minutes: 240 });
  });

  it('treats a missing time as the default', () => {
    expect(resolveAutoUpdateSettings({ enabled: true }).time).toBe('04:00');
  });
});

describe('wallClockMinutes', () => {
  it('reads the clock in the display timezone, not the host one', () => {
    // 09:07 UTC is 04:07 in Chicago during daylight time.
    const minutes = wallClockMinutes(new Date('2026-09-22T09:07:00Z'), CHICAGO);
    expect(minutes).toBe(wall('2026-09-22', '04:07'));
    expect(wallDateKey(minutes)).toBe('2026-09-22');
  });

  it('crosses the date line with the timezone', () => {
    // 03:00 UTC on the 23rd is still the evening of the 22nd in Chicago.
    expect(wallDateKey(wallClockMinutes(new Date('2026-09-23T03:00:00Z'), CHICAGO))).toBe('2026-09-22');
  });

  it('falls back to the host clock for an unknown timezone', () => {
    const date = new Date('2026-09-22T09:07:00Z');
    expect(wallClockMinutes(date, 'Not/AZone')).toBe(wallClockMinutes(date, undefined));
  });
});

describe('jitterMinutesFor', () => {
  it('is stable for one device and inside the allowed spread', () => {
    for (const host of ['home-screens', 'kitchen-pi', 'a', '']) {
      const jitter = jitterMinutesFor(host);
      expect(jitter).toBe(jitterMinutesFor(host));
      expect(jitter).toBeGreaterThanOrEqual(0);
      expect(jitter).toBeLessThanOrEqual(MAX_JITTER_MINUTES);
    }
  });

  it('spreads different devices across the whole window', () => {
    // Machine ids are 32 hex characters; a hundred of them should not bunch up.
    const ids = Array.from({ length: 100 }, (_, i) => (i * 2654435761 >>> 0).toString(16).padStart(32, 'a'));
    const minutes = new Set(ids.map(jitterMinutesFor));
    expect(minutes.size).toBeGreaterThan(15);
  });
});

describe('slotsAround', () => {
  it('gives today as the last slot once its time has passed', () => {
    const { last, next } = slotsAround(wall('2026-09-22', '09:00'), minutesOf('04:00'), 7);
    expect(last).toEqual({ date: '2026-09-22', dueAt: wall('2026-09-22', '04:07') });
    expect(next).toEqual({ date: '2026-09-23', dueAt: wall('2026-09-23', '04:07') });
  });

  it('gives yesterday as the last slot before today\'s time', () => {
    const { last, next } = slotsAround(wall('2026-09-22', '02:00'), minutesOf('04:00'), 0);
    expect(last.date).toBe('2026-09-21');
    expect(next.date).toBe('2026-09-22');
  });

  it('never returns a last slot that is not due yet when jitter crosses midnight', () => {
    // 23:55 plus 20 minutes is due at 00:15. At 00:10 neither yesterday's nor
    // today's slot has come round, so the last due one is from two days back.
    const now = wall('2026-09-22', '00:10');
    const { last, next } = slotsAround(now, minutesOf('23:55'), 20);
    expect(last.dueAt).toBeLessThanOrEqual(now);
    expect(last.date).toBe('2026-09-20');
    expect(next).toEqual({ date: '2026-09-21', dueAt: wall('2026-09-22', '00:15') });
  });
});

describe('dueSlot', () => {
  it('runs a slot that has come round and has not run', () => {
    expect(dueSlot(timing({}))).toEqual({ date: '2026-09-22', dueAt: wall('2026-09-22', '04:00') });
  });

  it('waits for the jitter', () => {
    expect(dueSlot(timing({ wallNow: wall('2026-09-22', '04:10'), jitter: 15 }))).toBeNull();
    expect(dueSlot(timing({ wallNow: wall('2026-09-22', '04:15'), jitter: 15 }))?.date).toBe('2026-09-22');
  });

  it('runs once a day', () => {
    expect(dueSlot(timing({ lastRunDate: '2026-09-22' }))).toBeNull();
  });

  it('catches up a slot missed while the device was off, within six hours', () => {
    expect(dueSlot(timing({ wallNow: wall('2026-09-22', '10:00') }))?.date).toBe('2026-09-22');
  });

  it('does not restart the wall for a slot missed longer ago than that', () => {
    expect(dueSlot(timing({ wallNow: wall('2026-09-22', '10:01') }))).toBeNull();
  });

  it('does not owe a slot that passed before the setting was switched on', () => {
    expect(dueSlot(timing({ wallNow: wall('2026-09-22', '09:00'), changedAt: wall('2026-09-22', '08:59') }))).toBeNull();
  });

  it('still owes a slot that came round after the setting changed', () => {
    expect(dueSlot(timing({ changedAt: wall('2026-09-22', '03:00') }))?.date).toBe('2026-09-22');
  });

  it('runs on the morning the clocks go forward', () => {
    // 2026-03-08, Chicago: 02:00 CST jumps to 03:00 CDT, so a 02:30 slot has
    // no clock reading of its own. It runs at the first tick after the jump.
    const minutes = minutesOf('02:30');
    const beforeJump = wallClockMinutes(new Date('2026-03-08T07:59:00Z'), CHICAGO); // 01:59 CST
    const afterJump = wallClockMinutes(new Date('2026-03-08T08:00:00Z'), CHICAGO); // 03:00 CDT
    expect(dueSlot(timing({ wallNow: beforeJump, minutes }))).toBeNull();
    expect(dueSlot(timing({ wallNow: afterJump, minutes }))?.date).toBe('2026-03-08');
  });

  it('runs once on the morning the clocks go back, though 01:30 happens twice', () => {
    // 2026-11-01, Chicago: 01:30 CDT is 06:30 UTC and 01:30 CST is 07:30 UTC.
    const minutes = minutesOf('01:30');
    const first = wallClockMinutes(new Date('2026-11-01T06:30:00Z'), CHICAGO);
    const second = wallClockMinutes(new Date('2026-11-01T07:30:00Z'), CHICAGO);
    expect(dueSlot(timing({ wallNow: first, minutes }))?.date).toBe('2026-11-01');
    expect(dueSlot(timing({ wallNow: second, minutes, lastRunDate: '2026-11-01' }))).toBeNull();
  });
});

describe('upcomingSlot', () => {
  it('is today\'s slot while it is still ahead', () => {
    expect(upcomingSlot(timing({ wallNow: wall('2026-09-22', '01:00') })).date).toBe('2026-09-22');
  });

  it('is the slot that is due right now', () => {
    expect(upcomingSlot(timing({})).date).toBe('2026-09-22');
  });

  it('is tomorrow once today has run', () => {
    expect(upcomingSlot(timing({ lastRunDate: '2026-09-22' })).date).toBe('2026-09-23');
  });

  it('is tomorrow when the time moves later on a day that already ran', () => {
    // Ran at 04:00; at 09:00 the time is moved to 22:00. Today is done.
    const slot = upcomingSlot(timing({
      wallNow: wall('2026-09-22', '09:00'),
      minutes: minutesOf('22:00'),
      lastRunDate: '2026-09-22',
      changedAt: wall('2026-09-22', '09:00'),
    }));
    expect(slot).toEqual({ date: '2026-09-23', dueAt: wall('2026-09-23', '22:00') });
    // And the scheduler agrees: nothing is due at 22:00 today.
    expect(dueSlot(timing({
      wallNow: wall('2026-09-22', '22:05'),
      minutes: minutesOf('22:00'),
      lastRunDate: '2026-09-22',
      changedAt: wall('2026-09-22', '09:00'),
    }))).toBeNull();
  });

  it('is tomorrow when today\'s slot was switched on past', () => {
    expect(upcomingSlot(timing({ wallNow: wall('2026-09-22', '09:00'), changedAt: wall('2026-09-22', '09:00') })).date)
      .toBe('2026-09-23');
  });
});

describe('decideAutoUpdate', () => {
  const offer: NonNullable<AutoUpdateDecisionInput['info']> = {
    installedVia: 'tarball',
    latest: '1.13.0-dev.20260923',
    updateAvailable: true,
    isDowngrade: false,
    missingStep: null,
    requiredStepFor: null,
    blockedDowngrade: null,
  };

  function decide(overrides: Partial<AutoUpdateDecisionInput> = {}, info: Partial<typeof offer> | null = {}) {
    return decideAutoUpdate({
      enabled: true,
      info: info === null ? null : { ...offer, ...info },
      hasTarball: true,
      failedTags: [],
      upgradeRunning: false,
      ...overrides,
    });
  }

  it('installs a newer version with a download', () => {
    expect(decide()).toEqual({ action: 'install', tag: 'v1.13.0-dev.20260923' });
  });

  it('takes a required step, which is still upward', () => {
    expect(decide({}, { latest: '1.15.0', requiredStepFor: '2.0.0' })).toEqual({ action: 'install', tag: 'v1.15.0' });
  });

  it('does nothing when switched off', () => {
    expect(decide({ enabled: false })).toEqual({ action: 'skip', reason: 'off' });
  });

  it('leaves a developer checkout alone', () => {
    expect(decide({}, { installedVia: 'git' })).toEqual({ action: 'skip', reason: 'not-installed-build' });
  });

  it('does not start a second update', () => {
    expect(decide({ upgradeRunning: true })).toEqual({ action: 'skip', reason: 'already-updating' });
  });

  it('says so when the check could not be made at all', () => {
    expect(decide({}, null)).toEqual({ action: 'skip', reason: 'unreachable' });
  });

  it('reads an empty channel on a release install as an unreachable server', () => {
    expect(decide({}, { latest: null, updateAvailable: false })).toEqual({ action: 'skip', reason: 'unreachable' });
  });

  it('names the step that is missing, not "up to date"', () => {
    expect(decide({}, { latest: null, updateAvailable: false, requiredStepFor: '2.0.0', missingStep: '1.15.0' }))
      .toEqual({ action: 'skip', reason: 'missing-step', tag: 'v2.0.0', step: 'v1.15.0' });
  });

  it('never steps back, even one the settings could not survive', () => {
    expect(decide({}, { latest: null, updateAvailable: false, blockedDowngrade: '1.12.0' }))
      .toEqual({ action: 'skip', reason: 'step-back', tag: 'v1.12.0' });
    expect(decide({}, { latest: '1.12.2', isDowngrade: true }))
      .toEqual({ action: 'skip', reason: 'step-back', tag: 'v1.12.2' });
  });

  it('is up to date when the channel has nothing newer', () => {
    expect(decide({}, { updateAvailable: false })).toEqual({ action: 'skip', reason: 'up-to-date' });
  });

  it('does not retry a version that did not start here', () => {
    expect(decide({ failedTags: ['v1.13.0-dev.20260923'] }))
      .toEqual({ action: 'skip', reason: 'failed-before', tag: 'v1.13.0-dev.20260923' });
  });

  it('remembers more than the last failure', () => {
    expect(decide({ failedTags: ['v1.14.0', 'v1.13.0-dev.20260923'] }))
      .toEqual({ action: 'skip', reason: 'failed-before', tag: 'v1.13.0-dev.20260923' });
  });

  it('takes the next build after one that failed', () => {
    expect(decide({ failedTags: ['v1.13.0-dev.20260922'] })).toEqual({ action: 'install', tag: 'v1.13.0-dev.20260923' });
  });

  it('never builds on the device', () => {
    expect(decide({ hasTarball: false }))
      .toEqual({ action: 'skip', reason: 'no-download', tag: 'v1.13.0-dev.20260923' });
  });
});

describe('blockedTags', () => {
  const base: AutoUpdateState = { runDate: '2026-09-22', at: '2026-09-22T09:07:00Z', result: 'skipped' };

  it('names what the rollback marker names', () => {
    expect(blockedTags({ tag: 'v1.2.0' }, null)).toEqual(['v1.2.0']);
  });

  it('remembers a version after the marker is dismissed', () => {
    expect(blockedTags(null, { ...base, failedTags: ['v1.2.0'] })).toEqual(['v1.2.0']);
  });

  it('keeps remembering it through nights that found nothing', () => {
    // The night after a failure the device was offline: that run replaces the
    // record, and the list is the only thing that still names the bad build.
    const offlineNight: AutoUpdateState = { ...base, reason: 'unreachable', failedTags: ['v1.2.0'] };
    expect(blockedTags(null, offlineNight)).toEqual(['v1.2.0']);
  });

  it('lists the marker first and never twice', () => {
    expect(blockedTags({ tag: 'v1.2.0' }, { ...base, failedTags: ['v1.2.0', 'v1.1.0'] })).toEqual(['v1.2.0', 'v1.1.0']);
  });

  it('forgets the oldest once it has five', () => {
    const many = ['v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.0', 'v1.1.0'];
    expect(blockedTags({ tag: 'v1.6.0' }, { ...base, failedTags: many })).toEqual(['v1.6.0', 'v1.5.0', 'v1.4.0', 'v1.3.0', 'v1.2.0']);
  });

  it('is empty when nothing has failed', () => {
    expect(blockedTags(null, null)).toEqual([]);
    expect(blockedTags(null, { ...base, reason: 'up-to-date' })).toEqual([]);
  });
});

describe('settleAfterRestart', () => {
  const pending: AutoUpdateState = {
    runDate: '2026-09-22',
    at: '2026-09-22T09:07:00Z',
    result: 'installed',
    tag: 'v1.13.0',
    pending: true,
  };

  it('confirms an install that came up on the new version', () => {
    expect(settleAfterRestart(pending, '1.13.0', null)).toEqual({
      runDate: '2026-09-22', at: '2026-09-22T09:07:00Z', result: 'installed', tag: 'v1.13.0',
    });
  });

  it('records a version that never started and was put back, and remembers it', () => {
    expect(settleAfterRestart(pending, '1.12.2', 'v1.13.0')).toMatchObject({
      result: 'failed', failure: 'did-not-start', failedTags: ['v1.13.0'],
    });
  });

  it('records an install that was cut off, which is worth another try', () => {
    expect(settleAfterRestart(pending, '1.12.2', null)).toMatchObject({ result: 'failed', failure: 'interrupted' });
    expect(settleAfterRestart(pending, '1.12.2', null)?.failedTags).toBeUndefined();
    expect(settleAfterRestart(pending, '1.12.2', 'v1.12.9')).toMatchObject({ result: 'failed', failure: 'interrupted' });
  });

  it('leaves a settled record alone', () => {
    expect(settleAfterRestart({ ...pending, pending: undefined }, '1.12.2', null)).toBeNull();
    expect(settleAfterRestart(null, '1.12.2', null)).toBeNull();
  });
});
