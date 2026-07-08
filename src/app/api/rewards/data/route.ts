import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, guardEmptyOverwrite, assertRequiredArrays, parseJsonBody } from '@/lib/api-utils';
import {
  readRewardData,
  updateRewardDefinitions,
  creditPoints,
  debitPoints,
} from '@/lib/reward-data';
import type { RewardDefinition } from '@/lib/reward-data';

export const dynamic = 'force-dynamic';

/** PUT — update reward definitions (parents only). */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ rewards: RewardDefinition[]; force?: boolean }>(request);
  if (body instanceof NextResponse) return body;
  const { rewards, force } = body;

  const invalid = assertRequiredArrays(body, ['rewards']);
  if (invalid) return invalid;

  const guard = await guardEmptyOverwrite(
    [rewards],
    async () => { const d = await readRewardData(); return [d.rewards]; },
    'reward',
    force,
  );
  if (guard) return guard;

  const result = await updateRewardDefinitions(rewards);
  return NextResponse.json({ rewards: result.rewards });
}, 'Failed to write reward data');

/** POST — manual balance adjustment (parents only). */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ memberId?: string; amount?: number }>(request);
  if (body instanceof NextResponse) return body;
  const { memberId, amount } = body;

  if (!memberId || typeof amount !== 'number' || amount === 0) {
    return NextResponse.json(
      { error: 'Missing memberId or invalid amount' },
      { status: 400 },
    );
  }

  const result = amount > 0
    ? await creditPoints(memberId, amount)
    : await debitPoints(memberId, Math.abs(amount));

  return NextResponse.json({ balances: result.balances });
}, 'Failed to adjust balance');
