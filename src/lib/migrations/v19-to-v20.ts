/**
 * Migration 020: two full-screen calendar switches stop belonging to one view.
 *
 * - `monthShowWeekNumbers` becomes `showWeekNumbers`, which the Week list, the
 *   Family grid and a week-anchored Schedule now read too (the week number in
 *   their title).
 * - `dayShowLocation` becomes `showLocation`, which the Week list, the Agenda
 *   and Up next now read too. Those three always drew the location before.
 *
 * Each old switch was offered, and read, in one view only, but its value
 * stayed on the module when the view was changed. Carrying it over as it
 * stands would let a switch nobody could see change another view: week
 * numbers turned on for a Month grid long ago would appear in a Week list's
 * title, and a location hidden on a Day timeline would vanish from an Agenda.
 * So the old value is carried only for the view that was reading it, and
 * every other calendar gets what it draws today: no week numbers, locations
 * shown. Nothing on a wall changes.
 *
 * The Day timeline read its switch as "on only when true" while the editor
 * showed an absent value as on; the wall is what is kept.
 */

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from './module-walk';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const v19ToV20 = {
  version: 20,
  description: 'Full-screen calendar week numbers and locations become one switch each for every view',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    ...mapConfigModules(config, (mod) => {
      if (mod.type !== 'fullscreen-calendar' || !isRecord(mod.config)) return mod;
      const { monthShowWeekNumbers, dayShowLocation, ...rest } = mod.config;
      // A calendar already written in the new shape keeps what it says.
      const showWeekNumbers = typeof rest.showWeekNumbers === 'boolean'
        ? rest.showWeekNumbers
        : rest.view === 'month-grid' && monthShowWeekNumbers === true;
      const showLocation = typeof rest.showLocation === 'boolean'
        ? rest.showLocation
        : rest.view === 'day-timeline' ? dayShowLocation === true : true;
      return { ...mod, config: { ...rest, showWeekNumbers, showLocation } } as typeof mod;
    }),
    version: 20,
  }),
};
