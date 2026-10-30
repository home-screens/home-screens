import { createHash } from 'crypto';
import { readBuildId } from './build-id';
import { fileSignature } from './file-signature';
import { DAY_NOTES_FILE } from './day-notes-data';

/**
 * The ETag `GET /api/day-notes` answers with, worked out from the file's
 * identity and the running build, never from the answer. The heartbeat hands
 * the same value to every wall, so a calendar fetches day notes only when a
 * phone changed them.
 */
export async function dayNotesEtag(): Promise<string> {
  const [build, file] = await Promise.all([readBuildId(), fileSignature(DAY_NOTES_FILE)]);
  const hash = createHash('sha256').update([build, file].join('|')).digest('hex').slice(0, 24);
  return `"${hash}"`;
}
