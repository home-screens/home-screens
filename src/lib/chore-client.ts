import type { ChoreDefinition, ChoreSettings } from '@/types/config';
import { readChoreSettings } from './chore-bonus';

/**
 * What `GET /api/chores/data` (and the server-rendered phone pages) hand out:
 * the stored chores plus the revision a whole-list save has to quote back.
 * A save built from an older copy comes back as a 409 carrying this same
 * shape with `reason: 'revision'`.
 */
export interface ChoreSnapshot {
  chores: ChoreDefinition[];
  /** Household chore settings, saved on their own (`PUT /api/chores/settings`). */
  settings: ChoreSettings;
  revision: string;
  /** The household's day when the page was drawn on the hub, so its first paint shows the same day as the hub. */
  today?: string;
}

/**
 * The snapshot in a response body, or null when the body is not one. A
 * surface adopts a snapshot as already-saved state, so a malformed reload
 * (no list, no revision to quote) must be treated as a failed reload rather
 * than as an empty, saved list.
 */
export function asChoreSnapshot(json: unknown): ChoreSnapshot | null {
  const d = json as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  if (!Array.isArray(d.chores) || typeof d.revision !== 'string' || !d.revision) return null;
  return { chores: d.chores as ChoreDefinition[], settings: readChoreSettings(d.settings), revision: d.revision };
}

/** `editorFetch` on the editor and phone; the wall never writes chores. */
export type ChoreFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type ChoreSaveOutcome =
  | { kind: 'saved'; snapshot: ChoreSnapshot }
  /** Somebody else saved first; `snapshot` is their list, already adopted. */
  | { kind: 'conflict'; snapshot: ChoreSnapshot }
  /** A conflict was adopted after this save was queued; its list is stale and was not sent. */
  | { kind: 'superseded' };

/**
 * One surface's saves of the whole chore list, in order.
 *
 * The auto-save is debounced, not serialized: a second edit made while the
 * first save is still out would quote the same revision, conflict, and have
 * its newer list replaced by the first save's answer. Saves queue here, each
 * sent with the revision the previous one was answered with. A save queued
 * before a conflict was adopted carries a list built from the old copy, so it
 * is dropped rather than sent over the adopted one.
 */
export class ChoreSession {
  private revision: string | null;
  private tail: Promise<unknown> = Promise.resolve();
  private conflicts = 0;

  constructor(private readonly fetcher: ChoreFetch, initial?: ChoreSnapshot) {
    this.revision = initial?.revision ?? null;
  }

  /** A list the hub handed over (a load, a reload, or a conflict's copy). */
  adopt(snapshot: ChoreSnapshot): void {
    this.revision = snapshot.revision;
  }

  save(chores: ChoreDefinition[], force: boolean): Promise<ChoreSaveOutcome> {
    const conflictsBefore = this.conflicts;
    const run = this.tail.then(async (): Promise<ChoreSaveOutcome> => {
      if (this.conflicts !== conflictsBefore) return { kind: 'superseded' };
      const res = await this.fetcher('/api/chores/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chores, force, revision: this.revision }),
      });
      const json: unknown = await res.json().catch(() => null);
      const theirs = res.status === 409 && (json as { reason?: unknown } | null)?.reason === 'revision'
        ? asChoreSnapshot(json)
        : null;
      if (theirs) {
        this.conflicts += 1;
        this.adopt(theirs);
        return { kind: 'conflict', snapshot: theirs };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = asChoreSnapshot(json);
      if (!saved) throw new Error('Malformed chore data');
      this.revision = saved.revision;
      return { kind: 'saved', snapshot: saved };
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}
