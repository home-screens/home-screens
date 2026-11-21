import { readRemembered, remember } from '@/lib/device-memory';

/**
 * The author this phone last posted a note as, so a parent's second note is
 * two taps. Kept per phone: an empty string is a deliberate Nobody, a missing
 * key is no pick yet.
 */

const NOTES_AUTHOR_KEY = 'hs-remote-notes-author';

/** The remembered member id, or null for Nobody and for no pick yet. */
export function readRememberedAuthor(): string | null {
  return readRemembered(NOTES_AUTHOR_KEY) || null;
}

export function rememberAuthor(authorId: string | null): void {
  remember(NOTES_AUTHOR_KEY, authorId ?? '');
}
