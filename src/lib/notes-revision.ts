import { fileEtag } from './file-etag';
import { NOTES_FILE } from './notes-data';

/**
 * The ETag `GET /api/notes` answers with, worked out from the file's
 * identity and the running build, never from the answer. The heartbeat
 * hands the same value to every wall, so a wall fetches the board only when
 * a phone changed it; a note that merely expires needs no fetch, because
 * every answer carries `expiresAt` and the wall retires notes on its own
 * clock.
 */
export function notesEtag(): Promise<string> {
  return fileEtag([NOTES_FILE]);
}
