import type { ChoreCompletion, ChoreDefinition, ChoreGrab, ChoreSettings, ChoreToggleRequest, ChoreToggleResponse } from '@/types/config';
import { readChoreSettings, type BonusRefusal } from './chore-bonus';
import { choreGrabUrl, choreToggleUrl } from './fetch-keys';
import { readJson, refusalMessage } from './hub-request';

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

/** `editorFetch` on the editor and phone, `displayFetch` on the wall. */
export type ChoreFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The lists every chore write answers with: ticks, who is holding which bonus chore, and when each was last put back. */
export interface ChoreMarks {
  completions: ChoreCompletion[];
  grabs?: ChoreGrab[];
  bonusResets?: Record<string, string>;
}

/**
 * The lists in a chore write's answer and nothing else it carries (rewards,
 * `changed`), or null when the body has no lists (an older hub, a broken body).
 */
export function choreMarksOf(body: unknown): ChoreMarks | null {
  const b = body as Partial<ChoreMarks> | null;
  if (!b || typeof b !== 'object' || !Array.isArray(b.completions)) return null;
  return {
    completions: b.completions,
    ...(Array.isArray(b.grabs) ? { grabs: b.grabs } : {}),
    ...(b.bonusResets && typeof b.bonusResets === 'object' ? { bonusResets: b.bonusResets } : {}),
  };
}

/**
 * What a tick, a grab, a "not today" or a put-back came to. The phone and the
 * wall answer each case the same way: a refusal shows the lists its answer
 * carries, and when it carries none, or the hub could not be reached, the
 * screen goes back to what it had and the next poll shows the truth.
 */
export type ChoreWriteOutcome =
  /**
   * The hub took it. `changed` is false when it had nothing to do (already
   * done this time round). `answer` carries the lists after the write and
   * whatever else the route said: rewards moved, an overspent balance.
   */
  | { ok: true; changed: boolean; answer: ChoreToggleResponse }
  /**
   * The hub refused: a bonus chore someone else has, or that is not open to
   * this person. `refusal` says why and `memberId` who got there first;
   * `marks` is where the lists stand, when the answer carried them.
   */
  | { ok: false; refused: true; refusal?: BonusRefusal; memberId?: string; marks: ChoreMarks | null }
  /**
   * Nothing was saved: the hub could not be reached, answered with an error,
   * or with a body no screen can show. `error` is what the fetcher threw, so
   * the phone can tell an expired session (already on its way to sign-in)
   * from a hub out of reach.
   */
  | { ok: false; refused: false; refusal?: undefined; memberId?: undefined; error?: unknown };

/** A write to the lists besides a tick: grab or let go, "not today" for some people, put a bonus chore back. */
export type ChoreMarksWrite =
  | { kind: 'grab'; choreId: string; memberId: string; action: 'grab' | 'let-go' }
  | { kind: 'skip'; choreId: string; memberIds: string[]; date: string; skipped: boolean }
  | { kind: 'put-back'; choreId: string };

// Grabs are read-cached under their key; the other two are phone-only writes
// with no key in the registry.
const MARKS_URL: Record<ChoreMarksWrite['kind'], string> = {
  grab: choreGrabUrl(),
  skip: '/api/chores/skip',
  'put-back': '/api/chores/put-back',
};

async function sendChoreWrite(fetcher: ChoreFetch, url: string, body: unknown): Promise<ChoreWriteOutcome> {
  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await readJson(res) as (Partial<ChoreToggleResponse> & { reason?: BonusRefusal; memberId?: string }) | null;
    if (res.status === 409) {
      return { ok: false, refused: true, refusal: json?.reason, memberId: json?.memberId, marks: choreMarksOf(json) };
    }
    const marks = res.ok ? choreMarksOf(json) : null;
    if (!marks) return { ok: false, refused: false };
    return { ok: true, changed: json?.changed !== false, answer: { ...json, ...marks } as ChoreToggleResponse };
  } catch (error) {
    return { ok: false, refused: false, error };
  }
}

/** Tick or un-tick a chore for someone on a day. `direction` makes the write idempotent (see `planChoreToggle`). */
export function postChoreToggle(fetcher: ChoreFetch, request: ChoreToggleRequest): Promise<ChoreWriteOutcome> {
  return sendChoreWrite(fetcher, choreToggleUrl(), request);
}

/** Send one of the other writes to the lists. Every one answers with the lists, like a tick. */
export function postChoreMarks(fetcher: ChoreFetch, write: ChoreMarksWrite): Promise<ChoreWriteOutcome> {
  const { kind, ...body } = write;
  return sendChoreWrite(fetcher, MARKS_URL[kind], body);
}

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

  /** The revision of the list this surface last received or saved. */
  get currentRevision(): string | null {
    return this.revision;
  }

  /** A list the hub handed over (a load, a reload, or a conflict's copy). */
  adopt(snapshot: ChoreSnapshot): void {
    this.revision = snapshot.revision;
  }

  /**
   * Save the list. A refusal rejects with the hub's own sentence (someone in
   * the list was removed, say), else `fallback`; a hub out of reach and an
   * expired session reject as themselves.
   */
  save(chores: ChoreDefinition[], force: boolean, fallback: string): Promise<ChoreSaveOutcome> {
    const conflictsBefore = this.conflicts;
    const run = this.tail.then(async (): Promise<ChoreSaveOutcome> => {
      if (this.conflicts !== conflictsBefore) return { kind: 'superseded' };
      const res = await this.fetcher('/api/chores/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chores, force, revision: this.revision }),
      });
      const json = await readJson(res);
      const theirs = res.status === 409 && (json as { reason?: unknown } | null)?.reason === 'revision'
        ? asChoreSnapshot(json)
        : null;
      if (theirs) {
        this.conflicts += 1;
        this.adopt(theirs);
        return { kind: 'conflict', snapshot: theirs };
      }
      const saved = res.ok ? asChoreSnapshot(json) : null;
      if (!saved) throw new Error(refusalMessage(json, fallback));
      this.revision = saved.revision;
      return { kind: 'saved', snapshot: saved };
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}
