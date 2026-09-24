import type { ChoreDefinition, ChoreSettings } from '@/types/config';
import { createJsonStore } from './json-store';
import { settleFamilyMigration } from './family-data';
import { withDataTransaction } from './data-transaction';
import { contentRevision } from './content-revision';
import { readChoreSettings } from './chore-bonus';
import { householdToday } from './household-day';
import type { ChoreSnapshot } from './chore-client';

export interface ChoreData {
  /** Chore definitions (see ChoreDefinition) */
  chores: ChoreDefinition[];
  /** Household chore settings (see ChoreSettings). Missing = the defaults */
  settings?: ChoreSettings;
}

const EMPTY: ChoreData = { chores: [] };

const store = createJsonStore<ChoreData>({
  path: 'data/chores.json',
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

/** The saved chores and settings; settings are filled with the defaults where missing. */
export function readChoreData(): Promise<ChoreData & { settings: ChoreSettings }> {
  return withDataTransaction(async () => {
    await settleFamilyMigration();
    const data = await store.read();
    return { chores: data.chores, settings: readChoreSettings(data.settings) };
  });
}

/** Replace the whole document, settings included. */
export const writeChoreData = store.write;

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
