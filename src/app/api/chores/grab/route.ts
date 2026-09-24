import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, publicErrorResponse } from '@/lib/api-utils';
import { readChoreData } from '@/lib/chore-data';
import { readFamilyData } from '@/lib/family-data';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';
import { choreMarks, updateCompletionsAtomic } from '@/lib/chore-completion-data';
import { checkGrab, grabHolds, isBonusChore, type BonusCheck } from '@/lib/chore-bonus';
import { householdToday } from '@/lib/household-day';

export const dynamic = 'force-dynamic';

interface GrabRequest {
  choreId?: unknown;
  memberId?: unknown;
  /** `grab` holds the chore for this person; `let-go` puts it back up for grabs. */
  action?: unknown;
}

/**
 * Grab an up-for-grabs bonus chore, or let it go.
 *
 * Public on the LAN like `POST /api/chores`: the /chores kid view and the wall
 * both grab. A grab is always for today. Letting go is allowed for anyone's
 * grab, the same honour system as ticking a chore: the wall cannot tell who is
 * standing at it, and a grown-up frees a forgotten grab from /remote.
 */
export const POST = async (request: NextRequest) => {
  try {
    return await withFamilyData(async () => {
      const body = await parseJsonBody<GrabRequest>(request);
      if (body instanceof NextResponse) return body;
      const { choreId, memberId, action } = body;
      if (typeof choreId !== 'string' || !choreId || typeof memberId !== 'string' || !memberId
        || (action !== 'grab' && action !== 'let-go')) {
        return NextResponse.json({ error: 'Send a choreId, a memberId and an action of "grab" or "let-go".' }, { status: 400 });
      }
      const references = await validateMemberReferences([memberId]);
      if (references) return references;

      const [{ chores, settings }, family] = await Promise.all([readChoreData(), readFamilyData()]);
      const chore = chores.find((c) => c.id === choreId);
      if (!chore) return NextResponse.json({ error: 'That chore no longer exists.' }, { status: 404 });
      // A grab is always for the hub's today, whatever day the asking screen
      // thinks it is: every rule, the clean-up and every other screen judge
      // grabs by the hub's day, so a grab dated otherwise would lapse at once.
      // Phones take their today from the hub (`GET /api/chores`).
      const date = await householdToday();

      let refused: BonusCheck | null = null;
      const result = await updateCompletionsAtomic((data) => {
        const grabs = data.grabs ?? [];
        if (action === 'let-go') {
          const kept = grabs.filter((g) => !(g.choreId === choreId && g.memberId === memberId));
          return kept.length === grabs.length ? data : { ...data, grabs: kept };
        }
        refused = checkGrab(chore, memberId, date, chores, choreMarks(data), family.groups ?? [], settings);
        if (refused) return data;
        // Already holding it: nothing changes, not even the date, so grabbing
        // again (from a screen that had not caught up) never renews how long a
        // grab lasts. Otherwise this grab is now the only one on the chore:
        // any other entry for it (a lapsed grab, one by someone since taken
        // out of the group) could otherwise come back to life and take the
        // chore away from whoever holds it now.
        if (isBonusChore(chore) && grabs.some((g) => g.memberId === memberId && grabHolds(g, chore, date, settings.grabHold, date))) return data;
        return {
          ...data,
          grabs: [...grabs.filter((g) => g.choreId !== choreId), { choreId, memberId, date }],
        };
      });

      if (refused) {
        const { refusal, memberId: holder } = refused as BonusCheck;
        return NextResponse.json(
          // The lists as they stand, so the screen that asked can show why at once.
          { error: 'This bonus chore cannot be grabbed right now.', reason: refusal, ...(holder ? { memberId: holder } : {}), ...choreMarks(result) },
          { status: 409 },
        );
      }
      return NextResponse.json(choreMarks(result));
    });
  } catch (error) {
    return publicErrorResponse(error, 'Failed to grab the chore');
  }
};
