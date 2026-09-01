import type { FullscreenMealPlannerConfig, MealSettings, SavedMeal, PlannedMeal, MealSlotType, TimeFormat } from '@/types/config';
import { DIFFICULTY_COLORS } from '@/lib/meal-constants';
import type { RecipeTapMode } from '../shared/MealTapTarget';

export interface MealPlannerViewProps {
  config: FullscreenMealPlannerConfig;
  /** Shared planning settings from data/meals.json — single source of truth for slots/weekStart/defaultSlotTimes */
  settings: MealSettings;
  /** Effective serving-time format (explicit override, else the household global) */
  timeFormat: TimeFormat;
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  now: Date;
  slots: MealSlotType[];
  activeSlot: MealSlotType | null;
  bu: number;
  s: number;
  pad: number;
  showEmoji: boolean;
  showPrepTime: boolean;
  showTags: boolean;
  showDifficulty: boolean;
  showTitle: boolean;
  headerFont: string;
  bodyFont: string;
  recipeTapMode: RecipeTapMode;
  /** Canvas is wider than tall; the today and menu-board views re-flow. */
  landscape: boolean;
}

/**
 * Reference width the today / menu-board / next-meal views are authored
 * against. `s` is 10.8 at 1080 wide and `medium` type, so `px(s, n)` renders
 * `n` canvas pixels there and scales with canvas size, typographySize and the
 * fit factor exactly as every other `s`-multiple does.
 */
const REF_S = 10.8;

/** `n` authored canvas pixels expressed in the module's scale unit. */
export function px(s: number, n: number): number {
  return (s * n) / REF_S;
}

export function getDifficultyColor(difficulty: string | undefined): string | undefined {
  if (!difficulty) return undefined;
  return DIFFICULTY_COLORS[difficulty];
}

export function countPlanned(
  planArr: PlannedMeal[],
  totalSlots: number,
): { filled: number; total: number; pct: number } {
  const filled = planArr.filter((p) => p.mealId).length;
  return { filled, total: totalSlots, pct: totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0 };
}
