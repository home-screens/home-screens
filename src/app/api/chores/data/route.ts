import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import { rewardCascadeDeleteMember } from '@/lib/reward-data';
import type { ChoreMember, ChoreDefinition } from '@/types/config';
import { withAuth, withDisplayAuth, guardEmptyOverwrite } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const data = await readChoreData();
  return NextResponse.json(data);
}, 'Failed to read chore data');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { members, chores, force } = body as {
    members: ChoreMember[];
    chores: ChoreDefinition[];
    force?: boolean;
  };

  if (!Array.isArray(members) || !Array.isArray(chores)) {
    return NextResponse.json(
      { error: 'members and chores must be arrays' },
      { status: 400 },
    );
  }

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
    rewardCascadeDeleteMember(id).catch(console.error);
  }

  return NextResponse.json(data);
}, 'Failed to write chore data');
