import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readMealData, updateMealData, prunePlan, type MealData } from '@/lib/meal-data';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, assertOptionalArrays, parseJsonBody } from '@/lib/api-utils';
import { normalizeMealSettings } from '@/lib/meal-constants';

export const dynamic = 'force-dynamic';

/** GET /api/meals/data — return saved meals + plan + grocery checked state + shared settings */
export const GET = withDisplayAuth(async () => {
  const data = await readMealData();
  return NextResponse.json(data);
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
  }>(req);
  if (body instanceof NextResponse) return body;
  const { savedMeals, plan, groceryChecked, settings, force } = body;

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

  // Atomic read-modify-write — the mutator sees the most recent on-disk state
  // and no other writer can land between its read and its write. Throwing a
  // Response from inside short-circuits to the caller (withAuth re-throws).
  const data = await updateMealData(async (existing) => {
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

  return NextResponse.json(data);
}, 'Failed to update meal data');
