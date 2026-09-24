import type { ChoreCompletion, ChoreGrab } from '@/types/config';
import { createJsonStore } from './json-store';

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

/**
 * Single store instance for data/chore-completions.json. Every reader and
 * writer (the /api/chores toggle route AND /api/backup restore) must go
 * through this module so they share one write queue — a raw fs write from
 * a second copy of this store would race the toggle route's updateAtomic
 * cycles and drop completions.
 */
const store = createJsonStore<CompletionsData>({
  path: 'data/chore-completions.json',
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

/** The lists every chore surface reads, as every chore route answers them. */
export function choreMarks(data: CompletionsData): Required<CompletionsData> {
  return { completions: data.completions, grabs: data.grabs ?? [], bonusResets: data.bonusResets ?? {} };
}
