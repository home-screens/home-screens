import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import type { ChoreMember, ChoreDefinition } from '@/types/config';
import { withAuth, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const data = await readChoreData();
  return NextResponse.json(data);
}, 'Failed to read chore data');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { members, chores } = body as {
    members: ChoreMember[];
    chores: ChoreDefinition[];
  };

  if (!Array.isArray(members) || !Array.isArray(chores)) {
    return NextResponse.json(
      { error: 'members and chores must be arrays' },
      { status: 400 },
    );
  }

  const data = { members, chores };
  await writeChoreData(data);
  return NextResponse.json(data);
}, 'Failed to write chore data');
