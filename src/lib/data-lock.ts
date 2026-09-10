import { promises as fs, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

/**
 * The lock one writer holds while it changes the data directory.
 *
 * The file at the lock path names its owner. Creating it is a hard link from a
 * staging file, which either succeeds or fails with EEXIST and never leaves a
 * half-written owner behind, so exactly one writer can win it. A writer proves
 * it still holds the lock by reading that file back and finding its own token:
 * only one file can sit at that path, so only one token can be current, and a
 * writer that lost the lock always finds out.
 *
 * There is no heartbeat. An owner is finished with when its process is gone,
 * which is a question the operating system answers exactly. A writer that is
 * merely slow, or paused, still owns its lock: nothing else may take it. That
 * is the difference from a timeout, which cannot tell "busy" from "dead" and
 * has to guess.
 *
 * scripts/upgrade.sh implements this same protocol so a deploy and the server
 * exclude each other. The file format below is the contract between them.
 */

export interface DataLockOwner {
  token: string;
  pid: number;
  /** Identifies the boot this lock was taken in; see bootId(). */
  boot: string;
  host: string;
  /** Milliseconds since the epoch at which the lock was taken. */
  at: number;
}

/** Only used by the derived form below, which drifts. Two boots this close
 * together do not happen. */
const BOOT_TOLERANCE_SECONDS = 30;

/** Tokens this process currently holds, so its own leftover records can be
 * told apart from a lock it is genuinely still using. */
const ourTokens = new Set<string>();

export class DataLockBusyError extends Error {
  readonly owner: DataLockOwner | null;
  constructor(owner: DataLockOwner | null) {
    super('The settings files are in use by another update.');
    this.name = 'DataLockBusyError';
    this.owner = owner;
  }
}

/**
 * Identifies the boot a lock was taken in, so a process id recorded before a
 * restart is never mistaken for a live one.
 *
 * Linux publishes an identifier that has nothing to do with the clock, which
 * is what a Raspberry Pi needs: it has no battery-backed clock, so its time
 * jumps by however far it was wrong the moment the network comes up, and a
 * boot time worked out from the clock jumps with it. Anywhere else, fall back
 * to deriving it and compare loosely.
 */
export function bootId(): string {
  try {
    const id = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    if (id) return id;
  } catch { /* not Linux, or not readable */ }
  return `t${Math.round(Date.now() / 1000 - os.uptime())}`;
}

function sameBoot(recorded: string): boolean {
  const mine = bootId();
  // A derived value on both sides is compared loosely; anything else is an
  // identifier and has to match exactly.
  if (!recorded.startsWith('t') || !mine.startsWith('t')) return recorded === mine;
  const delta = Math.abs(Number(recorded.slice(1)) - Number(mine.slice(1)));
  return Number.isFinite(delta) && delta <= BOOT_TOLERANCE_SECONDS;
}

function serialize(owner: DataLockOwner): string {
  return `token=${owner.token}\npid=${owner.pid}\nboot=${owner.boot}\nhost=${owner.host}\nat=${owner.at}\n`;
}

function parseOwner(text: string): DataLockOwner | null {
  const fields = new Map<string, string>();
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    if (at > 0) fields.set(line.slice(0, at), line.slice(at + 1));
  }
  const token = fields.get('token');
  const pid = Number(fields.get('pid'));
  const boot = fields.get('boot');
  const host = fields.get('host');
  const at = Number(fields.get('at'));
  if (!token || !host || !boot || !Number.isInteger(pid) || pid <= 0 || !Number.isFinite(at)) return null;
  return { token, pid, boot, host, at };
}

async function readOwner(lockPath: string): Promise<DataLockOwner | null | 'absent'> {
  let text: string;
  try { text = await fs.readFile(lockPath, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw error;
  }
  return parseOwner(text);
}

/**
 * Whether the lock is still someone's. Content nobody can be identified from
 * counts as finished with: only a writer that died mid-take leaves that, and a
 * lock nobody can identify would otherwise block every writer forever. A lock
 * that cannot be READ at all is a different matter and is reported as the
 * error it is, because retrying it would only hang.
 */
function stillOwned(owner: DataLockOwner | null): boolean {
  if (!owner) return false;
  // Deliberately nothing here compares the clock. A Raspberry Pi has no
  // battery-backed clock, so its time can jump hours the moment the network
  // comes up, and any rule that expired a lock on elapsed time would declare a
  // writer that is very much alive abandoned, mid-write. Whether a process
  // exists is a question with an exact answer, so that is the only one asked.
  // The cost is that a lock is never taken from a live process, which is the
  // whole point: it also means a writer releasing its own lock cannot have had
  // it taken in the meantime.
  if (owner.host !== os.hostname()) return true;
  if (!sameBoot(owner.boot)) return false;
  // Our own process id paired with a token we are not using is our own
  // leftover record, which no amount of asking the system will reveal: the
  // process is alive, it just is not using this lock any more. This is also
  // what keeps a reused process id from blocking writers for good.
  if (owner.pid === process.pid) return ourTokens.has(owner.token);
  try { process.kill(owner.pid, 0); return true; }
  // The owner exists but belongs to another account.
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Exposed so scripts/__tests__/deploy-coordination.test.ts can hold the shell
 * to exactly this rule. Not part of the lock's own interface. */
export function stillOwnedForTests(contents: string): boolean {
  return stillOwned(parseOwner(contents));
}

export interface DataLockHandle {
  readonly token: string;
  /** Rejects unless this process's token is the one at the lock path now. */
  assertOwned(): Promise<void>;
  /** Removes the lock, but only while it is still ours to remove. */
  release(): Promise<void>;
}

export class DataLockLostError extends Error {
  constructor() {
    super('This update no longer holds the settings lock.');
    this.name = 'DataLockLostError';
  }
}

function handleFor(lockPath: string, token: string): DataLockHandle {
  return {
    token,
    async assertOwned() {
      const current = await readOwner(lockPath);
      if (current === 'absent' || current === null || current.token !== token) throw new DataLockLostError();
    },
    async release() {
      // Never remove a lock that is no longer ours: it would belong to whoever
      // took it next, and pulling it out from under them lets a third writer in.
      const current = await readOwner(lockPath);
      // Dropped first: from here this process no longer counts this token as
      // one of its own, so its record can never outlive the release.
      ourTokens.delete(token);
      if (current !== 'absent' && current !== null && current.token === token) {
        await fs.unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    },
  };
}

export interface AcquireOptions {
  /** How long to wait for a live owner to finish before giving up. */
  waitMs: number;
  pollMs?: number;
}

/**
 * Takes the lock, waiting only while somebody else genuinely holds it.
 * Throws DataLockBusyError if the wait runs out; any other error is a real
 * filesystem problem and is reported as-is rather than retried into a hang.
 */
export async function acquireDataLock(lockPath: string, options: AcquireOptions): Promise<DataLockHandle> {
  const pollMs = options.pollMs ?? 100;
  const token = randomUUID();
  // Registered before the lock is even attempted, never after: between linking
  // the record and reading it back this process yields, and a contender that
  // looked in that gap would see our own process id against a token we had not
  // claimed yet and take the lock for abandoned.
  ourTokens.add(token);
  let granted = false;
  const staging = `${lockPath}.staging.${process.pid}.${randomUUID()}`;
  const mine: DataLockOwner = { token, pid: process.pid, boot: bootId(), host: os.hostname(), at: Date.now() };
  await fs.writeFile(staging, serialize(mine), { mode: 0o600 });
  const deadline = Date.now() + options.waitMs;
  let lastSeen: DataLockOwner | null = null;
  /**
   * Every way round this loop comes through here, so none of them can spin.
   * Several mean another contender is moving the same lock about, and retrying
   * those flat out would burn a core and starve the very work being waited on.
   */
  const pause = async () => {
    if (Date.now() >= deadline) throw new DataLockBusyError(lastSeen);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  };
  try {
    for (;;) {
      let linked = false;
      try {
        // The whole owner record appears at the lock path in one step, so a
        // contender never sees a lock it cannot identify.
        await fs.link(staging, lockPath);
        linked = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      if (linked) {
        // Read it back before handing it out. Another contender reclaiming
        // what it believed was an abandoned lock can move this one aside a
        // moment after it appears, and returning a lock this process does not
        // actually hold would put the burden on every later check.
        let claimed: Awaited<ReturnType<typeof readOwner>>;
        try { claimed = await readOwner(lockPath); }
        catch (error) {
          // The record is at the lock path under this process's own name, and
          // this process is alive, so leaving it there would shut every writer
          // out until this one exits. Take it back down before reporting.
          await handleFor(lockPath, token).release().catch(() => {});
          throw error;
        }
        if (claimed !== 'absent' && claimed !== null && claimed.token === token) {
          granted = true;
          return handleFor(lockPath, token);
        }
        await pause();
        continue;
      }
      const current = await readOwner(lockPath);
      if (current === 'absent') { await pause(); continue; }
      lastSeen = current;
      if (stillOwned(current)) { await pause(); continue; }
      // Finished with. Move it aside and drop it: the move either works or
      // reports the file already gone, so of several contenders exactly one
      // clears it and the rest simply try again.
      //
      // Judging it finished with and moving it are two steps, so this can just
      // occasionally take a lock somebody claimed in between. That is left to
      // stand rather than put back: whoever claimed it finds out at their next
      // ownership check and stops before writing anything, which is the
      // guarantee everything here rests on. Trying to undo it instead means
      // reinstating a record that may already have been released, and an owner
      // that has finished but is still named in the file blocks every writer
      // until the backstop expires.
      const discarded = `${lockPath}.abandoned.${randomUUID()}`;
      try { await fs.rename(lockPath, discarded); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await pause();
        continue;
      }
      await fs.unlink(discarded).catch(() => {});
    }
  } finally {
    if (!granted) ourTokens.delete(token);
    await fs.unlink(staging).catch(() => {});
  }
}

/**
 * Clears staging and set-aside files left beside the lock by writers that died
 * partway through taking or reclaiming it. Each one is tiny, but nothing else
 * ever removes them and they sit next to the release directory for good.
 *
 * Only ever run at startup, before this process takes the lock: the age limit
 * is far longer than taking the lock could possibly take, so it can never
 * remove a file another writer is in the middle of using.
 */
const LEFTOVER_AFTER_MS = 60 * 60 * 1000;

export async function sweepAbandonedLockFiles(lockPath: string): Promise<void> {
  const directory = path.dirname(lockPath);
  const prefix = `${path.basename(lockPath)}.`;
  let entries: string[];
  try { entries = await fs.readdir(directory); }
  catch { return; }
  for (const entry of entries) {
    // The trailing dot keeps the lock file itself out of this.
    if (!entry.startsWith(prefix)) continue;
    const rest = entry.slice(prefix.length);
    if (!rest.startsWith('staging.') && !rest.startsWith('abandoned.')) continue;
    const leftover = path.join(directory, entry);
    try {
      const stat = await fs.stat(leftover);
      if (Date.now() - stat.mtimeMs < LEFTOVER_AFTER_MS) continue;
      await fs.unlink(leftover);
    } catch { /* raced with another sweep, or not ours to remove */ }
  }
}
