import type { MealCourse, MealCourseKind, MealSlotType, PlannedMeal, SavedMeal } from '@/types/config';
// Types only: this file is shared with the browser (MealPicture reads meal
// ids), and `mealie.ts` is the hub's client with its secrets.
import type { MealieEntryType, MealiePlanEntry, MealiePlanEntryWrite, MealieRecipe, MealieRecipeSummary } from './mealie';

/**
 * How Mealie's meal plan reads as a Home Screens plan, and how a change made
 * in Home Screens goes back. Pure, so both directions are tested against
 * answers recorded from a real Mealie.
 *
 * Mealie plans a day as a list of entries, each a type (breakfast, lunch,
 * dinner, snack, side, dessert, drink) and either a recipe or a note. Home
 * Screens plans a day as one meal per slot with courses beside its main dish.
 * Reading groups the entries into meals:
 * - breakfast, lunch, dinner and snack are slots; the first entry of one is
 *   the meal's main dish and any further one is another main (`main` course);
 * - side, dessert and drink are courses, of dinner unless the hub remembers
 *   they were planned with another meal (Mealie has no way to say so);
 * - a recipe entry points at the recipe; a note entry is typed text.
 * Entries are taken in the order they were made, so the same day always
 * reads the same way.
 */

/** Plan entries read from Mealie say which Mealie entry they are with this prefix. */
const SOURCE_PREFIX = 'mealie:';

/**
 * A short fingerprint of what an entry holds: its day, kind, recipe, title
 * and note (FNV-1a, base 36).
 */
function entryFingerprint(entry: Pick<MealiePlanEntry, 'date' | 'entryType' | 'recipeId' | 'title' | 'text'>): string {
  const content = [entry.date, entry.entryType, entry.recipeId ?? '', entry.title ?? '', entry.text ?? ''].join('\u0000');
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Which Mealie entry a plan entry or course is: `mealie:<entry id>.<fingerprint>`.
 *
 * The number alone is not enough. Mealie on SQLite hands a deleted entry's
 * number to the next one made, so "entry 339" can be one family member's
 * dinner now and someone else's a minute later. With the fingerprint, an
 * Undo cannot take away a different meal that inherited a number, and a save
 * made on an older copy is refused when anything in the meal changed.
 */
export function mealieSourceId(entry: Pick<MealiePlanEntry, 'id' | 'date' | 'entryType' | 'recipeId' | 'title' | 'text'>): string {
  return `${SOURCE_PREFIX}${entry.id}.${entryFingerprint(entry)}`;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * True when one of the household's meal plan rules in Mealie covers this meal
 * (its day or every day, its kind or every kind) and narrows the recipes:
 * Mealie's own pick then follows the family's wishes ("Friday is pizza
 * night"). A rule that filters nothing leaves the pick to Home Screens.
 */
export function mealieRuleCovers(
  rules: readonly { day: string; entryType: string; queryFilterString?: string | null }[],
  date: string,
  entryType: MealieEntryType,
): boolean {
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return rules.some((r) => !!r.queryFilterString?.trim()
    && (r.day === 'unset' || r.day === weekday)
    && (r.entryType === 'unset' || r.entryType === entryType));
}

/** The Mealie entry number a `sourceId` names, or null. */
export function parseMealieSourceId(sourceId: string | undefined): number | null {
  const match = sourceId ? /^mealie:([1-9]\d*)\.[0-9a-z]+$/.exec(sourceId) : null;
  return match ? Number(match[1]) : null;
}

/** Mealie recipes show up as saved meals whose id says which recipe they are. */
export function mealieMealId(recipeId: string): string {
  return `${SOURCE_PREFIX}${recipeId}`;
}

export function parseMealieMealId(mealId: string | undefined): string | null {
  if (!mealId?.startsWith(SOURCE_PREFIX)) return null;
  const id = mealId.slice(SOURCE_PREFIX.length);
  return /^[0-9a-f-]{32,36}$/i.test(id) ? id : null;
}

/**
 * What the hub remembers about a Mealie entry that Mealie cannot hold: a
 * serving time for one meal, and which meal a side, dessert or drink was
 * planned with when it was not dinner. Kept in `meals.json` under
 * `mealieExtras`, keyed by the entry's id.
 */
export interface MealieEntryExtra {
  /** 24-hour `HH:MM` serving time of the meal this entry is the main dish of. */
  time?: string;
  /** The meal a side, dessert or drink belongs to, when it is not dinner. */
  slot?: MealSlotType;
  /**
   * Where a course sits among its meal's courses. Mealie keeps a day's
   * entries in the order they were made; the family's order lives here.
   */
  order?: number;
  /**
   * The entry's day and kind. The day lets the hub forget entries well in the
   * past; both together keep a note from passing to a new entry that inherited
   * the number of a deleted one (see `mealieSourceId`).
   */
  date: string;
  type: MealieEntryType;
}

/** The hub's note on `entry`, if it was made for this entry and not an earlier one with its number. */
export function mealieEntryExtra(extras: MealieExtras, entry: Pick<MealiePlanEntry, 'id' | 'date' | 'entryType'>): MealieEntryExtra | undefined {
  const extra = extras[String(entry.id)];
  return extra && extra.date === entry.date && extra.type === entry.entryType ? extra : undefined;
}

export type MealieExtras = Record<string, MealieEntryExtra>;

const SLOT_OF_TYPE: Partial<Record<MealieEntryType, MealSlotType>> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
};

const COURSE_OF_TYPE: Partial<Record<MealieEntryType, MealCourseKind>> = {
  side: 'side',
  dessert: 'dessert',
  drink: 'drink',
};

const TYPE_OF_COURSE: Record<Exclude<MealCourseKind, 'main'>, MealieEntryType> = {
  side: 'side',
  dessert: 'dessert',
  drink: 'drink',
};

/** The meal a Mealie entry belongs to. */
export function mealieEntrySlot(entry: MealiePlanEntry, extras: MealieExtras): MealSlotType {
  return SLOT_OF_TYPE[entry.entryType] ?? mealieEntryExtra(extras, entry)?.slot ?? 'dinner';
}

// ── Times ──

/**
 * Minutes from Mealie's free-text times ("45 minutes", "1 hour 15 minutes",
 * "1h30m", "PT1H30M", "90"). Mealie only fills its `*Seconds` fields for some
 * recipes; the rest carry the text a person typed. Undefined when the text
 * says nothing countable.
 */
export function parseMealieMinutes(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const s = text.trim().toLowerCase();
  if (!s) return undefined;
  const iso = /^p(?:t)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (iso && (iso[1] || iso[2] || iso[3])) {
    const total = Number(iso[1] ?? 0) * 60 + Number(iso[2] ?? 0) + Number(iso[3] ?? 0) / 60;
    return total > 0 ? Math.round(total) : undefined;
  }
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Math.round(Number(s));
    return n > 0 ? n : undefined;
  }
  let total = 0;
  let found = false;
  // A unit may run straight into the next number ("1h30m"), so it ends at
  // the first character that is not a letter rather than at a word boundary.
  const re = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|days?|d)(?![a-z])/g;
  for (const m of s.matchAll(re)) {
    const n = Number(m[1].replace(',', '.'));
    const unit = m[2];
    if (unit.startsWith('h')) total += n * 60;
    else if (unit.startsWith('d')) total += n * 24 * 60;
    else total += n;
    found = true;
  }
  return found && total > 0 ? Math.round(total) : undefined;
}

function minutes(seconds: number | null | undefined, text: string | null | undefined): number | undefined {
  if (typeof seconds === 'number' && seconds > 0) return Math.round(seconds / 60);
  return parseMealieMinutes(text);
}

// ── Recipes ──

/** Where a recipe opens in Mealie's own pages. */
export function mealieRecipePageUrl(baseUrl: string, groupSlug: string, recipeSlug: string): string {
  return `${baseUrl}/g/${encodeURIComponent(groupSlug)}/r/${encodeURIComponent(recipeSlug)}`;
}

export interface MealieContext {
  /** Mealie's address, for links to its recipe pages. */
  baseUrl: string;
  groupSlug: string;
}

/** Where the hub serves a recipe's photo, with a version so a new photo is not served from cache. */
export function mealiePhotoUrl(recipe: Pick<MealieRecipeSummary, 'id' | 'image' | 'dateUpdated' | 'updatedAt'>): string | undefined {
  if (!recipe.image) return undefined;
  const version = typeof recipe.image === 'string' ? recipe.image : recipe.dateUpdated ?? recipe.updatedAt ?? '';
  return `/api/mealie/image/${encodeURIComponent(recipe.id)}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
}

/** A Mealie recipe as the saved meal every view already knows how to draw. */
export function mealieRecipeToMeal(recipe: MealieRecipeSummary, ctx: MealieContext): SavedMeal {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const o of [...(recipe.recipeCategory ?? []), ...(recipe.tags ?? [])]) {
    const name = o?.name?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    tags.push(name);
  }
  const meal: SavedMeal = {
    id: mealieMealId(recipe.id),
    name: recipe.name?.trim() || recipe.slug,
    recipeUrl: mealieRecipePageUrl(ctx.baseUrl, ctx.groupSlug, recipe.slug),
  };
  if (tags.length > 0) meal.tags = tags;
  const prep = minutes(recipe.prepTimeSeconds, recipe.prepTime);
  const cook = minutes(recipe.performTimeSeconds, recipe.performTime ?? recipe.cookTime);
  if (prep) meal.prepTime = prep;
  if (cook) meal.cookTime = cook;
  // A recipe with only a total time shows it where the views show prep time,
  // which is the one time they draw.
  if (!prep && !cook) {
    const total = minutes(recipe.totalTimeSeconds, recipe.totalTime);
    if (total) meal.prepTime = total;
  }
  if (typeof recipe.recipeServings === 'number' && recipe.recipeServings > 0) meal.servings = Math.round(recipe.recipeServings);
  if (typeof recipe.rating === 'number' && recipe.rating > 0) meal.rating = Math.min(5, Math.max(1, Math.round(recipe.rating)));
  const photoUrl = mealiePhotoUrl(recipe);
  if (photoUrl) meal.photoUrl = photoUrl;
  return meal;
}

// ── Reading the plan ──

interface Dish {
  mealId?: string;
  customText?: string;
}

function entryDish(entry: MealiePlanEntry, meals: Map<string, SavedMeal>, ctx: MealieContext): Dish | null {
  if (entry.recipe && entry.recipe.id) {
    const meal = mealieRecipeToMeal(entry.recipe, ctx);
    meals.set(meal.id, meal);
    return { mealId: meal.id };
  }
  const title = entry.title?.trim();
  if (title) return { customText: title };
  // A note with only its longer text, and no title, still says something.
  const text = entry.text?.trim();
  return text ? { customText: text.split('\n')[0].slice(0, 80) } : null;
}

/**
 * Mealie's entries as Home Screens' plan, and the recipes they use as saved
 * meals. `extras` adds what the hub remembers (serving times, which meal a
 * side belongs to).
 */
export function mealieEntriesToPlan(
  entries: MealiePlanEntry[],
  ctx: MealieContext & { extras: MealieExtras },
): { plan: PlannedMeal[]; meals: SavedMeal[] } {
  const meals = new Map<string, SavedMeal>();
  const cells = new Map<string, PlannedMeal>();
  const order = new Map<MealCourse, number | undefined>();
  const ordered = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));

  for (const entry of ordered) {
    const dish = entryDish(entry, meals, ctx);
    if (!dish) continue;
    const slot = mealieEntrySlot(entry, ctx.extras);
    const key = `${entry.date}|${slot}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { date: entry.date, slot };
      cells.set(key, cell);
    }
    const isSlotType = SLOT_OF_TYPE[entry.entryType] !== undefined;
    const hasMain = !!(cell.mealId || cell.customText);
    if (isSlotType && !hasMain) {
      if (dish.mealId) cell.mealId = dish.mealId;
      else cell.customText = dish.customText;
      cell.sourceId = mealieSourceId(entry);
      // A recipe entry's text is Mealie's note on it; a note entry's text is
      // the note's own body, under its title.
      const notes = entry.text?.trim();
      if (notes && (dish.mealId || notes !== dish.customText)) cell.notes = notes;
      const time = mealieEntryExtra(ctx.extras, entry)?.time;
      if (time) cell.time = time;
      continue;
    }
    const course: MealCourse = { kind: isSlotType ? 'main' : COURSE_OF_TYPE[entry.entryType] ?? 'side', sourceId: mealieSourceId(entry) };
    order.set(course, mealieEntryExtra(ctx.extras, entry)?.order);
    if (dish.mealId) course.mealId = dish.mealId;
    else course.customText = dish.customText;
    cell.courses = [...(cell.courses ?? []), course];
  }
  // Courses in the order the family put them in; ones Home Screens has no
  // order for (added in Mealie since) follow, in the order they were made.
  for (const cell of cells.values()) {
    if (!cell.courses || cell.courses.length < 2) continue;
    const rank = (c: MealCourse) => [order.get(c) ?? Number.MAX_SAFE_INTEGER, parseMealieSourceId(c.sourceId) ?? 0];
    cell.courses = [...cell.courses].sort((a, b) => {
      const [oa, ia] = rank(a);
      const [ob, ib] = rank(b);
      return oa - ob || ia - ib;
    });
  }
  return { plan: [...cells.values()], meals: [...meals.values()] };
}

/** The Mealie entries that make up each meal, keyed `date|slot`, as `mealieEntriesToPlan` groups them. */
export function groupMealieEntries(entries: MealiePlanEntry[], extras: MealieExtras): Map<string, MealiePlanEntry[]> {
  const cells = new Map<string, MealiePlanEntry[]>();
  for (const entry of entries) {
    const key = `${entry.date}|${mealieEntrySlot(entry, extras)}`;
    cells.set(key, [...(cells.get(key) ?? []), entry]);
  }
  return cells;
}

// ── Writing a meal back ──

/** One entry a meal should be made of in Mealie, and the entry it already is when it has one. */
export interface MealieDesiredEntry {
  /** The Mealie entry this already is, when it is in the same meal now. */
  existing?: MealiePlanEntry;
  write: MealiePlanEntryWrite;
  /** What the hub must remember about the entry once it exists (absent: nothing). */
  extra?: Omit<MealieEntryExtra, 'date' | 'type'>;
}

export interface MealieCellOps {
  /** In order: the main dish first, then each course. */
  entries: MealieDesiredEntry[];
  /** Entries in the meal now that the change leaves out. */
  deletes: number[];
}

export class MealieMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MealieMapError';
  }
}

function dishWrite(dish: { mealId?: string; customText?: string }, base: Omit<MealiePlanEntryWrite, 'recipeId' | 'title'>): MealiePlanEntryWrite {
  if (dish.mealId) {
    const recipeId = parseMealieMealId(dish.mealId);
    if (!recipeId) throw new MealieMapError('A meal from the Home Screens library cannot go in a Mealie plan');
    return { ...base, recipeId, title: '' };
  }
  return { ...base, recipeId: null, title: dish.customText?.trim() ?? '' };
}

function sameWrite(entry: MealiePlanEntry, write: MealiePlanEntryWrite): boolean {
  return entry.date === write.date
    && entry.entryType === write.entryType
    && (entry.recipeId ?? null) === write.recipeId
    && (entry.title ?? '') === write.title
    && (entry.text ?? '') === write.text;
}

/**
 * What Mealie has to do so one meal (`date`, `slot`) reads back as `after`.
 *
 * `current` is the meal's entries in Mealie right now. An entry of `after`
 * whose `sourceId` names one of them is updated in place (or left alone when
 * nothing changed); anything else is created; whatever of `current` is no
 * longer named is deleted. `after` null clears the meal. A dish from the
 * Home Screens library has no Mealie recipe behind it and is refused: in
 * Mealie mode the pickers only offer Mealie recipes and typed text.
 */
export function cellToMealieOps(
  current: MealiePlanEntry[],
  date: string,
  slot: MealSlotType,
  after: PlannedMeal | null,
): MealieCellOps {
  const byId = new Map(current.map((e) => [e.id, e]));
  const used = new Set<number>();
  const entries: MealieDesiredEntry[] = [];
  // The entry the edit was made on, if it is still that entry: the same
  // number holding something else is a different entry (see `mealieSourceId`).
  const claim = (sourceId: string | undefined): MealiePlanEntry | undefined => {
    const id = parseMealieSourceId(sourceId);
    if (id === null || used.has(id)) return undefined;
    const existing = byId.get(id);
    if (!existing || mealieSourceId(existing) !== sourceId) return undefined;
    used.add(id);
    return existing;
  };

  if (after && (after.mealId || after.customText?.trim())) {
    const write = dishWrite(after, { date, entryType: slot, text: after.notes?.trim() ?? '' });
    const existing = claim(after.sourceId);
    entries.push({ existing, write, ...(after.time ? { extra: { time: after.time } } : {}) });
  }
  const courses = (after?.courses ?? []).filter((c) => c.mealId || c.customText?.trim());
  for (const [index, course] of courses.entries()) {
    const entryType: MealieEntryType = course.kind === 'main' ? slot : TYPE_OF_COURSE[course.kind];
    const existing = claim(course.sourceId);
    // An existing note's longer text belongs to it, not to the course: keep it.
    const write = dishWrite(course, { date, entryType, text: existing?.text ?? '' });
    // A side with breakfast reads back as dinner's unless the hub remembers,
    // and so does the order of a meal with more than one course.
    const needsSlot = course.kind !== 'main' && slot !== 'dinner';
    const extra = { ...(needsSlot ? { slot } : {}), ...(courses.length > 1 ? { order: index } : {}) };
    entries.push({ existing, write, ...(Object.keys(extra).length > 0 ? { extra } : {}) });
  }

  const deletes = current.filter((e) => !used.has(e.id)).map((e) => e.id);
  return { entries, deletes };
}

/** True when an entry of `ops` needs no call to Mealie. */
export function isUnchanged(desired: MealieDesiredEntry): boolean {
  return !!desired.existing && sameWrite(desired.existing, desired.write);
}

const EXTRA_SLOTS: ReadonlySet<string> = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const EXTRA_TYPES: ReadonlySet<string> = new Set(['breakfast', 'lunch', 'dinner', 'side', 'snack', 'drink', 'dessert']);

/** The hub's notes on Mealie entries, as `meals.json` may hold them: anything malformed is dropped. */
export function normalizeMealieExtras(raw: unknown): MealieExtras | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: MealieExtras = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[1-9]\d*$/.test(key) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) continue;
    if (typeof v.type !== 'string' || !EXTRA_TYPES.has(v.type)) continue;
    const extra: MealieEntryExtra = { date: v.date, type: v.type as MealieEntryType };
    if (typeof v.time === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v.time)) extra.time = v.time;
    if (typeof v.slot === 'string' && EXTRA_SLOTS.has(v.slot)) extra.slot = v.slot as MealSlotType;
    if (typeof v.order === 'number' && Number.isInteger(v.order) && v.order >= 0 && v.order < 100) extra.order = v.order;
    if (extra.time || extra.slot || extra.order !== undefined) out[key] = extra;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A recipe's ingredients and steps, in the plain lines a surface lists them as. */
export interface MealieRecipeDetail {
  /** The recipe as a saved meal, like the plan carries it. */
  meal: SavedMeal;
  description?: string;
  /** In Mealie's order; `heading` starts a section ("For the sauce"). */
  ingredients: { heading?: string; text: string }[];
  steps: { heading?: string; text: string }[];
}

export function mealieRecipeDetail(recipe: MealieRecipe, ctx: MealieContext): MealieRecipeDetail {
  const ingredients: MealieRecipeDetail['ingredients'] = [];
  for (const ing of recipe.recipeIngredient ?? []) {
    const text = (ing.display || ing.note || ing.originalText || '').trim();
    const heading = ing.title?.trim() || undefined;
    if (text || heading) ingredients.push({ ...(heading ? { heading } : {}), text });
  }
  const steps: MealieRecipeDetail['steps'] = [];
  for (const step of recipe.recipeInstructions ?? []) {
    const text = (step.text ?? '').trim();
    const heading = step.title?.trim() || undefined;
    if (text) steps.push({ ...(heading ? { heading } : {}), text });
  }
  const description = recipe.description?.trim();
  return { meal: mealieRecipeToMeal(recipe, ctx), ...(description ? { description } : {}), ingredients, steps };
}
