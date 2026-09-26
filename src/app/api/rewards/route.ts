import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { publicErrorResponse, parseJsonBody } from '@/lib/api-utils';
import { readRewardData, redeemReward } from '@/lib/reward-data';
import { contentRevision } from '@/lib/content-revision';
import { readFamilyData } from '@/lib/family-data';
import { withFamilyData } from '@/lib/family-api';
import { isRewardEligibleFor, canAffordReward } from '@/lib/reward-rules';
import { withDataTransaction } from '@/lib/data-transaction';
import { householdToday } from '@/lib/household-day';
import { holdsEtag, revalidatedHeaders, rewardsEtag } from '@/lib/chore-revisions';

export const dynamic = 'force-dynamic';

// Public on the LAN — no auth wrapper. The /chores route is the unauthenticated
// kid view and needs to read balances/rewards (GET) and redeem (POST).
// Admin-only mutations (editing rewards, manual balance adjust) live at
// /api/rewards/data and are still gated by withAuth.

/**
 * GET — returns rewards, balances, and recent redemptions (display polls this),
 * plus the revision a whole-list save of the rewards has to quote back. An
 * unchanged answer is a bodiless 304 (see `chore-revisions`).
 */
export const GET = async (request: NextRequest) => {
  try {
    // One pass through the coordinator, so the ETag names the bytes it is sent with.
    return await withDataTransaction(async () => {
      const etag = await rewardsEtag(await householdToday());
      if (holdsEtag(request, etag)) return new NextResponse(null, { status: 304, headers: revalidatedHeaders(etag) });
      const data = await readRewardData();
      return NextResponse.json({ ...data, revision: contentRevision(data.rewards) }, { headers: revalidatedHeaders(etag) });
    });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to read rewards');
  }
};

/** POST — redeem a reward for a member. */
export const POST = async (request: NextRequest) => {
  try {
    return await withFamilyData(async () => {
    const body = await parseJsonBody<{ rewardId?: string; memberId?: string }>(request);
    if (body instanceof NextResponse) return body;
    const { rewardId, memberId } = body;

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

    // Checked apart from `enabled` above so the two answer differently: a
    // disabled reward is "no such reward", an ineligible one is "not yours".
    if (!isRewardEligibleFor(reward, memberId)) {
      return NextResponse.json(
        { error: 'Member is not eligible for this reward' },
        { status: 403 },
      );
    }

    // Check balance
    const balance = rewardData.balances[memberId] ?? 0;
    if (!canAffordReward(balance, reward)) {
      return NextResponse.json(
        { error: 'Insufficient point balance' },
        { status: 400 },
      );
    }

    // Look up member name for denormalized snapshot
    const family = await readFamilyData();
    const member = family.members.find((m) => m.id === memberId);
    if (!member) return NextResponse.json({ error: 'This person was removed. Refresh and choose again.' }, { status: 409 });
    const memberName = member.name;

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
    });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to redeem reward');
  }
};
