import { FamilyError } from '@/lib/family-errors';
import { validFamilyId } from '@/lib/family-merge';
import { HISTORICAL_ORPHANS_POLICY } from './chore-completions';
import { checkedIds, isRecord, recordLabel, rows, stripIds, withoutKeys, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

export const REWARD_REPAIR_POLICY = 'remove-missing-members-disable-if-none-remain';
export const GOAL_REPAIR_POLICY = 'drop-goal-without-member-or-reward';

/**
 * Rewards: `memberIds` on a reward says who may redeem it (empty means
 * everyone), `balances` holds each person's points, `goals` names the reward
 * each person is saving toward, and `redemptions` and `adjustments` are
 * history with the person's id copied in.
 *
 * Removal takes the person off every reward and drops their balance and
 * goal; redemptions and adjustments keep their ids because they are facts
 * about the past. A reward that was only theirs is disabled, as on restore:
 * an empty `memberIds` means everyone, so stripping the last name alone
 * would hand one child's private reward to the whole family.
 *
 * Restore repairs eligibility a failed legacy deletion left behind: missing
 * people come off a reward, and a reward left with nobody is disabled rather
 * than widened to everyone. A goal whose person or reward is missing is
 * dropped and recorded; a goal is a wish, not history. Orphaned balances are
 * kept as a ledger and recorded, like chore history.
 */
export const rewardReferences: MemberReferenceDomain = {
  path: 'data/rewards.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.rewards)) throw new FamilyError('The saved rewards are invalid.', 409);
    next.balances = withoutKeys(next.balances, removed);
    if (next.goals !== undefined) {
      const goals = withoutKeys(next.goals, removed);
      if (Object.keys(goals).length > 0) next.goals = goals;
      else delete next.goals;
    }
    next.rewards = next.rewards.map((reward: Doc) => {
      const memberIds = stripIds(reward.memberIds, removed);
      const leftWithNobody = Array.isArray(reward.memberIds) && reward.memberIds.length > 0 && memberIds.length === 0;
      return { ...reward, memberIds, ...(leftWithNobody ? { enabled: false } : {}) };
    });
    return next;
  },
  planRestore(doc, members): RestorePlan {
    const repairs: { before: Doc; removedMemberIds: string[]; disabled: boolean }[] = [];
    const rewards = rows(doc.rewards, 'Rewards').map((reward, index) => {
      const ids = checkedIds(reward.memberIds, `${recordLabel('data/rewards.json', `rewards[${index}]`, reward)}, memberIds`);
      const removedMemberIds = [...new Set(ids.filter((id) => !members.has(id)))];
      if (removedMemberIds.length === 0) return reward;
      const memberIds = ids.filter((id) => members.has(id));
      const disabled = memberIds.length === 0;
      repairs.push({ before: reward, removedMemberIds, disabled });
      return { ...reward, memberIds, ...(disabled ? { enabled: false } : {}) };
    });
    if (!isRecord(doc.balances)) throw new Error('Reward balances must be a member mapping.');
    const orphanedBalances: Record<string, number> = {};
    for (const [id, balance] of Object.entries(doc.balances)) {
      if (!validFamilyId(id)) throw new Error('A reward balance needs a valid member identity.');
      if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('A reward balance must be a finite number.');
      if (!members.has(id)) orphanedBalances[id] = balance;
    }
    rows(doc.redemptions, 'Reward redemptions');
    if (doc.adjustments !== undefined) rows(doc.adjustments, 'Reward adjustments');

    const goalRepairs: { memberId: string; rewardId: string; missing: 'member' | 'reward' }[] = [];
    let goals: Doc | undefined;
    if (doc.goals !== undefined) {
      if (!isRecord(doc.goals)) throw new Error('Reward goals must be a member mapping.');
      const rewardIds = new Set(rewards.map((reward) => reward.id));
      goals = {};
      for (const [memberId, rewardId] of Object.entries(doc.goals)) {
        if (!validFamilyId(memberId)) throw new Error('A reward goal needs a valid member identity.');
        if (typeof rewardId !== 'string' || !rewardId) throw new Error('A reward goal must name a reward.');
        if (!members.has(memberId)) goalRepairs.push({ memberId, rewardId, missing: 'member' });
        else if (!rewardIds.has(rewardId)) goalRepairs.push({ memberId, rewardId, missing: 'reward' });
        else goals[memberId] = rewardId;
      }
    }

    const evidence: RestorePlan['evidence'] = {};
    if (Object.keys(orphanedBalances).length > 0) evidence.historicalOrphans = { policy: HISTORICAL_ORPHANS_POLICY, balances: orphanedBalances };
    if (repairs.length > 0) evidence.rewardAssignmentRepairs = { policy: REWARD_REPAIR_POLICY, records: repairs };
    if (goalRepairs.length > 0) evidence.savingsGoalRepairs = { policy: GOAL_REPAIR_POLICY, records: goalRepairs };

    const changed = repairs.length > 0 || goalRepairs.length > 0;
    if (!changed) return { missing: [], evidence };
    const { goals: _dropped, ...rest } = doc;
    const repaired: Doc = { ...rest, rewards, ...(goals && Object.keys(goals).length > 0 ? { goals } : {}) };
    return { doc: repaired, missing: [], evidence };
  },
};
