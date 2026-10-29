import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { publicErrorResponse, parseJsonBody } from '@/lib/api-utils';
import { readRewardData, setSavingsGoal } from '@/lib/reward-data';
import { readFamilyData } from '@/lib/family-data';
import { withFamilyData } from '@/lib/family-api';
import { isRewardEligibleFor } from '@/lib/reward-rules';

export const dynamic = 'force-dynamic';

// Public on the LAN, like redeeming through POST /api/rewards: the /chores
// kid view is where a child picks what to save for, and it has no session.
// Picking a goal moves no tickets; it only decides which bar is drawn.

/** POST — pick (or with `rewardId: null` clear) the reward a member is saving toward. */
export const POST = async (request: NextRequest) => {
  try {
    return await withFamilyData(async () => {
      const body = await parseJsonBody<{ memberId?: unknown; rewardId?: unknown }>(request);
      if (body instanceof NextResponse) return body;
      const { memberId, rewardId } = body;

      if (typeof memberId !== 'string' || !memberId || (rewardId !== null && (typeof rewardId !== 'string' || !rewardId))) {
        return NextResponse.json({ error: 'Missing memberId or rewardId' }, { status: 400 });
      }

      const family = await readFamilyData();
      if (!family.members.some((m) => m.id === memberId)) {
        return NextResponse.json({ error: 'This person was removed. Refresh and choose again.' }, { status: 409 });
      }

      if (rewardId !== null) {
        const reward = (await readRewardData()).rewards.find((r) => r.id === rewardId);
        if (!reward || !reward.enabled) {
          return NextResponse.json({ error: 'Reward not found or disabled' }, { status: 404 });
        }
        if (!isRewardEligibleFor(reward, memberId)) {
          return NextResponse.json({ error: 'Member is not eligible for this reward' }, { status: 403 });
        }
      }

      const result = await setSavingsGoal(memberId, rewardId);
      return NextResponse.json({ goals: result.goals ?? {} });
    });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to save the goal');
  }
};
