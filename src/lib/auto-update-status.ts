/**
 * What the System page says about automatic updates. Pure; the component
 * formats the times and looks the sentences up.
 */
import type { AutoUpdateFailure, AutoUpdateInfo, AutoUpdateSkipReason } from './auto-update-policy';
import type { VersionInfo } from './version';

/** One sentence under `settings.systemPage.autoUpdate.status`. */
export type AutoUpdateStatusKey =
  | 'installed'
  | 'upToDate'
  | 'didNotStart'
  | 'failedBefore'
  | 'needsPassword'
  | 'failed'
  | 'unreachable'
  | 'stepBack'
  | 'missingStep'
  | 'noDownload'
  | 'alreadyUpdating'
  | 'interrupted'
  | 'notInstalledBuild';

export interface AutoUpdateStatusLine {
  key: AutoUpdateStatusKey;
  /** Something needs the owner: said in the warning colour. */
  warning: boolean;
  /** Said on its own, with no "Last check:" and no time. */
  standsAlone: boolean;
}

// `off` is never recorded: a run that finds the setting off does not happen.
const SKIPPED: Record<Exclude<AutoUpdateSkipReason, 'off'>, AutoUpdateStatusKey> = {
  'not-installed-build': 'notInstalledBuild',
  'already-updating': 'alreadyUpdating',
  unreachable: 'unreachable',
  'missing-step': 'missingStep',
  'up-to-date': 'upToDate',
  'step-back': 'stepBack',
  'failed-before': 'failedBefore',
  'no-download': 'noDownload',
};

const FAILED: Record<AutoUpdateFailure, AutoUpdateStatusKey> = {
  'needs-password': 'needsPassword',
  'did-not-start': 'didNotStart',
  interrupted: 'interrupted',
  error: 'failed',
};

const NEEDS_THE_OWNER = new Set<AutoUpdateStatusKey>(['didNotStart', 'needsPassword', 'failed', 'missingStep', 'interrupted']);

/** The sentence for the last run, or null when nothing has run yet. */
export function lastRunStatus(lastRun: AutoUpdateInfo['lastRun']): AutoUpdateStatusLine | null {
  if (!lastRun) return null;
  let key: AutoUpdateStatusKey;
  if (lastRun.result === 'installed') key = 'installed';
  else if (lastRun.result === 'failed') key = FAILED[lastRun.failure ?? 'error'];
  else if (!lastRun.reason || lastRun.reason === 'off') return null;
  else key = SKIPPED[lastRun.reason];
  return { key, warning: NEEDS_THE_OWNER.has(key), standsAlone: key === 'notInstalledBuild' };
}

/**
 * Whether the hub will install `offeredTag` by itself, which is what decides
 * if a "new version" note about it is news or noise.
 *
 * False whenever the last run ended in something a later night cannot clear
 * on its own: a missing device password, a version that never started, one
 * with no ready-made download. Someone has to press the button for those, and
 * a silent Settings page is no way to tell them.
 */
export function autoUpdateWillInstall(
  /**
   * The version route's answer. `autoUpdate` may be missing: a page left open
   * across a rollback polls a server from before automatic updates.
   */
  version: Pick<VersionInfo, 'installedVia'> & { autoUpdate?: AutoUpdateInfo },
  offeredTag: string | null,
  /** The rollback marker's version, when one stands. */
  failedTag: string | null,
): boolean {
  const info = version.autoUpdate;
  // No scheduled run means nothing installs it: the scheduler is not running
  // in this process, or the setting is off.
  if (!info?.enabled || info.nextRun === null) return false;
  // Only a release download updates itself; a git checkout never will, and
  // it has no run on record to say so until its first night.
  if (version.installedVia !== 'tarball') return false;
  if (offeredTag !== null && failedTag === offeredTag) return false;
  const last = info.lastRun;
  if (!last) return true;
  if ((last.failedTags ?? []).includes(offeredTag ?? '')) return false;
  const status = lastRunStatus(last);
  if (!status) return true;
  // The amber lines all name something the owner has to do.
  if (status.warning || status.standsAlone) return false;
  return !(last.tag === offeredTag && (last.reason === 'no-download' || last.reason === 'failed-before'));
}

function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** How to name the day a run happened, relative to today (both `YYYY-MM-DD`). */
export function pastDayWord(date: string, today: string): 'today' | 'yesterday' | 'other' {
  if (date === today) return 'today';
  if (date === dayBefore(today)) return 'yesterday';
  return 'other';
}

/**
 * How to name the day of the next run. A slot due right now can belong to
 * yesterday (a late time carried past midnight); it still runs today.
 */
export function nextDayWord(date: string, today: string): 'today' | 'tomorrow' {
  return date > today ? 'tomorrow' : 'today';
}
