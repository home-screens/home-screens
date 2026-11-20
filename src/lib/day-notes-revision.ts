import { fileEtag } from './file-etag';
import { DAY_NOTES_FILE } from './day-notes-data';

/**
 * The ETag `GET /api/day-notes` answers with, worked out from the file's
 * identity and the running build, never from the answer. The heartbeat hands
 * the same value to every wall, so a calendar fetches day notes only when a
 * phone changed them.
 */
export function dayNotesEtag(): Promise<string> {
  return fileEtag([DAY_NOTES_FILE]);
}
