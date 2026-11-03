import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readChoreData, readChoreSnapshot, validateChoreList, writeChoreList } from '@/lib/chore-data';
import { contentRevision } from '@/lib/content-revision';
import { DEFAULT_CHORE_SETTINGS, readChoreSettings, stampBonusSince } from '@/lib/chore-bonus';
import { householdTimestamp } from '@/lib/household-day';
import type { ChoreDefinition } from '@/types/config';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, parseJsonBody } from '@/lib/api-utils';
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
  // The same rule a backup restore holds chores.json to, so a list the save
  // accepts is one a restore accepts and the other way round.
  const invalid = validateChoreList(body?.chores);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const { chores, force, revision } = body;
  if (typeof revision !== 'string' || !revision) {
    return NextResponse.json({ error: 'Reload the page and try again.' }, { status: 400 });
  }
  return withFamilyData(async () => {
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
