import { calendarReferences } from './calendar';
import { choreReferences } from './chores';
import { choreCompletionReferences } from './chore-completions';
import { rewardReferences } from './rewards';
import { todoReferences } from './todos';
import { notesReferences } from './notes';
import { timetableReferences } from './timetables';
import type { MemberReferenceDomain } from './contract';

export type { Doc, MemberReferenceDomain, RestorePlan } from './contract';
export { isRecord } from './contract';

/**
 * Every store that names a family member by id, in the order the family
 * coordinator visits them. Removing a person and restoring a backup both
 * walk this list and nothing else, so a new member-based domain takes part
 * by adding one entry here and is refused by the contract test until it
 * declares what removal and restore mean for its file.
 */
export const MEMBER_REFERENCE_DOMAINS: readonly MemberReferenceDomain[] = [
  calendarReferences,
  choreReferences,
  choreCompletionReferences,
  rewardReferences,
  todoReferences,
  timetableReferences,
  notesReferences,
];
