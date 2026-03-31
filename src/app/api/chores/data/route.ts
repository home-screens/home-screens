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

  // Guard against empty overwrites — if existing data has content but the
  // incoming payload is completely empty, this is almost certainly a bug
  if (members.length === 0 && chores.length === 0 && !force) {
    try {
      const existing = await readChoreData();
      if (existing.members.length > 0 || existing.chores.length > 0) {
        return NextResponse.json(
          { error: 'Refusing to overwrite non-empty chore data with empty payload. Send { force: true } to confirm.' },
          { status: 409 },
        );
      }
    } catch {
      // Can't read existing data — allow the write
    }
  }

  const data = { members, chores };
  await writeChoreData(data);
  return NextResponse.json(data);
}, 'Failed to write chore data');
