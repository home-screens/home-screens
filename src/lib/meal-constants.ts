import type { SavedMeal, PlannedMeal, MealSlotType, FullscreenTypographySize } from '@/types/config';

// ── Shared defaults (used across editor + remote + config sections) ────

/** Default accent color used throughout the app */
export const DEFAULT_ACCENT_COLOR = '#f59e0b';

/** Default emoji for meals with no emoji set */
export const DEFAULT_MEAL_EMOJI = '🍽️';

/** Typography size options for fullscreen modules */
export const TYPOGRAPHY_SIZES: { value: FullscreenTypographySize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'extra-large', label: 'Extra Large' },
  { value: '2x-large', label: '2X Large' },
  { value: '3x-large', label: '3X Large' },
];

/** Default meal slots when none configured (excludes snack) */
export const DEFAULT_SLOTS: readonly MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

/** Difficulty level colors (hex) */
export const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   '#10b981',
  medium: '#f59e0b',
  hard:   '#ef4444',
};

// ── Meal tags & emoji constants (shared across editor + remote) ────

/** Slot tags — meals tagged with these only appear in the matching slot during shuffle */
export const SLOT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** All available meal tags (lowercase canonical form). Slot tags first, then dietary/style. */
export const MEAL_TAGS = [
  ...SLOT_TAGS,
  'quick', 'healthy', 'vegetarian', 'vegan', 'comfort',
  'spicy', 'kid-friendly', 'meal-prep', 'gluten-free', 'dairy-free', 'batch-cook',
] as const;

/** Library filter categories (for sidebar pill filters in both editor + remote) */
export const LIBRARY_FILTERS = [
  'all', 'favorites', 'quick', 'healthy', 'comfort', 'kid-friendly',
] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

/** Emoji picker grid for meal detail form */
export const FOOD_EMOJIS = [
  '🍳', '🥞', '🧇', '🥣', '🥗', '🥪', '🌮', '🌯',
  '🍕', '🍔', '🍝', '🍜', '🍲', '🥘', '🍛', '🍣',
  '🍱', '🥩', '🍗', '🐟', '🥦', '🥕', '🌽', '🥑',
  '🍅', '🫑', '🧀', '🥚', '🍞', '🥐', '🍰', '🧁',
  '🍪', '🍩', '🍫', '🥤', '☕', '🍵', '🧃', '🥛',
  '🥧', '🍿', '🥜', '🫘', '🍓', '🍌', '🍎', '🥝',
] as const;

/** Normalize a tag to canonical form: 'Batch Cook' → 'batch-cook' */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, '-');
}

/** Capitalize a tag for display: 'kid-friendly' → 'Kid-Friendly' */
export function formatTagLabel(tag: string): string {
  return tag
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

/** Capitalize for simple labels: 'produce' → 'Produce' */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Slot visual config */
export const SLOT_META: Record<MealSlotType, { label: string; color: string; bg: string }> = {
  breakfast: { label: 'Breakfast', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)' },
  lunch:     { label: 'Lunch',     color: '#10b981', bg: 'rgba(16, 185, 129, 0.10)' },
  dinner:    { label: 'Dinner',    color: '#6366f1', bg: 'rgba(99, 102, 241, 0.10)' },
  snack:     { label: 'Snack',     color: '#ec4899', bg: 'rgba(236, 72, 153, 0.10)' },
};

/** Canonical slot ordering — matches chronological time windows */
export const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Slot time windows — [start, end) in hours */
export const SLOT_WINDOWS: Record<MealSlotType, { start: number; end: number }> = {
  breakfast: { start: 5, end: 10 },
  lunch:     { start: 10, end: 14 },
  snack:     { start: 14, end: 17 },
  dinner:    { start: 17, end: 21 },
};

/** Short day names (0 = Sunday) */
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Full day names (0 = Sunday) */
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
    return savedMeals.find((m) => m.id === planned.mealId) ?? null;
  }
  return null;
}

/** Get the active (current) meal slot based on time and enabled slots */
export function getActiveSlot(hour: number, slots: MealSlotType[]): MealSlotType | null {
  const active = SLOT_ORDER.filter((s) => slots.includes(s));
  for (const s of active) {
    const w = SLOT_WINDOWS[s];
    if (hour >= w.start && hour < w.end) return s;
  }
  return null;
}
