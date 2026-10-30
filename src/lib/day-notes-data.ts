import { createJsonStore } from './json-store';
import { withDataTransaction } from './data-transaction';
import { householdToday } from './household-day';
import { sweepDayNotes } from './day-notes';
import type { DayNotesData } from '@/types/day-notes';

/**
 * Calendar day notes: `data/day-notes.json`.
 *
 * Household data like the notes board: the phone writes it, every calendar
 * on every wall reads it. Writes go through the data transaction so a backup
 * restore can never interleave with one.
 */

export const DAY_NOTES_FILE = 'data/day-notes.json';

const EMPTY: DayNotesData = { notes: [] };

const store = createJsonStore<DayNotesData>({
  path: DAY_NOTES_FILE,
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

export { DayNotesError, validateDayNotesData } from './day-notes';

/** Every kept note, as stored. Reads never write; the sweep waits for the next write. */
export function readDayNotesData(): Promise<DayNotesData> {
  return withDataTransaction(() => store.read());
}

/**
 * Atomic read-modify-write. The sweep runs on the mutator's input against
 * the household's today, so a write also tidies away notes whose day is long
 * gone; a mutator returning its input unchanged skips the disk.
 */
export function updateDayNotesData(
  mutator: (current: DayNotesData, today: string) => DayNotesData,
): Promise<DayNotesData> {
  return withDataTransaction(async () => {
    const today = await householdToday();
    return store.updateAtomic((current) => {
      const swept = sweepDayNotes(current, today);
      const result = mutator(swept, today);
      if (result === swept && swept === current) return current;
      return result;
    });
  });
}
