import type { ChoreCompletion, ChoreGrab } from '@/types/config';
import { createJsonStore } from './json-store';
import { isRecord } from './member-references/contract';

export interface CompletionsData {
  /**
   * Chores done, one entry per person per day (see ChoreCompletion). Entries older than 90 days are
   * removed
   */
  completions: ChoreCompletion[];
  /** Up-for-grabs chores someone is holding (see ChoreGrab). Lapsed ones are ignored when read and dropped after 90 days */
  grabs?: ChoreGrab[];
  /** When a grown-up last put each "when I put it back" bonus chore back, by chore ID, as an ISO timestamp */
  bonusResets?: Record<string, string>;
}

/** Where the completions, grabs and put-backs live, relative to the data root. */
export const CHORE_COMPLETIONS_FILE = 'data/chore-completions.json';

/**
 * Single store instance for data/chore-completions.json. Every reader and
 * writer (the /api/chores toggle route AND /api/backup restore) must go
 * through this module so they share one write queue — a raw fs write from
 * a second copy of this store would race the toggle route's updateAtomic
 * cycles and drop completions.
 */
const store = createJsonStore<CompletionsData>({
  path: CHORE_COMPLETIONS_FILE,
  defaultValue: { completions: [] },
  errorHandling: 'throw-corrupt',
  backup: true,
});

export const readCompletions = store.read;
export const writeCompletions = store.write;
export const updateCompletionsAtomic = store.updateAtomic;

/**
 * Plan a toggle without publishing it, so the caller can commit it in the same
 * transaction as the reward points it moves. See `planUpdate` in json-store.
 */
export const planCompletionsUpdate = store.planUpdate;

/** A completion or a grab: the chore, the person and the day. */
const isMark = (entry: unknown): boolean => isRecord(entry)
  && typeof entry.choreId === 'string' && typeof entry.memberId === 'string' && typeof entry.date === 'string';

/**
 * Why a whole completions file cannot be written, or null. Only a backup
 * restore writes the file whole; the toggle route edits one entry at a time.
 */
export function validateCompletionsData(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw.completions)) return 'Chore history needs a list of what was done.';
  if (raw.completions.some((entry) => !isMark(entry))) return 'Each chore in the history needs the chore, the person and the day.';
  if (raw.grabs !== undefined && (!Array.isArray(raw.grabs) || raw.grabs.some((entry) => !isMark(entry)))) {
    return 'Each grabbed chore needs the chore, the person and the day.';
  }
  if (raw.bonusResets !== undefined && (!isRecord(raw.bonusResets) || Object.values(raw.bonusResets).some((at) => typeof at !== 'string'))) {
    return 'Each put-back needs the chore and the time it was put back.';
  }
  return null;
}

/** The lists every chore surface reads, as every chore route answers them. */
export function choreMarks(data: CompletionsData): Required<CompletionsData> {
  return { completions: data.completions, grabs: data.grabs ?? [], bonusResets: data.bonusResets ?? {} };
}
