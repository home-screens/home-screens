import type { CSSProperties } from 'react';
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
  /**
   * The next meal's photo fills the module behind a dark scrim (Next Meal
   * view only), so the view draws its text light and leaves out the big
   * picture. Only true once the photo has loaded: light text on the theme's
   * own background would not read.
   */
  photoBackdrop?: boolean;
  /** A real display with taps switched on (`config.interactive`): tick boxes, recipe step buttons, finger scrolling. */
  interactive: boolean;
  /**
   * The fit loop shrank the type as far as it goes (`FIT_MIN_FACTOR`) and the
   * view may still not fit. Only then does a touch wall let the Today view's
   * cards take their own height and scroll; above the floor they share the
   * panel exactly as before.
   */
  fitFloored?: boolean;
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

/**
 * The "Back to today" button and the scroll bar of a list a finger scrolls
 * (`WallScroller`), in the theme: the accent with its own ink, about a dish
 * name's size, and a bar in the theme's text colour.
 */
export function wallScrollLook(s: number): { backStyle: CSSProperties; thumbColor: string; thumbWidth: number } {
  return {
    backStyle: {
      top: px(s, 18),
      fontSize: px(s, 30),
      padding: '0.55em 1.2em',
      gap: '0.45em',
      background: 'var(--fmp-accent)',
      color: 'var(--fmp-on-accent)',
      boxShadow: '0 0.3em 0.9em color-mix(in srgb, var(--fmp-accent) 35%, transparent)',
    },
    thumbColor: 'color-mix(in srgb, var(--fmp-text) 28%, transparent)',
    thumbWidth: Math.max(4, Math.round(px(s, 8))),
  };
}

export function getDifficultyColor(difficulty: string | undefined): string | undefined {
  if (!difficulty) return undefined;
  return DIFFICULTY_COLORS[difficulty];
}
