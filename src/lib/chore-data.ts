import type { ChoreMember, ChoreDefinition } from '@/types/config';
import { createJsonStore } from './json-store';

export interface ChoreData {
  members: ChoreMember[];
  chores: ChoreDefinition[];
}

const EMPTY: ChoreData = { members: [], chores: [] };

const store = createJsonStore<ChoreData>({
  path: 'data/chores.json',
  defaultValue: EMPTY,
  backup: true,
  errorHandling: 'throw-corrupt',
});

export const readChoreData = store.read;
export const writeChoreData = store.write;
