import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import { rewardCascadeDeleteMember } from '@/lib/reward-data';
import type { ChoreMember, ChoreDefinition } from '@/types/config';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, assertRequiredArrays, parseJsonBody } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const log = logger('chores');

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const data = await readChoreData();
  return NextResponse.json(data);
}, 'Failed to read chore data');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{
    members: ChoreMember[];
    chores: ChoreDefinition[];
    force?: boolean;
  }>(request);
  if (body instanceof NextResponse) return body;
  const { members, chores, force } = body;

  const invalid = assertRequiredArrays(body, ['members', 'chores']);
  if (invalid) return invalid;

  const guard = await guardEmptyOverwrite(
    [members, chores],
    async () => { const d = await readChoreData(); return [d.members, d.chores]; },
    'chore',
    force,
  );
  if (guard) return guard;

  // Read existing members before write so we can detect deletions
  let existingMembers: typeof members = [];
  try {
    const existing = await readChoreData();
    existingMembers = existing.members;
  } catch { /* can't read — skip cascade */ }

  const data = { members, chores };
  await writeChoreData(data);

  // Cascade deleted members to rewards data (fire-and-forget)
  const removedIds = existingMembers
    .filter((m) => !members.some((n) => n.id === m.id))
    .map((m) => m.id);
  for (const id of removedIds) {
    rewardCascadeDeleteMember(id).catch((err) => log.error('reward cascade failed for removed member', err));
  }

  return NextResponse.json(data);
}, 'Failed to write chore data');
