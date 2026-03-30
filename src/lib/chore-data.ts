import { promises as fs } from 'fs';
import path from 'path';
import type { ChoreMember, ChoreDefinition } from '@/types/config';

const DATA_FILE = path.join(process.cwd(), 'data', 'chores.json');

export interface ChoreData {
  members: ChoreMember[];
  chores: ChoreDefinition[];
}

const EMPTY: ChoreData = { members: [], chores: [] };

export async function readChoreData(): Promise<ChoreData> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as ChoreData;
  } catch {
    return EMPTY;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function writeChoreData(data: ChoreData): Promise<void> {
  const next = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, DATA_FILE);
  });
  writeQueue = next.catch(() => {});
  return next;
}
