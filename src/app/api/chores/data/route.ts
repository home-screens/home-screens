import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readChoreData, writeChoreData } from '@/lib/chore-data';
import type { ChoreDefinition } from '@/types/config';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, assertRequiredArrays, parseJsonBody } from '@/lib/api-utils';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  return NextResponse.json(await readChoreData());
}, 'Failed to read chore data');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ chores: ChoreDefinition[]; members?: unknown; force?: boolean }>(request);
  if (body instanceof NextResponse) return body;
  if (body && Object.hasOwn(body, 'members')) {
    return NextResponse.json({ error: 'Family has moved. Refresh this page before saving.', code: 'refresh_required' }, { status: 409 });
  }
  const invalid = assertRequiredArrays(body, ['chores']);
  if (invalid) return invalid;
  return withFamilyData(async () => {
    const { chores, force } = body;
    if (chores.some((chore) => !chore || !Array.isArray(chore.assigneeIds))) {
      return NextResponse.json({ error: 'Each chore needs an assignee list.' }, { status: 400 });
    }
    const references = await validateMemberReferences(chores.flatMap((chore) => [
      ...chore.assigneeIds, ...Object.keys(chore.schedule ?? {}),
    ]));
    if (references) return references;
    const guard = await guardEmptyOverwrite([chores], async () => [(await readChoreData()).chores], 'chore', force);
    if (guard) return guard;
    await writeChoreData({ chores });
    return NextResponse.json({ chores });
  });
}, 'Failed to write chore data');
