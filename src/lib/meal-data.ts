import { promises as fs } from 'fs';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { createJsonStore } from './json-store';

// ── Data shape ────────────────────────────────

export interface MealData {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  previousPlan: PlannedMeal[];
  groceryChecked: string[]; // ingredient names that have been checked off
}

const EMPTY: MealData = { savedMeals: [], plan: [], previousPlan: [], groceryChecked: [] };

const mealStore = createJsonStore<MealData>({
  path: 'data/meals.json',
  defaultValue: EMPTY,
  backup: true,
});

// ── Read (with field normalization for backward compat) ──

export async function readMealData(): Promise<MealData> {
  try {
    const raw = await fs.readFile(mealStore.filePath, 'utf-8');
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

export const writeMealData = mealStore.write;
