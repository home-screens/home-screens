/**
 * The author this phone last posted a note as, so a parent's second note is
 * two taps. Kept per phone in `localStorage`: an empty string is a deliberate
 * Nobody, a missing key is no pick yet. Private mode or blocked storage just
 * means nothing is remembered.
 */

const NOTES_AUTHOR_KEY = 'hs-remote-notes-author';

/** The remembered member id, or null for Nobody and for no pick yet. */
export function readRememberedAuthor(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(NOTES_AUTHOR_KEY) || null;
  } catch {
    return null;
  }
}

export function rememberAuthor(authorId: string | null): void {
  try {
    window.localStorage.setItem(NOTES_AUTHOR_KEY, authorId ?? '');
  } catch {
    /* private mode: the pick just does not stick */
  }
}
