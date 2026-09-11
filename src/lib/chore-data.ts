import type { ChoreDefinition } from '@/types/config';
import { createJsonStore } from './json-store';
import { settleFamilyMigration } from './family-data';
import { withDataTransaction } from './data-transaction';

export interface ChoreData {
  /** Chore definitions (see ChoreDefinition) */
  chores: ChoreDefinition[];
}

const EMPTY: ChoreData = { chores: [] };

const store = createJsonStore<ChoreData>({
  path: 'data/chores.json',
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

export function readChoreData(): Promise<ChoreData> {
  return withDataTransaction(async () => {
    await settleFamilyMigration();
    const data = await store.read();
    return { chores: data.chores };
  });
}
export const writeChoreData = store.write;
