import type { ChoreDefinition } from '@/types/config';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import { choreAssigneeIds } from './chore-assignments';

/**
 * What an edit to the family roster does, shared by the editor's Family
 * page and the phone's Family screen. Each surface draws its own list and
 * forms; these decide what gets sent. Pure, so the two cannot drift.
 */

/** How many chores each person owes; a bonus chore is only open to them, so it is not counted. */
export function memberChoreCounts(
  members: readonly FamilyMember[],
  groups: readonly FamilyGroup[],
  chores: readonly ChoreDefinition[],
): Map<string, number> {
  return new Map(members.map((member) => [
    member.id,
    chores.filter((chore) => !chore.bonus && (choreAssigneeIds(chore, groups).includes(member.id) || Object.hasOwn(chore.schedule ?? {}, member.id))).length,
  ]));
}

/** How many chores are given to a group as a group. */
export function groupChoreCount(group: Pick<FamilyGroup, 'id'>, chores: readonly ChoreDefinition[] | undefined): number {
  return chores?.filter((chore) => chore.assigneeGroupIds?.includes(group.id)).length ?? 0;
}

/**
 * The person a form saves. A name the person left exactly as it was is kept
 * as it was (an older, longer name is not cut down by a colour change);
 * a changed one is trimmed. An empty or blank emoji is no emoji.
 */
export function memberToSave(draft: FamilyMember, before: readonly FamilyMember[]): FamilyMember {
  const original = before.find((member) => member.id === draft.id);
  const name = original?.name === draft.name ? draft.name : draft.name.trim();
  return { ...draft, name, emoji: draft.emoji?.trim() || undefined };
}

/** The roster after saving one person: a new one goes on the end, an existing one stays in place. */
export function membersAfterSave(before: readonly FamilyMember[], member: FamilyMember, isNew: boolean): FamilyMember[] {
  return isNew ? [...before, member] : before.map((existing) => (existing.id === member.id ? member : existing));
}

/** The roster with one person moved one place up (-1) or down (1). */
export function membersAfterMove(members: readonly FamilyMember[], index: number, direction: -1 | 1): FamilyMember[] {
  const next = [...members];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The groups after saving one: a new one goes on the end, its name trimmed. */
export function groupsAfterSave(before: readonly FamilyGroup[], draft: FamilyGroup, isNew: boolean): FamilyGroup[] {
  const group = { ...draft, name: draft.name.trim() };
  return isNew ? [...before, group] : before.map((existing) => (existing.id === group.id ? group : existing));
}

/** The longest name a person's form takes: the limit, or an older name that is already longer. */
export function memberNameLimit(max: number, member: Pick<FamilyMember, 'id'>, before: readonly FamilyMember[]): number {
  return Math.max(max, before.find((existing) => existing.id === member.id)?.name.length ?? 0);
}
