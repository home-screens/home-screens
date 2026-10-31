import type { MealData } from './meal-data';
import { mealRevision } from './meal-revision';
import { readConfigCached } from './config-cache';
import { settingsTimeFormat } from './clock-time';
import { buildDefaultMealieBlock, buildMealieBlock } from './mealie-plan';
import { getMealieConfig } from './mealie';

/**
 * The stored data as a client sees it: the internal migration marker never
 * goes on the wire (client state must not grow a dependency on migration
 * machinery), and the revision a save has to quote is always present.
 */
export function mealsWire(data: MealData) {
  const { timeFormatLegacyStripped: _marker, mealieExtras: _extras, ...rest } = data;
  void _marker;
  void _extras;
  return { ...rest, revision: mealRevision(data) };
}

/**
 * The whole answer a meal surface adopts: the stored data, the household time
 * format, and, while the plan lives in Mealie, Mealie's plan for the weeks
 * around today (see `meal-sources.ts`). A Mealie problem never fails the
 * request; it arrives as the block's status.
 */
export async function mealsAnswer(data: MealData, mealieRange?: { start: string; end: string }) {
  const [config, mealieConnected, mealie] = await Promise.all([
    readConfigCached(),
    // Whether the switch to Mealie can be offered at all.
    getMealieConfig().then((cfg) => cfg !== null, () => false),
    data.settings.planSource !== 'mealie'
      ? Promise.resolve(undefined)
      // A surface paging past the shared weeks asks for the days it shows, so
      // the answer to its save still holds them.
      : mealieRange ? buildMealieBlock(mealieRange, data.mealieExtras) : buildDefaultMealieBlock(data.settings, data.mealieExtras),
  ]);
  return {
    ...mealsWire(data),
    globalTimeFormat: settingsTimeFormat(config.settings),
    mealieConnected,
    ...(mealie ? { mealie } : {}),
  };
}
