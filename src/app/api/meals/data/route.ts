import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readMealData, updateMealData, prunePlan, type MealData } from '@/lib/meal-data';
import { readConfigCached } from '@/lib/config-cache';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, assertOptionalArrays, parseJsonBody } from '@/lib/api-utils';
import { normalizeMealSettings } from '@/lib/meal-constants';
import { mealRevision } from '@/lib/meal-revision';
import { settingsTimeFormat } from '@/lib/clock-time';

export const dynamic = 'force-dynamic';

/**
 * The stored data as a client sees it: the internal migration marker never
 * goes on the wire (client state must not grow a dependency on migration
 * machinery), and the revision a save has to quote is always present.
 */
function toWire(data: MealData) {
  const { timeFormatLegacyStripped: _marker, ...rest } = data;
  void _marker;
  return { ...rest, revision: mealRevision(data) };
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
  const [data, config] = await Promise.all([readMealData(), readConfigCached()]);
  return NextResponse.json({
    ...toWire(data),
    globalTimeFormat: settingsTimeFormat(config.settings),
  });
}, 'Failed to read meal data');

/**
 * PUT /api/meals/data — partial update.
 *
 * Every field in the body is optional. Omitted fields are preserved from the
 * existing on-disk data, so callers can write only what they actually changed:
 *   - meals modal sends `{ savedMeals, plan }` (settings preserved)
 *   - settings sheets send `{ settings }` (meals/plan/groceries preserved)
 *   - grocery checks send `{ savedMeals, plan, groceryChecked }`
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
    groceryChecked?: MealData['groceryChecked'];
    settings?: unknown;
    force?: boolean;
    revision?: unknown;
  }>(req);
  if (body instanceof NextResponse) return body;
  const { savedMeals, plan, groceryChecked, settings, force, revision } = body;

  const arrayCheck = assertOptionalArrays(body, ['savedMeals', 'plan', 'groceryChecked']);
  if (arrayCheck) return arrayCheck;

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
          ...toWire(existing),
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

    return {
      savedMeals: hasSavedMeals ? savedMeals : existing.savedMeals,
      plan: hasPlan ? prunePlan(plan) : existing.plan,
      groceryChecked: hasGroceryChecked ? groceryChecked : existing.groceryChecked,
      settings: hasSettings ? normalizeMealSettings(settings) : existing.settings,
    };
  });

  // The same shape as GET, so a client can adopt the response as its next
  // snapshot and hand it to the display cache without asking again.
  const config = await readConfigCached();
  return NextResponse.json({
    ...toWire(data),
    globalTimeFormat: settingsTimeFormat(config.settings),
  });
}, 'Failed to update meal data');
