import { NextResponse } from 'next/server';
import { withDataTransaction } from './data-transaction';
import { readFamilyData, settleFamilyMigration } from './family-data';

/** Hold the family snapshot through validation and every dependent write. */
export function withFamilyData<T>(operation: () => Promise<T>): Promise<T> {
  return withDataTransaction(async () => {
    await settleFamilyMigration();
    return operation();
  });
}

/**
 * The one answer for "this names someone who is not in the family": 409 with
 * `reason: 'member'`, so every client can treat a removed person the same
 * way whichever store refused. Run it inside the write's transaction; an
 * unknown id that reaches a file makes every later backup unrestorable.
 */
export async function validateMemberReferences(ids: readonly string[]): Promise<NextResponse | null> {
  const members = new Set((await readFamilyData()).members.map((member) => member.id));
  return ids.some((id) => !members.has(id))
    ? NextResponse.json({ error: 'Someone in this selection was removed. Refresh and choose again.', reason: 'member' }, { status: 409 })
    : null;
}

/** The same check for family groups, so a stale page cannot hand something to a group that was just removed. */
export async function validateGroupReferences(ids: readonly string[]): Promise<NextResponse | null> {
  const groups = new Set(((await readFamilyData()).groups ?? []).map((group) => group.id));
  return ids.some((id) => !groups.has(id))
    ? NextResponse.json({ error: 'A group in this selection was removed. Refresh and choose again.' }, { status: 409 })
    : null;
}
