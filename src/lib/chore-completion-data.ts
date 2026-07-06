import type { ChoreCompletion } from '@/types/config';
import { createJsonStore } from './json-store';

export interface CompletionsData {
  completions: ChoreCompletion[];
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
});

export const readCompletions = store.read;
export const writeCompletions = store.write;
export const updateCompletionsAtomic = store.updateAtomic;
