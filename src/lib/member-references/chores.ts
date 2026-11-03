import { FamilyError } from '@/lib/family-errors';
import { isRecord, missingAssignment, recordLabel, rows, stripIds, withoutKeys, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

const validDays = (days: unknown) => Array.isArray(days) && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);

/** A chore's saved group list; absent means none, anything else malformed stops the removal. */
function groupIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) throw new FamilyError('family.dataInvalid', 'A saved chore group assignment is invalid.', { status: 409 });
  return value;
}

/** A chore's saved schedule rows, people or groups; absent means none, anything else malformed stops the change. */
function scheduleRows(value: unknown): Record<string, number[]> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.values(value).some((days) => !validDays(days))) throw new FamilyError('family.dataInvalid', 'The saved chore schedule is invalid.', { status: 409 });
  return value as Record<string, number[]>;
}

/**
 * A scheduled chore after rows came off its grid. Its days become whatever
 * the rows left still cover. One person left alone goes back to a fixed chore
 * on that person's days, since a schedule needs somebody to share with; a
 * group row keeps the schedule however few rows are left, because the group
 * is several people. No rows at all leaves a fixed chore that keeps its days.
 */
function settleSchedule(chore: Doc, schedule: Record<string, number[]>, groupSchedule: Record<string, number[]>): Doc {
  const { schedule: _people, groupSchedule: _groups, ...rest } = chore;
  const people = Object.values(schedule);
  const hasGroups = Object.keys(groupSchedule).length > 0;
  if (people.length === 0 && !hasGroups) return { ...rest, rotation: 'fixed' };
  if (people.length === 1 && !hasGroups && chore.rotation === 'schedule') return { ...rest, rotation: 'fixed', daysOfWeek: people[0] };
  return {
    ...rest,
    ...(people.length > 0 ? { schedule } : {}),
    ...(hasGroups ? { groupSchedule } : {}),
    daysOfWeek: [...new Set([...people, ...Object.values(groupSchedule)].flat())].sort((a, b) => a - b),
  };
}

/**
 * The chore file after these family groups are removed: their ids come off
 * every chore that named them, and so do their rows on a schedule. A chore
 * left with nobody stays in the list so its name, tickets and days are not
 * lost; it goes to no one until somebody is picked for it. The same document
 * back means nothing named the groups.
 */
export function removeChoreGroups(doc: Doc, removed: ReadonlySet<string>): Doc {
  if (!Array.isArray(doc.chores)) throw new FamilyError('family.dataInvalid', 'The saved chore definitions are invalid.', { status: 409 });
  let changed = false;
  const chores = doc.chores.map((chore: unknown) => {
    if (!isRecord(chore)) throw new FamilyError('family.dataInvalid', 'The saved chore definitions are invalid.', { status: 409 });
    const before = groupIds(chore.assigneeGroupIds);
    const kept = before.filter((id) => !removed.has(id));
    const rowsBefore = scheduleRows(chore.groupSchedule);
    const rowsKept = withoutKeys(rowsBefore, removed) as Record<string, number[]>;
    if (kept.length === before.length && Object.keys(rowsKept).length === Object.keys(rowsBefore).length) return chore;
    changed = true;
    const { assigneeGroupIds: _dropped, ...rest } = chore;
    const next = kept.length > 0 ? { ...rest, assigneeGroupIds: kept } : rest;
    if (Object.keys(rowsKept).length === Object.keys(rowsBefore).length) return next;
    return settleSchedule(next, scheduleRows(chore.schedule), rowsKept);
  });
  return changed ? { ...doc, chores } : doc;
}

/**
 * Chore definitions: `assigneeIds` says who a chore can go to,
 * `assigneeGroupIds` names family groups whose members get it too, and a
 * `schedule` says which days each person has it, with `groupSchedule` doing
 * the same for a whole group.
 *
 * Removal takes the person out of both and drops a chore that removal left
 * with nobody. A chore that goes to a group is never dropped: its
 * `assigneeIds` is empty by design, and the group itself is pruned on the
 * family list. Neither is a chore that already had nobody, which is what a
 * removed group leaves behind until someone is picked for it.
 * A schedule left with one person and no group collapses back to a fixed
 * rotation on that person's days (see `settleSchedule`).
 *
 * Restore refuses a chore that names a missing person or group rather than
 * guessing who should do it: the restore is stopped with every such record
 * listed.
 */
export const choreReferences: MemberReferenceDomain = {
  path: 'data/chores.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.chores)) throw new FamilyError('family.dataInvalid', 'The saved chore definitions are invalid.', { status: 409 });
    next.chores = next.chores.flatMap((chore: unknown) => {
      if (!isRecord(chore)) throw new FamilyError('family.dataInvalid', 'The saved chore definitions are invalid.', { status: 409 });
      const stripped: Doc = { ...chore, assigneeIds: stripIds(chore.assigneeIds, removed) };
      const updated = (chore.schedule !== undefined
        ? settleSchedule(stripped, scheduleRows(withoutKeys(chore.schedule, removed)), scheduleRows(chore.groupSchedule))
        : stripped) as Doc & { assigneeIds: string[] };
      const goesToGroup = groupIds(chore.assigneeGroupIds).length > 0;
      const emptied = updated.assigneeIds.length === 0 && (chore.assigneeIds as string[]).length > 0;
      return emptied && !goesToGroup ? [] : [updated];
    });
    return next;
  },
  planRestore(doc, members, groups): RestorePlan {
    const missing: string[] = [];
    for (const [index, chore] of rows(doc.chores, 'Chores').entries()) {
      const label = recordLabel('data/chores.json', `chores[${index}]`, chore);
      missing.push(...missingAssignment(chore.assigneeIds, `${label}, assigneeIds`, members));
      if (chore.assigneeGroupIds !== undefined) missing.push(...missingAssignment(chore.assigneeGroupIds, `${label}, assigneeGroupIds`, groups));
      if (chore.schedule !== undefined) {
        if (!isRecord(chore.schedule)) throw new FamilyError('family.dataInvalid', `${label}, schedule must map person IDs to days.`);
        missing.push(...missingAssignment(Object.keys(chore.schedule), `${label}, schedule`, members));
        for (const [id, days] of Object.entries(chore.schedule)) {
          if (!validDays(days)) throw new FamilyError('family.dataInvalid', `${label}, schedule for ${JSON.stringify(id)} contains invalid days.`);
        }
      }
      if (chore.groupSchedule !== undefined) {
        if (!isRecord(chore.groupSchedule)) throw new FamilyError('family.dataInvalid', `${label}, groupSchedule must map group IDs to days.`);
        missing.push(...missingAssignment(Object.keys(chore.groupSchedule), `${label}, groupSchedule`, groups));
        for (const [id, days] of Object.entries(chore.groupSchedule)) {
          if (!validDays(days)) throw new FamilyError('family.dataInvalid', `${label}, groupSchedule for ${JSON.stringify(id)} contains invalid days.`);
        }
      }
    }
    return { missing, evidence: {} };
  },
};
