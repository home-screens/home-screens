import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, guardEmptyOverwrite, assertRequiredArrays, parseJsonBody } from '@/lib/api-utils';
import {
  readRewardData,
  updateRewardDefinitions,
  adjustPoints,
} from '@/lib/reward-data';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';
import { contentRevision } from '@/lib/content-revision';
import type { RewardDefinition } from '@/lib/reward-data';

export const dynamic = 'force-dynamic';

/**
 * PUT — replace the reward definitions (parents only). The body quotes the
 * `revision` its list was built from (`GET /api/rewards` or the previous
 * save); one built from an older copy comes back as a 409 with
 * `reason: 'revision'` and the current list rather than overwriting it.
 */
export const PUT = withAuth(async (request: NextRequest) => withFamilyData(async () => {
  const body = await parseJsonBody<{ rewards: RewardDefinition[]; force?: boolean; revision?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { rewards, force, revision } = body;

  const invalid = assertRequiredArrays(body, ['rewards']);
  if (invalid) return invalid;
  if (typeof revision !== 'string' || !revision) {
    return NextResponse.json({ error: 'Reload the page and try again.' }, { status: 400 });
  }

  if (rewards.some((reward) => !reward || !Array.isArray(reward.memberIds))) {
    return NextResponse.json({ error: 'Each reward needs a member list.' }, { status: 400 });
  }
  // A list that cannot be read has nothing to compare against; the write is
  // what repairs it, and the empty guard below keeps its own reading.
  let current: RewardDefinition[] | null = null;
  try { current = (await readRewardData()).rewards; } catch { /* unreadable */ }
  if (current && revision !== contentRevision(current)) {
    return NextResponse.json({
      error: 'Somebody else changed the rewards. Reload the page and make your change again.',
      reason: 'revision',
      rewards: current,
      revision: contentRevision(current),
    }, { status: 409 });
  }

  // After the revision check on purpose. Removing a person takes them off
  // every reward in the same commit, so a page still naming them holds an old
  // list: it must get the current one back above, which is what lets it
  // recover, rather than a refusal it can never save its way out of.
  const references = await validateMemberReferences(rewards.flatMap((reward) => reward.memberIds));
  if (references) return references;

  const guard = await guardEmptyOverwrite([rewards], async () => [current ?? []], 'reward', force);
  if (guard) return guard;

  const result = await updateRewardDefinitions(rewards);
  return NextResponse.json({ rewards: result.rewards, revision: contentRevision(result.rewards) });
}), 'Failed to write reward data');

/** The most a reason may say; it is one line under a row on a phone. */
const REASON_MAX_CHARS = 80;

/**
 * POST — a grown-up gives or takes tickets by hand (parents only). One
 * person as `memberId`, or several as `memberIds`, the same `amount` each,
 * with an optional `reason` that lands in their ticket history. Every person
 * is checked before anyone is written, so a list naming someone who was
 * removed changes nothing.
 */
export const POST = withAuth(async (request: NextRequest) => withFamilyData(async () => {
  const body = await parseJsonBody<{ memberId?: unknown; memberIds?: unknown; amount?: unknown; reason?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  const { amount } = body;

  const memberIds = Array.isArray(body.memberIds)
    ? body.memberIds
    : typeof body.memberId === 'string' ? [body.memberId] : [];
  const validIds = memberIds.length > 0 && memberIds.every((id) => typeof id === 'string' && id.length > 0);
  if (!validIds || typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
    return NextResponse.json(
      { error: 'Missing memberId or invalid amount' },
      { status: 400 },
    );
  }
  if (body.reason !== undefined && typeof body.reason !== 'string') {
    return NextResponse.json({ error: 'The reason must be text' }, { status: 400 });
  }
  const reason = (body.reason ?? '').trim().slice(0, REASON_MAX_CHARS) || undefined;

  const unique = [...new Set(memberIds as string[])];
  const references = await validateMemberReferences(unique);
  if (references) return references;

  let result = await adjustPoints(unique[0], amount, reason);
  for (const memberId of unique.slice(1)) result = await adjustPoints(memberId, amount, reason);

  return NextResponse.json({ balances: result.balances, adjustments: result.adjustments ?? [] });
}), 'Failed to adjust balance');
