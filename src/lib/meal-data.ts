import { promises as fs } from 'fs';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { createJsonStore } from './json-store';
import { toISODate } from './meal-constants';

// ── Data shape ────────────────────────────────

export interface MealData {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: string[]; // ingredient names that have been checked off
}

const EMPTY: MealData = { savedMeals: [], plan: [], groceryChecked: [] };

/** Prune plan entries older than this many weeks */
const PRUNE_WEEKS = 12;

const mealStore = createJsonStore<MealData>({
  path: 'data/meals.json',
  defaultValue: EMPTY,
  backup: true,
});

// ── Migration: day-of-week → ISO date ──

function migrateLegacyPlan(plan: unknown[]): PlannedMeal[] {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());

  return plan.map((raw) => {
    const entry = raw as Record<string, unknown>;
    if (typeof entry === 'object' && entry !== null && 'date' in entry && typeof entry.date === 'string') {
      return entry as unknown as PlannedMeal;
    }
    const dayNum = typeof entry.day === 'number' ? entry.day : 0;
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + dayNum);
    const { day: _day, ...rest } = entry;
    return { ...rest, date: toISODate(d) } as PlannedMeal;
  });
}

// ── Read (with migration write-through) ──

export async function readMealData(): Promise<MealData> {
  try {
    const raw = await fs.readFile(mealStore.filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const data: MealData = {
      savedMeals: Array.isArray(parsed.savedMeals) ? parsed.savedMeals : [],
      plan: Array.isArray(parsed.plan) ? parsed.plan : [],
      groceryChecked: Array.isArray(parsed.groceryChecked) ? parsed.groceryChecked : [],
    };

    // Detect legacy entries (have `day` but no `date`)
    const needsMigration = (data.plan as unknown as Record<string, unknown>[]).some(
      (entry) => !('date' in entry && typeof entry.date === 'string') && 'day' in entry,
    );
    const needsPreviousPlanRemoval = Array.isArray(parsed.previousPlan) && parsed.previousPlan.length > 0;

    if (needsMigration || needsPreviousPlanRemoval) {
      if (needsMigration) {
        data.plan = migrateLegacyPlan(data.plan as unknown as unknown[]);
      }
      // Best-effort write-through: persist migration so it's not re-applied.
      // If the write fails (e.g. SD card issue), we still return the migrated data
      // in memory — it will simply be re-migrated on the next read.
      writeMealData(data).catch(() => {});
    }

    return data;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY };
    throw err;
  }
}

// ── Pruning ──

export function prunePlan(plan: PlannedMeal[]): PlannedMeal[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PRUNE_WEEKS * 7);
  const cutoffStr = toISODate(cutoff);
  return plan.filter((p) => p.date >= cutoffStr);
}

// ── Write (queued, atomic) ────────────────────

export const writeMealData = mealStore.write;
