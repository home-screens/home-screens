/**
 * When a hub saves a backup by itself, what it is called, and which ones it
 * keeps.
 *
 * The setting is `GlobalSettings.autoBackup`: on or off, every day, week or
 * month, a time of day in the display timezone, how many to keep, which
 * pictures, and whether the keys go in. A backup is owed `every` days after
 * the last good one, at the chosen time. A hub that was off at that time
 * backs up on its next tick, and a failed run waits an hour before trying
 * again, three tries a day at most.
 *
 * Pure: no I/O, so the editor reads the same rules to say when the next
 * backup is. Wall-clock arithmetic is on "wall minutes" (see
 * `wallClockMinutes`), so neither the host's timezone nor a DST change can
 * move a slot.
 */
import type { AutoBackupFrequency, AutoBackupSettings } from '@/types/config';
import type { PictureBackupChoice } from './backup-pictures-types';
import { parseTimeToMinutes } from './sleep-timeline';
import { wallClockMinutes, wallDateKey } from './auto-update-policy';

export const DEFAULT_AUTO_BACKUP_TIME = '03:00';
export const DEFAULT_AUTO_BACKUP_KEEP = 7;
export const MIN_AUTO_BACKUP_KEEP = 1;
export const MAX_AUTO_BACKUP_KEEP = 30;
/** The choices the editor offers for "Keep the last". Any whole number in range is accepted. */
export const AUTO_BACKUP_KEEP_CHOICES = [1, 2, 3, 5, 7, 10, 14, 30] as const;

export const AUTO_BACKUP_FREQUENCIES: readonly AutoBackupFrequency[] = ['day', 'week', 'month'];
const INTERVAL_DAYS: Record<AutoBackupFrequency, number> = { day: 1, week: 7, month: 30 };

/** A failed run waits this long before the next try. */
export const RETRY_AFTER_MINUTES = 60;
/** Tries on one day before the hub waits for the next day's time. */
export const MAX_TRIES_PER_DAY = 3;

const MINUTES_PER_DAY = 24 * 60;

export interface ResolvedAutoBackup {
  enabled: boolean;
  every: AutoBackupFrequency;
  /** `HH:MM`, the default when the stored value is missing or malformed. */
  time: string;
  /** `time` as minutes from midnight. */
  minutes: number;
  keep: number;
  pictures: PictureBackupChoice;
  includeKeys: boolean;
}

/** The setting with every default filled in. The only place defaults are decided. */
export function resolveAutoBackupSettings(settings: AutoBackupSettings | undefined | null): ResolvedAutoBackup {
  const stored = typeof settings?.time === 'string' ? parseTimeToMinutes(settings.time) : null;
  const keep = settings?.keep;
  return {
    enabled: settings?.enabled === true,
    every: settings?.every && AUTO_BACKUP_FREQUENCIES.includes(settings.every) ? settings.every : 'day',
    time: stored === null ? DEFAULT_AUTO_BACKUP_TIME : (settings?.time as string),
    minutes: stored ?? (parseTimeToMinutes(DEFAULT_AUTO_BACKUP_TIME) as number),
    keep: typeof keep === 'number' && Number.isInteger(keep) && keep >= MIN_AUTO_BACKUP_KEEP && keep <= MAX_AUTO_BACKUP_KEEP
      ? keep
      : DEFAULT_AUTO_BACKUP_KEEP,
    pictures: settings?.pictures === 'used' || settings?.pictures === 'all' ? settings.pictures : 'off',
    includeKeys: settings?.includeKeys === true,
  };
}

/** Why a saved setting cannot be kept, or null. Run by the config write check. */
export function autoBackupSettingsProblem(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'settings.autoBackup must be an object.';
  const s = raw as Record<string, unknown>;
  if (typeof s.enabled !== 'boolean') return 'settings.autoBackup.enabled must be true or false.';
  if (s.every !== undefined && !AUTO_BACKUP_FREQUENCIES.includes(s.every as AutoBackupFrequency)) {
    return 'settings.autoBackup.every must be day, week or month.';
  }
  if (s.time !== undefined && (typeof s.time !== 'string' || parseTimeToMinutes(s.time) === null)) {
    return 'settings.autoBackup.time must be a time like 03:00.';
  }
  if (s.keep !== undefined && !(typeof s.keep === 'number' && Number.isInteger(s.keep) && s.keep >= MIN_AUTO_BACKUP_KEEP && s.keep <= MAX_AUTO_BACKUP_KEEP)) {
    return `settings.autoBackup.keep must be a whole number from ${MIN_AUTO_BACKUP_KEEP} to ${MAX_AUTO_BACKUP_KEEP}.`;
  }
  if (s.pictures !== undefined && s.pictures !== 'off' && s.pictures !== 'used' && s.pictures !== 'all') {
    return 'settings.autoBackup.pictures must be off, used or all.';
  }
  if (s.includeKeys !== undefined && typeof s.includeKeys !== 'boolean') {
    return 'settings.autoBackup.includeKeys must be true or false.';
  }
  return null;
}

/** What the scheduler compares between ticks: a change to any of these restarts the count. */
export function scheduleSignature(settings: ResolvedAutoBackup, timezone: string | undefined): string {
  return `${settings.enabled}|${settings.every}|${settings.minutes}|${timezone ?? ''}`;
}

export interface BackupTiming {
  /** Now, as wall minutes. */
  wallNow: number;
  settings: ResolvedAutoBackup;
  /** Wall minutes of the last good backup, or null when there has been none. */
  lastOkAt: number | null;
  /** Wall minutes of the last attempt, good or bad. */
  lastAttemptAt: number | null;
  /** Failed tries on one wall day since the last good backup. */
  failedTries: { day: string; count: number } | null;
  /**
   * Wall minutes at which the schedule was switched on or changed. No slot
   * before that moment is owed: switching backups on, or from weekly to
   * daily, waits for the chosen time instead of backing up that minute.
   */
  changedAt: number | null;
}

function dayStartOf(wallMinutes: number): number {
  return Math.floor(wallMinutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

/** The first time-of-day slot at or after `wallMinutes`. */
function slotAtOrAfter(wallMinutes: number, minutes: number): number {
  const sameDay = dayStartOf(wallMinutes) + minutes;
  return sameDay >= wallMinutes ? sameDay : sameDay + MINUTES_PER_DAY;
}

/**
 * Wall minutes at which the next backup is owed, or null when backups are
 * off. At or before `wallNow` means "run now".
 */
export function nextBackupAt(timing: BackupTiming): number | null {
  const { settings } = timing;
  if (!settings.enabled) return null;
  let due = Number.NEGATIVE_INFINITY;
  if (timing.lastOkAt !== null) {
    due = dayStartOf(timing.lastOkAt) + INTERVAL_DAYS[settings.every] * MINUTES_PER_DAY + settings.minutes;
  }
  if (timing.changedAt !== null) due = Math.max(due, slotAtOrAfter(timing.changedAt, settings.minutes));
  // Never set up and never changed: the first slot from now.
  if (due === Number.NEGATIVE_INFINITY) due = slotAtOrAfter(timing.wallNow, settings.minutes);
  const failedSinceOk = timing.lastAttemptAt !== null && (timing.lastOkAt === null || timing.lastAttemptAt > timing.lastOkAt);
  if (failedSinceOk && timing.lastAttemptAt !== null) {
    const tries = timing.failedTries;
    if (tries && tries.count >= MAX_TRIES_PER_DAY && tries.day === wallDateKey(timing.lastAttemptAt)) {
      // Three tries today: wait for tomorrow's time.
      due = Math.max(due, dayStartOf(timing.lastAttemptAt) + MINUTES_PER_DAY + settings.minutes);
    } else {
      due = Math.max(due, timing.lastAttemptAt + RETRY_AFTER_MINUTES);
    }
  }
  return due;
}

/** Whether a backup is owed now. */
export function backupDue(timing: BackupTiming): boolean {
  const at = nextBackupAt(timing);
  return at !== null && at <= timing.wallNow;
}

/** The failed-tries record after one more failure at `wallNow`. */
export function countFailedTry(previous: { day: string; count: number } | null, wallNow: number): { day: string; count: number } {
  const day = wallDateKey(wallNow);
  return previous && previous.day === day ? { day, count: previous.count + 1 } : { day, count: 1 };
}

/** A wall-minute moment as the `{ date, time }` the editor words ("tomorrow at 3:00 AM"). */
export function wallMoment(wallMinutes: number): { date: string; time: string } {
  const minuteOfDay = ((wallMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return { date: wallDateKey(wallMinutes), time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

/** An ISO instant as wall minutes in `timezone`, or null for no instant. */
export function isoToWall(iso: string | null | undefined, timezone: string | undefined): number | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : wallClockMinutes(at, timezone);
}

// ── File names ───────────────────────────────────────────────────────

const NAME_PREFIX = 'home-screens-auto-backup-';
const KEYS_MARK = 'with-keys-';

/**
 * Every name an automatic backup can have. Every route that takes a name from
 * a request checks it here before it touches the folder, so nothing outside
 * `data/auto-backups/` can be named.
 */
export const AUTO_BACKUP_NAME_RE = /^home-screens-auto-backup-(with-keys-)?(\d{4}-\d{2}-\d{2})-(\d{4})(?:-(\d{1,2}))?\.(json|zip)$/;

export function isAutoBackupName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= 80 && AUTO_BACKUP_NAME_RE.test(name);
}

/**
 * The name a backup made at `wallNow` is saved under, dated and timed on the
 * household's clock. Two runs in one minute (Back up now, twice) get `-2`,
 * `-3` from `taken`. A backup holding keys says so in its name, so it stands
 * out in a storage folder the way a downloaded one does.
 */
export function autoBackupFileName(
  wallNow: number,
  { withKeys, extension }: { withKeys: boolean; extension: 'json' | 'zip' },
  taken: ReadonlySet<string> = new Set(),
): string {
  const { date, time } = wallMoment(wallNow);
  const stem = `${NAME_PREFIX}${withKeys ? KEYS_MARK : ''}${date}-${time.replace(':', '')}`;
  let name = `${stem}.${extension}`;
  for (let n = 2; taken.has(name) && n < 100; n++) name = `${stem}-${n}.${extension}`;
  return name;
}

export interface AutoBackupNameInfo {
  withKeys: boolean;
  withPictures: boolean;
}

export function describeAutoBackupName(name: string): AutoBackupNameInfo | null {
  const m = AUTO_BACKUP_NAME_RE.exec(name);
  if (!m) return null;
  return { withKeys: !!m[1], withPictures: m[5] === 'zip' };
}

/**
 * Which of `copies` (newest first) retention removes once a new copy is in
 * place: everything past the newest `keep`.
 */
export function copiesToRemove<T>(copies: readonly T[], keep: number): T[] {
  return copies.slice(Math.max(keep, 0));
}
