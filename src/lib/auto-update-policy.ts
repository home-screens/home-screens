/**
 * When a hub installs an update by itself, and what it installs.
 *
 * The setting is `GlobalSettings.autoUpdate`: on or off, and a time of day in
 * the display timezone. Once a day at that time the scheduler
 * (`auto-update-scheduler.ts`) asks the same question the Update button
 * answers, and this module decides whether the answer is one a device may act
 * on with nobody watching:
 *
 *   - upward only; a step back is always a person's choice
 *   - a ready-made download only; building on the device can take minutes and
 *     run out of memory
 *   - never a version that already failed to start here, or a broken nightly
 *     would restart the wall every night until the next one
 *
 * Pure: no I/O. Wall-clock arithmetic is done on "wall minutes", the clock
 * reading in the display timezone encoded as minutes since the UTC epoch, so
 * a day is always 1440 of them and neither the host's own timezone nor a DST
 * change can move a slot.
 */
import type { AutoUpdateSettings } from '@/types/config';
import type { VersionInfo } from './version';
import { parseTimeToMinutes } from './sleep-timeline';
import { versionOfTag } from './update-policy';

export const DEFAULT_AUTO_UPDATE_TIME = '04:00';

/** A slot missed while the device was off is still taken this long after it. */
export const MISSED_WINDOW_MINUTES = 6 * 60;

/** Each device waits up to this long past the chosen time, so a household's
 *  devices (and everyone else's) do not all ask GitHub in the same second. */
export const MAX_JITTER_MINUTES = 20;

const MINUTES_PER_DAY = 24 * 60;

/** Why a run did not install anything. Each maps to one sentence in Settings. */
export type AutoUpdateSkipReason =
  | 'off'
  | 'not-installed-build'
  | 'already-updating'
  | 'unreachable'
  | 'missing-step'
  | 'up-to-date'
  | 'step-back'
  | 'failed-before'
  | 'no-download';

/** Why an install that started did not end on the new version. */
export type AutoUpdateFailure =
  /** The preflight found no passwordless sudo; nobody can type it at 4am. */
  | 'needs-password'
  /** The new version never answered and `finalize-deploy` put the old one back. */
  | 'did-not-start'
  /** The process stopped mid-install (power cut, manual restart). */
  | 'interrupted'
  /** Anything else before the restart: download, disk, checksum. */
  | 'error';

/**
 * The last run, as kept in `data/auto-update-state.json`. One record, replaced
 * by every run.
 */
export interface AutoUpdateState {
  /** The slot this run answered: its day in the display timezone, `YYYY-MM-DD`. */
  runDate: string;
  /** When the run happened, ISO. */
  at: string;
  result: 'installed' | 'skipped' | 'failed';
  /** The version offered, with its leading "v", when there was one. */
  tag?: string;
  /** For a `missing-step` skip: the version `tag` needs first, which could not be found. */
  step?: string;
  /** Set when `result` is `skipped`. */
  reason?: AutoUpdateSkipReason;
  /** Set when `result` is `failed`. */
  failure?: AutoUpdateFailure;
  /** The raw error, for the diagnostics bundle. Never shown as is. */
  error?: string;
  /**
   * Versions that did not start on this device, newest first. Kept apart from
   * the run above and carried into every later record, because the run itself
   * is replaced nightly: one offline night used to be enough to forget a
   * broken release and install it all over again. The rollback marker says
   * the same thing until someone dismisses it on the System page.
   */
  failedTags?: string[];
  /**
   * Written before the install starts, because a successful install ends
   * with this process being replaced. The next process to start settles it
   * (see `settleAfterRestart`).
   */
  pending?: boolean;
}

/** How many failed versions a device remembers. Older ones are off its channel. */
export const REMEMBERED_FAILURES = 5;

export interface ResolvedAutoUpdate {
  enabled: boolean;
  /** `HH:MM`, the default when the stored value is missing or malformed. */
  time: string;
  /** `time` as minutes from midnight. */
  minutes: number;
}

export function resolveAutoUpdateSettings(settings: AutoUpdateSettings | undefined | null): ResolvedAutoUpdate {
  const stored = typeof settings?.time === 'string' ? parseTimeToMinutes(settings.time) : null;
  const minutes = stored ?? (parseTimeToMinutes(DEFAULT_AUTO_UPDATE_TIME) as number);
  return {
    enabled: settings?.enabled === true,
    time: stored === null ? DEFAULT_AUTO_UPDATE_TIME : (settings?.time as string),
    minutes,
  };
}

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The clock reading of `date` in `timezone`, as wall minutes. Without a
 * timezone (or with one Intl does not know) the host's own clock is read.
 */
export function wallClockMinutes(date: Date, timezone?: string | null): number {
  if (timezone) {
    try {
      let formatter = wallFormatters.get(timezone);
      if (!formatter) {
        // en-US for ASCII digits; this is machine extraction, not display.
        formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          hourCycle: 'h23',
        });
        wallFormatters.set(timezone, formatter);
      }
      const parts = formatter.formatToParts(date);
      const get = (type: Intl.DateTimeFormatPartTypes) =>
        Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
      const hour = get('hour') === 24 ? 0 : get('hour');
      return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute')) / 60_000;
    } catch {
      // Unknown timezone: fall through to the host clock.
    }
  }
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()) / 60_000;
}

/** The `YYYY-MM-DD` day a wall-minute value falls on. */
export function wallDateKey(wallMinutes: number): string {
  return new Date(wallMinutes * 60_000).toISOString().slice(0, 10);
}

/** A stable 0 to MAX_JITTER_MINUTES delay for one device, from a string unique to it. */
export function jitterMinutesFor(seed: string): number {
  // FNV-1a: tiny, deterministic, and spreads machine ids evenly enough.
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % (MAX_JITTER_MINUTES + 1);
}

export interface RunSlot {
  /** The day the chosen time falls on, `YYYY-MM-DD`. Jitter never changes it. */
  date: string;
  /** Wall minutes at which the run is due, jitter included. */
  dueAt: number;
}

function slotForDay(dayStart: number, minutes: number, jitter: number): RunSlot {
  return { date: wallDateKey(dayStart), dueAt: dayStart + minutes + jitter };
}

/** The latest slot due at or before `wallNow`, and the one after it. */
export function slotsAround(wallNow: number, minutes: number, jitter: number): { last: RunSlot; next: RunSlot } {
  let dayStart = Math.floor(wallNow / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  let last = slotForDay(dayStart, minutes, jitter);
  // Jitter can carry a late slot past midnight (23:55 plus 20 minutes), so
  // yesterday's may not be due yet either. At most two steps back.
  while (last.dueAt > wallNow) {
    dayStart -= MINUTES_PER_DAY;
    last = slotForDay(dayStart, minutes, jitter);
  }
  return { last, next: slotForDay(dayStart + MINUTES_PER_DAY, minutes, jitter) };
}

export interface RunTiming {
  wallNow: number;
  /** Chosen time, minutes from midnight. */
  minutes: number;
  jitter: number;
  /** `runDate` of the last recorded run, if any. */
  lastRunDate: string | null;
  /**
   * Wall minutes at which the setting was last switched on or changed, kept
   * across restarts, or null when no change has been seen. A slot due
   * before that moment is not owed: turning the setting on at 9am must not
   * restart the wall for the 4am slot it just missed. A slot missed while the
   * device was off is, which is what null allows.
   */
  changedAt: number | null;
}

/** The slot to run now, or null when nothing is owed. */
export function dueSlot(timing: RunTiming): RunSlot | null {
  const { last } = slotsAround(timing.wallNow, timing.minutes, timing.jitter);
  if (timing.lastRunDate === last.date) return null;
  if (timing.wallNow - last.dueAt > MISSED_WINDOW_MINUTES) return null;
  if (timing.changedAt !== null && last.dueAt < timing.changedAt) return null;
  return last;
}

/**
 * The slot the next run will answer: the one due now if any, else the next
 * one that has not run. A day runs once, so moving the time later on a day
 * that already ran puts the next run on the day after, not later today.
 */
export function upcomingSlot(timing: RunTiming): RunSlot {
  const due = dueSlot(timing);
  if (due) return due;
  const { next } = slotsAround(timing.wallNow, timing.minutes, timing.jitter);
  if (next.date !== timing.lastRunDate) return next;
  return slotForDay(next.dueAt - timing.minutes - timing.jitter + MINUTES_PER_DAY, timing.minutes, timing.jitter);
}

export type AutoUpdateDecision =
  | { action: 'install'; tag: string }
  | { action: 'skip'; reason: AutoUpdateSkipReason; tag?: string; step?: string };

export interface AutoUpdateDecisionInput {
  enabled: boolean;
  /** The update check for the saved channel, or null when it could not be made. */
  info: Pick<
    VersionInfo,
    'installedVia' | 'latest' | 'updateAvailable' | 'isDowngrade' | 'missingStep' | 'requiredStepFor' | 'blockedDowngrade'
  > | null;
  /** Whether `v<info.latest>` has a ready-made download. */
  hasTarball: boolean;
  /** Versions that did not start on this device (see `failedTags`). */
  failedTags: readonly string[];
  upgradeRunning: boolean;
}

/**
 * What a run does with the update check's answer. The order matters where two
 * reasons apply: the first one that holds is the one the owner is told.
 */
export function decideAutoUpdate(input: AutoUpdateDecisionInput): AutoUpdateDecision {
  const { info } = input;
  if (!input.enabled) return { action: 'skip', reason: 'off' };
  if (info && info.installedVia !== 'tarball') return { action: 'skip', reason: 'not-installed-build' };
  if (input.upgradeRunning) return { action: 'skip', reason: 'already-updating' };
  if (!info) return { action: 'skip', reason: 'unreachable' };
  // Both leave `latest` empty, so they are told apart before "nothing new".
  if (info.missingStep) {
    return {
      action: 'skip',
      reason: 'missing-step',
      ...(info.requiredStepFor ? { tag: `v${info.requiredStepFor}` } : {}),
      step: `v${info.missingStep}`,
    };
  }
  if (info.blockedDowngrade) return { action: 'skip', reason: 'step-back', tag: `v${info.blockedDowngrade}` };
  // An empty channel means the release list could not be read: a tarball
  // install has no git tags to fall back on.
  if (!info.latest) return { action: 'skip', reason: 'unreachable' };
  if (!info.updateAvailable) return { action: 'skip', reason: 'up-to-date' };
  const tag = `v${info.latest}`;
  if (info.isDowngrade) return { action: 'skip', reason: 'step-back', tag };
  if (input.failedTags.some((failed) => versionOfTag(failed) === info.latest)) {
    return { action: 'skip', reason: 'failed-before', tag };
  }
  if (!input.hasTarball) return { action: 'skip', reason: 'no-download', tag };
  return { action: 'install', tag };
}

/**
 * The versions that must not be tried again: what the rollback marker names,
 * plus everything the device has remembered failing. The marker is the only
 * source until someone dismisses it on the System page, which is why the
 * record keeps its own list.
 */
export function blockedTags(marker: { tag: string } | null, state: AutoUpdateState | null): string[] {
  return rememberFailedTag(state?.failedTags, marker?.tag);
}

/** `tags` with `tag` in front, deduplicated by version and capped. */
export function rememberFailedTag(tags: readonly string[] | undefined, tag: string | undefined): string[] {
  const kept = (tags ?? []).filter((known) => !tag || versionOfTag(known) !== versionOfTag(tag));
  return [...(tag ? [tag] : []), ...kept].slice(0, REMEMBERED_FAILURES);
}

/**
 * Settle a record left `pending` by an install, from the process that starts
 * next. Running the version it installed means it worked. Anything else means
 * it did not: the rollback's marker naming the same version says the new one
 * never started; no marker means the install was cut off. Null when there is
 * nothing to settle.
 */
export function settleAfterRestart(
  state: AutoUpdateState | null,
  currentVersion: string,
  markerTag: string | null,
): AutoUpdateState | null {
  if (!state?.pending || !state.tag) return null;
  const { pending: _pending, ...rest } = state;
  if (versionOfTag(state.tag) === currentVersion) return { ...rest, result: 'installed' };
  const failure: AutoUpdateFailure = markerTag !== null && versionOfTag(markerTag) === versionOfTag(state.tag)
    ? 'did-not-start'
    : 'interrupted';
  // A version that never started is remembered for good; one that was cut off
  // (a power cut mid-install) is worth another try tomorrow.
  const remembered = failure === 'did-not-start'
    ? { failedTags: rememberFailedTag(state.failedTags, state.tag) }
    : {};
  return { ...rest, ...remembered, result: 'failed', failure };
}

/** What `GET /api/system/version` reports about automatic updates. */
export interface AutoUpdateInfo {
  enabled: boolean;
  /** The last run, without its raw error. */
  lastRun: Omit<AutoUpdateState, 'error'> | null;
  /** The day and chosen time of the next run, in the display timezone. Null when none will happen. */
  nextRun: { date: string; time: string } | null;
  /** Today in the display timezone, so a viewer can say "today" or "tomorrow". */
  today: string;
}
