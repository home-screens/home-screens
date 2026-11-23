import { insertInListOrder } from '@/lib/calendar-sources';
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

/**
 * `source` saved where its account's own list puts it (`listedUrls` in
 * Apple's order, then the birthdays), so a calendar ticked again goes back to
 * its place in every list instead of the bottom.
 *
 * An id is saved once: a calendar already kept under this id, left behind by
 * an account that was removed and added again, is taken over rather than
 * kept beside the new one. Two sources with one id put every event of that
 * calendar on the wall twice.
 */
export function withICloudSource(sources: readonly ICloudSource[], source: ICloudSource, listedUrls: readonly string[]): ICloudSource[] {
  const others = sources.filter((s) => s.id !== source.id);
  return insertInListOrder(others, source, (s) => {
    if (s.accountId !== source.accountId) return -1;
    return s.kind === 'birthdays' ? listedUrls.length : listedUrls.indexOf(s.url);
  });
}

/**
 * The saved calendars that belong to `account` but are kept under another
 * account id, handed to it. An Apple ID added again gets a new account id
 * while its calendars' ids stay the same (they come from the Apple ID), so
 * the id alone says whose they are. Calendars saved before ids worked that
 * way carry random ids and are left alone. Answers `sources` itself when
 * nothing moves.
 */
export function adoptICloudSources(sources: ICloudSource[], account: { id: string; appleId: string }): ICloudSource[] {
  const theirs = (s: ICloudSource) => s.accountId !== account.id && s.id === icloudSourceId(account.appleId, s.kind, s.url);
  return sources.some(theirs) ? sources.map((s) => (theirs(s) ? { ...s, accountId: account.id } : s)) : sources;
}

/** The saved calendars whose account is not among `accountIds`: nothing can fetch them, and no account's list shows them. */
export function orphanedICloudSources(sources: readonly ICloudSource[], accountIds: readonly string[]): ICloudSource[] {
  return sources.filter((s) => !accountIds.includes(s.accountId));
}
