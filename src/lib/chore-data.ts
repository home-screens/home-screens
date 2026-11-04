import type { ChoreDefinition, ChoreSettings } from '@/types/config';
import { createJsonStore } from './json-store';
import { settleFamilyMigration } from './family-data';
import { withDataTransaction } from './data-transaction';
import { contentRevision } from './content-revision';
import { isValidBonus, readChoreSettings } from './chore-bonus';
import { householdToday } from './household-day';
import { isRecord } from './member-references/contract';
import type { ChoreSnapshot } from './chore-client';

export interface ChoreData {
  /** Chore definitions (see ChoreDefinition) */
  chores: ChoreDefinition[];
  /** Household chore settings (see ChoreSettings). Missing = the defaults */
  settings?: ChoreSettings;
}

const EMPTY: ChoreData = { chores: [] };

/** Where the chores and household chore settings live, relative to the data root. */
export const CHORES_FILE = 'data/chores.json';

const store = createJsonStore<ChoreData>({
  path: CHORES_FILE,
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === 'string');

/** A schedule grid: each person or group id to the days (0 to 6) they have the chore. */
const dayRows = (value: unknown): boolean => value === undefined || (isRecord(value)
  && Object.values(value).every((days) => Array.isArray(days) && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)));

/**
 * Why a chore list cannot be written, or null when every chore is well
 * formed. The chore save and a backup restore both ask this, so a restored
 * list is one every later save would accept too.
 */
export function validateChoreList(chores: unknown): string | null {
  if (!Array.isArray(chores)) return 'Chore data needs a list of chores.';
  for (const chore of chores) {
    if (!isRecord(chore) || typeof chore.id !== 'string' || !chore.id) return 'Each chore needs an id.';
    if (!stringList(chore.assigneeIds) || (chore.assigneeGroupIds !== undefined && !stringList(chore.assigneeGroupIds))) {
      return 'Each chore needs a list of who it goes to.';
    }
    // A group's row only counts through `assigneeGroupIds`: that list is what
    // removing a group, the chore counts and the chore lists all read. A
    // bonus chore keeps its regular schedule untouched while it is a bonus
    // chore (who can do it is picked apart from it), so the rows only have to
    // match the named groups on a regular chore.
    const groups = chore.assigneeGroupIds as string[] | undefined;
    if (!dayRows(chore.schedule) || !dayRows(chore.groupSchedule)
      || (!chore.bonus && Object.keys(chore.groupSchedule ?? {}).some((id) => !groups?.includes(id)))) {
      return 'A chore schedule needs days for each person or group on it.';
    }
    if (chore.points !== undefined && (typeof chore.points !== 'number' || !Number.isFinite(chore.points) || chore.points < 0)) {
      return 'Tickets for a chore must be 0 or more.';
    }
    if (!isValidBonus(chore.bonus)) return 'A bonus chore needs a kind and a time it comes back.';
  }
  return null;
}

/** Why a whole chores file cannot be written, or null. The settings are filled in on read, so only the list is checked. */
export function validateChoreData(raw: unknown): string | null {
  if (!isRecord(raw)) return 'Chore data needs a list of chores.';
  return validateChoreList(raw.chores);
}

/** The saved chores and settings; settings are filled with the defaults where missing. */
export function readChoreData(): Promise<ChoreData & { settings: ChoreSettings }> {
  return withDataTransaction(async () => {
    await settleFamilyMigration();
    const data = await store.read();
    return { chores: data.chores, settings: readChoreSettings(data.settings) };
  });
}

/** Replace the chore list, keeping the household settings saved beside it. */
export function writeChoreList(chores: ChoreDefinition[]): Promise<ChoreData> {
  return store.updateAtomic((data) => ({ ...data, chores }));
}

/** Replace the household chore settings, keeping the chores. */
export function writeChoreSettings(settings: ChoreSettings): Promise<ChoreData> {
  return store.updateAtomic((data) => ({ ...data, settings }));
}

/**
 * What `GET /api/chores/data` and the server-rendered phone pages hand out.
 * The revision covers the chore list only: saving the settings must not make
 * a phone's next chore save look stale.
 */
export async function readChoreSnapshot(): Promise<ChoreSnapshot> {
  const [{ chores, settings }, today] = await Promise.all([readChoreData(), householdToday()]);
  return { chores, settings, revision: contentRevision(chores), today };
}
