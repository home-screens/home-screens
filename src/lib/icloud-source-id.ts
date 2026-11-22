import type { ICloudSource } from '@/types/config';

/** FNV-1a over UTF-16 code units, from a given start, as an unsigned 32-bit number. */
function fnv1a(text: string, start: number): number {
  let hash = start >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The id an iCloud calendar is kept under, the same every time it is
 * ticked: worked out from the Apple ID, the kind and the calendar's address.
 * A random id made a calendar ticked again a new calendar to everything that
 * names it by id, so it lost its own name and colour and dropped out of the
 * calendars new events may go on. Removing the account and adding it again
 * gives the same ids back too, because the Apple ID is the same.
 *
 * Sixteen hex digits from two passes with different starts; one household's
 * few calendars never meet.
 */
export function icloudSourceId(appleId: string, kind: ICloudSource['kind'], url: string): string {
  const key = `${appleId.trim().toLowerCase()}\n${kind}\n${kind === 'birthdays' ? '' : url}`;
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `icloud-${hex(fnv1a(key, 0x811c9dc5))}${hex(fnv1a(key, 0x050c5d1f))}`;
}
