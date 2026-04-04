import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { readRewardData, redeemReward } from '@/lib/reward-data';
import { readChoreData } from '@/lib/chore-data';

export const dynamic = 'force-dynamic';

/** GET — returns rewards, balances, and recent redemptions (display polls this). */
export const GET = withDisplayAuth(async () => {
  const data = await readRewardData();
  return NextResponse.json(data);
}, 'Failed to read rewards');

/** POST — redeem a reward for a member. */
export const POST = withDisplayAuth(async (request: NextRequest) => {
  const body = await request.json();
  const { rewardId, memberId } = body as { rewardId: string; memberId: string };

  if (!rewardId || !memberId) {
    return NextResponse.json(
      { error: 'Missing rewardId or memberId' },
      { status: 400 },
    );
  }

  const rewardData = await readRewardData();
  const reward = rewardData.rewards.find((r) => r.id === rewardId);

  if (!reward || !reward.enabled) {
    return NextResponse.json(
      { error: 'Reward not found or disabled' },
      { status: 404 },
    );
  }

  // Check member eligibility
  if (reward.memberIds.length > 0 && !reward.memberIds.includes(memberId)) {
    return NextResponse.json(
      { error: 'Member is not eligible for this reward' },
      { status: 403 },
    );
  }

  // Check balance
  const balance = rewardData.balances[memberId] ?? 0;
  if (balance < reward.cost) {
    return NextResponse.json(
      { error: 'Insufficient point balance' },
      { status: 400 },
    );
  }

  // Look up member name for denormalized snapshot
  const choreData = await readChoreData();
  const member = choreData.members.find((m) => m.id === memberId);
  const memberName = member?.name ?? 'Unknown';

  let result;
  try {
    result = await redeemReward(reward, memberId, memberName);
  } catch (err) {
    if (err instanceof Error && err.message === 'Insufficient balance') {
      return NextResponse.json({ error: 'Insufficient point balance' }, { status: 400 });
    }
    throw err;
  }
  return NextResponse.json({ balances: result.balances, redemptions: result.redemptions });
}, 'Failed to redeem reward');
