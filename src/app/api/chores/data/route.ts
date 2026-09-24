import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readChoreData, readChoreSnapshot, writeChoreList } from '@/lib/chore-data';
import { contentRevision } from '@/lib/content-revision';
import { DEFAULT_CHORE_SETTINGS, isValidBonus, readChoreSettings, stampBonusSince } from '@/lib/chore-bonus';
import { householdTimestamp } from '@/lib/household-day';
import type { ChoreDefinition } from '@/types/config';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, assertRequiredArrays, parseJsonBody } from '@/lib/api-utils';
import { withFamilyData, validateGroupReferences, validateMemberReferences } from '@/lib/family-api';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  return NextResponse.json(await readChoreSnapshot());
}, 'Failed to read chore data');

/**
 * Replace the chore list. The body quotes the `revision` its list was built
 * from (from GET or the previous save); one built from an older copy comes
 * back as a 409 with `reason: 'revision'` and the current list, so the
 * surface can show what is there now instead of overwriting it.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ chores: ChoreDefinition[]; members?: unknown; force?: boolean; revision?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (body && Object.hasOwn(body, 'members')) {
    return NextResponse.json({ error: 'Family has moved. Refresh this page before saving.', code: 'refresh_required' }, { status: 409 });
  }
  const invalid = assertRequiredArrays(body, ['chores']);
  if (invalid) return invalid;
  const { chores, force, revision } = body;
  if (typeof revision !== 'string' || !revision) {
    return NextResponse.json({ error: 'Reload the page and try again.' }, { status: 400 });
  }
  return withFamilyData(async () => {
    const stringList = (value: unknown) => Array.isArray(value) && value.every((id) => typeof id === 'string');
    if (chores.some((chore) => !chore || !stringList(chore.assigneeIds)
      || (chore.assigneeGroupIds !== undefined && !stringList(chore.assigneeGroupIds)))) {
      return NextResponse.json({ error: 'Each chore needs a list of who it goes to.' }, { status: 400 });
    }
    // A group's row only counts through `assigneeGroupIds`: that list is what
    // removing a group, the chore counts and the chore lists all read.
    const dayRows = (value: unknown) => value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value)
      && Object.values(value).every((days) => Array.isArray(days) && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)));
    // A bonus chore keeps its regular schedule untouched while it is a bonus
    // chore (who can do it is picked apart from it), so the rows only have to
    // match the named groups on a regular chore.
    if (chores.some((chore) => !dayRows(chore.schedule) || !dayRows(chore.groupSchedule)
      || (!chore.bonus && Object.keys(chore.groupSchedule ?? {}).some((id) => !chore.assigneeGroupIds?.includes(id))))) {
      return NextResponse.json({ error: 'A chore schedule needs days for each person or group on it.' }, { status: 400 });
    }
    if (chores.some((chore) => chore.points !== undefined && (typeof chore.points !== 'number' || !Number.isFinite(chore.points) || chore.points < 0))) {
      return NextResponse.json({ error: 'Tickets for a chore must be 0 or more.' }, { status: 400 });
    }
    if (chores.some((chore) => !isValidBonus(chore.bonus))) {
      return NextResponse.json({ error: 'A bonus chore needs a kind and a time it comes back.' }, { status: 400 });
    }
    // A list that cannot be read has nothing to compare against; the write is
    // what repairs it, and the empty guard below keeps its own reading.
    let current: ChoreDefinition[] | null = null;
    let settings = DEFAULT_CHORE_SETTINGS;
    try { ({ chores: current, settings } = await readChoreData()); } catch { /* unreadable */ }
    if (current && revision !== contentRevision(current)) {
      return NextResponse.json({
        error: 'Somebody else changed the chores. Reload the page and make your change again.',
        reason: 'revision',
        chores: current,
        settings,
        revision: contentRevision(current),
      }, { status: 409 });
    }
    // Both reference checks come after the revision check on purpose.
    // Removing a person or a group takes them off every chore in the same
    // commit, so a page still naming one holds an old chore list: it must get
    // the current list back above, which is what lets it recover, rather than
    // a refusal it can never save its way out of.
    const references = await validateMemberReferences(chores.flatMap((chore) => [
      ...chore.assigneeIds, ...Object.keys(chore.schedule ?? {}),
    ]));
    if (references) return references;
    const groupReferences = await validateGroupReferences(chores.flatMap((chore) => chore.assigneeGroupIds ?? []));
    if (groupReferences) return groupReferences;
    const guard = await guardEmptyOverwrite([chores], async () => [current ?? []], 'chore', force);
    if (guard) return guard;
    const stamped = stampBonusSince(chores, current ?? [], await householdTimestamp());
    const saved = await writeChoreList(stamped);
    return NextResponse.json({ chores: stamped, settings: readChoreSettings(saved.settings), revision: contentRevision(stamped) });
  });
}, 'Failed to write chore data');
