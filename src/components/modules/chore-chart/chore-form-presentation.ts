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
 * read the same `choreChartModal.choreSummary.*` keys from the editor
 * namespace, so callers must supply a `t` bound to `useTranslate('editor')`.
 * Frequency, time-of-day, and ticket pluralization each route through
 * `t()` independently and the joiner ("·") stays a verbatim glyph.
 */
export function buildChoreSummaryLine(args: {
  chore: ChoreDefinition;
  t: TranslateFn;
  tModules: TranslateFn;
}): string {
  const { chore, t, tModules } = args;
  let frequencyLabel: string;
  if (chore.frequency === 'daily') frequencyLabel = t('choreChartModal.choreSummary.daily');
  else if (chore.frequency === 'biweekly') frequencyLabel = t('choreChartModal.choreSummary.biweekly');
  else if (chore.frequency === 'once') {
    frequencyLabel = chore.specificDate
      ? t('choreChartModal.choreSummary.once', { date: chore.specificDate })
      : t('choreChartModal.choreSummary.onceNoDate');
  } else frequencyLabel = t('choreChartModal.choreSummary.weekly');

  const timeOfDayLabel = tModules(getTimeOfDayLabelKey(chore.timeOfDay));
  const ticketsLabel = chore.points === 1
    ? t('choreChartModal.choreSummary.ticketCountSingular', { count: chore.points })
    : t('choreChartModal.choreSummary.ticketCountPlural', { count: chore.points });

  return `${frequencyLabel} · ${timeOfDayLabel} · ${ticketsLabel}`;
}
