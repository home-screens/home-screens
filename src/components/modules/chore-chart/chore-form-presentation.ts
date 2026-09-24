import type { ChoreBonusClaim, ChoreBonusComesBack, ChoreDefinition, ChoreResetFrequency, ChoreRotation, ChoreSettings } from '@/types/config';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { TranslateFn } from '@/i18n';
import { choreAssigneeIds, getTimeOfDayLabelKey } from './types';

/**
 * Discriminated kind for the chore-form validation hint. Computed
 * separately from `form-hooks.ts` (which returns an English literal)
 * so the rendered hint always resolves through `t()`.
 */
export type ChoreValidationHintKind =
  | 'enterName'
  | 'addPersonToSchedule'
  | 'addPersonOrGroupToSchedule'
  | 'selectAtLeastOnePerson'
  | 'selectAtLeastOnePersonOrGroup'
  | 'selectAtLeastOneDay'
  | 'familyNotReady';

/**
 * The line under a bonus chore's Comes back: what coming back means for who
 * gets the tickets. "Done until next Monday" is wrong for an everyone-can
 * chore, where each person still gets their turn.
 */
export function comesBackHintKey(claim: ChoreBonusClaim, comesBack: ChoreBonusComesBack): string {
  return `chore-chart.choreForm.${claim === 'each' ? 'comesBackHintEach' : 'comesBackHint'}.${comesBack}`;
}

/**
 * The household's grab rules as one line ("One grab at a time · a grab ends
 * at bedtime"), shown above the bonus chores on the phone and in the editor.
 */
export function grabRulesSummary(settings: ChoreSettings, t: TranslateFn): { limit: string; hold: string } {
  return {
    limit: t(`chore-chart.settings.summary.limit.${settings.grabLimit}`),
    hold: t(`chore-chart.settings.summary.hold.${settings.grabHold}`),
  };
}

/** Every day of the week, Sunday first, matching `ChoreDefinition.daysOfWeek`. */
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * The days a chore's day row starts on before anyone has picked any.
 *
 * Daily means every day, so the row arrives full. Weekly and every-other-week
 * are a question ("which days?"), so the row arrives empty and a tap turns a
 * day on. A row that arrives full under those frequencies turns the two days
 * you tap OFF and saves the other five. A one-time chore picks a date instead
 * and never reads its days.
 */
export function defaultChoreDays(frequency: ChoreResetFrequency): number[] {
  return frequency === 'daily' ? [...EVERY_DAY] : [];
}

export function getChoreValidationHintKind(args: {
  name: string;
  rotation: ChoreRotation;
  scheduleHasAssignment: boolean;
  assigneeIdsLength: number;
  /** Groups picked on the form. A chore is valid with people, groups or both. */
  assigneeGroupIdsLength: number;
  /** Whether the household has any groups to pick; without them the hint never mentions one. */
  hasGroups: boolean;
  /** False while the family list has not loaded; nothing about people or groups can be judged until it has. */
  familyReady: boolean;
  /** A one-time chore answers "when" with a date, so it is never asked for days. */
  frequency: ChoreResetFrequency;
  /** Days on the day row. A recurring chore with none reads as "never" and is not saved. */
  daysOfWeekLength: number;
}): ChoreValidationHintKind | null {
  if (!args.familyReady) return 'familyNotReady';
  if (!args.name.trim()) return 'enterName';
  if (args.rotation === 'schedule' && !args.scheduleHasAssignment) {
    return args.hasGroups ? 'addPersonOrGroupToSchedule' : 'addPersonToSchedule';
  }
  if (args.rotation !== 'schedule' && args.assigneeIdsLength === 0 && args.assigneeGroupIdsLength === 0) {
    return args.hasGroups ? 'selectAtLeastOnePersonOrGroup' : 'selectAtLeastOnePerson';
  }
  // On a schedule the days live in the grid, which has already been checked.
  if (args.rotation !== 'schedule' && args.frequency !== 'once' && args.daysOfWeekLength === 0) {
    return 'selectAtLeastOneDay';
  }
  return null;
}

/**
 * Compose the per-chore secondary line ("Weekly · Tue, Fri · Morning · 2 tickets").
 *
 * Both the editor (`ChoreChartModal`) and /remote (`ChoresManageView`)
 * read the same `chore-chart.choreSummary.*` keys, which live in the
 * `modules` namespace so /remote and /chores never have to pull the 181 KB
 * editor dictionary for a handful of chore words. Callers supply a single `t`
 * bound to `useTranslate('modules')`. Frequency, time-of-day, and ticket
 * pluralization each route through `t()` independently and the joiner ("·")
 * stays a verbatim glyph.
 *
 * The days are named whenever a chore does not run every day, because
 * otherwise a chore saved on the wrong days reads exactly like one saved on
 * the right ones, and nobody finds out until it fails to appear. A chore that
 * does run every day, and a one-time chore that shows its date, leave them out
 * so the line stays one phone-width line.
 */
export function buildChoreSummaryLine(args: {
  chore: ChoreDefinition;
  t: TranslateFn;
  /** Weekday names for the formatting locale, Sunday first, from `getLocalizedDayNames`. */
  dayNames: readonly string[];
}): string {
  const { chore, t, dayNames } = args;
  const ticketsLabel = chore.points === 1
    ? t('chore-chart.choreSummary.ticketCountSingular', { count: chore.points })
    : t('chore-chart.choreSummary.ticketCountPlural', { count: chore.points });
  // A bonus chore shows on its days whatever frequency it kept from its regular life.
  const showDays = (!!chore.bonus || chore.frequency !== 'once') && chore.daysOfWeek.length > 0 && chore.daysOfWeek.length < EVERY_DAY.length;
  const daysLabel = showDays
    ? [...chore.daysOfWeek].sort((a, b) => a - b).map((d) => dayNames[d]).join(', ')
    : null;

  // A bonus chore has no time of day and no frequency of its own: it says
  // what kind it is and when it comes back ("Up for grabs · every week · 5 tickets").
  if (chore.bonus) {
    const kindLabel = t(chore.bonus.claim === 'first' ? 'chore-chart.bonus.upForGrabs' : 'chore-chart.bonus.everyoneCan');
    const comesBackLabel = t(`chore-chart.bonus.comesBackSummary.${chore.bonus.comesBack}`);
    return [kindLabel, comesBackLabel, daysLabel, ticketsLabel].filter(Boolean).join(' · ');
  }

  let frequencyLabel: string;
  if (chore.frequency === 'daily') frequencyLabel = t('chore-chart.choreSummary.daily');
  else if (chore.frequency === 'biweekly') frequencyLabel = t('chore-chart.choreSummary.biweekly');
  else if (chore.frequency === 'once') {
    frequencyLabel = chore.specificDate
      ? t('chore-chart.choreSummary.once', { date: chore.specificDate })
      : t('chore-chart.choreSummary.onceNoDate');
  } else frequencyLabel = t('chore-chart.choreSummary.weekly');

  const timeOfDayLabel = t(getTimeOfDayLabelKey(chore.timeOfDay));

  return [frequencyLabel, daysLabel, timeOfDayLabel, ticketsLabel].filter(Boolean).join(' · ');
}

/**
 * Who a chore goes to, for the chore lists: its groups by name, then the
 * people it names directly. A chore with nobody on it (what a removed group
 * leaves behind) says so rather than showing a blank line.
 */
export function buildChoreAssigneeLine(args: {
  chore: ChoreDefinition;
  members: readonly FamilyMember[];
  groups: readonly FamilyGroup[];
  unknownLabel: string;
  nobodyLabel: string;
}): string {
  const { chore, members, groups, unknownLabel, nobodyLabel } = args;
  const groupNames = (chore.assigneeGroupIds ?? []).flatMap((id) => groups.find((group) => group.id === id)?.name ?? []);
  const memberNames = chore.assigneeIds.map((id) => members.find((member) => member.id === id)?.name ?? unknownLabel);
  return [...groupNames, ...memberNames].join(', ') || nobodyLabel;
}

/** The "(rotate weekly)" suffix key for a chore list row, or null when everyone has it every time. */
export function getChoreRotationSummaryKey(chore: ChoreDefinition, groups: readonly FamilyGroup[]): string | null {
  // A bonus chore keeps its regular turns for later but is not shared by them.
  if (chore.bonus) return null;
  if (chore.rotation === 'schedule') return 'chore-chart.choreSummary.rotationSchedule';
  if (chore.rotation === 'fixed' || choreAssigneeIds(chore, groups).length <= 1) return null;
  return chore.rotation === 'rotate-daily'
    ? 'chore-chart.choreSummary.rotationDaily'
    : 'chore-chart.choreSummary.rotationWeekly';
}

/** The rows of a schedule grid that have at least one day; a row with none is not saved. */
function rowsWithDays(rows: Record<string, number[]>): Record<string, number[]> {
  return Object.fromEntries(Object.entries(rows).filter(([, days]) => days.length > 0));
}

/** Every day some row of a schedule covers, in week order. */
export function scheduleDaysCovered(schedule: Record<string, number[]>, groupSchedule: Record<string, number[]>): number[] {
  return [...new Set([...Object.values(schedule), ...Object.values(groupSchedule)].flat())].sort((a, b) => a - b);
}

/**
 * Who a saved chore goes to and how it is shared, from what the form holds.
 * On a schedule the people and groups are whoever has a row with a day in it,
 * so `assigneeIds` and `assigneeGroupIds` always say who the chore can reach
 * whichever way it is shared. Rotation falls back to `fixed` when nobody is
 * left to take turns with, counted after groups are expanded: one group of
 * five is five people, not one. A chore that goes to a group keeps its
 * rotation however small the group is today, because the group can grow and
 * the turns should start when it does.
 */
export function finalizeChoreAssignment(args: {
  rotation: ChoreRotation;
  schedule: Record<string, number[]>;
  groupSchedule: Record<string, number[]>;
  assigneeIds: string[];
  assigneeGroupIds: string[];
  groups: readonly FamilyGroup[];
}): Pick<ChoreDefinition, 'assigneeIds' | 'assigneeGroupIds' | 'rotation' | 'schedule' | 'groupSchedule'> {
  const isSchedule = args.rotation === 'schedule';
  const schedule = rowsWithDays(args.schedule);
  const groupSchedule = rowsWithDays(args.groupSchedule);
  const assigneeIds = isSchedule ? Object.keys(schedule) : args.assigneeIds;
  const assigneeGroupIds = isSchedule ? Object.keys(groupSchedule) : args.assigneeGroupIds;
  const count = choreAssigneeIds({ assigneeIds, assigneeGroupIds }, args.groups).length;
  return {
    assigneeIds,
    ...(assigneeGroupIds.length > 0 ? { assigneeGroupIds } : {}),
    rotation: canChoreRotate({ assigneeCount: count, assigneeGroupIdsLength: assigneeGroupIds.length, rotation: args.rotation }) ? args.rotation : 'fixed',
    ...(isSchedule ? { schedule } : {}),
    ...(isSchedule && assigneeGroupIds.length > 0 ? { groupSchedule } : {}),
  };
}

/** Whether "how is it shared" is a real question for this chore, which is also when the form asks it. */
export function canChoreRotate(args: { assigneeCount: number; assigneeGroupIdsLength: number; rotation: ChoreRotation }): boolean {
  return args.assigneeCount >= 2 || args.assigneeGroupIdsLength > 0 || args.rotation === 'schedule';
}
