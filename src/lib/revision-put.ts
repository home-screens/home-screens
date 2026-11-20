import { RefusalError } from './refusal';

/**
 * The hub's half of saving a whole list against a revision (chores, rewards,
 * routines, the meal arrays). A save quotes the revision of the copy it was
 * built from; one built from an older copy is answered 409 with the copy the
 * hub holds now, so the surface can show it, or make its change again on top
 * of it, where a plain overwrite would have dropped whatever another phone
 * just saved. `sendRevisionedSave` in `hub-request.ts` is the other half.
 *
 * Both answers are refusals with a code under the store's own name
 * (`chores.reload`, `chores.revision`), thrown for the route wrapper to
 * answer. Each route keeps its own comparison, because where it happens
 * differs: inside the family transaction for chores and rewards, inside the
 * store's write queue for routines and meals.
 */

/** The revision a save quoted. A save with none is refused: it cannot be told from one built on an old copy. */
export function requireRevision(revision: unknown, domain: string, sentence = 'Reload the page and try again.'): string {
  if (typeof revision !== 'string' || !revision) throw new RefusalError(400, `${domain}.reload`, sentence);
  return revision;
}

/**
 * The refusal for a save built from an older copy. `theirs` is the copy the
 * hub holds now with its revision, spread into the answer beside
 * `reason: 'revision'`, which is what every client tells this 409 from any
 * other by.
 */
export function revisionConflict(domain: string, sentence: string, theirs: Record<string, unknown>): RefusalError {
  return new RefusalError(409, `${domain}.revision`, sentence, { extra: { ...theirs, reason: 'revision' } });
}
