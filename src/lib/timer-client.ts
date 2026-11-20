import { sendRevisionedSave, type HubFetch, type RevisionedSave } from './hub-request';
import type { Routine } from '@/types/timers';

/** What `GET /api/timers/routines` and every save of the list answer with: the routines and the revision the next save quotes. */
export interface RoutineSnapshot {
  routines: Routine[];
  revision: string;
}

export const ROUTINES_URL = '/api/timers/routines';

/** The snapshot in an answer, or null when the body is not one: a broken read is never an empty list. */
export function asRoutineSnapshot(json: unknown): RoutineSnapshot | null {
  const d = json as { routines?: unknown; revision?: unknown } | null;
  if (!d || !Array.isArray(d.routines) || typeof d.revision !== 'string' || !d.revision) return null;
  return { routines: d.routines as Routine[], revision: d.revision };
}

/**
 * Save the whole routine list, quoting the revision of the copy it was built
 * from. A list another phone saved meanwhile comes back as a conflict with
 * that list; what to do about it (the Timers tab makes its change again on
 * top) is the caller's.
 */
export function saveRoutineList(fetcher: HubFetch, routines: Routine[], revision: string | null, fallback: string): Promise<RevisionedSave<RoutineSnapshot>> {
  return sendRevisionedSave(fetcher, { url: ROUTINES_URL, method: 'PUT', body: { routines, revision } }, asRoutineSnapshot, fallback);
}
