import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { readBuildId } from './build-id';
import { CHORES_FILE } from './chore-data';
import { CHORE_COMPLETIONS_FILE } from './chore-completion-data';
import { getDataRoot } from './data-transaction';
import { REWARDS_FILE } from './reward-data';

/**
 * The ETags of `GET /api/chores` and `GET /api/rewards`, worked out without
 * reading either answer.
 *
 * Chore screens ask these two every few seconds and the answers change a few
 * times a day, so a revision has to be cheap to get: it comes from the
 * files' identity (every store write lands through a rename, so each write is
 * a new inode, size or mtime), the household's day (the chores answer drops
 * lapsed grabs and old history by it, the rewards answer old redemptions)
 * and the running build (an upgrade can change what the same files answer).
 * The heartbeat hands the same values to walls, so a wall fetches either list
 * only when it changed.
 */

async function fileSignature(relative: string): Promise<string> {
  try {
    const stat = await fs.stat(path.join(getDataRoot(), relative));
    return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function revisionOf(files: readonly string[], today: string): Promise<string> {
  const parts = await Promise.all([readBuildId(), ...files.map(fileSignature)]);
  const hash = createHash('sha256').update([today, ...parts].join('|')).digest('hex').slice(0, 24);
  return `"${hash}"`;
}

/** The ETag `GET /api/chores` answers with on the household's `today`, whatever its `days`. */
export function choresEtag(today: string): Promise<string> {
  return revisionOf([CHORES_FILE, CHORE_COMPLETIONS_FILE], today);
}

/** The ETag `GET /api/rewards` answers with on the household's `today`. */
export function rewardsEtag(today: string): Promise<string> {
  return revisionOf([REWARDS_FILE], today);
}

/**
 * Headers for an answer a browser may keep but must check before every reuse.
 * Browsers then send the ETag back on their own, and an unchanged answer is a
 * bodiless 304 that `fetch` still hands the page as the kept 200.
 */
export function revalidatedHeaders(etag: string): Record<string, string> {
  return { ETag: etag, 'Cache-Control': 'no-cache' };
}

/** Whether the request already holds the answer `etag` names. */
export function holdsEtag(request: Request, etag: string): boolean {
  return request.headers.get('if-none-match') === etag;
}
