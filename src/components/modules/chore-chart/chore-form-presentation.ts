import type { ChoreDefinition, ChoreRotation } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import { getTimeOfDayLabelKey } from './types';

/**
 * Discriminated kind for the chore-form validation hint. Computed
 * separately from `form-hooks.ts` (which returns an English literal)
 * so the rendered hint always resolves through `t()`.
 */
export type ChoreValidationHintKind =
  | 'enterName'
  | 'addPersonToSchedule'
  | 'selectAtLeastOnePerson';

export function getChoreValidationHintKind(args: {
  name: string;
  rotation: ChoreRotation;
  scheduleHasAssignment: boolean;
  assigneeIdsLength: number;
}): ChoreValidationHintKind | null {
  if (!args.name.trim()) return 'enterName';
  if (args.rotation === 'schedule' && !args.scheduleHasAssignment) {
    return 'addPersonToSchedule';
  }
  if (args.rotation !== 'schedule' && args.assigneeIdsLength === 0) {
    return 'selectAtLeastOnePerson';
  }
  return null;
}

/**
 * Compose the per-chore secondary line ("Daily · Morning · 2 tickets").
 *
 * Both the editor (`ChoreChartModal`) and /remote (`ChoresManageView`)
 * read the same `chore-chart.choreSummary.*` keys, which live in the
 * `modules` namespace so /remote and /chores never have to pull the 181 KB
 * editor dictionary for a handful of chore words. Callers supply a single `t`
 * bound to `useTranslate('modules')`. Frequency, time-of-day, and ticket
 * pluralization each route through `t()` independently and the joiner ("·")
 * stays a verbatim glyph.
 */
export function buildChoreSummaryLine(args: {
  chore: ChoreDefinition;
  t: TranslateFn;
}): string {
  const { chore, t } = args;
  let frequencyLabel: string;
  if (chore.frequency === 'daily') frequencyLabel = t('chore-chart.choreSummary.daily');
  else if (chore.frequency === 'biweekly') frequencyLabel = t('chore-chart.choreSummary.biweekly');
  else if (chore.frequency === 'once') {
    frequencyLabel = chore.specificDate
      ? t('chore-chart.choreSummary.once', { date: chore.specificDate })
      : t('chore-chart.choreSummary.onceNoDate');
  } else frequencyLabel = t('chore-chart.choreSummary.weekly');

  const timeOfDayLabel = t(getTimeOfDayLabelKey(chore.timeOfDay));
  const ticketsLabel = chore.points === 1
    ? t('chore-chart.choreSummary.ticketCountSingular', { count: chore.points })
    : t('chore-chart.choreSummary.ticketCountPlural', { count: chore.points });

  return `${frequencyLabel} · ${timeOfDayLabel} · ${ticketsLabel}`;
}
