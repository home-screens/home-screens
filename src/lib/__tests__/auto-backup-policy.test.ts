import { describe, it, expect } from 'vitest';
import {
  AUTO_BACKUP_NAME_RE,
  autoBackupFileName,
  autoBackupSettingsProblem,
  backupDue,
  copiesToRemove,
  countFailedTry,
  describeAutoBackupName,
  isAutoBackupName,
  nextBackupAt,
  resolveAutoBackupSettings,
  scheduleSignature,
  wallMoment,
  type BackupTiming,
  type ResolvedAutoBackup,
} from '../auto-backup-policy';
import { wallClockMinutes } from '../auto-update-policy';

/** Wall minutes for a household clock reading, `YYYY-MM-DD HH:MM`. */
function wall(reading: string): number {
  const [date, time] = reading.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) / 60_000;
}

function settings(overrides: Partial<ResolvedAutoBackup> = {}): ResolvedAutoBackup {
  return { ...resolveAutoBackupSettings({ enabled: true }), ...overrides };
}

function timing(overrides: Partial<BackupTiming> = {}): BackupTiming {
  return {
    wallNow: wall('2026-11-16 12:00'),
    settings: settings(),
    lastOkAt: null,
    lastAttemptAt: null,
    failedTries: null,
    changedAt: null,
    ...overrides,
  };
}

describe('resolveAutoBackupSettings', () => {
  it('fills every default for an unset setting', () => {
    expect(resolveAutoBackupSettings(undefined)).toEqual({
      enabled: false, every: 'day', time: '03:00', minutes: 180, keep: 7, pictures: 'off', includeKeys: false,
    });
  });

  it('falls back from malformed values instead of trusting them', () => {
    const resolved = resolveAutoBackupSettings({ enabled: true, every: 'hourly' as 'day', time: '25:00', keep: 99, pictures: 'some' as 'off' });
    expect(resolved).toMatchObject({ enabled: true, every: 'day', time: '03:00', keep: 7, pictures: 'off' });
  });

  it('keeps every value that is in range', () => {
    expect(resolveAutoBackupSettings({ enabled: true, every: 'month', time: '22:15', keep: 1, pictures: 'all', includeKeys: true }))
      .toEqual({ enabled: true, every: 'month', time: '22:15', minutes: 22 * 60 + 15, keep: 1, pictures: 'all', includeKeys: true });
  });
});

describe('autoBackupSettingsProblem', () => {
  it('accepts an absent setting and a full one', () => {
    expect(autoBackupSettingsProblem(undefined)).toBeNull();
    expect(autoBackupSettingsProblem({ enabled: true, every: 'week', time: '03:00', keep: 30, pictures: 'used', includeKeys: false })).toBeNull();
  });

  it.each([
    [[], /object/],
    [{ enabled: 'yes' }, /enabled/],
    [{ enabled: true, every: 'hour' }, /every/],
    [{ enabled: true, time: '3am' }, /time/],
    [{ enabled: true, keep: 0 }, /keep/],
    [{ enabled: true, keep: 31 }, /keep/],
    [{ enabled: true, keep: 2.5 }, /keep/],
    [{ enabled: true, pictures: 'everything' }, /pictures/],
    [{ enabled: true, includeKeys: 'on' }, /includeKeys/],
  ])('refuses %j', (raw, message) => {
    expect(autoBackupSettingsProblem(raw)).toMatch(message);
  });
});

describe('nextBackupAt', () => {
  it('is null while backups are off', () => {
    expect(nextBackupAt(timing({ settings: settings({ enabled: false }) }))).toBeNull();
  });

  it('waits for the chosen time after being switched on, not that minute', () => {
    const t = timing({ wallNow: wall('2026-11-16 19:42'), changedAt: wall('2026-11-16 19:40') });
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date: '2026-11-17', time: '03:00' });
    expect(backupDue(t)).toBe(false);
  });

  it('takes today\'s time when switched on before it', () => {
    const t = timing({ wallNow: wall('2026-11-16 01:00'), changedAt: wall('2026-11-16 01:00') });
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date: '2026-11-16', time: '03:00' });
  });

  it.each([
    ['day', '2026-11-17'],
    ['week', '2026-11-23'],
    ['month', '2026-12-16'],
  ] as const)('every %s counts from the day of the last good backup', (every, date) => {
    const t = timing({ settings: settings({ every }), lastOkAt: wall('2026-11-16 03:00'), lastAttemptAt: wall('2026-11-16 03:00') });
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date, time: '03:00' });
  });

  it('lands a weekly backup on the day of a Back up now, at the chosen time', () => {
    const t = timing({ settings: settings({ every: 'week' }), lastOkAt: wall('2026-11-18 19:30'), lastAttemptAt: wall('2026-11-18 19:30') });
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date: '2026-11-25', time: '03:00' });
  });

  it('catches up as soon as a hub that was off at the time is on again', () => {
    const t = timing({
      wallNow: wall('2026-11-20 14:10'),
      lastOkAt: wall('2026-11-16 03:00'),
      lastAttemptAt: wall('2026-11-16 03:00'),
      changedAt: wall('2026-11-01 12:00'),
    });
    expect(backupDue(t)).toBe(true);
  });

  it('does not make a backup the moment the schedule changes to a shorter one', () => {
    // Weekly, last good five days ago; switching to daily waits for the next 3:00.
    const t = timing({
      wallNow: wall('2026-11-21 15:00'),
      settings: settings({ every: 'day' }),
      lastOkAt: wall('2026-11-16 03:00'),
      lastAttemptAt: wall('2026-11-16 03:00'),
      changedAt: wall('2026-11-21 14:59'),
    });
    expect(backupDue(t)).toBe(false);
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date: '2026-11-22', time: '03:00' });
  });

  it('waits an hour after a failed try', () => {
    const t = timing({
      wallNow: wall('2026-11-17 03:30'),
      lastOkAt: wall('2026-11-16 03:00'),
      lastAttemptAt: wall('2026-11-17 03:00'),
      failedTries: { day: '2026-11-17', count: 1 },
    });
    expect(backupDue(t)).toBe(false);
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date: '2026-11-17', time: '04:00' });
    expect(backupDue({ ...t, wallNow: wall('2026-11-17 04:00') })).toBe(true);
  });

  it('stops after three tries on one day and comes back at tomorrow\'s time', () => {
    const t = timing({
      wallNow: wall('2026-11-17 06:00'),
      lastOkAt: wall('2026-11-16 03:00'),
      lastAttemptAt: wall('2026-11-17 05:00'),
      failedTries: { day: '2026-11-17', count: 3 },
    });
    expect(backupDue(t)).toBe(false);
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date: '2026-11-18', time: '03:00' });
  });

  it('retries a hub that has never managed one an hour later', () => {
    const t = timing({
      wallNow: wall('2026-11-16 03:10'),
      lastAttemptAt: wall('2026-11-16 03:00'),
      failedTries: { day: '2026-11-16', count: 1 },
      changedAt: wall('2026-11-15 20:00'),
    });
    expect(wallMoment(nextBackupAt(t)!)).toEqual({ date: '2026-11-16', time: '04:00' });
  });

  it('reads the household\'s clock, so a zone change moves the slot with it', () => {
    const instant = new Date('2026-11-16T09:00:00Z');
    expect(wallMoment(wallClockMinutes(instant, 'America/Chicago'))).toEqual({ date: '2026-11-16', time: '03:00' });
    expect(wallMoment(wallClockMinutes(instant, 'Europe/Berlin'))).toEqual({ date: '2026-11-16', time: '10:00' });
  });
});

describe('countFailedTry', () => {
  it('counts tries on the same day and starts again on a new one', () => {
    const first = countFailedTry(null, wall('2026-11-17 03:00'));
    expect(first).toEqual({ day: '2026-11-17', count: 1 });
    expect(countFailedTry(first, wall('2026-11-17 04:00'))).toEqual({ day: '2026-11-17', count: 2 });
    expect(countFailedTry({ day: '2026-11-17', count: 3 }, wall('2026-11-18 03:00'))).toEqual({ day: '2026-11-18', count: 1 });
  });
});

describe('scheduleSignature', () => {
  it('changes with anything that moves the next backup, and not with what does not', () => {
    const base = scheduleSignature(settings(), 'America/Chicago');
    expect(scheduleSignature(settings({ every: 'week' }), 'America/Chicago')).not.toBe(base);
    expect(scheduleSignature(settings({ minutes: 240 }), 'America/Chicago')).not.toBe(base);
    expect(scheduleSignature(settings(), 'Europe/Berlin')).not.toBe(base);
    expect(scheduleSignature(settings({ keep: 3, pictures: 'all' }), 'America/Chicago')).toBe(base);
  });
});

describe('file names', () => {
  it('names a copy after the household\'s date and time', () => {
    expect(autoBackupFileName(wall('2026-11-16 03:00'), { withKeys: false, extension: 'json' }))
      .toBe('home-screens-auto-backup-2026-11-16-0300.json');
    expect(autoBackupFileName(wall('2026-11-16 03:00'), { withKeys: true, extension: 'zip' }))
      .toBe('home-screens-auto-backup-with-keys-2026-11-16-0300.zip');
  });

  it('never reuses a name already in the folder', () => {
    const taken = new Set(['home-screens-auto-backup-2026-11-16-1930.json', 'home-screens-auto-backup-2026-11-16-1930-2.json']);
    expect(autoBackupFileName(wall('2026-11-16 19:30'), { withKeys: false, extension: 'json' }, taken))
      .toBe('home-screens-auto-backup-2026-11-16-1930-3.json');
  });

  it('reads what a name says about the copy', () => {
    expect(describeAutoBackupName('home-screens-auto-backup-with-keys-2026-11-16-0300.zip')).toEqual({ withKeys: true, withPictures: true });
    expect(describeAutoBackupName('home-screens-auto-backup-2026-11-16-0300-2.json')).toEqual({ withKeys: false, withPictures: false });
    expect(describeAutoBackupName('home-screens-backup-2026-11-16.json')).toBeNull();
  });

  it.each([
    '../config.json',
    'home-screens-auto-backup-2026-11-16-0300.json/../../secrets.json',
    'home-screens-auto-backup-2026-11-16-0300.json.partial',
    '/etc/passwd',
    'home-screens-auto-backup-2026-11-16-0300.JSON',
    'home-screens-auto-backup-2026-11-16-0300.json\0',
    'sub/home-screens-auto-backup-2026-11-16-0300.json',
    '',
  ])('refuses %j as a name', (name) => {
    expect(isAutoBackupName(name)).toBe(false);
    expect(AUTO_BACKUP_NAME_RE.test(name)).toBe(false);
  });

  it('refuses anything that is not text', () => {
    expect(isAutoBackupName(undefined)).toBe(false);
    expect(isAutoBackupName(['home-screens-auto-backup-2026-11-16-0300.json'])).toBe(false);
  });
});

describe('copiesToRemove', () => {
  it('removes everything past the newest keep', () => {
    expect(copiesToRemove(['d', 'c', 'b', 'a'], 2)).toEqual(['b', 'a']);
    expect(copiesToRemove(['a'], 7)).toEqual([]);
    expect(copiesToRemove(['b', 'a'], 0)).toEqual(['b', 'a']);
  });
});
