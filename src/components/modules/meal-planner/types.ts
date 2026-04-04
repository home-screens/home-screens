import type { MealSlotType } from '@/types/config';
import { SLOT_ORDER, SLOT_WINDOWS } from '@/lib/meal-constants';

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
