import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings, FullscreenTypographySize } from '@/types/config';
import { formatDateSync } from '@/i18n/formatters';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

// ── Shared defaults (used across editor + remote + config sections) ────

/** Default accent color used throughout the app */
export const DEFAULT_ACCENT_COLOR = '#f59e0b';

/** Default emoji for meals with no emoji set */
export const DEFAULT_MEAL_EMOJI = '🍽️';

/**
 * Typography size options for fullscreen modules.
 *
 * Each option carries an `i18nKey` (resolved against the `editor` namespace
 * at the call site via `tOrFallback`) plus a `label` English fallback. Both
 * fullscreen-meal-planner and fullscreen-chore-chart config sections
 * translate at render time so the dropdown reads in the active locale.
 */
export const TYPOGRAPHY_SIZES: { value: FullscreenTypographySize; label: string; i18nKey: string }[] = [
  { value: 'small',       label: 'Small',       i18nKey: 'common.typographySizes.small' },
  { value: 'medium',      label: 'Medium',      i18nKey: 'common.typographySizes.medium' },
  { value: 'large',       label: 'Large',       i18nKey: 'common.typographySizes.large' },
  { value: 'extra-large', label: 'Extra Large', i18nKey: 'common.typographySizes.extra-large' },
  { value: '2x-large',    label: '2X Large',    i18nKey: 'common.typographySizes.2x-large' },
  { value: '3x-large',    label: '3X Large',    i18nKey: 'common.typographySizes.3x-large' },
  { value: '4x-large',    label: '4X Large',    i18nKey: 'common.typographySizes.4x-large' },
];

/**
 * Default meal slots when none configured (excludes snack).
 * Internal — only used by `DEFAULT_MEAL_SETTINGS` below. Not part of the
 * module's public API; consumers should read from `DEFAULT_MEAL_SETTINGS`
 * or the household's actual `MealSettings`.
 */
const DEFAULT_SLOTS: readonly MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

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
export const SLOT_META: Record<MealSlotType, { color: string; bg: string }> = {
  breakfast: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)' },
  lunch:     { color: '#10b981', bg: 'rgba(16, 185, 129, 0.10)' },
  dinner:    { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.10)' },
  snack:     { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.10)' },
};

/**
 * Translation-key helper for meal slot labels. Callers using
 * `useTranslate('modules')` pass the returned dotted path directly —
 * the namespace prefix is implicit.
 */
export function getMealSlotLabelKey(slot: MealSlotType): string {
  return `meal-planner.slots.${slot}`;
}

/** Canonical slot ordering — matches chronological time windows */
export const SLOT_ORDER: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/** Slot time windows — [start, end) in hours */
export const SLOT_WINDOWS: Record<MealSlotType, { start: number; end: number }> = {
  breakfast: { start: 5, end: 10 },
  lunch:     { start: 10, end: 14 },
  snack:     { start: 14, end: 17 },
  dinner:    { start: 17, end: 21 },
};

/**
 * Return 7 localized day-of-week names indexed 0=Sunday … 6=Saturday.
 *
 * Uses `formatDateSync` against a known anchor week (Sun 2024-01-07 →
 * Sat 2024-01-13) so the array indices line up with `Date.prototype.getDay()`.
 * The locale's date-fns bundle must already be preloaded — every layout
 * does this server-side at request time, so by the time any client
 * component calls this, the cache is warm. Falls back to the en-US
 * date-fns default (synchronous) on cache miss.
 *
 * `format` selects the date-fns pattern: `'full'` → `EEEE` ("Monday",
 * "Montag"), `'short'` → `EEE` ("Mon", "Mo").
 */
export function getLocalizedDayNames(
  locale: string = DEFAULT_LOCALE,
  format: 'short' | 'full' = 'full',
): string[] {
  const pattern = format === 'short' ? 'EEE' : 'EEEE';
  // Anchor week: 2024-01-07 is a Sunday in every reasonable timezone
  // (it's noon UTC, well clear of the date boundary). We construct each
  // day with local-time `new Date(y, m, d)` so the result matches what
  // `Date.prototype.getDay()` would return at the consumer site.
  const result: string[] = new Array(7);
  for (let dow = 0; dow < 7; dow++) {
    const anchor = new Date(2024, 0, 7 + dow); // Sun Jan 7 + dow
    result[dow] = formatDateSync(anchor, pattern, { locale });
  }
  return result;
}

/** Get ordered day indices based on week start */
export function getOrderedDays(weekStartDay: 'sunday' | 'monday'): number[] {
  if (weekStartDay === 'monday') return [1, 2, 3, 4, 5, 6, 0];
  return [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Align an arbitrary date to the start of its containing week, given the
 * household's `weekStartDay`. Returns a new Date — never mutates the input.
 *
 * Examples (Wed April 8 2026):
 *   alignToWeekStart(Wed Apr 8, 'sunday') → Sun Apr 5
 *   alignToWeekStart(Wed Apr 8, 'monday') → Mon Apr 6
 *
 * Idempotent for same-day-of-week inputs (a Sunday aligned to Sunday-start
 * returns the same Sunday). DST-safe — uses local-time `setDate`, which the
 * JS Date API handles correctly across spring-forward / fall-back boundaries.
 *
 * This is the canonical helper for the offset math; previously the same
 * `(dow + 6) % 7` vs `dow` calculation lived in five places across MealsTab,
 * meals-shared.ts, and the realign effect, which led to a "compounding offset"
 * bug when the math was applied to an already-aligned date.
 */
export function alignToWeekStart(date: Date, weekStartDay: 'sunday' | 'monday'): Date {
  const dow = date.getDay(); // 0 = Sunday
  const offset = weekStartDay === 'monday' ? ((dow + 6) % 7) : dow;
  const aligned = new Date(date);
  aligned.setDate(date.getDate() - offset);
  return aligned;
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

/**
 * Resolve both the saved meal AND the planned-meal entry for a given date+slot,
 * so callers can access both the meal definition and per-instance fields like
 * `time` and `notes` without having to scan the plan twice.
 */
export function resolveMealWithEntry(
  date: string,
  slot: MealSlotType,
  plan: PlannedMeal[] | undefined,
  savedMeals: SavedMeal[] | undefined,
): { meal: SavedMeal | null; planned: PlannedMeal | undefined } {
  if (!plan) return { meal: null, planned: undefined };
  const planned = plan.find((p) => p.date === date && p.slot === slot);
  if (!planned) return { meal: null, planned: undefined };
  const meal = planned.mealId && savedMeals
    ? savedMeals.find((m) => m.id === planned.mealId) ?? null
    : null;
  return { meal, planned };
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

// ── Default MealSettings ────────────────────────────────────────────

/** Sensible defaults used when `data/meals.json` has no `settings` block yet */
export const DEFAULT_MEAL_SETTINGS: MealSettings = {
  enabledSlots: [...DEFAULT_SLOTS],
  weekStartDay: 'sunday',
  defaultSlotTimes: {},
  timeFormat: '12h',
};

// ── Settings normalization (shared by server reads and client fetches) ──

const VALID_SLOT_SET: ReadonlySet<MealSlotType> = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

/**
 * Validate an "HH:MM" 24h time string. Range-checks hours (0–23) and minutes
 * (0–59) — stricter than a regex alone, so '25:99' is rejected.
 */
function isValidTimeString(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/**
 * Coerce an unknown settings blob into a valid `MealSettings`, falling back
 * to defaults per-field. Used by both server reads (`readMealData`) and client
 * fetches (`useMealsData`) so the invariant is enforced on both sides — a
 * stale or partial API response can't crash subsequent renders.
 */
export function normalizeMealSettings(raw: unknown): MealSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_MEAL_SETTINGS, enabledSlots: [...DEFAULT_MEAL_SETTINGS.enabledSlots], defaultSlotTimes: {} };
  }
  const r = raw as Record<string, unknown>;

  const filteredSlots = Array.isArray(r.enabledSlots)
    ? r.enabledSlots.filter((s): s is MealSlotType => typeof s === 'string' && VALID_SLOT_SET.has(s as MealSlotType))
    : null;
  // Empty / all-invalid enabledSlots → fall back to defaults so the household
  // is never left with zero slots (which would silently render nothing everywhere).
  const enabledSlots: MealSlotType[] = filteredSlots && filteredSlots.length > 0
    ? filteredSlots
    : [...DEFAULT_MEAL_SETTINGS.enabledSlots];

  const weekStartDay: 'sunday' | 'monday' =
    r.weekStartDay === 'monday' || r.weekStartDay === 'sunday'
      ? r.weekStartDay
      : DEFAULT_MEAL_SETTINGS.weekStartDay;

  const defaultSlotTimes: Partial<Record<MealSlotType, string>> = {};
  if (r.defaultSlotTimes && typeof r.defaultSlotTimes === 'object') {
    for (const [k, v] of Object.entries(r.defaultSlotTimes as Record<string, unknown>)) {
      if (VALID_SLOT_SET.has(k as MealSlotType) && isValidTimeString(v)) {
        defaultSlotTimes[k as MealSlotType] = v;
      }
    }
  }

  const timeFormat: '12h' | '24h' =
    r.timeFormat === '24h' || r.timeFormat === '12h'
      ? r.timeFormat
      : DEFAULT_MEAL_SETTINGS.timeFormat;

  return { enabledSlots, weekStartDay, defaultSlotTimes, timeFormat };
}

// ── Time formatting & resolution ────────────────────────────────────

/**
 * Resolve the effective serving time for a planned meal:
 * the explicit `time` on the entry, or the default for that slot, or undefined.
 *
 * `defaults` is the household's `MealSettings.defaultSlotTimes` map (always present
 * post-normalization, may be empty `{}`).
 */
export function resolvePlannedMealTime(
  planned: PlannedMeal | undefined,
  slot: MealSlotType,
  defaults: Partial<Record<MealSlotType, string>>,
): string | undefined {
  if (planned?.time) return planned.time;
  return defaults[slot];
}

/**
 * Format an "HH:MM" 24-hour time string for display.
 * Honors the global timeFormat preference. Returns empty string for invalid input.
 *
 * Examples:
 *   formatMealTime('18:30', '12h') → '6:30 PM'
 *   formatMealTime('18:30', '24h') → '18:30'
 *   formatMealTime('07:00', '12h') → '7:00 AM'
 */
export function formatMealTime(
  time: string | undefined,
  format: '12h' | '24h' = '12h',
): string {
  if (!time) return '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return '';
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return '';

  if (format === '24h') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Suggested time presets shown as quick-pick buttons in MealTimeChip.
 *
 * Hand-authored per slot rather than derived from SLOT_WINDOWS so each slot
 * can reflect realistic household eating times. SLOT_WINDOWS still defines
 * the broader "active window" used for getActiveSlot, but those windows are
 * intentionally generous (5–10 AM for breakfast) and would produce unrealistic
 * presets like 5:30 AM. Edit this table directly to tune defaults per slot.
 */
export const SLOT_TIME_PRESETS: Record<MealSlotType, string[]> = {
  breakfast: ['06:00', '06:30', '07:00', '07:30'],
  lunch:     ['11:00', '11:30', '12:00', '12:30'],
  snack:     ['14:30', '15:00', '15:30', '16:00'],
  dinner:    ['17:30', '18:00', '18:30', '19:00'],
};

/**
 * Get suggested time presets for a given slot.
 * Returns 4 common eating times appropriate for the slot.
 *
 * Example: dinner → ['17:30', '18:00', '18:30', '19:00']
 */
export function getSlotTimePresets(slot: MealSlotType): string[] {
  return SLOT_TIME_PRESETS[slot];
}
