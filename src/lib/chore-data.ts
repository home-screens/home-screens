import { promises as fs } from 'fs';
import path from 'path';
import type { ChoreMember, ChoreDefinition } from '@/types/config';

const DATA_FILE = path.join(process.cwd(), 'data', 'chores.json');
const BACKUP_FILE = DATA_FILE + '.bak';

export interface ChoreData {
  members: ChoreMember[];
  chores: ChoreDefinition[];
}

const EMPTY: ChoreData = { members: [], chores: [] };

export async function readChoreData(): Promise<ChoreData> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as ChoreData;
  } catch (err: unknown) {
    // File doesn't exist yet — that's fine, return empty
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return EMPTY;
    }
    // Any other error (corrupt JSON, permission denied) — bubble up
    // so callers don't silently treat real data as empty
    throw err;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function writeChoreData(data: ChoreData): Promise<void> {
  const next = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    // Back up the current file before overwriting
    try {
      await fs.copyFile(DATA_FILE, BACKUP_FILE);
    } catch {
      // No existing file to back up — that's OK
    }
    const tmp = DATA_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, DATA_FILE);
  });
  writeQueue = next.catch(() => {});
  return next;
}
