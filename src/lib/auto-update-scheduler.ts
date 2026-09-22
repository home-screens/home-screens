import { readFileSync } from 'fs';
import os from 'os';
import { readConfigCached } from './config-cache';
import { logger } from './logger';
import { parseUpdateChannel } from './semver';
import { PreflightError, isUpgradeRunning, runUpgrade } from './upgrade';
import { readFailedUpdate } from './upgrade-failed-state';
import { getPackageVersion, getVersionInfo, hasReleaseTarball, type VersionInfo } from './version';
import {
  readAutoUpdateSettingChange,
  readAutoUpdateState,
  writeAutoUpdateSettingChange,
  writeAutoUpdateState,
} from './auto-update-state';
import {
  blockedTags,
  decideAutoUpdate,
  dueSlot,
  jitterMinutesFor,
  resolveAutoUpdateSettings,
  settleAfterRestart,
  upcomingSlot,
  wallClockMinutes,
  wallDateKey,
  type AutoUpdateInfo,
  type AutoUpdateSkipReason,
  type AutoUpdateState,
  type ResolvedAutoUpdate,
  type RunSlot,
} from './auto-update-policy';

const log = logger('auto-update');

/** How often the scheduler looks at the clock. One cached config read, no network. */
const TICK_MS = 60_000;

interface SchedulerState {
  started: boolean;
  /** A tick is in flight; the next one waits rather than overlapping it. */
  busy: boolean;
  timer: ReturnType<typeof setInterval> | null;
  /** What the setting looked like at the last tick, to notice a change. */
  signature: string | null;
  /** See `RunTiming.changedAt`. */
  changedAt: number | null;
  /** `signature` and `changedAt` have been restored from the last process. */
  restored: boolean;
  jitter: number;
}

/**
 * What spreads this device's runs from everyone else's. Not the hostname:
 * every Pi flashed from the image keeps `home-screens`, so they would all
 * land on the same minute. The machine id is generated on first boot (the
 * image build clears it), so it differs per device; hosts without one fall
 * back to the hostname.
 */
function deviceSeed(): string {
  try {
    const id = readFileSync('/etc/machine-id', 'utf8').trim();
    if (id) return id;
  } catch {
    // Not Linux, or no machine id.
  }
  return os.hostname();
}

// On globalThis for the same reason as the upgrade lock: the boot hook that
// starts this and the version route that reports on it can hold separate
// copies of this module.
const stateKey = Symbol.for('home-screens.auto-update-scheduler.v1');
const globals = globalThis as typeof globalThis & { [stateKey]?: SchedulerState };
const scheduler: SchedulerState = globals[stateKey] ??= {
  started: false,
  busy: false,
  timer: null,
  signature: null,
  changedAt: null,
  restored: false,
  jitter: jitterMinutesFor(deviceSeed()),
};

function settingsSignature(settings: ResolvedAutoUpdate, timezone: string | undefined): string {
  return `${settings.enabled}|${settings.minutes}|${timezone ?? ''}`;
}

/** `RunTiming.changedAt` as it stands once `signature` is the current setting. */
function changedAtFor(signature: string, wallNow: number): number | null {
  return scheduler.signature !== null && scheduler.signature !== signature ? wallNow : scheduler.changedAt;
}

/**
 * Pick up the setting and its change time where the last process left them,
 * so a restart does not forget that the setting was switched on past today's
 * slot. Once per process.
 */
async function restoreSettingChange(): Promise<void> {
  if (scheduler.restored) return;
  scheduler.restored = true;
  try {
    const saved = await readAutoUpdateSettingChange();
    if (saved) {
      scheduler.signature = saved.signature;
      scheduler.changedAt = saved.changedAt;
    }
  } catch (err) {
    log.warn('Could not read when automatic updates were last changed:', err);
  }
}

/** Only an installed production server updates itself. E2E sets the kill switch. */
function schedulerAllowed(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.HS_DISABLE_AUTO_UPDATE !== '1';
}

/** Called once from the boot hook. Safe to call again; only the first call starts anything. */
export function startAutoUpdateScheduler(): void {
  if (scheduler.started || !schedulerAllowed()) return;
  scheduler.started = true;
  void Promise.all([settlePendingRun(), restoreSettingChange()]).finally(() => {
    scheduler.timer = setInterval(() => { void autoUpdateTick(); }, TICK_MS);
    scheduler.timer.unref?.();
    void autoUpdateTick();
  });
}

/** Test seam: stop the timer and forget everything. */
export function __resetAutoUpdateSchedulerForTests(): void {
  if (scheduler.timer) clearInterval(scheduler.timer);
  Object.assign(scheduler, {
    started: false,
    busy: false,
    timer: null,
    signature: null,
    changedAt: null,
    restored: false,
    jitter: jitterMinutesFor(deviceSeed()),
  } satisfies SchedulerState);
}

/**
 * Settle the record an install left behind, now that this process is the one
 * that came up after it (see `settleAfterRestart`).
 */
async function settlePendingRun(): Promise<void> {
  try {
    const [state, current, marker] = await Promise.all([
      readAutoUpdateState(),
      getPackageVersion(),
      readFailedUpdate(),
    ]);
    const settled = settleAfterRestart(state, current, marker?.tag ?? null);
    if (settled) await writeAutoUpdateState(settled);
  } catch (err) {
    log.warn('Could not settle the last automatic update:', err);
  }
}

/**
 * One look at the clock. Exported for tests; the interval is the only other
 * caller.
 */
export async function autoUpdateTick(now: Date = new Date()): Promise<void> {
  if (scheduler.busy) return;
  scheduler.busy = true;
  try {
    const config = await readConfigCached();
    const settings = resolveAutoUpdateSettings(config.settings?.autoUpdate);
    const timezone = config.settings?.timezone;
    const wallNow = wallClockMinutes(now, timezone);
    // Re-read every tick, so switching it on, off or to a new time takes
    // effect within a minute without a restart.
    const signature = settingsSignature(settings, timezone);
    await restoreSettingChange();
    const changedAt = changedAtFor(signature, wallNow);
    const changed = signature !== scheduler.signature || changedAt !== scheduler.changedAt;
    scheduler.changedAt = changedAt;
    scheduler.signature = signature;
    if (changed) await writeAutoUpdateSettingChange({ signature, changedAt });
    if (!settings.enabled) return;

    const state = await readAutoUpdateState();
    const slot = dueSlot({
      wallNow,
      minutes: settings.minutes,
      jitter: scheduler.jitter,
      lastRunDate: state?.runDate ?? null,
      changedAt: scheduler.changedAt,
    });
    if (!slot) return;
    await runSlot(slot, now, parseUpdateChannel(config.settings?.updateChannel), config.version ?? null);
  } catch (err) {
    log.warn('Automatic update check failed:', err);
  } finally {
    scheduler.busy = false;
  }
}

async function runSlot(slot: RunSlot, now: Date, channel: ReturnType<typeof parseUpdateChannel>, localSchema: number | null): Promise<void> {
  const at = now.toISOString();
  /** Every record carries the failures forward; only the run itself is new. */
  const record = (fields: Omit<AutoUpdateState, 'runDate' | 'at' | 'failedTags'>, known: readonly string[]): AutoUpdateState => ({
    runDate: slot.date,
    at,
    ...fields,
    ...(known.length > 0 ? { failedTags: [...known] } : {}),
  });
  let info: VersionInfo | null = null;
  try {
    // Forced: the scheduled check is the one answer of the day and must not
    // be an hour-old cache from before the nightly published.
    info = await getVersionInfo({ channel, localSchema, force: true });
  } catch (err) {
    log.warn('Could not check for updates:', err);
  }
  const offered = info?.latest ? `v${info.latest}` : null;
  const [hasTarball, marker, state] = await Promise.all([
    offered ? hasReleaseTarball(offered) : Promise.resolve(false),
    readFailedUpdate(),
    readAutoUpdateState(),
  ]);
  const known = blockedTags(marker, state);
  const decision = decideAutoUpdate({
    enabled: true,
    info,
    hasTarball,
    failedTags: known,
    upgradeRunning: isUpgradeRunning(),
  });

  const skip = (reason: AutoUpdateSkipReason, tag?: string, step?: string) => {
    log.info(`Skipped (${reason})${tag ? ` ${tag}` : ''}`);
    return writeAutoUpdateState(record({
      result: 'skipped',
      reason,
      ...(tag ? { tag } : {}),
      ...(step ? { step } : {}),
    }, known));
  };

  if (decision.action === 'skip') {
    await skip(decision.reason, decision.tag, decision.step);
    return;
  }

  // The check took a network round trip. Read the setting again rather than
  // trusting the copy from before it: switching automatic updates off is not
  // meant to leave one last install in flight.
  const settings = resolveAutoUpdateSettings((await readConfigCached()).settings?.autoUpdate);
  if (!settings.enabled) {
    await skip('off', decision.tag);
    return;
  }

  log.info(`Installing ${decision.tag}`);
  // Written first: a good install ends with this process replaced, and the
  // record has to say the day's run happened so the new one does not repeat it.
  await writeAutoUpdateState(record({ result: 'installed', tag: decision.tag, pending: true }, known));
  try {
    await runUpgrade(decision.tag);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Could not install ${decision.tag}:`, message);
    await writeAutoUpdateState(record({
      result: 'failed',
      tag: decision.tag,
      failure: err instanceof PreflightError && err.needsSudoPassword ? 'needs-password' : 'error',
      error: message,
    }, known));
  }
}

/**
 * When the next run will be, for the System page. Null `nextRun` when the
 * setting is off or no scheduler runs in this process (a dev server, E2E).
 */
export function describeAutoUpdateSchedule(
  settings: ResolvedAutoUpdate,
  timezone: string | undefined,
  lastRunDate: string | null,
  now: Date = new Date(),
): Pick<AutoUpdateInfo, 'nextRun' | 'today'> {
  const wallNow = wallClockMinutes(now, timezone);
  const today = wallDateKey(wallNow);
  if (!settings.enabled || !scheduler.started) return { nextRun: null, today };
  // A save the scheduler has not ticked over yet already counts, so the page
  // never promises the slot that was just switched on past.
  const slot = upcomingSlot({
    wallNow,
    minutes: settings.minutes,
    jitter: scheduler.jitter,
    lastRunDate,
    changedAt: changedAtFor(settingsSignature(settings, timezone), wallNow),
  });
  return { nextRun: { date: slot.date, time: settings.time }, today };
}
