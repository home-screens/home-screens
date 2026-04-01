import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

/** Slot visual config */
export const SLOT_META: Record<MealSlotType, { label: string; color: string; bg: string }> = {
  breakfast: { label: 'Breakfast', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)' },
  lunch:     { label: 'Lunch',     color: '#10b981', bg: 'rgba(16, 185, 129, 0.10)' },
  dinner:    { label: 'Dinner',    color: '#6366f1', bg: 'rgba(99, 102, 241, 0.10)' },
  snack:     { label: 'Snack',     color: '#ec4899', bg: 'rgba(236, 72, 153, 0.10)' },
};

/** Short day names */
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Get ordered day indices based on week start */
export function getOrderedDays(weekStartDay: 'sunday' | 'monday'): number[] {
  if (weekStartDay === 'monday') return [1, 2, 3, 4, 5, 6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

/** Resolve a planned meal to display info */
export function resolveMeal(
  day: number,
  slot: MealSlotType,
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
): SavedMeal | null {
  if (!plan || !savedMeals) return null;
  const planned = plan.find((p) => p.day === day && p.slot === slot);
  if (!planned) return null;

  if (planned.mealId) {
    const saved = savedMeals.find((m) => m.id === planned.mealId);
    if (saved) return saved;
  }
  return null;
}

/** Slot time windows — [start, end) in hours */
const SLOT_WINDOWS: Record<MealSlotType, { start: number; end: number }> = {
  breakfast: { start: 5, end: 10 },
  lunch:     { start: 10, end: 14 },
  snack:     { start: 14, end: 17 },
  dinner:    { start: 17, end: 21 },
};

/** Canonical slot ordering (snack sits between lunch and dinner) */
const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Get the active (current) meal slot based on time and enabled slots */
export function getActiveSlot(hour: number, slots: MealSlotType[]): MealSlotType | null {
  const active = SLOT_ORDER.filter((s) => slots.includes(s));
  for (const s of active) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) return s;
  }
  return null;
}

/** Get the next/current meal slot for display */
export function getNextMealSlot(
  hour: number,
  slots: MealSlotType[],
): { slot: MealSlotType; dayOffset: number; label: string } {
  const activeOrder = SLOT_ORDER.filter((s) => slots.includes(s));
  if (activeOrder.length === 0) return { slot: 'breakfast', dayOffset: 0, label: 'Next' };

  // Currently in a slot's window → "Now"
  for (const s of activeOrder) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) return { slot: s, dayOffset: 0, label: 'Now' };
  }

  // Next upcoming slot whose window hasn't started → "Coming Up"
  for (const s of activeOrder) {
    if (hour < SLOT_WINDOWS[s].start) return { slot: s, dayOffset: 0, label: 'Coming Up' };
  }

  // All windows passed → wrap to first slot tomorrow
  return { slot: activeOrder[0], dayOffset: 1, label: 'Tomorrow' };
}

/** Slot tags — meals tagged with these only appear in the matching slot during shuffle */
export const SLOT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** Common tag presets (slot tags first, then dietary/style) */
export const MEAL_TAGS = [
  ...SLOT_TAGS,
  'quick', 'healthy', 'vegetarian', 'vegan', 'comfort',
  'spicy', 'kid-friendly', 'meal-prep', 'gluten-free', 'dairy-free',
] as const;

/** Emoji picker grid for meal detail form (8-column layout) */
export const FOOD_EMOJIS = [
  '🍳', '🥞', '🧇', '🥣', '🥗', '🥪', '🌮', '🌯',
  '🍕', '🍔', '🍝', '🍜', '🍲', '🥘', '🍛', '🍣',
  '🍱', '🥩', '🍗', '🐟', '🥦', '🥕', '🌽', '🥑',
  '🍅', '🫑', '🧀', '🥚', '🍞', '🥐', '🍰', '🧁',
  '🍪', '🍩', '🍫', '🥤', '☕', '🍵', '🧃', '🥛',
  '🥧', '🍿', '🥜', '🫘', '🍓', '🍌', '🍎', '🥝',
] as const;

/** Library sidebar filter categories */
export const LIBRARY_FILTERS = [
  'all', 'favorites', 'quick', 'healthy', 'comfort', 'kid-friendly',
] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];
