import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readMealData, updateMealData, prunePlan, type MealData } from '@/lib/meal-data';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, assertOptionalArrays, parseJsonBody } from '@/lib/api-utils';
import { normalizeMealSettings } from '@/lib/meal-constants';
import { isGroceryChecked, normalizeGroceryChecked, pruneGroceryChecked, rekeyGroceryChecked } from '@/lib/grocery-checks';
import { mealRevision } from '@/lib/meal-revision';
import { normalizeStoredPlanEntry } from '@/lib/meal-courses';
import { mealsAnswer, mealsWire } from '@/lib/meal-answer';

export const dynamic = 'force-dynamic';

function cameFromMealie(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as { sourceId?: unknown; courses?: unknown };
  if (e.sourceId !== undefined) return true;
  return Array.isArray(e.courses) && e.courses.some((c) => !!c && typeof c === 'object' && (c as { sourceId?: unknown }).sourceId !== undefined);
}

/**
 * GET /api/meals/data — return saved meals + plan + grocery checked state + shared settings.
 * `globalTimeFormat` mirrors GlobalSettings.timeFormat so meal surfaces can
 * resolve "absent override → follow global" without a second config fetch.
 *
 * A corrupt config.json deliberately fails closed here (the read throws →
 * 500): a corrupt hub config is a hub-wide emergency, and meals shouldn't
 * silently limp along on a default while everything else is broken. The
 * cached read preserves that: config-cache never caches errors, and
 * in-process writes invalidate it, so displays polling every 60s share one
 * config parse without serving stale or defaulted settings.
 *
 */
export const GET = withDisplayAuth(async () => {
  return NextResponse.json(await mealsAnswer(await readMealData()));
}, 'Failed to read meal data');

/**
 * PUT /api/meals/data — partial update.
 *
 * Every field in the body is optional. Omitted fields are preserved from the
 * existing on-disk data, so callers can write only what they actually changed:
 *   - meals modal sends `{ savedMeals, plan }` (settings preserved)
 *   - settings sheets send `{ settings }` (meals/plan/groceries preserved)
 *   - a whole set of grocery ticks sends `{ groceryChecked }` (one tick at a
 *     time goes through `POST /api/meals/grocery`)
 *
 * Required: at least one writable field must be present (otherwise the request
 * is a no-op and returns 400). Each present field must be a valid type.
 *
 * A write of `savedMeals` or `plan` replaces that array whole, so it has to
 * quote the `revision` it was built from (see `mealRevision`). One built from
 * an older copy comes back as a 409 carrying what is stored now, with
 * `reason: 'revision'` so the client can tell it from the empty-overwrite
 * guard's 409, re-apply its edit to the fresh copy and try again.
 *
 * The empty-overwrite guard runs whenever `savedMeals` OR `plan` is being
 * written — previously it only ran when both were present, which let a
 * `{ savedMeals: [] }` request wipe the meal library without the guard
 * firing. Settings-only and grocery-only writes still bypass the guard
 * because they can't touch savedMeals/plan.
 *
 * The entire read-modify-write cycle runs inside `updateMealData`, which
 * serializes through the json-store write queue. This prevents cross-surface
 * writers (editor settings, /remote, grocery checks, migration) from
 * interleaving and silently losing each other's edits.
 */
export const PUT = withAuth(async (req: NextRequest) => {
  const body = await parseJsonBody<{
    savedMeals?: MealData['savedMeals'];
    plan?: MealData['plan'];
    groceryChecked?: unknown;
    settings?: unknown;
    force?: boolean;
    revision?: unknown;
  }>(req);
  if (body instanceof NextResponse) return body;
  const { savedMeals, plan, groceryChecked, settings, force, revision } = body;

  const arrayCheck = assertOptionalArrays(body, ['savedMeals', 'plan']);
  if (arrayCheck) return arrayCheck;
  if (groceryChecked !== undefined && !isGroceryChecked(groceryChecked)) {
    return NextResponse.json(
      { error: 'groceryChecked must map the date each week starts on (YYYY-MM-DD) to a list of item names' },
      { status: 400 },
    );
  }

  // Determine which fields are present so we know what to write
  const hasSavedMeals = savedMeals !== undefined;
  const hasPlan = plan !== undefined;
  const hasGroceryChecked = groceryChecked !== undefined;
  const hasSettings = settings !== undefined;

  if (!hasSavedMeals && !hasPlan && !hasGroceryChecked && !hasSettings) {
    return NextResponse.json(
      { error: 'PUT body must include at least one of: savedMeals, plan, groceryChecked, settings' },
      { status: 400 },
    );
  }

  // A plan read from Mealie carries `sourceId`s and lives in Mealie: a surface
  // that sends one here has lost track of where the plan is, and storing it
  // would leave a copy of Mealie's week in meals.json.
  if (hasPlan && plan.some(cameFromMealie)) {
    return NextResponse.json(
      { error: 'This meal plan lives in Mealie. Reopen the meal planner and try again.' },
      { status: 400 },
    );
  }

  const replacesArrays = hasSavedMeals || hasPlan;
  if (replacesArrays && (typeof revision !== 'string' || !revision)) {
    return NextResponse.json(
      { error: 'Reopen the meal planner and try again.' },
      { status: 400 },
    );
  }

  // Atomic read-modify-write — the mutator sees the most recent on-disk state
  // and no other writer can land between its read and its write. Throwing a
  // Response from inside short-circuits to the caller (withAuth re-throws).
  const data = await updateMealData(async (existing) => {
    // The revision check shares the queue with the write, so a save that lands
    // between this client's read and its write is seen rather than clobbered.
    if (replacesArrays && revision !== mealRevision(existing)) {
      throw NextResponse.json(
        {
          error: 'Somebody else changed the meals. Your change was not saved; try it again.',
          reason: 'revision',
          ...mealsWire(existing),
        },
        { status: 409 },
      );
    }
    // Empty-overwrite guard: fires whenever savedMeals OR plan is being
    // written as an empty array against non-empty existing data. We build
    // the projected incoming/existing pairs based on which fields are
    // present in the body — a request that only touches savedMeals is
    // only guarded against wiping savedMeals, and similarly for plan.
    if (hasSavedMeals || hasPlan) {
      const incoming: unknown[][] = [];
      const existingPair: unknown[][] = [];
      if (hasSavedMeals) {
        incoming.push(savedMeals);
        existingPair.push(existing.savedMeals);
      }
      if (hasPlan) {
        incoming.push(plan);
        existingPair.push(existing.plan);
      }
      const guard = await guardEmptyOverwrite(
        incoming,
        async () => existingPair,
        'meal',
        force,
      );
      if (guard) throw guard;
    }

    const nextPlan = hasPlan ? prunePlan(plan.map(normalizeStoredPlanEntry)) : existing.plan;
    const nextSettings = hasSettings ? normalizeMealSettings(settings) : existing.settings;
    // Ticks are kept per week, keyed by the day the week starts on. Sent ticks
    // are taken as they are; stored ones follow a change of week start day to
    // the week that now holds them. Either way a week with nothing planned
    // loses its ticks once the plan is written, so clearing a week and
    // planning it again starts its shopping list over instead of bringing
    // back what was bought the first time.
    const carriedGroceryChecked = hasGroceryChecked
      ? normalizeGroceryChecked(groceryChecked)
      : nextSettings.weekStartDay !== existing.settings.weekStartDay
        ? rekeyGroceryChecked(existing.groceryChecked, nextSettings.weekStartDay)
        : existing.groceryChecked;
    const nextGroceryChecked = hasGroceryChecked || hasPlan
      ? pruneGroceryChecked(carriedGroceryChecked, nextPlan, nextSettings.weekStartDay)
      : carriedGroceryChecked;

    // What the hub keeps for itself (Mealie's extras, the chosen shopping
    // list) is never in a client's body, so it comes along as stored.
    return {
      ...existing,
      savedMeals: hasSavedMeals ? savedMeals : existing.savedMeals,
      plan: nextPlan,
      groceryChecked: nextGroceryChecked,
      settings: nextSettings,
    };
  });

  // The same shape as GET, so a client can adopt the response as its next
  // snapshot and hand it to the display cache without asking again.
  return NextResponse.json(await mealsAnswer(data));
}, 'Failed to update meal data');
