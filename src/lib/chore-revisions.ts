import { CHORES_FILE } from './chore-data';
import { CHORE_COMPLETIONS_FILE } from './chore-completion-data';
import { fileEtag } from './file-etag';
import { REWARDS_FILE } from './reward-data';
import { FAMILY_FILE_PATH } from './constants';

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

/** The ETag `GET /api/chores` answers with on the household's `today`, whatever its `days`. */
export function choresEtag(today: string): Promise<string> {
  return fileEtag([CHORES_FILE, CHORE_COMPLETIONS_FILE], today);
}

/**
 * The ETag of `GET /api/chores?chores=1`, the read the phone and the kids'
 * page make. That answer carries the family too, so a change to the family
 * alone has to be a new answer.
 */
export function choresPageEtag(today: string): Promise<string> {
  return fileEtag([CHORES_FILE, CHORE_COMPLETIONS_FILE, FAMILY_FILE_PATH], today);
}

/** The ETag `GET /api/rewards` answers with on the household's `today`. */
export function rewardsEtag(today: string): Promise<string> {
  return fileEtag([REWARDS_FILE], today);
}
