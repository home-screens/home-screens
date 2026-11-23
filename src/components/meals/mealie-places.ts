import type { TranslateFn } from '@/i18n/types';
import { settingsPlaceText } from '@/lib/settings-route';

/**
 * Where a Mealie problem is fixed, for the editor's and the phone's Mealie
 * lines alike: `{place}` is the page that holds Mealie's address and token
 * (Settings > API keys), `{mealsPlace}` the page that sets where the meal plan
 * comes from (Settings > Meals). A line that names neither ignores them.
 */
export function mealiePlaces(tCore: TranslateFn): { place: string; mealsPlace: string } {
  return {
    place: settingsPlaceText(tCore, 'integrations'),
    mealsPlace: settingsPlaceText(tCore, 'meals'),
  };
}
