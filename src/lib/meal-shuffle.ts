import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { SLOT_TAGS, normalizeTag } from '@/lib/meal-constants';
import { mealKind } from '@/lib/meal-dish-rules';

/** Slot tag names that restrict which slot a meal can be assigned to */
const SLOT_TAG_SET = new Set<string>(SLOT_TAGS);

/**
 * The slots a main dish the family has never placed may fill. Any main will
 * do for lunch or dinner, but a breakfast or a snack is a meal the family says
 * is one: lasagna is never a breakfast and pizza never a snack.
 */
const OPEN_SLOTS: ReadonlySet<MealSlotType> = new Set<MealSlotType>(['lunch', 'dinner']);

/**
 * The slots a meal belongs in: the slots its tags name, or else the slot the
 * family has planned it in most (popcorn planned as a snack is a snack, not a
 * dinner). Empty for a meal with neither.
 */
function homeSlots(meal: SavedMeal, history: readonly PlannedMeal[]): Set<string> {
  const tagged = new Set((meal.tags ?? []).map(normalizeTag).filter((tag) => SLOT_TAG_SET.has(tag)));
  if (tagged.size > 0) return tagged;
  const times = new Map<string, number>();
  for (const p of history) if (p.mealId === meal.id) times.set(p.slot, (times.get(p.slot) ?? 0) + 1);
  const most = Math.max(0, ...times.values());
  return new Set([...times].filter(([, n]) => n === most).map(([slot]) => slot));
}

/** A copy of `items` in random order. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface SuggestOptions {
  /**
   * The family's plan outside the week being filled. A meal with no slot tag
   * goes in the slot the family has planned it in most.
   */
  history?: readonly PlannedMeal[];
  /** A number in [0, 1) like Math.random, which it defaults to; tests pass a seeded one. */
  random?: () => number;
}

/**
 * Suggest a week of meals from the family's own library.
 *
 * - Only main dishes are picked. A meal saved as a side, a dessert or a drink
 *   goes with a meal; it is never the meal itself.
 * - A meal tagged for a slot (breakfast, lunch, dinner, snack) goes only in
 *   that slot, and is picked before one that is not. A meal with no slot tag
 *   counts as the meal the family has planned it as most, and one never
 *   planned goes in lunch or dinner, never breakfast or snack.
 * - Dinners are filled first, so they have the pick of the library.
 * - No meal comes twice in the week while the library has another. When a
 *   slot runs out, only its own meals come round again (the family's usual
 *   breakfasts), never twice in one day and not two days running where
 *   another will do.
 * - A slot with nothing sensible for it is left empty.
 *
 * @param weekDates — the ISO dates of the week to fill, in order
 */
export function generateRandomPlan(
  savedMeals: SavedMeal[],
  slots: MealSlotType[],
  weekDates: string[],
  { history = [], random = Math.random }: SuggestOptions = {},
): PlannedMeal[] {
  const mains = savedMeals.filter((m) => mealKind(m) === 'main');
  const homes = new Map(mains.map((m) => [m.id, homeSlots(m, history)]));
  const uses = new Map<string, number>();
  const onDay = new Map(weekDates.map((date) => [date, new Set<string>()]));
  const picks = new Map<string, string>();
  const place = (date: string, slot: MealSlotType, mealId: string) => {
    picks.set(`${date}|${slot}`, mealId);
    onDay.get(date)!.add(mealId);
    uses.set(mealId, (uses.get(mealId) ?? 0) + 1);
  };

  const order = [...slots.filter((s) => s === 'dinner'), ...slots.filter((s) => s !== 'dinner')];
  for (const slot of order) {
    const own = mains.filter((m) => homes.get(m.id)!.has(slot));
    const unplaced = OPEN_SLOTS.has(slot) ? mains.filter((m) => homes.get(m.id)!.size === 0) : [];
    const fresh = (m: SavedMeal) => !uses.has(m.id);
    // Meals not in the week yet, this slot's own first, then shuffled so
    // those do not all land at the start of the week.
    const unused = shuffled(
      [...shuffled(own.filter(fresh), random), ...shuffled(unplaced.filter(fresh), random)]
        .slice(0, weekDates.length),
      random,
    );
    let previous: string | undefined;
    for (const date of weekDates) {
      let mealId = unused.shift()?.id;
      if (!mealId) {
        // Out of new meals: one of this slot's own again, the least used, not
        // one already eaten today, and not yesterday's if there is another.
        const today = onDay.get(date)!;
        const free = own.filter((m) => !today.has(m.id));
        const notAgain = free.filter((m) => m.id !== previous);
        const pool = notAgain.length > 0 ? notAgain : free;
        const fewest = Math.min(...pool.map((m) => uses.get(m.id) ?? 0));
        const least = pool.filter((m) => (uses.get(m.id) ?? 0) === fewest);
        mealId = least.length > 0 ? least[Math.floor(random() * least.length)].id : undefined;
      }
      previous = mealId;
      if (mealId) place(date, slot, mealId);
    }
  }

  const plan: PlannedMeal[] = [];
  for (const date of weekDates) {
    for (const slot of slots) {
      const mealId = picks.get(`${date}|${slot}`);
      if (mealId) plan.push({ date, slot, mealId });
    }
  }
  return plan;
}
