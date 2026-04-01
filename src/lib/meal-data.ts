import { promises as fs } from 'fs';
import path from 'path';
import type { SavedMeal, PlannedMeal } from '@/types/config';

// ── Data shape ────────────────────────────────

export interface MealData {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  previousPlan: PlannedMeal[];
  groceryChecked: string[]; // ingredient names that have been checked off
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'meals.json');
const BACKUP_FILE = DATA_FILE + '.bak';

const EMPTY: MealData = { savedMeals: [], plan: [], previousPlan: [], groceryChecked: [] };

// ── Read ──────────────────────────────────────

export async function readMealData(): Promise<MealData> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      savedMeals: Array.isArray(parsed.savedMeals) ? parsed.savedMeals : [],
      plan: Array.isArray(parsed.plan) ? parsed.plan : [],
      previousPlan: Array.isArray(parsed.previousPlan) ? parsed.previousPlan : [],
      groceryChecked: Array.isArray(parsed.groceryChecked) ? parsed.groceryChecked : [],
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY };
    throw err;
  }
}

// ── Write (queued, atomic) ────────────────────

let writeQueue: Promise<void> = Promise.resolve();

export function writeMealData(data: MealData): Promise<void> {
  const next = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Backup
    try {
      await fs.copyFile(DATA_FILE, BACKUP_FILE);
    } catch {
      // No existing file to back up — fine
    }

    // Atomic write via temp file + rename
    const tmp = DATA_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, DATA_FILE);
  });

  writeQueue = next.catch(() => {});
  return next;
}
