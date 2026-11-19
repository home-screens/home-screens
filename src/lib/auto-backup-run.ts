/**
 * One automatic backup: build the bundle, write it to `data/auto-backups/`,
 * keep the newest `keep`, then send it to the storage folder (a WebDAV folder
 * or a network share) when one is set up. Called by the scheduler and by
 * "Back up now".
 *
 * A backup without the keys beats no backup, and so does one without the
 * pictures: either is left out with the reason recorded, never the whole
 * run. Only a backup that cannot be written at all is a failed run.
 */
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { readConfig } from './config';
import { isAuthEnabled } from './auth';
import { audit } from './audit';
import { logger } from './logger';
import { isUpgradeRunning } from './upgrade';
import { walkLibrary } from './library-files';
import { composeBackupArchive } from './backup-archive';
import { pictureBackupSet, RESTORE_FREE_SPACE_MARGIN } from './backup-pictures';
import { buildBackupBundle } from './backup-compose';
import { readAutoBackupSecrets, type StorageDestination } from './auto-backup-secrets';
import {
  readAutoBackupState,
  updateAutoBackupState,
  type AutoBackupErrorCode,
  type AutoBackupState,
  type KeysLeftOutReason,
} from './auto-backup-state';
import {
  autoBackupFileName,
  copiesToRemove,
  countFailedTry,
  resolveAutoBackupSettings,
} from './auto-backup-policy';
import { wallClockMinutes } from './auto-update-policy';
import {
  PARTIAL_SUFFIX,
  autoBackupFreeBytes,
  autoBackupPath,
  autoBackupRoot,
  listAutoBackups,
  removeAutoBackup,
} from './auto-backup-files';
import { removeFromDestination, sendToDestination } from './offsite-send';

const log = logger('auto-backup');

/**
 * Room a backup without pictures must leave on the card. Smaller than the
 * pictures' margin: a family on a nearly full card still gets its settings
 * saved, while a zip that would fill the card is left for a roomier day.
 */
export const JSON_FREE_SPACE_MARGIN = 32 * 1024 * 1024;

interface RunLock {
  running: boolean;
}

// On globalThis for the same reason as the upgrade lock: the scheduler and
// the route that runs "Back up now" can hold separate copies of this module.
const lockKey = Symbol.for('home-screens.auto-backup-run.v1');
const globals = globalThis as typeof globalThis & { [lockKey]?: RunLock };
const lock: RunLock = globals[lockKey] ??= { running: false };

export function isAutoBackupRunning(): boolean {
  return lock.running;
}

export type RunReason = 'schedule' | 'manual';

export type RunOutcome =
  | { ran: true; ok: boolean; state: AutoBackupState }
  /** Nothing ran: another backup, or an update, is in progress. */
  | { ran: false; reason: 'busy' | 'updating' };

class NoRoomError extends Error {
  constructor(message = 'not enough room for the backup') {
    super(message);
    this.name = 'NoRoomError';
  }
}

function errorCode(err: unknown): AutoBackupErrorCode {
  if (err instanceof NoRoomError) return 'no-room';
  return (err as NodeJS.ErrnoException | null)?.code === 'ENOSPC' ? 'no-room' : 'failed';
}

function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Write a copy under its `.partial` name, flush it, then give it its name. */
async function writeCopy(name: string, json: string, bundle: unknown, pictures: readonly { path: string }[]): Promise<void> {
  const root = autoBackupRoot();
  await fs.mkdir(root, { recursive: true });
  const final = path.join(root, name);
  const partial = final + PARTIAL_SUFFIX;
  try {
    if (pictures.length > 0) {
      await pipeline(composeBackupArchive(bundle, pictures), createWriteStream(partial, { mode: 0o600 }));
    } else {
      await fs.writeFile(partial, json, { mode: 0o600 });
    }
    const handle = await fs.open(partial, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(partial, final);
  } catch (err) {
    await fs.rm(partial, { force: true }).catch(() => {});
    throw err;
  }
}

interface WrittenCopy {
  name: string;
  keysLeftOut: KeysLeftOutReason | null;
  picturesLeftOut: AutoBackupState['picturesLeftOut'];
  pictureCount: number;
}

/** Everything up to the copy being in place and the old ones removed. Throws on a failed run. */
async function saveCopy(now: Date, includeKeys: boolean, pictureChoice: 'off' | 'used' | 'all', keep: number, timezone: string | undefined): Promise<WrittenCopy> {
  let passphrase: string | undefined;
  let keysLeftOut: KeysLeftOutReason | null = null;
  if (includeKeys) {
    // The same rule as the keys in a downloaded backup: an install with no
    // editor password cannot tell its owner from anyone else on the network.
    if (!(await isAuthEnabled())) keysLeftOut = 'no-editor-password';
    else {
      const { backupPassword } = await readAutoBackupSecrets();
      if (backupPassword) passphrase = backupPassword;
      else keysLeftOut = 'no-backup-password';
    }
  }

  const bundle = await buildBackupBundle({ customIcons: true, credentialsPassphrase: passphrase, now });
  const json = JSON.stringify(bundle, null, 2);
  const jsonBytes = Buffer.byteLength(json);

  // Chosen against the bundle's own config, so the pictures match the
  // screens being saved rather than ones edited a second later.
  let pictures: { path: string; bytes: number }[] = [];
  if (pictureChoice !== 'off') {
    const { items } = await walkLibrary();
    pictures = pictureBackupSet(pictureChoice, bundle.config, items);
  }
  const pictureBytes = pictures.reduce((sum, picture) => sum + picture.bytes, 0);

  const copies = await listAutoBackups();
  // The copies the new one will push out, which count as room it can use.
  // Never the newest: until the new copy is safely written it is the only
  // good backup, so with "keep the last 1" a run that lacks room makes a
  // smaller backup or says there is no room, rather than deleting it first.
  const surplus = copiesToRemove(copies, Math.max(keep - 1, 1));
  const freedBytes = surplus.reduce((sum, copy) => sum + copy.bytes, 0);
  const free = await autoBackupFreeBytes();
  let picturesLeftOut: AutoBackupState['picturesLeftOut'] = null;
  if (free !== undefined) {
    if (pictures.length > 0) {
      const needed = jsonBytes + pictureBytes + RESTORE_FREE_SPACE_MARGIN - freedBytes;
      if (needed > free) {
        picturesLeftOut = { neededBytes: needed, freeBytes: free };
        pictures = [];
      }
    }
    const needed = jsonBytes + (pictures.length > 0 ? pictureBytes + RESTORE_FREE_SPACE_MARGIN : JSON_FREE_SPACE_MARGIN);
    if (needed - freedBytes > free) throw new NoRoomError();
    // Only when the room is needed do the old copies go first; otherwise
    // they stay until the new one is safely in place.
    if (needed > free) {
      for (const copy of surplus) await removeAutoBackup(copy.name);
    }
  }

  const withPictures = pictures.length > 0;
  const name = autoBackupFileName(
    wallClockMinutes(now, timezone),
    { withKeys: !!passphrase, extension: withPictures ? 'zip' : 'json' },
    new Set(copies.map((copy) => copy.name)),
  );
  await writeCopy(name, json, bundle, pictures);

  for (const copy of copiesToRemove(await listAutoBackups(), keep)) {
    if (copy.name !== name) await removeAutoBackup(copy.name);
  }
  return { name, keysLeftOut, picturesLeftOut, pictureCount: pictures.length };
}

/**
 * Send `name` to the folder, then remove what the folder holds past `keep`.
 * Answers the new `offsite` record.
 */
async function sendOffsite(
  dest: StorageDestination,
  name: string,
  keep: number,
  previous: AutoBackupState['offsite'],
  at: string,
): Promise<AutoBackupState['offsite']> {
  const file = autoBackupPath(name);
  const outcome = file ? await sendToDestination(dest, file, name) : { ok: false as const, code: 'refused' as const, detail: 'unknown copy' };
  if (!outcome.ok) {
    log.warn(`Could not send ${name} to the storage folder (${outcome.code}): ${outcome.detail ?? ''}`);
    audit({ action: 'auto_backup_offsite', result: 'failed', code: outcome.code });
    return { ...previous, lastAttemptAt: at, lastError: { code: outcome.code, detail: outcome.detail }, pendingFile: name };
  }
  audit({ action: 'auto_backup_offsite', result: 'ok' });
  const sent = [name, ...previous.remoteFiles.filter((n) => n !== name)];
  const kept = sent.slice(0, keep);
  // A copy the folder would not let go of stays on the list and is tried
  // again after the next upload.
  for (const old of sent.slice(keep)) {
    const removed = await removeFromDestination(dest, old);
    if (!removed.ok) kept.push(old);
  }
  return { ...previous, lastAttemptAt: at, lastOkAt: at, lastError: null, pendingFile: null, remoteFiles: kept };
}

/**
 * The offsite part of a state update: the send's result, but only while the
 * record is still the one the send started from. A storage folder changed
 * mid-send has its own fresh record, which this result says nothing about.
 */
function offsiteIfCurrent(current: AutoBackupState, offsite: AutoBackupState['offsite']): AutoBackupState['offsite'] {
  return current.offsite.revision === offsite.revision ? offsite : current.offsite;
}

/** Run one backup now. Never throws: a failure is recorded and answered as `ok: false`. */
export async function runAutoBackup({ reason, now = new Date() }: { reason: RunReason; now?: Date }): Promise<RunOutcome> {
  if (lock.running) return { ran: false, reason: 'busy' };
  if (isUpgradeRunning()) return { ran: false, reason: 'updating' };
  lock.running = true;
  try {
    return await runLocked(reason, now);
  } finally {
    lock.running = false;
  }
}

async function runLocked(reason: RunReason, now: Date): Promise<RunOutcome> {
  const at = now.toISOString();
  const config = await readConfig();
  const timezone = config.settings?.timezone;
  const settings = resolveAutoBackupSettings(config.settings?.autoBackup);

  let written: WrittenCopy;
  try {
    written = await saveCopy(now, settings.includeKeys, settings.pictures, settings.keep, timezone);
  } catch (err) {
    const code = errorCode(err);
    log.warn(`Automatic backup failed (${code}):`, errorDetail(err));
    audit({ action: 'auto_backup', result: 'failed', reason, code });
    const state = await updateAutoBackupState((current) => ({
      ...current,
      lastAttemptAt: at,
      lastError: { code, detail: errorDetail(err) },
      failedTries: countFailedTry(current.failedTries, wallClockMinutes(now, timezone)),
    }));
    return { ran: true, ok: false, state };
  }

  audit({
    action: 'auto_backup',
    result: 'ok',
    reason,
    file: written.name,
    keys: written.keysLeftOut === null && settings.includeKeys,
    pictures: written.pictureCount,
  });
  log.info(`Saved ${written.name}`);

  // The record first, then the folder: a folder changed in between is
  // caught by the revision, never paired with the old folder's file list.
  const previous = (await readAutoBackupState()).offsite;
  const { destination } = await readAutoBackupSecrets();
  const offsite = destination ? await sendOffsite(destination, written.name, settings.keep, previous, at) : null;
  const state = await updateAutoBackupState((current) => ({
    ...current,
    lastAttemptAt: at,
    lastOkAt: at,
    lastError: null,
    lastFile: written.name,
    failedTries: null,
    keysLeftOut: written.keysLeftOut,
    picturesLeftOut: written.picturesLeftOut,
    offsite: offsite ? offsiteIfCurrent(current, offsite) : current.offsite,
  }));
  return { ran: true, ok: true, state };
}

/** A failed upload waits this long before the scheduler sends it again. */
export const OFFSITE_RETRY_MINUTES = 60;

/**
 * Send the newest copy again after a failed upload, an hour after the last
 * try. The copy that failed may have been pushed out by retention since,
 * and the newest one is the one worth having off the hub anyway.
 */
export async function retryPendingUpload(now: Date = new Date()): Promise<void> {
  if (lock.running || isUpgradeRunning()) return;
  // Taken before the first await: a "Back up now" pressed while the state
  // is being read must find the lock held, or both would send at once and
  // each write its own idea of the offsite record.
  lock.running = true;
  try {
    const state = await readAutoBackupState();
    const { pendingFile, lastAttemptAt } = state.offsite;
    if (!pendingFile) return;
    if (lastAttemptAt && now.getTime() - Date.parse(lastAttemptAt) < OFFSITE_RETRY_MINUTES * 60_000) return;
    const { destination } = await readAutoBackupSecrets();
    const newest = (await listAutoBackups())[0];
    if (!destination || !newest) {
      await updateAutoBackupState((current) => ({
        ...current,
        offsite: offsiteIfCurrent(current, { ...state.offsite, pendingFile: null }),
      }));
      return;
    }
    const config = await readConfig();
    const { keep } = resolveAutoBackupSettings(config.settings?.autoBackup);
    const offsite = await sendOffsite(destination, newest.name, keep, state.offsite, now.toISOString());
    await updateAutoBackupState((current) => ({ ...current, offsite: offsiteIfCurrent(current, offsite) }));
  } finally {
    lock.running = false;
  }
}
