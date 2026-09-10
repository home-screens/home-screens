import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, withDisplayAuth, parseJsonBody } from '@/lib/api-utils';
import { readFamilyData, familyRevision, replaceFamilyMembers } from '@/lib/family-data';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  const data = await readFamilyData();
  return NextResponse.json({ members: data.members, revision: familyRevision(data) });
}, 'Your family could not be loaded. Try again in a moment.');

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<Parameters<typeof replaceFamilyMembers>[0]>(request);
  if (body instanceof NextResponse) return body;
  return NextResponse.json(await replaceFamilyMembers(body));
}, 'Your family could not be saved. Try again in a moment.');
