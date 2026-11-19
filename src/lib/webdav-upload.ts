/**
 * Send a backup to a storage folder over WebDAV, the one off-site
 * destination built in. Nextcloud, Synology, QNAP, ownCloud and most home
 * storage boxes speak it. Only three plain requests are needed: PUT a file,
 * DELETE a file, and both with Basic sign-in. No folder listing and no XML,
 * so no dependency: the names to remove come from our own record of what we
 * sent.
 *
 * Plain `http`/`https` requests rather than `fetch`: the body streams from
 * disk with a real `Content-Length` (some servers refuse chunked uploads),
 * a redirect is never followed (the password must not follow one to
 * another host), and a stalled server is caught by an idle timeout rather
 * than a guess at how long a gigabyte should take.
 */
import http from 'http';
import https from 'https';
import { createReadStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import { TEST_FILE_NAME, TEST_FILE_TEXT, type WebdavDestination } from './storage-destination';
import type { OffsiteOutcome } from './auto-backup-state';

/** No bytes either way for this long and the storage is given up on. */
const IDLE_TIMEOUT_MS = 60_000;
/** The whole request may take this long plus a second per 256 KB. */
const BASE_TIMEOUT_MS = 2 * 60_000;
const BYTES_PER_SECOND_FLOOR = 256 * 1024;

export { TEST_FILE_NAME } from './storage-destination';

export type WebdavOutcome = OffsiteOutcome;

class RequestTimeout extends Error {
  constructor() {
    super('timed out');
    this.name = 'RequestTimeout';
  }
}

const CERTIFICATE_ERRORS = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** A status the storage answered, as an outcome. */
export function outcomeForStatus(status: number): WebdavOutcome {
  if (status >= 200 && status < 300) return { ok: true };
  const detail = `HTTP ${status}`;
  if (status === 401 || status === 403) return { ok: false, code: 'sign-in', detail };
  if (status === 404 || status === 409) return { ok: false, code: 'not-found', detail };
  if (status === 507) return { ok: false, code: 'no-room', detail };
  if (status === 413) return { ok: false, code: 'too-big', detail };
  if (status >= 300 && status < 400) return { ok: false, code: 'redirect', detail };
  return { ok: false, code: 'refused', detail };
}

/** A request that never got an answer, as an outcome. */
export function outcomeForError(err: unknown): WebdavOutcome {
  if (err instanceof RequestTimeout) return { ok: false, code: 'timeout', detail: 'timed out' };
  const code = (err as NodeJS.ErrnoException | null)?.code;
  const detail = err instanceof Error ? `${code ? `${code}: ` : ''}${err.message}` : String(err);
  if (code && CERTIFICATE_ERRORS.has(code)) return { ok: false, code: 'certificate', detail };
  return { ok: false, code: 'unreachable', detail };
}

/** The address of `name` inside the folder. */
export function fileUrl(folder: string, name: string): URL {
  const base = new URL(folder);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(encodeURIComponent(name), base);
}

interface Body {
  open: () => Readable;
  bytes: number;
}

/** One request; resolves with the status the storage answered. */
function send(method: 'PUT' | 'DELETE', target: URL, dest: WebdavDestination, body?: Body): Promise<number> {
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'https:' ? https : http;
    const headers: Record<string, string | number> = {
      Authorization: `Basic ${Buffer.from(`${dest.username}:${dest.password}`, 'utf8').toString('base64')}`,
      'User-Agent': 'HomeScreens',
    };
    if (method === 'PUT') {
      headers['Content-Type'] = 'application/octet-stream';
      headers['Content-Length'] = body?.bytes ?? 0;
    }
    const totalMs = BASE_TIMEOUT_MS + Math.ceil(((body?.bytes ?? 0) / BYTES_PER_SECOND_FLOOR) * 1000);
    let settled = false;
    let source: Readable | null = null;
    const req = client.request(target, { method, headers });
    const total = setTimeout(() => req.destroy(new RequestTimeout()), totalMs);
    // Every way the request ends closes the file being sent. A source left
    // paused after a failure keeps its descriptor open, and the hourly retry
    // would leak one per try.
    const stopSource = () => {
      if (source && !source.destroyed) {
        source.unpipe(req);
        source.destroy();
      }
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(total);
      stopSource();
      fn();
    };
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(new RequestTimeout()));
    req.on('response', (res) => {
      // An early answer (a refused sign-in) can arrive before the upload
      // finished; the rest of the file is not worth sending.
      res.resume();
      finish(() => resolve(res.statusCode ?? 0));
    });
    req.on('error', (err) => finish(() => reject(err)));
    if (body) {
      source = body.open();
      source.on('error', (err) => req.destroy(err));
      source.pipe(req);
    } else {
      req.end();
    }
  });
}

async function attempt(run: () => Promise<number>): Promise<WebdavOutcome> {
  try {
    return outcomeForStatus(await run());
  } catch (err) {
    return outcomeForError(err);
  }
}

/** Upload one file from disk under its own name. */
export async function uploadFile(dest: WebdavDestination, file: string, name: string): Promise<WebdavOutcome> {
  let bytes: number;
  try {
    bytes = (await fs.stat(file)).size;
  } catch (err) {
    return { ok: false, code: 'refused', detail: `local file: ${(err as Error).message}` };
  }
  return attempt(() => send('PUT', fileUrl(dest.url, name), dest, { open: () => createReadStream(file), bytes }));
}

/** Remove one file. Already gone counts as removed. */
export async function deleteFile(dest: WebdavDestination, name: string): Promise<WebdavOutcome> {
  return attempt(async () => {
    const status = await send('DELETE', fileUrl(dest.url, name), dest);
    return status === 404 ? 204 : status;
  });
}

/** "Check it works": save a small file and remove it again. */
export async function testDestination(dest: WebdavDestination): Promise<WebdavOutcome> {
  const text = Buffer.from(TEST_FILE_TEXT, 'utf8');
  const put = await attempt(() => send('PUT', fileUrl(dest.url, TEST_FILE_NAME), dest, {
    open: () => Readable.from([text]),
    bytes: text.length,
  }));
  if (!put.ok) return put;
  // A folder that takes files but will not let them go again still works
  // for backups; only its own keep-the-last would pile up, so say nothing.
  await deleteFile(dest, TEST_FILE_NAME);
  return { ok: true };
}
