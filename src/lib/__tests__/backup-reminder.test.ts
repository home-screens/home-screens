import { describe, it, expect } from 'vitest';
import { BACKUP_REMINDER_DEFAULTS, backupReminderKind, resolveBackupReminder } from '../backup-reminder';
import { lacksCustomIcons, summarizeBundle } from '../backup-summary';

const quiet = { shouldShow: true, autoFailed: null, iconsLeftOut: false, picturesLeftOut: false, autoOn: false } as const;

describe('resolveBackupReminder', () => {
  it('fills in an unset reminder: off, weekly', () => {
    expect(resolveBackupReminder(undefined)).toEqual({ enabled: false, intervalDays: 7 });
    expect(resolveBackupReminder(undefined)).toEqual(BACKUP_REMINDER_DEFAULTS);
  });

  it('keeps what the household saved', () => {
    expect(resolveBackupReminder({ enabled: true, intervalDays: 30 })).toEqual({ enabled: true, intervalDays: 30 });
    expect(resolveBackupReminder({ enabled: true })).toEqual({ enabled: true, intervalDays: 7 });
  });
});

describe('backupReminderKind', () => {
  it('is nothing while the reminder is down', () => {
    expect(backupReminderKind({ ...quiet, shouldShow: false, autoFailed: 'backup' })).toBeNull();
  });

  it('puts an automatic backup that stopped working first', () => {
    expect(backupReminderKind({ ...quiet, autoFailed: 'backup', iconsLeftOut: true, autoOn: true })).toBe('autoFailed');
    expect(backupReminderKind({ ...quiet, autoFailed: 'offsite', picturesLeftOut: true, autoOn: true })).toBe('autoNotSent');
  });

  it('then a download that went without something', () => {
    expect(backupReminderKind({ ...quiet, iconsLeftOut: true, picturesLeftOut: true, autoOn: true })).toBe('iconsLeftOut');
    expect(backupReminderKind({ ...quiet, picturesLeftOut: true, autoOn: true })).toBe('picturesLeftOut');
  });

  it('tells automatic backups with no copy off the hub from a plain overdue one', () => {
    expect(backupReminderKind({ ...quiet, autoOn: true })).toBe('autoLocalOnly');
    expect(backupReminderKind(quiet)).toBe('overdue');
  });
});

describe('summarizeBundle', () => {
  it('reads a plain JSON backup the way both restore buttons need', () => {
    const summary = summarizeBundle({ _type: 'home-screens-backup', config: {} }, null);
    expect(summary).toEqual({
      hasCredentials: false, credentialsEncrypted: false, hasCustomIcons: false, usesCustomIcons: false,
      pictures: { count: 0, bytes: 0, skipped: 0 },
    });
    expect(lacksCustomIcons(summary)).toBe(false);
  });

  it('notices keys, and whether they are locked', () => {
    expect(summarizeBundle({ credentials: { secrets: {} } }, null)).toMatchObject({ hasCredentials: true, credentialsEncrypted: false });
  });

  it('counts the pictures of a zip', () => {
    const inspected = { pictures: [{ bytes: 10 }, { bytes: 32 }], skipped: 1 } as Parameters<typeof summarizeBundle>[1];
    expect(summarizeBundle({}, inspected).pictures).toEqual({ count: 2, bytes: 42, skipped: 1 });
  });

  it('says a backup lacks icons only when it uses some and carries none', () => {
    expect(lacksCustomIcons({ usesCustomIcons: true, hasCustomIcons: false })).toBe(true);
    expect(lacksCustomIcons({ usesCustomIcons: true, hasCustomIcons: true })).toBe(false);
    expect(lacksCustomIcons({ usesCustomIcons: false, hasCustomIcons: false })).toBe(false);
  });
});
