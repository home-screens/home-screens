import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { publicErrorResponse } from '@/lib/api-utils';
import { readRewardData } from '@/lib/reward-data';
import { readChoreData } from '@/lib/chore-data';
import { choreMarks, readCompletions } from '@/lib/chore-completion-data';
import { readFamilyData } from '@/lib/family-data';
import { withFamilyData } from '@/lib/family-api';
import { buildTicketLedger, summarizeTicketLedger } from '@/lib/reward-history';
import { readConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Public on the LAN, like GET /api/rewards: the /chores kid view shows a
// child their own ticket history with no session. It names chores, rewards
// and a grown-up's reasons, which the same view already shows.

/**
 * GET ?member=<id> — every ticket move for one person, newest first, with the
 * thirty-day totals. Built on the server from the completions, the chore
 * list, the redemptions and the adjustments, so every phone adds the same
 * rows up the same way.
 */
export const GET = async (request: NextRequest) => {
  try {
    return await withFamilyData(async () => {
      const memberId = request.nextUrl.searchParams.get('member');
      if (!memberId) return NextResponse.json({ error: 'Missing member' }, { status: 400 });

      const family = await readFamilyData();
      if (!family.members.some((m) => m.id === memberId)) {
        return NextResponse.json({ error: 'This person was removed. Refresh and choose again.' }, { status: 409 });
      }

      const [rewards, { chores }, marks, config] = await Promise.all([
        readRewardData(),
        readChoreData(),
        readCompletions().then(choreMarks),
        readConfig(),
      ]);
      const timeZone = config.settings.timezone;
      const rows = buildTicketLedger({
        memberId,
        completions: marks.completions,
        chores,
        redemptions: rewards.redemptions,
        adjustments: rewards.adjustments ?? [],
        timeZone,
      });
      const summary = summarizeTicketLedger(rows, new Date(), undefined, timeZone);
      return NextResponse.json({ rows, summary });
    });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to read the ticket history');
  }
};
