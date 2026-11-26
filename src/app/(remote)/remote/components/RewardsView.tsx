'use client';

import type { FamilyMember } from '@/types/family';

import { useState, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { ChevronRight, Lock, Plus, Minus } from 'lucide-react';

import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { HubUnreachableError } from '@/lib/hub-request';
import { RewardSession, adjustTickets, setSavingsGoal, type TicketAdjustment } from '@/lib/reward-client';
import { useTranslate } from '@/i18n';
import { ticketWords } from './ticket-words';
import MemberPills from './MemberPills';
import ConfirmSheet from './ConfirmSheet';
import RewardFormOverlay from './RewardFormOverlay';
import { SavingsGoalCard, SavingsGoalSheet } from './SavingsGoalCard';
import AdjustTicketsSheet from './AdjustTicketsSheet';
import TicketsFeed from './TicketsFeed';
import { useHouseholdTimezone } from '../household-clock';
import { showToast } from '../remote-toast';
import { isRewardOfferedTo, canAffordReward, ticketsAfterRedeeming, redeemGoalEffect, resolveSavingsGoal, requestRedemption, type RedeemOutcome, type SavingsGoals } from '@/lib/reward-rules';
import { memberInitials, memberInk } from '@/lib/family-avatar';
import { GROUP_HEADING } from './remote-styles';
import SegmentedTabs from './SegmentedTabs';
import IconButton from './IconButton';
import { asksForCode } from '@/lib/grown-up-code';
import { grownUpFetch, isGrownUpCancelled } from '@/lib/grown-up-client';
import { useGrownUpStatus, useGrownUpUnlock } from '@/hooks/useGrownUp';
import GrownUpCodeNudge from './GrownUpCodeNudge';

// ── Types ────────────────────────────────────────────────────────────

export interface RewardsData {
  rewards: RewardDefinition[];
  balances: Record<string, number>;
  redemptions: RewardRedemption[];
  /** Each person's reward to save toward. Absent until someone picks one. */
  goals?: SavingsGoals;
  /** Quoted on every save of the reward list; see `contentRevision`. */
  revision: string;
}

interface RewardsViewProps {
  members: FamilyMember[];
  accentColor: string;
  isAdmin?: boolean;
  /**
   * Owned by ChoresTab and shared with the Today view, so the kid who just
   * checked off their chores is the kid whose tickets show here. In the kid
   * view this is also the only way to pick whose tickets get spent: Redeem
   * shows no member picker of its own.
   */
  selectedMemberId: string;
  onSelectMember: (id: string) => void;
  /**
   * The rewards answer, owned by ChoresTab: its poll also feeds the ticket
   * balances on the Today view, so the two never read the rewards twice.
   * `setData` takes this view's optimistic edits and `refreshData` re-reads.
   */
  data: RewardsData | null;
  setData: Dispatch<SetStateAction<RewardsData | null>>;
  refreshData: () => Promise<void>;
}

type InnerView = 'redeem' | 'rewards' | 'balances' | 'history';

// ── Component ────────────────────────────────────────────────────────

export default function RewardsView({
  members,
  accentColor,
  isAdmin = false,
  selectedMemberId,
  onSelectMember,
  data,
  setData,
  refreshData,
}: RewardsViewProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const [innerView, setInnerView] = useState<InnerView>('redeem');
  const [editingReward, setEditingReward] = useState<RewardDefinition | 'new' | null>(null);
  const [redeemTarget, setRedeemTarget] = useState<{ reward: RewardDefinition; memberId: string } | null>(null);
  // One person's plus and minus taps go to the hub one change at a time: a
  // tap while one is out waits here, added up, and goes when it lands.
  const adjustingRef = useRef<Set<string>>(new Set());
  const waitingRef = useRef<Map<string, number>>(new Map());
  const [saveError, setSaveError] = useState<keyof typeof REWARD_ERROR_KEYS | null>(null);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [adjustSheetOpen, setAdjustSheetOpen] = useState(false);
  const timeZone = useHouseholdTimezone();
  const [session] = useState(() => new RewardSession(editorFetch));
  /** Saves of the reward list queued or out. */
  const savesOut = useRef(0);

  // ── Derived ──
  const selectedMember = members.find((m) => m.id === selectedMemberId);
  const selectedColor = selectedMember?.color ?? accentColor;
  const balance = data?.balances[selectedMemberId] ?? 0;

  const availableRewards = useMemo(() => {
    if (!data) return [];
    return data.rewards.filter((r) => isRewardOfferedTo(r, selectedMemberId));
  }, [data, selectedMemberId]);

  // The reward this person is saving for, while it is still one they could redeem.
  const goal = data ? resolveSavingsGoal(data, selectedMemberId) : null;
  // Spending tickets may need the grown-up code: the confirm says so before
  // it is pressed. A signed-in grown-up (or a phone already unlocked) is not asked.
  const grownUpStatus = useGrownUpStatus(fetch);
  const unlocked = useGrownUpUnlock() !== null;
  const asksGrownUp = asksForCode(grownUpStatus, 'redeem') && !unlocked;

  // ── Handlers ──
  const handleRedeem = async () => {
    if (!redeemTarget) return;
    const who = members.find((m) => m.id === redeemTarget.memberId)?.name ?? '';
    const said = { name: who, reward: redeemTarget.reward.name };
    try {
      // The balance this sheet was built from: the hub refuses if it has moved.
      // Spending tickets may need the grown-up code; the hub says when.
      const why = tCore('grownUp.why.redeem', { count: redeemTarget.reward.cost, member: who, reward: redeemTarget.reward.name });
      const { outcome, numbers } = await requestRedemption(grownUpFetch(editorFetch, why), { rewardId: redeemTarget.reward.id, memberId: redeemTarget.memberId, expectedBalance: data?.balances[redeemTarget.memberId] ?? 0 });
      // The hub's numbers, with a yes or with "the tickets moved": goals too,
      // since the one for this reward is gone and the card must say so now,
      // not at the next poll, or a kid is told to spend again.
      if (numbers) setData((prev) => (prev ? { ...prev, balances: numbers.balances ?? prev.balances, redemptions: numbers.redemptions ?? prev.redemptions, goals: numbers.goals ?? {} } : prev));
      // Said out loud either way: a sheet that just closes reads as "you got it".
      if (outcome === 'redeemed') {
        setSaveError(null);
        showToast(t(isAdmin ? 'rewardsView.redeem.gotIt' : 'rewardsView.redeem.gotItKid', said));
      } else {
        if (outcome === 'alreadyGot') {
          setSaveError(null);
          showToast(t(isAdmin ? 'rewardsView.redeem.alreadyGot' : 'rewardsView.redeem.alreadyGotKid', said));
        } else if (outcome === 'moved') {
          setSaveError(null);
          showToast(t('rewardsView.redeem.changed', said));
        } else {
          setSaveError(REDEEM_REFUSALS[outcome]);
        }
        await refreshData();
      }
    } catch (err) {
      // Nobody gave the grown-up code: the sheet stays, so Cancel is still there.
      if (isGrownUpCancelled(err)) return;
      if (!isSessionExpired(err)) setSaveError('redeemFailed');
      await refreshData();
    }
    setRedeemTarget(null);
  };

  /**
   * Persist a rewards list, rolling back to `snapshot` if the write fails.
   * After a failure the real state is fetched back so the page never shows a
   * phantom: these are surfaces children use.
   *
   * Saves go out one at a time (`RewardSession`), each quoting the revision
   * the one before it was answered with. Sent side by side, a second save
   * made before the first came back quoted the same revision and was told
   * somebody else had changed the list.
   *
   * `force` is for deletes: the hub refuses an empty list as a guard against
   * a buggy client wiping the data, but deleting the only reward is exactly
   * that list and the person just confirmed it.
   *
   * When somebody else did save first, the hub answers with its list: that
   * list is shown and the person told to make the change again.
   */
  const persistRewards = async (updated: RewardDefinition[], snapshot: RewardsData | null, force = false) => {
    setSaveError(null);
    // With nothing out, the list on screen is the hub's and so is its
    // revision. While a save is out the session holds the newer one.
    if (savesOut.current === 0 && snapshot) session.adopt(snapshot);
    savesOut.current += 1;
    try {
      const outcome = await session.save(updated, force, '');
      if (outcome.kind === 'superseded') return;
      const { rewards, revision } = outcome.snapshot;
      // A later save still out has a newer list on screen than this answer.
      const last = savesOut.current === 1;
      if (outcome.kind === 'conflict') {
        setData((prev) => (prev ? { ...prev, rewards, revision } : prev));
        setSaveError('conflict');
        await refreshData();
      } else {
        setData((prev) => (prev ? { ...prev, ...(last ? { rewards } : {}), revision } : prev));
      }
    } catch (err) {
      if (isSessionExpired(err)) return;
      setData(snapshot);
      setSaveError(failureKey(err, 'failed'));
      await refreshData();
    } finally {
      savesOut.current -= 1;
    }
  };

  const handleSaveReward = async (reward: RewardDefinition) => {
    const snapshot = data;
    const existing = data?.rewards ?? [];
    const updated = editingReward === 'new'
      ? [...existing, reward]
      : existing.map((r) => (r.id === reward.id ? reward : r));
    // Everything else stays: dropping the goals here blanked every kid's card until the next poll.
    setData((prev) => ({ ...prev, rewards: updated, balances: prev?.balances ?? {}, redemptions: prev?.redemptions ?? [], revision: prev?.revision ?? '' }));
    setEditingReward(null);
    await persistRewards(updated, snapshot);
  };

  const handleDeleteReward = async (id: string) => {
    const snapshot = data;
    const updated = (data?.rewards ?? []).filter((r) => r.id !== id);
    setData((prev) => ({ ...prev, rewards: updated, balances: prev?.balances ?? {}, redemptions: prev?.redemptions ?? [], revision: prev?.revision ?? '' }));
    setEditingReward(null);
    await persistRewards(updated, snapshot, true);
  };

  /**
   * Give or take tickets and show the hub's balances. A refusal or a hub out
   * of reach says so, puts back what `rollback` holds and reads the real
   * numbers, whichever control sent it.
   */
  const sendAdjustment = async (adjustment: TicketAdjustment, rollback?: RewardsData | null): Promise<boolean> => {
    try {
      const balances = await adjustTickets(editorFetch, adjustment, '');
      setSaveError(null);
      // Taps still waiting to go stay on the number shown, or it would dip
      // back to the hub's answer for a moment between quick taps. Read now:
      // React runs the update later, after the caller has taken the waiting
      // taps out to send them.
      const shown = { ...balances };
      for (const [memberId, amount] of waitingRef.current) shown[memberId] = Math.max(0, (shown[memberId] ?? 0) + amount);
      setData((prev) => (prev ? { ...prev, balances: shown } : prev));
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      if (rollback !== undefined) setData(rollback);
      setSaveError(failureKey(err, 'adjustFailed'));
      await refreshData();
      return false;
    }
  };

  /**
   * One person's plus or minus. Optimistic: the number moves at once. Taps
   * faster than the hub answers all count: they wait and go as one change
   * once the one out lands, where each used to be dropped while a save was
   * out (two taps on a slow hub gave one ticket).
   */
  const handleAdjust = async (memberId: string, amount: number) => {
    const snapshot = data;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        balances: {
          ...prev.balances,
          [memberId]: Math.max(0, (prev.balances[memberId] ?? 0) + amount),
        },
      };
    });
    if (adjustingRef.current.has(memberId)) {
      waitingRef.current.set(memberId, (waitingRef.current.get(memberId) ?? 0) + amount);
      return;
    }
    adjustingRef.current.add(memberId);
    let next = amount;
    let rollback: RewardsData | null | undefined = snapshot;
    while (next !== 0) {
      const saved = await sendAdjustment({ memberIds: [memberId], amount: next }, rollback);
      next = waitingRef.current.get(memberId) ?? 0;
      waitingRef.current.delete(memberId);
      // A refused change put the hub's numbers back: taps that waited on it are dropped with it.
      if (!saved) break;
      // The hub's answer already holds everything sent so far; only what waited is left to undo.
      rollback = undefined;
    }
    adjustingRef.current.delete(memberId);
  };

  /**
   * Pick (or clear) what this person is saving for. Optimistic: the bar is
   * drawn at once; a refusal puts the old pick back and says so.
   */
  const handleSetGoal = async (rewardId: string | null) => {
    const snapshot = data;
    setData((prev) => {
      if (!prev) return prev;
      const goals = { ...prev.goals };
      if (rewardId) goals[selectedMemberId] = rewardId;
      else delete goals[selectedMemberId];
      return { ...prev, goals };
    });
    try {
      const goals = await setSavingsGoal(editorFetch, selectedMemberId, rewardId, '');
      setSaveError(null);
      setData((prev) => (prev ? { ...prev, goals } : prev));
    } catch (err) {
      if (isSessionExpired(err)) return;
      setData(snapshot);
      setSaveError(failureKey(err, 'goalFailed'));
      await refreshData();
    }
  };

  /** Several people, the same amount each, with a reason. Nothing optimistic: the sheet waits for the hub. */
  const handleAdjustMany = async (memberIds: string[], amount: number, reason: string) => {
    await sendAdjustment({ memberIds, amount, reason });
  };

  // ── Render ──
  return (
    <div>
      {saveError && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'color-mix(in srgb, var(--hs-danger) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--hs-danger) 30%, transparent)',
            color: 'var(--hs-danger)',
            fontSize: 12,
          }}
        >
          {REWARD_ERROR_KEYS[saveError][0] === 'core' ? tCore(REWARD_ERROR_KEYS[saveError][1]) : t(REWARD_ERROR_KEYS[saveError][1])}
        </div>
      )}

      {/* Inner pages: Redeem, Rewards, Balances, History */}
      <SegmentedTabs
        ariaLabel={t('choresTab.subNav.rewards')}
        value={innerView}
        onChange={setInnerView}
        style={{ marginBottom: 14 }}
        tabs={(isAdmin ? ['redeem', 'rewards', 'balances', 'history'] as const : ['redeem', 'history'] as const).map((v) => ({
          id: v,
          label: t(`rewardsView.nav.${v}`),
        }))}
      />

      {innerView === 'redeem' && (
        <RedeemSection
          t={t}
          members={members}
          selectedMemberId={selectedMemberId}
          onSelectMember={onSelectMember}
          showMemberPicker={isAdmin}
          balance={balance}
          selectedColor={selectedColor}
          rewards={availableRewards}
          onRedeem={(reward) => setRedeemTarget({ reward, memberId: selectedMemberId })}
          goal={goal}
          onOpenGoal={() => setGoalSheetOpen(true)}
          forOther={isAdmin}
        />
      )}

      {innerView === 'rewards' && (
        <RewardsManageSection
          t={t}
          data={data}
          onEditReward={setEditingReward}
        />
      )}

      {innerView === 'balances' && (
        <BalancesSection
          t={t}
          data={data}
          members={members}
          onAdjust={handleAdjust}
          onOpenAdjust={() => setAdjustSheetOpen(true)}
        />
      )}

      {innerView === 'history' && (
        <TicketsFeed
          members={members}
          memberId={selectedMemberId}
          onSelectMember={onSelectMember}
          showMemberPicker={isAdmin}
          isAdmin={isAdmin}
          timeZone={timeZone}
          version={data?.balances}
        />
      )}

      {goalSheetOpen && (
        <SavingsGoalSheet
          memberName={selectedMember?.name ?? t('rewardsView.redeem.memberFallback')}
          rewards={availableRewards}
          goalId={goal?.id ?? null}
          color={selectedColor}
          forOther={isAdmin}
          onPick={(rewardId) => void handleSetGoal(rewardId)}
          onClose={() => setGoalSheetOpen(false)}
        />
      )}

      {adjustSheetOpen && (
        <AdjustTicketsSheet
          members={members}
          balances={data?.balances ?? {}}
          onSubmit={handleAdjustMany}
          onClose={() => setAdjustSheetOpen(false)}
        />
      )}

      {redeemTarget && (() => {
        const cost = redeemTarget.reward.cost;
        const remaining = ticketsAfterRedeeming(balance, redeemTarget.reward);
        const remainingTickets = ticketWords(t, remaining, 'rewardsView');
        const memberName = selectedMember?.name ?? t('rewardsView.redeem.memberFallback');
        // What this does to the goal: clears it, or leaves it short. Nothing
        // is said when the goal stays affordable after the spend.
        const effect = redeemGoalEffect(balance, redeemTarget.reward, goal);
        const goalLine = effect && goal
          ? effect.kind === 'clears'
            ? t('rewardsView.redeem.goalClears', { name: memberName })
            : t('rewardsView.redeem.goalFurther', { goal: goal.name, n: effect.stillNeeded })
          : null;
        const base = cost === 1
          ? t('rewardsView.redeem.confirmDescriptionSingular', { cost, memberName, remaining: remainingTickets })
          : t('rewardsView.redeem.confirmDescriptionPlural', { cost, memberName, remaining: remainingTickets });
        // Two sentences: the base line ends without a full stop in some locales.
        const description = goalLine ? `${base.replace(/[.。]$/, '')}. ${goalLine}` : base;
        const confirmLabel = asksGrownUp
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Lock size={18} strokeWidth={2.6} aria-hidden="true" />{tCore('grownUp.ask')}</span>
          : cost === 1
            ? t('rewardsView.redeem.confirmLabelSingular', { cost })
            : t('rewardsView.redeem.confirmLabelPlural', { cost });
        return (
          <ConfirmSheet
            icon={
              <div style={{ width: 56, height: 56, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${selectedColor} 12%, transparent)` }}>
                <ChoreIcon value={redeemTarget.reward.emoji} size={28} color={selectedColor} />
              </div>
            }
            title={t('rewardsView.redeem.confirmTitle', { name: redeemTarget.reward.name })}
            description={description}
            confirmLabel={confirmLabel}
            memberColor={selectedMember?.color}
            tone="primary"
            onConfirm={handleRedeem}
            onCancel={() => setRedeemTarget(null)}
          />
        );
      })()}

      {editingReward !== null && (
        <RewardFormOverlay
          reward={editingReward === 'new' ? null : editingReward}
          members={members}
          savers={editingReward === 'new' ? [] : members.filter((m) => data?.goals?.[m.id] === editingReward.id).map((m) => m.name)}
          onSave={handleSaveReward}
          onDelete={editingReward !== 'new' ? handleDeleteReward : undefined}
          onBack={() => setEditingReward(null)}
        />
      )}
    </div>
  );
}

/** A hub out of reach says so in the words every phone tab uses; anything else is the action's own line. */
function failureKey(err: unknown, fallback: keyof typeof REWARD_ERROR_KEYS): keyof typeof REWARD_ERROR_KEYS {
  return err instanceof HubUnreachableError ? 'unreachable' : fallback;
}

/** Each line's dictionary and key: `core` holds the sentences the wall and the editor say too. */
const REWARD_ERROR_KEYS = {
  failed: ['core', 'refusals.saveFailed'],
  unreachable: ['core', 'refusals.hubUnreachable'],
  conflict: ['remote', 'rewardsView.changedElsewhere'],
  redeemRefused: ['remote', 'rewardsView.redeem.refused'],
  redeemNotOffered: ['core', 'rewards.redeem.notOffered'],
  redeemRemoved: ['core', 'rewards.redeem.removed'],
  redeemFailed: ['remote', 'rewardsView.redeem.failed'],
  goalFailed: ['core', 'refusals.saveFailed'],
  adjustFailed: ['core', 'refusals.saveFailed'],
} as const;

/** The phone's line for each refusal the shared rule can name; the hub's own words are never shown. */
const REDEEM_REFUSALS: Record<Exclude<RedeemOutcome, 'redeemed' | 'alreadyGot' | 'moved'>, keyof typeof REWARD_ERROR_KEYS> = {
  notEnough: 'redeemRefused',
  notOffered: 'redeemNotOffered',
  removed: 'redeemRemoved',
  failed: 'redeemFailed',
};

// ── Redeem Section ───────────────────────────────────────────────────

function RedeemSection({
  t,
  members,
  selectedMemberId,
  onSelectMember,
  showMemberPicker,
  balance,
  selectedColor,
  rewards,
  onRedeem,
  goal,
  onOpenGoal,
  forOther,
}: {
  t: ReturnType<typeof useTranslate>;
  members: FamilyMember[];
  selectedMemberId: string;
  onSelectMember: (id: string) => void;
  /** Grown-ups pick any member here; kids spend only as the member picked on Today. */
  showMemberPicker: boolean;
  balance: number;
  selectedColor: string;
  rewards: RewardDefinition[];
  onRedeem: (reward: RewardDefinition) => void;
  /** What this person is saving for, if anything; the card under the balance. */
  goal: RewardDefinition | null;
  onOpenGoal: () => void;
  /** A grown-up looking at a kid's goal: the card names the kid rather than saying "you". */
  forOther: boolean;
}) {
  const selectedMember = members.find((m) => m.id === selectedMemberId);
  return (
    <>
      {showMemberPicker && (
      <MemberPills members={members} selectedId={selectedMemberId} onSelect={onSelectMember} />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 20,
          background: 'var(--hs-bg-card)',
          borderRadius: 16,
          marginBottom: 16,
          border: '1px solid var(--hs-bg-hover)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: selectedColor }}>
            {balance}
          </div>
          <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', fontWeight: 500, marginTop: 4 }}>
            {showMemberPicker || !selectedMember
              ? t('rewardsView.redeem.balanceLabel')
              : t('rewardsView.redeem.balanceLabelNamed', { name: selectedMember.name, count: balance })}
          </div>
        </div>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            background: `color-mix(in srgb, ${selectedColor} 12%, transparent)`,
          }}
        >
          🎟️
        </div>
      </div>

      {!showMemberPicker && selectedMember && (
        <p style={{ fontSize: 12, color: 'var(--hs-text-faint)', margin: '-6px 2px 14px', lineHeight: 1.4 }}>
          {t('rewardsView.redeem.switchHint', { name: selectedMember.name })}
        </p>
      )}

      {/* A kid with nothing yet is told where tickets come from. */}
      {!showMemberPicker && balance <= 0 && (
        <p data-testid="no-tickets-hint" style={{ fontSize: 12.5, color: 'var(--hs-text-muted)', margin: '-6px 2px 14px', lineHeight: 1.4 }}>
          {t('rewardsView.redeem.noTicketsHint')}
        </p>
      )}

      <SavingsGoalCard goal={goal} balance={balance} color={selectedColor} onOpen={onOpenGoal} onRedeem={goal && canAffordReward(balance, goal) ? () => onRedeem(goal) : undefined} memberName={selectedMember?.name ?? ''} forOther={forOther} />

      <div style={{ ...GROUP_HEADING, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>🎟️</span>
        {t('rewardsView.redeem.availableHeading')}
      </div>

      {rewards.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--hs-text-faint)', fontSize: 14 }}>
          {t(showMemberPicker ? 'rewardsView.redeem.empty' : 'rewardsView.redeem.emptyKid')}
        </div>
      )}

      {rewards.map((reward) => {
        const canAfford = canAffordReward(balance, reward);
        return (
          <button
            key={reward.id}
            className="press-scale"
            onClick={() => canAfford && onRedeem(reward)}
            disabled={!canAfford}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              background: 'var(--hs-bg-hover)',
              borderRadius: 12,
              marginBottom: 6,
              border: 'none',
              width: '100%',
              textAlign: 'left' as const,
              cursor: canAfford ? 'pointer' : 'not-allowed',
              opacity: canAfford ? 1 : 0.7,
              transition: 'all 0.15s',
              color: 'inherit',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: `color-mix(in srgb, ${selectedColor} 12%, transparent)`,
              }}
            >
              <ChoreIcon value={reward.emoji} size={20} color={selectedColor} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--hs-text-body)' }}>
                {reward.name}
                {goal?.id === reward.id && (
                  <span data-testid="savings-goal-chip" style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: selectedColor, background: `color-mix(in srgb, ${selectedColor} 15%, transparent)`, borderRadius: 999, padding: '3px 8px', verticalAlign: 2 }}>
                    {t('rewardsView.goal.savingChip')}
                  </span>
                )}
              </div>
              {reward.description && (
                <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 1 }}>{reward.description}</div>
              )}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                padding: '6px 14px',
                borderRadius: 999,
                flexShrink: 0,
                whiteSpace: 'nowrap' as const,
                background: canAfford ? `color-mix(in srgb, ${selectedColor} 15%, transparent)` : 'var(--hs-bg-hover)',
                color: canAfford ? selectedColor : 'var(--hs-text-muted)',
              }}
            >
              {ticketWords(t, reward.cost, 'rewardsView')}
            </div>
          </button>
        );
      })}
    </>
  );
}

// ── Manage Section ───────────────────────────────────────────────────

function RewardsManageSection({
  t,
  data,
  onEditReward,
}: {
  t: ReturnType<typeof useTranslate>;
  data: RewardsData | null;
  onEditReward: (reward: RewardDefinition | 'new') => void;
}) {
  const rewards = data?.rewards ?? [];

  return (
    <>
      <GrownUpCodeNudge rewardCount={rewards.length} />
      <div style={{ ...GROUP_HEADING, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ChoreIcon value="lucide:gem" bare size={14} color="currentColor" />
        {t('rewardsView.manage.heading')}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--hs-border-strong)', fontWeight: 500, textTransform: 'none' as const, letterSpacing: 0 }}>
          {rewards.length === 1
            ? t('rewardsView.manage.countSingular', { n: rewards.length })
            : t('rewardsView.manage.countPlural', { n: rewards.length })}
        </span>
      </div>

      {rewards.map((reward) => (
        <button
          key={reward.id}
          className="press-scale"
          onClick={() => onEditReward(reward)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            background: 'var(--hs-bg-card)',
            borderRadius: 12,
            marginBottom: 6,
            cursor: 'pointer',
            width: '100%',
            border: 'none',
            textAlign: 'left' as const,
            opacity: reward.enabled ? 1 : 0.4,
            color: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--hs-bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ChoreIcon value={reward.emoji} size={18} color="var(--hs-text-muted)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--hs-text-body)' }}>{reward.name}</div>
            <div style={{ fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 1 }}>
              {ticketWords(t, reward.cost, 'rewardsView')}
              {' · '}
              {reward.memberIds.length === 0
                ? t('rewardsView.manage.everyone')
                : reward.enabled
                  ? (reward.memberIds.length === 1
                      ? t('rewardsView.manage.memberCountSingular', { n: reward.memberIds.length })
                      : t('rewardsView.manage.memberCountPlural', { n: reward.memberIds.length }))
                  : t('rewardsView.manage.disabled')}
            </div>
          </div>
          <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--hs-border-strong)', flex: 'none' }} />
        </button>
      ))}

      <button
        className="press-scale"
        onClick={() => onEditReward('new')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px 16px',
          minHeight: 48,
          borderRadius: 12,
          border: '2px dashed var(--hs-border)',
          background: 'transparent',
          color: 'var(--hs-text-faint)',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          width: '100%',
          marginTop: 4,
        }}
      >
        <Plus size={18} /> {t('rewardsView.manage.addButton')}
      </button>
    </>
  );
}

// ── Balances Section ─────────────────────────────────────────────────

function BalancesSection({
  t,
  data,
  members,
  onAdjust,
  onOpenAdjust,
}: {
  t: ReturnType<typeof useTranslate>;
  data: RewardsData | null;
  members: FamilyMember[];
  onAdjust: (memberId: string, amount: number) => void;
  /** The sheet for several people, an amount and a reason. */
  onOpenAdjust: () => void;
}) {
  return (
    <>
      <div style={{ ...GROUP_HEADING, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ChoreIcon value="lucide:gem" bare size={14} color="currentColor" />
        {t('rewardsView.balances.heading')}
      </div>

      {members.map((member) => (
        <div
          key={member.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            background: 'var(--hs-bg-card)',
            borderRadius: 12,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: member.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: memberInk(member.color),
              flexShrink: 0,
              fontWeight: 700,
            }}
          >
            {memberInitials(member.name)}
          </div>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--hs-text-body)' }}>
            {member.name}
          </div>
          <div data-testid={`balance-${member.id}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--hs-text-muted)', marginRight: 8 }}>
            {(() => {
              const n = data?.balances[member.id] ?? 0;
              return ticketWords(t, n, 'rewardsView');
            })()}
          </div>
          {/* Minus and plus sit a finger-width apart: side by side they were
              one mis-tap away from taking a ticket instead of giving one. */}
          <IconButton
            framed
            onClick={() => onAdjust(member.id, -1)}
            disabled={(data?.balances[member.id] ?? 0) <= 0}
            label={t('rewardsView.balances.adjustDownAriaLabel', { name: member.name })}
            style={{ marginRight: 8 }}
          >
            <Minus size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            framed
            onClick={() => onAdjust(member.id, 1)}
            label={t('rewardsView.balances.adjustUpAriaLabel', { name: member.name })}
          >
            <Plus size={16} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
      <button
        type="button"
        data-testid="adjust-tickets-open"
        className="press-scale"
        onClick={onOpenAdjust}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, marginTop: 4,
          border: '1px dashed var(--hs-border-strong)', borderRadius: 12, background: 'transparent',
          color: 'var(--hs-text-muted)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <Plus size={18} /> {t('rewardsView.adjust.button')}
      </button>
    </>
  );
}
