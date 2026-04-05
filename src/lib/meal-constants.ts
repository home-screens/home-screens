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

// ── Date utilities (ISO date string helpers for multi-week plans) ────

/** Format a Date as ISO date string "2026-04-04" */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse an ISO date string back to a Date (noon local time to avoid DST boundary issues) */
export function fromISODate(s: string): Date {
  return new Date(s + 'T12:00:00');
}

/** Get the day-of-week index (0=Sun) for an ISO date string */
export function dateToDayIndex(date: string): number {
  return new Date(date + 'T12:00:00').getDay();
}

/** Get the ISO date range (start, end) for the week containing `referenceDate` */
export function getWeekRange(
  referenceDate: Date,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): { start: string; end: string } {
  const d = new Date(referenceDate);
  const dow = d.getDay();
  const startOffset = weekStartDay === 'monday' ? ((dow + 6) % 7) : dow;
  const start = new Date(d);
  start.setDate(d.getDate() - startOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toISODate(start), end: toISODate(end) };
}

/** Return 7 ISO date strings for the week starting at `start` (already aligned) */
export function getWeekDatesForRange(
  start: string,
  weekStartDay: 'sunday' | 'monday' = 'sunday',
): string[] {
  const d = fromISODate(start);
  // If start isn't already aligned, align it
  const dow = d.getDay();
  const offset = weekStartDay === 'monday' ? ((dow + 6) % 7) : dow;
  d.setDate(d.getDate() - offset);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    dates.push(toISODate(day));
  }
  return dates;
}

/** Filter plan entries to those within a date range (inclusive) */
export function filterPlanToWeek(
  plan: PlannedMeal[],
  start: string,
  end: string,
): PlannedMeal[] {
  return plan.filter((p) => p.date >= start && p.date <= end);
}

/** Replace one week's entries in the full plan (used for multi-week merge) */
export function replaceWeekInPlan(
  fullPlan: PlannedMeal[],
  weekDates: string[],
  newWeekEntries: PlannedMeal[],
): PlannedMeal[] {
  const weekSet = new Set(weekDates);
  const otherWeeks = fullPlan.filter((p) => !weekSet.has(p.date));
  return [...otherWeeks, ...newWeekEntries];
}

/** Resolve a planned meal to display info */
export function resolveMeal(
  date: string,
  slot: MealSlotType,
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
): SavedMeal | null {
  if (!plan || !savedMeals) return null;
  const planned = plan.find((p) => p.date === date && p.slot === slot);
  if (!planned) return null;
  if (planned.mealId) {
    return savedMeals.find((m) => m.id === planned.mealId) ?? null;
  }
  return null;
}

/** Copy entries from one week to another, preserving day-of-week position */
export function copyWeekEntries(
  plan: PlannedMeal[],
  fromDates: string[],
  toDates: string[],
): PlannedMeal[] {
  const entries = filterPlanToWeek(plan, fromDates[0], fromDates[fromDates.length - 1]);
  return entries.map((entry) => {
    const idx = fromDates.indexOf(entry.date);
    return { ...entry, date: toDates[idx >= 0 ? idx : 0] };
  });
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
