import { sendRevisionedSave, type HubFetch } from './hub-request';

export type RevisionSaveOutcome<S> =
  | { kind: 'saved'; snapshot: S }
  /** Somebody else saved first; `snapshot` is their copy, already adopted. */
  | { kind: 'conflict'; snapshot: S }
  /** A conflict was adopted after this save was queued; its list is stale and was not sent. */
  | { kind: 'superseded' };

export interface RevisionSessionOptions<T, S> {
  url: string;
  /** The body of one save: the list, the revision it quotes and whether an empty list is meant. */
  body: (value: T, revision: string | null, force: boolean) => unknown;
  /** The copy in an answer, or null when the answer is not one. */
  parse: (json: unknown) => S | null;
}

/**
 * One surface's saves of a whole list, in order (chores, rewards).
 *
 * A second edit made while the first save is still out would quote the same
 * revision, conflict, and be told somebody else changed the list when nobody
 * did. Saves queue here, each sent with the revision the previous one was
 * answered with. A save queued before a conflict was adopted carries a list
 * built from the old copy, so it is dropped rather than sent over the adopted
 * one.
 */
export class RevisionSession<T, S extends { revision: string }> {
  private revision: string | null;
  private tail: Promise<unknown> = Promise.resolve();
  private conflicts = 0;

  constructor(
    private readonly fetcher: HubFetch,
    private readonly options: RevisionSessionOptions<T, S>,
    initial?: { revision: string } | null,
  ) {
    this.revision = initial?.revision || null;
  }

  /** The revision of the list this surface last received or saved. */
  get currentRevision(): string | null {
    return this.revision;
  }

  /** A list the hub handed over (a load, a reload, or a conflict's copy). */
  adopt(snapshot: { revision: string }): void {
    this.revision = snapshot.revision;
  }

  /**
   * Save the list. A refusal rejects with the hub's own refusal (someone in
   * the list was removed, say), else `fallback`; a conflict that came back
   * without the hub's copy rejects the same way. A hub out of reach and an
   * expired session reject as themselves.
   */
  save(value: T, force: boolean, fallback: string): Promise<RevisionSaveOutcome<S>> {
    const conflictsBefore = this.conflicts;
    const run = this.tail.then(async (): Promise<RevisionSaveOutcome<S>> => {
      if (this.conflicts !== conflictsBefore) return { kind: 'superseded' };
      const { url, body, parse } = this.options;
      const outcome = await sendRevisionedSave(this.fetcher, { url, method: 'PUT', body: body(value, this.revision, force) }, parse, fallback);
      if (outcome.kind === 'conflict') {
        if (!outcome.snapshot) throw new Error(fallback);
        this.conflicts += 1;
        this.adopt(outcome.snapshot);
        return { kind: 'conflict', snapshot: outcome.snapshot };
      }
      this.revision = outcome.snapshot.revision;
      return outcome;
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}
