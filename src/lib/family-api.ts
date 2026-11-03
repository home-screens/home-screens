import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody } from './api-utils';
import { withDataTransaction } from './data-transaction';
import { readFamilyData, settleFamilyMigration } from './family-data';
import { FamilyError } from './family-errors';
import { refusalBody } from './refusal';

/** Hold the family snapshot through validation and every dependent write. */
export function withFamilyData<T>(operation: () => Promise<T>): Promise<T> {
  return withDataTransaction(async () => {
    await settleFamilyMigration();
    return operation();
  });
}

/**
 * A family write: read and parse the body, then run the operation inside the
 * family transaction with the parsed body. The body is the client's input,
 * not persisted state, so it is parsed before the hub-wide lock is taken:
 * every wall poll, editor save and phone write queues behind that lock, and
 * the kid-view routes take bodies from anyone on the LAN with no sign-in.
 * `maxBytes` answers 413 to an oversized body (by Content-Length before any
 * read, by a streaming cap otherwise) and malformed JSON is a 400, both
 * without entering the transaction.
 */
export async function withFamilyWrite<B, T>(
  request: NextRequest,
  options: { maxBytes: number },
  operation: (body: B) => Promise<T>,
): Promise<T | NextResponse> {
  const body = await parseJsonBody<B>(request, options);
  if (body instanceof NextResponse) return body;
  return withFamilyData(() => operation(body));
}

/**
 * The one answer for "this names someone who is not in the family": 409 with
 * `code: 'family.memberRemoved'` and `reason: 'member'`, so every client can
 * treat a removed person the same way whichever store refused. Run it inside
 * the write's transaction; an unknown id that reaches a file makes every
 * later backup unrestorable.
 */
export async function validateMemberReferences(ids: readonly string[]): Promise<NextResponse | null> {
  const members = new Set((await readFamilyData()).members.map((member) => member.id));
  if (!ids.some((id) => !members.has(id))) return null;
  const refusal = new FamilyError('family.memberRemoved', 'Someone in this selection was removed. Refresh and choose again.', { status: 409 });
  // `reason` is what the chore and timetable clients key on to tell a
  // removed person from any other 409.
  return NextResponse.json({ ...refusalBody(refusal), reason: 'member' }, { status: 409 });
}

/** The same check for family groups, so a stale page cannot hand something to a group that was just removed. */
export async function validateGroupReferences(ids: readonly string[]): Promise<NextResponse | null> {
  const groups = new Set(((await readFamilyData()).groups ?? []).map((group) => group.id));
  if (!ids.some((id) => !groups.has(id))) return null;
  const refusal = new FamilyError('family.groupRemoved', 'A group in this selection was removed. Refresh and choose again.', { status: 409 });
  return NextResponse.json(refusalBody(refusal), { status: 409 });
}
