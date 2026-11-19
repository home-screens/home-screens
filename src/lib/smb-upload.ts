/**
 * Send a backup to a network share (SMB), the second kind of storage folder.
 * The only file that imports `smb3-client`, a pure JavaScript client: no
 * mount, no system packages, nothing that can freeze the hub when the share
 * goes away.
 *
 * What this file works around, each seen against Samba and a UniFi UNAS:
 * - The library has a `requestTimeout` option it never uses, and its
 *   `close()` waits for answers, so a frozen server would hang a send
 *   forever. A watchdog here destroys the socket when nothing has moved for
 *   a minute or the whole send is past its limit; every pending call then
 *   fails with "connection closed".
 * - Reading a file over about 8 MB breaks the connection on Samba. Nothing
 *   here reads, and every call uses its own connection.
 * - A storage that only speaks SMB 1 hangs up while connecting, and many
 *   NAS boxes sign an unknown name in as a guest and hang up on its first
 *   look at the share. Both arrive as the same "connection closed", so the
 *   share is opened as a step of its own and the step decides the reason.
 * - `rename` will not replace a file, and `mkdir` makes one level at a time.
 */
import { createReadStream, promises as fs } from 'fs';
import type { Socket } from 'net';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Client, SmbAuthError, SmbError, SmbProtocolError } from 'smb3-client';
import { TEST_FILE_NAME, TEST_FILE_TEXT, type ShareDestination } from './storage-destination';
import type { OffsiteOutcome } from './auto-backup-state';
import { PARTIAL_SUFFIX } from './auto-backup-files';

/** Timings, as an object so a test can shorten them. */
export const SMB_LIMITS = {
  /** Finding the storage and opening a connection. */
  connectMs: 10_000,
  /** No progress for this long and the send is given up. */
  idleMs: 60_000,
  /** The whole call may take this long plus a second per 256 KB. */
  baseMs: 2 * 60_000,
  bytesPerSecondFloor: 256 * 1024,
  /** A polite goodbye to the server gets this long before the socket is closed anyway. */
  closeGraceMs: 3_000,
  watchMs: 1_000,
};

/** Which step a call had reached: the same error means different things at each. */
export type SmbPhase = 'connect' | 'share' | 'work';

export type ShareCheck = OffsiteOutcome & { shares?: string[] };

// By number: the library names only some statuses (quota exceeded comes
// back as a bare hex string).
const SIGN_IN_STATUSES = new Set([
  0xc000006d, // LOGON_FAILURE
  0xc000006a, // WRONG_PASSWORD
  0xc0000064, // NO_SUCH_USER
  0xc0000072, // ACCOUNT_DISABLED
  0xc0000234, // ACCOUNT_LOCKED_OUT
  0xc0000193, // ACCOUNT_EXPIRED
  0xc000006e, // ACCOUNT_RESTRICTION
  0xc0000071, // PASSWORD_EXPIRED
  0xc0000224, // PASSWORD_MUST_CHANGE
  0xc000006f, // INVALID_LOGON_HOURS
  0xc0000070, // INVALID_WORKSTATION
]);
const BAD_NETWORK_NAME = 0xc00000cc;
const NO_ROOM_STATUSES = new Set([
  0xc000007f, // DISK_FULL
  0xc0000044, // QUOTA_EXCEEDED
]);
const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EADDRNOTAVAIL']);

class SizeMismatch extends Error {
  constructor(written: number, expected: number) {
    super(`the share holds ${written} bytes of ${expected}`);
    this.name = 'SizeMismatch';
  }
}

function describe(err: unknown): string {
  if (err instanceof SmbError) return `${err.name} ${err.statusName}: ${err.message}`;
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (err instanceof Error) return `${code ? `${code}: ` : ''}${err.message}`;
  return String(err);
}

/** An error from the library, as an outcome, given the step it came from. */
export function outcomeForSmbError(err: unknown, phase: SmbPhase): OffsiteOutcome {
  const detail = describe(err);
  const fail = (code: Extract<OffsiteOutcome, { ok: false }>['code']): OffsiteOutcome => ({ ok: false, code, detail });
  if (err instanceof SmbAuthError) return fail('sign-in');
  if (err instanceof SmbProtocolError) {
    // The server hung up (see the top of this file).
    if (phase === 'connect') return fail('too-old');
    if (phase === 'share') return fail('sign-in');
    return fail('unreachable');
  }
  if (err instanceof SmbError) {
    if (SIGN_IN_STATUSES.has(err.status)) return fail('sign-in');
    if (err.status === BAD_NETWORK_NAME || err.code === 'ENXIO') return fail('share-not-found');
    if (err.code === 'EACCES') return fail('no-write');
    if (NO_ROOM_STATUSES.has(err.status) || err.code === 'ENOSPC') return fail('no-room');
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return fail('not-found');
    return fail('refused');
  }
  const code = (err as NodeJS.ErrnoException | null)?.code;
  if (code && UNREACHABLE_CODES.has(code)) return fail('unreachable');
  // The library's own limit on finding the storage.
  if (err instanceof Error && /connect timeout/i.test(err.message)) return fail('unreachable');
  return fail('refused');
}

/**
 * Close the connection without waiting for the server. `Client` keeps its
 * socket private and offers no way to abandon a request, so this reaches in;
 * the version is pinned and a test checks the path still leads to a socket.
 */
export function destroySocket(client: Client): boolean {
  const socket = (client as unknown as { conn?: { transport?: { socket?: Socket } } }).conn?.transport?.socket;
  if (!socket) return false;
  socket.destroy();
  return true;
}

async function capped<T>(work: Promise<T>, ms = SMB_LIMITS.closeGraceMs): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The host as a socket wants it. An IPv6 address is written in brackets in
 * an address (`smb://[fd00::20]/Backups`), and kept that way for showing and
 * comparing, but a socket given the brackets looks it up as a name and fails.
 */
export function connectHost(host: string): string {
  return /^\[.*\]$/.test(host) ? host.slice(1, -1) : host;
}

/** `share/folder/name`, the library's path for a file in the destination's folder. */
export function sharePath(dest: ShareDestination, name?: string): string {
  return [dest.share, ...dest.folder.split('/').filter(Boolean), ...(name ? [name] : [])].join('/');
}

interface Call {
  client: Client;
  /** Something moved: holds the idle limit off. */
  touch: () => void;
}

/**
 * One connection for one call, under the watchdog: connect, open the share,
 * do the work, then always close. `cleanup` runs on the same connection after
 * a failure in the work step while it can still be trusted.
 */
async function withShare(
  dest: ShareDestination,
  bytes: number,
  work: (call: Call) => Promise<OffsiteOutcome>,
  opts: { cleanup?: (client: Client) => Promise<unknown>; listShares?: boolean } = {},
): Promise<ShareCheck> {
  const client = new Client({
    host: connectHost(dest.host),
    ...(dest.port !== undefined ? { port: dest.port } : {}),
    username: dest.username,
    password: dest.password,
    ...(dest.domain ? { domain: dest.domain } : {}),
    connectTimeout: SMB_LIMITS.connectMs,
  });
  const started = Date.now();
  let last = started;
  let aborted = false;
  let phase: SmbPhase = 'connect';
  const touch = () => { last = Date.now(); };
  const totalMs = SMB_LIMITS.baseMs + Math.ceil(bytes / SMB_LIMITS.bytesPerSecondFloor) * 1000;
  const watchdog = setInterval(() => {
    const now = Date.now();
    if (now - last > SMB_LIMITS.idleMs || now - started > totalMs) {
      aborted = true;
      destroySocket(client);
    }
  }, SMB_LIMITS.watchMs);
  watchdog.unref?.();

  try {
    await client.connect();
    touch();
    phase = 'share';
    await client.stat(dest.share);
    touch();
    phase = 'work';
    return await work({ client, touch });
  } catch (err) {
    if (aborted) return { ok: false, code: 'timeout', detail: `timed out at ${phase}` };
    const outcome: ShareCheck = outcomeForSmbError(err, phase);
    if (opts.cleanup && phase === 'work' && !(err instanceof SmbProtocolError)) {
      await capped(opts.cleanup(client).catch(() => {}));
    }
    if (opts.listShares && !outcome.ok && outcome.code === 'share-not-found') {
      touch();
      const listed = await capped(client.listShares().catch(() => undefined), SMB_LIMITS.idleMs);
      if (listed) {
        outcome.shares = listed
          .filter((share) => share.type === 'disk' && !share.name.endsWith('$'))
          .map((share) => share.name)
          .sort((a, b) => a.localeCompare(b));
      }
    }
    return outcome;
  } finally {
    clearInterval(watchdog);
    await capped(client.close().catch(() => {}));
    destroySocket(client);
  }
}

/** Make each missing level of the folder inside the share. */
async function makeFolder(client: Client, dest: ShareDestination, touch: () => void): Promise<void> {
  let path = dest.share;
  for (const part of dest.folder.split('/').filter(Boolean)) {
    path += `/${part}`;
    try {
      await client.mkdir(path);
    } catch (err) {
      if (!(err instanceof SmbError && err.code === 'EEXIST')) throw err;
    }
    touch();
  }
}

/**
 * Upload one file from disk under its own name. It is written as
 * `<name>.partial` and renamed once all of it has arrived, so a send that
 * was cut off never looks like a whole backup.
 */
export async function uploadFile(dest: ShareDestination, file: string, name: string): Promise<OffsiteOutcome> {
  let bytes: number;
  try {
    bytes = (await fs.stat(file)).size;
  } catch (err) {
    return { ok: false, code: 'refused', detail: `local file: ${(err as Error).message}` };
  }
  const target = sharePath(dest, name);
  const partial = target + PARTIAL_SUFFIX;
  return withShare(dest, bytes, async ({ client, touch }) => {
    await makeFolder(client, dest, touch);
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        touch();
        callback(null, chunk);
      },
    });
    await pipeline(createReadStream(file), progress, client.createWriteStream(partial));
    touch();
    const written = Number((await client.stat(partial)).size);
    if (written !== bytes) throw new SizeMismatch(written, bytes);
    try {
      await client.rename(partial, target);
    } catch (err) {
      // A copy by this name is there already: sent before by a run that
      // stopped before it could write that down.
      if (!(err instanceof SmbError && err.code === 'EEXIST')) throw err;
      await client.rm(target);
      await client.rename(partial, target);
    }
    return { ok: true };
  }, { cleanup: (client) => client.rm(partial) });
}

/** Remove one file, and any half-sent copy of it. Already gone counts as removed. */
export async function deleteFile(dest: ShareDestination, name: string): Promise<OffsiteOutcome> {
  return withShare(dest, 0, async ({ client }) => {
    try {
      await client.rm(sharePath(dest, name));
    } catch (err) {
      if (!(err instanceof SmbError && err.code === 'ENOENT')) throw err;
    }
    await client.rm(sharePath(dest, name) + PARTIAL_SUFFIX).catch(() => {});
    return { ok: true };
  });
}

/**
 * "Check it works": make the folder, save a small file and remove it again.
 * When the share is not there, the answer carries the shares the storage
 * does have, so the form can offer them.
 */
export async function testDestination(dest: ShareDestination): Promise<ShareCheck> {
  return withShare(dest, 0, async ({ client, touch }) => {
    await makeFolder(client, dest, touch);
    const test = sharePath(dest, TEST_FILE_NAME);
    await client.writeFile(test, TEST_FILE_TEXT);
    touch();
    // A share that takes files but will not let them go still works for
    // backups; only its own keep-the-last would pile up, so say nothing.
    await client.rm(test).catch(() => {});
    return { ok: true };
  }, { listShares: true });
}
