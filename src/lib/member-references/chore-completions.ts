import { FamilyError } from '@/lib/family-errors';
import { validFamilyId } from '@/lib/family-merge';
import { rows, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

/**
 * Chore history: each completion names the person who did it.
 *
 * Removal drops a removed person's history with them, and any bonus chore
 * they were holding goes back up for grabs. Restore keeps history: an
 * older deletion path left entries behind, and a ledger is preserved rather
 * than inventing a person for it or assigning future work to that identity.
 * Every unresolved entry goes into the evidence file.
 */
export const HISTORICAL_ORPHANS_POLICY = 'preserve-ledger-entries-without-creating-members';

export const choreCompletionReferences: MemberReferenceDomain = {
  path: 'data/chore-completions.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.completions)) throw new FamilyError('The saved chore completions are invalid.', 409);
    next.completions = next.completions.filter((completion: Doc) => !removed.has(completion.memberId as string));
    if (next.grabs !== undefined) {
      if (!Array.isArray(next.grabs)) throw new FamilyError('The saved chore completions are invalid.', 409);
      next.grabs = next.grabs.filter((grab: Doc) => !removed.has(grab.memberId as string));
    }
    return next;
  },
  planRestore(doc, members): RestorePlan {
    const orphans: Doc[] = [];
    for (const completion of rows(doc.completions, 'Chore completions')) {
      if (!validFamilyId(completion.memberId)) throw new Error('A chore completion needs a valid member identity.');
      if (!members.has(completion.memberId)) orphans.push(completion);
    }
    const evidence: RestorePlan['evidence'] = {};
    if (orphans.length > 0) evidence.historicalOrphans = { policy: HISTORICAL_ORPHANS_POLICY, completions: orphans };
    return { missing: [], evidence };
  },
};
