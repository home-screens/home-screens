import type { MealCourse, MealCourseKind, MealSlotType, PlannedMeal, SavedMeal } from '@/types/config';

/**
 * The rules for courses: the sides, desserts, drinks and second main dishes a
 * planned meal carries beside its main dish.
 *
 * Mealie plans a dinner as several entries (the dish, two sides, a dessert),
 * and a family planning in Home Screens wants the same, so a planned meal
 * holds its main dish plus an ordered list of courses. The phone and the
 * editor both edit them, and every view draws them, so what a valid course is
 * and what each edit does lives here once.
 *
 * Every transform returns the array it was given, unchanged and by identity,
 * when the edit is a no-op, the same contract as `meal-plan-actions.ts`.
 */

/** In the order a picker offers them and a view lists them. */
export const COURSE_KINDS: readonly MealCourseKind[] = ['main', 'side', 'dessert', 'drink'];

const COURSE_KIND_SET: ReadonlySet<string> = new Set(COURSE_KINDS);

/**
 * More than any real meal carries, few enough that a stuck client cannot grow
 * one entry without bound.
 */
export const MAX_COURSES = 12;

/** Translation key (modules namespace) for a course kind's label: "Also", "Side", "Dessert", "Drink". */
export function getMealCourseLabelKey(kind: MealCourseKind): string {
  return `meal-planner.courses.${kind}`;
}

/**
 * Coerce whatever arrived into a valid course list.
 *
 * A course names a saved meal or carries typed text; one with neither has
 * nothing to show and is dropped. `keepSource` is for a plan read from Mealie
 * or sent back to it, where `sourceId` says which Mealie entry a course is;
 * `meals.json` never stores one. Returns `undefined` for an empty list so a
 * meal without courses keeps the shape it always had.
 */
export function normalizeMealCourses(raw: unknown, keepSource = false): MealCourse[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const courses: MealCourse[] = [];
  for (const item of raw) {
    if (courses.length >= MAX_COURSES) break;
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.kind !== 'string' || !COURSE_KIND_SET.has(c.kind)) continue;
    const mealId = typeof c.mealId === 'string' && c.mealId ? c.mealId : undefined;
    const customText = typeof c.customText === 'string' && c.customText.trim() ? c.customText.trim() : undefined;
    if (!mealId && !customText) continue;
    const course: MealCourse = { kind: c.kind as MealCourseKind };
    if (mealId) course.mealId = mealId;
    else if (customText) course.customText = customText;
    if (keepSource && typeof c.sourceId === 'string' && c.sourceId) course.sourceId = c.sourceId;
    courses.push(course);
  }
  return courses.length > 0 ? courses : undefined;
}

/**
 * A saved meal as `meals.json` may hold it: a kind of dish that is not one of
 * the course kinds (older builds offered "snack", which is a meal of the day,
 * not a dish) is dropped, so the meal reads as a main dish.
 */
export function normalizeStoredMeal(meal: SavedMeal): SavedMeal {
  if (meal.category === undefined || COURSE_KINDS.includes(meal.category)) return meal;
  const next = { ...meal };
  delete next.category;
  return next;
}

/**
 * A plan entry as `meals.json` may hold it: courses normalized, and no
 * `sourceId` on the entry or its courses (those only describe a plan read from
 * Mealie). Hands back the entry itself when nothing needed changing.
 */
export function normalizeStoredPlanEntry(entry: PlannedMeal): PlannedMeal {
  const hasCourses = entry.courses !== undefined;
  if (!hasCourses && entry.sourceId === undefined) return entry;
  const next: PlannedMeal = { ...entry };
  delete next.sourceId;
  const courses = normalizeMealCourses(entry.courses);
  if (courses) next.courses = courses;
  else delete next.courses;
  return next;
}

/** True when a plan entry holds something to show: a main dish, typed text or a course. */
export function planEntryHasContent(entry: PlannedMeal): boolean {
  return !!entry.mealId || !!entry.customText?.trim() || (entry.courses?.length ?? 0) > 0;
}

/** Every saved meal an entry points at, its main dish first, then its courses in order. */
export function planEntryMealIds(entry: PlannedMeal): string[] {
  const ids: string[] = [];
  if (entry.mealId) ids.push(entry.mealId);
  for (const c of entry.courses ?? []) if (c.mealId) ids.push(c.mealId);
  return ids;
}

/** A course ready to draw: its kind, its saved meal (null for typed text) and what to print. */
export interface ResolvedCourse {
  kind: MealCourseKind;
  meal: SavedMeal | null;
  name: string;
}

/**
 * The courses of an entry, resolved against the library. A course whose
 * saved meal no longer exists and that carries no typed text is skipped
 * rather than drawn as an empty line.
 */
export function resolveCourses(entry: PlannedMeal | undefined, savedMeals: SavedMeal[] | undefined): ResolvedCourse[] {
  if (!entry?.courses?.length) return [];
  const out: ResolvedCourse[] = [];
  for (const c of entry.courses) {
    const meal = c.mealId && savedMeals ? savedMeals.find((m) => m.id === c.mealId) ?? null : null;
    const name = meal?.name ?? c.customText?.trim();
    if (name) out.push({ kind: c.kind, meal, name });
  }
  return out;
}

function updateEntry(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  edit: (entry: PlannedMeal | undefined) => PlannedMeal | null | undefined,
): PlannedMeal[] {
  const existing = plan.find((p) => p.date === date && p.slot === slot);
  const next = edit(existing);
  if (next === existing) return plan;
  const rest = plan.filter((p) => p !== existing);
  if (!next || !planEntryHasContent(next)) return existing ? rest : plan;
  return [...rest, next];
}

/**
 * Add a course to a meal, creating the meal's entry when the slot was empty
 * (a dinner can start as just a side). A full list refuses the addition.
 */
export function addPlanCourse(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  course: MealCourse,
): PlannedMeal[] {
  const [clean] = normalizeMealCourses([course], true) ?? [];
  if (!clean) return plan;
  return updateEntry(plan, date, slot, (entry) => {
    const courses = entry?.courses ?? [];
    if (courses.length >= MAX_COURSES) return entry;
    return { ...(entry ?? { date, slot }), courses: [...courses, clean] };
  });
}

/**
 * Change what one course is (another saved meal, different text, or another
 * kind). The course keeps its place and its `sourceId`, so a save to Mealie
 * updates that entry rather than replacing it.
 */
export function setPlanCourse(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  index: number,
  change: { kind?: MealCourseKind; mealId?: string; customText?: string },
): PlannedMeal[] {
  return updateEntry(plan, date, slot, (entry) => {
    const current = entry?.courses?.[index];
    if (!entry || !current) return entry;
    const merged: MealCourse = { kind: change.kind ?? current.kind };
    if (change.mealId !== undefined || change.customText !== undefined) {
      if (change.mealId) merged.mealId = change.mealId;
      else if (change.customText?.trim()) merged.customText = change.customText.trim();
    } else {
      if (current.mealId) merged.mealId = current.mealId;
      if (current.customText) merged.customText = current.customText;
    }
    if (current.sourceId) merged.sourceId = current.sourceId;
    // Blank text with no meal is the course being emptied: that is a removal.
    if (!merged.mealId && !merged.customText) return removeAt(entry, index);
    const courses = entry.courses!.map((c, i) => (i === index ? merged : c));
    return { ...entry, courses };
  });
}

function removeAt(entry: PlannedMeal, index: number): PlannedMeal {
  const courses = (entry.courses ?? []).filter((_, i) => i !== index);
  const next: PlannedMeal = { ...entry, courses };
  if (courses.length === 0) delete next.courses;
  return next;
}

/**
 * Remove one course. When it was the last thing in the slot (no main dish, no
 * other course) the slot is empty and its entry goes too.
 */
export function removePlanCourse(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  index: number,
): PlannedMeal[] {
  return updateEntry(plan, date, slot, (entry) => {
    if (!entry?.courses?.[index]) return entry;
    return removeAt(entry, index);
  });
}

/** Move one course to another place in the list (for the phone's up and down buttons). */
export function movePlanCourse(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  from: number,
  to: number,
): PlannedMeal[] {
  return updateEntry(plan, date, slot, (entry) => {
    const courses = entry?.courses;
    if (!entry || !courses || from === to || !courses[from] || to < 0 || to >= courses.length) return entry;
    const next = [...courses];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return { ...entry, courses: next };
  });
}
