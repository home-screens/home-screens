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

export async function validateMemberReferences(ids: readonly string[]): Promise<NextResponse | null> {
  const members = new Set((await readFamilyData()).members.map((member) => member.id));
  return ids.some((id) => !members.has(id))
    ? NextResponse.json({ error: 'Someone in this selection was removed. Refresh and choose again.' }, { status: 409 })
    : null;
}
