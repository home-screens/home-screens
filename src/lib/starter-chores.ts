/**
 * Starter chores: the rules behind "pick some to get started".
 *
 * The catalog (`starter-chores-catalog.ts`) says what each starter is; the
 * per-locale name files say what it is called. This module joins the two for
 * a locale, decides which starters a household already has, picks who a batch
 * goes to by default, and turns a selection into ordinary chore definitions.
 * Both surfaces (the phone's Manage view and the editor's chore chart window)
 * draw their own picker over these rules, so a change here lands on both.
 */

import type { ChoreDefinition, ChoreTimeOfDay } from '@/types/config';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import { resolveLocaleChain } from '@/i18n/fallback';
import { groupMembers } from '@/lib/family-groups';
import {
  STARTER_CHORE_CATALOG,
  STARTER_CHORE_SECTIONS,
  type StarterChoreId,
  type StarterChoreSection,
  type StarterChoreSpec,
} from './starter-chores-catalog';
import { EN_US_STARTER_CHORE_NAMES } from './starter-chores-names/en-US';
import { DE_DE_STARTER_CHORE_NAMES } from './starter-chores-names/de-DE';
import { FR_FR_STARTER_CHORE_NAMES } from './starter-chores-names/fr-FR';
import { ES_ES_STARTER_CHORE_NAMES } from './starter-chores-names/es-ES';
import { NL_NL_STARTER_CHORE_NAMES } from './starter-chores-names/nl-NL';
import { PT_BR_STARTER_CHORE_NAMES } from './starter-chores-names/pt-BR';
import { DA_DK_STARTER_CHORE_NAMES } from './starter-chores-names/da-DK';

export type { StarterChoreId, StarterChoreSection, StarterChoreSpec };
export { STARTER_CHORE_SECTIONS };

export const STARTER_CHORE_NAMES_BY_LOCALE: Record<string, Record<StarterChoreId, string>> = {
  'en-US': EN_US_STARTER_CHORE_NAMES,
  'de-DE': DE_DE_STARTER_CHORE_NAMES,
  'fr-FR': FR_FR_STARTER_CHORE_NAMES,
  'es-ES': ES_ES_STARTER_CHORE_NAMES,
  'nl-NL': NL_NL_STARTER_CHORE_NAMES,
  'pt-BR': PT_BR_STARTER_CHORE_NAMES,
  'da-DK': DA_DK_STARTER_CHORE_NAMES,
};

/** One starter as the picker shows it: the catalog row plus its name in the UI language. */
export interface StarterChore extends StarterChoreSpec {
  name: string;
}

/** How many starters the list holds, for the "27 everyday chores" copy. */
export const STARTER_CHORE_COUNT = STARTER_CHORE_CATALOG.length;

/**
 * The starter list in `locale`, walking the same fallback chain as the
 * dictionaries so `de-AT` reads the German names and an unknown locale reads
 * English.
 */
export function getStarterChoresForLocale(locale: string): StarterChore[] {
  const names = resolveLocaleChain(locale)
    .map((tag) => STARTER_CHORE_NAMES_BY_LOCALE[tag])
    .find((table) => table !== undefined) ?? EN_US_STARTER_CHORE_NAMES;
  return STARTER_CHORE_CATALOG.map((spec) => ({ ...spec, name: names[spec.id] }));
}

/** The starters of one section, in catalog order. */
export function starterChoresInSection(starters: readonly StarterChore[], section: StarterChoreSection): StarterChore[] {
  return starters.filter((starter) => starter.section === section);
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** Every name a starter goes by across the shipped languages, normalized, keyed by starter id. */
let namesInEveryLocale: Map<StarterChoreId, Set<string>> | null = null;
function starterNamesInEveryLocale(): Map<StarterChoreId, Set<string>> {
  if (namesInEveryLocale) return namesInEveryLocale;
  const byId = new Map<StarterChoreId, Set<string>>();
  for (const spec of STARTER_CHORE_CATALOG) byId.set(spec.id, new Set());
  for (const table of Object.values(STARTER_CHORE_NAMES_BY_LOCALE)) {
    for (const spec of STARTER_CHORE_CATALOG) byId.get(spec.id)!.add(normalizeName(table[spec.id]));
  }
  namesInEveryLocale = byId;
  return byId;
}

/**
 * The ids of starters the household already has. A chore picked from the
 * list carries its `starterId`, which matches whatever language the picker
 * is in now. A chore from before that was saved, or one written by hand,
 * counts when its name is the starter's name in any shipped language,
 * ignoring case and surrounding spaces. Those rows show as "Already added"
 * and cannot be picked again, so reopening the list, in any language,
 * never duplicates a chore.
 */
export function starterIdsAlreadyAdded(
  starters: readonly StarterChore[],
  chores: readonly Pick<ChoreDefinition, 'name' | 'starterId'>[],
): Set<StarterChoreId> {
  const byStarterId = new Set(chores.map((chore) => chore.starterId).filter((id): id is string => !!id));
  const existingNames = new Set(chores.map((chore) => normalizeName(chore.name)));
  const names = starterNamesInEveryLocale();
  return new Set(starters
    .filter((starter) => byStarterId.has(starter.id)
      || [...(names.get(starter.id) ?? [])].some((name) => existingNames.has(name)))
    .map((starter) => starter.id));
}

export interface StarterAssignment {
  assigneeIds: string[];
  assigneeGroupIds: string[];
}

/**
 * Who a batch goes to before the parent changes it: the biggest family group
 * when there is one (a "Kids" group is the usual shape), otherwise everyone.
 * A group that has nobody in it is skipped, so the default never points at
 * an empty set when people exist.
 */
export function defaultStarterAssignment(
  members: readonly FamilyMember[],
  groups: readonly FamilyGroup[],
): StarterAssignment {
  let biggest: FamilyGroup | undefined;
  let biggestSize = 0;
  for (const group of groups) {
    const size = groupMembers(group, members).length;
    if (size > biggestSize) {
      biggest = group;
      biggestSize = size;
    }
  }
  if (biggest) return { assigneeIds: [], assigneeGroupIds: [biggest.id] };
  return { assigneeIds: members.map((member) => member.id), assigneeGroupIds: [] };
}

/** True when the batch has somebody to go to. */
export function starterAssignmentHasSomeone(assignment: StarterAssignment): boolean {
  return assignment.assigneeIds.length > 0 || assignment.assigneeGroupIds.length > 0;
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** The day a "once a week" starter lands on unless the parent picks another: Saturday. */
export const DEFAULT_STARTER_WEEKLY_DAY = 6;

/**
 * When a section's chores happen. The three parts of the day are every day.
 * A weekly chore is due on each day it lists and ticked per day, so "once a
 * week" has to be one day: `weeklyDay`, which the picker lets the parent
 * change for the whole section.
 */
export function starterSectionTiming(
  section: StarterChoreSection,
  weeklyDay: number = DEFAULT_STARTER_WEEKLY_DAY,
): Pick<ChoreDefinition, 'frequency' | 'daysOfWeek' | 'timeOfDay'> {
  if (section === 'weekly') {
    return { frequency: 'weekly', daysOfWeek: [weeklyDay], timeOfDay: 'anytime' };
  }
  const timeOfDay: ChoreTimeOfDay = section;
  return { frequency: 'daily', daysOfWeek: [...EVERY_DAY], timeOfDay };
}

/**
 * The people and groups of an assignment that still exist. A group deleted
 * from the family while the picker is open would otherwise ride along into
 * the save and be refused by the hub.
 */
export function reconcileStarterAssignment(
  assignment: StarterAssignment,
  members: readonly Pick<FamilyMember, 'id'>[],
  groups: readonly Pick<FamilyGroup, 'id'>[],
): StarterAssignment {
  const memberIds = new Set(members.map((member) => member.id));
  const groupIds = new Set(groups.map((group) => group.id));
  return {
    assigneeIds: assignment.assigneeIds.filter((id) => memberIds.has(id)),
    assigneeGroupIds: assignment.assigneeGroupIds.filter((id) => groupIds.has(id)),
  };
}

/**
 * The chores a selection saves as: ordinary definitions, one per picked
 * starter, all going to the same people with no rotation. The caller gives
 * each an id the way the forms do (`addChoreToList`).
 */
export function buildStarterChores(
  starters: readonly StarterChore[],
  pickedIds: ReadonlySet<StarterChoreId>,
  assignment: StarterAssignment,
  weeklyDay: number = DEFAULT_STARTER_WEEKLY_DAY,
): Omit<ChoreDefinition, 'id'>[] {
  return starters
    .filter((starter) => pickedIds.has(starter.id))
    .map((starter) => ({
      name: starter.name,
      starterId: starter.id,
      // The icon prefix `ChoreIcon` reads; the catalog holds bare icon names.
      emoji: `lucide:${starter.icon}`,
      points: starter.points,
      ...starterSectionTiming(starter.section, weeklyDay),
      assigneeIds: [...assignment.assigneeIds],
      ...(assignment.assigneeGroupIds.length > 0 ? { assigneeGroupIds: [...assignment.assigneeGroupIds] } : {}),
      rotation: 'fixed' as const,
    }));
}
