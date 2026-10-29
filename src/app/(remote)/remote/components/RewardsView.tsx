'use client';

import type { FamilyMember } from '@/types/family';

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { Plus, Minus } from 'lucide-react';

import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import ConfirmSheet from './ConfirmSheet';
import RewardFormOverlay from './RewardFormOverlay';
import { SavingsGoalCard, SavingsGoalSheet } from './SavingsGoalCard';
import AdjustTicketsSheet from './AdjustTicketsSheet';
import TicketsFeed from './TicketsFeed';
import { useHouseholdTimezone } from '../household-clock';
import { showToast } from '../remote-toast';
import { isRewardOfferedTo, canAffordReward, ticketsAfterRedeeming, resolveSavingsGoal, type SavingsGoals } from '@/lib/reward-rules';

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
  const [innerView, setInnerView] = useState<InnerView>('redeem');
  const [editingReward, setEditingReward] = useState<RewardDefinition | 'new' | null>(null);
  const [redeemTarget, setRedeemTarget] = useState<{ reward: RewardDefinition; memberId: string } | null>(null);
  const [adjusting, setAdjusting] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<'failed' | 'conflict' | 'redeemRefused' | 'redeemFailed' | 'goalFailed' | 'adjustFailed' | null>(null);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [adjustSheetOpen, setAdjustSheetOpen] = useState(false);
  const timeZone = useHouseholdTimezone();

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

  // ── Handlers ──
  const handleRedeem = async () => {
    if (!redeemTarget) return;
    try {
      const res = await editorFetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The balance this sheet was built from: the hub refuses if it has moved.
        body: JSON.stringify({ rewardId: redeemTarget.reward.id, memberId: redeemTarget.memberId, expectedBalance: data?.balances[redeemTarget.memberId] ?? 0 }),
      });
      if (res.ok) {
        const result = await res.json() as { balances: Record<string, number>; redemptions: RewardRedemption[]; goals?: SavingsGoals };
        setSaveError(null);
        // Goals too: the one for this reward is gone, and the card must say so
        // now, not at the next poll, or a kid is told to spend again.
        setData((prev) => prev ? { ...prev, balances: result.balances, redemptions: result.redemptions, goals: result.goals ?? {} } : prev);
        // Said out loud: a sheet that just closes does not feel like getting it.
        const who = members.find((m) => m.id === redeemTarget.memberId)?.name ?? '';
        showToast(t(isAdmin ? 'rewardsView.redeem.gotIt' : 'rewardsView.redeem.gotItKid', { name: who, reward: redeemTarget.reward.name }));
      } else {
        // Said out loud: a sheet that just closes reads as "you got it".
        // A 400 is the hub finding too few tickets. When that is because this
        // very reward was redeemed from another device a moment ago, the kid
        // already has it, and "not enough tickets" would send them asking for
        // it again. The refresh then shows what is really left.
        const refused = await res.json().catch(() => null) as { reason?: string; balances?: Record<string, number>; redemptions?: RewardRedemption[]; goals?: SavingsGoals } | null;
        const moved = res.status === 409 && refused?.reason === 'balance';
        const fresh = moved ? refused : await editorFetch('/api/rewards').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { redemptions?: RewardRedemption[] } | null;
        const justGot = (moved || res.status === 400) && !!fresh?.redemptions?.some((r) => r.memberId === redeemTarget.memberId && r.rewardId === redeemTarget.reward.id && Date.now() - new Date(r.redeemedAt).getTime() < 10 * 60_000);
        const who = members.find((m) => m.id === redeemTarget.memberId)?.name ?? '';
        if (justGot) {
          setSaveError(null);
          showToast(t(isAdmin ? 'rewardsView.redeem.alreadyGot' : 'rewardsView.redeem.alreadyGotKid', { name: who, reward: redeemTarget.reward.name }));
        } else if (moved) {
          setSaveError(null);
          showToast(t('rewardsView.redeem.changed', { name: who }));
        } else {
          setSaveError(res.status === 400 ? 'redeemRefused' : 'redeemFailed');
        }
        if (moved && refused?.balances) {
          setData((prev) => (prev ? { ...prev, balances: refused.balances!, redemptions: refused.redemptions ?? prev.redemptions, goals: refused.goals ?? {} } : prev));
        }
        await refreshData();
      }
    } catch (err) {
      if (!isSessionExpired(err)) setSaveError('redeemFailed');
      await refreshData();
    }
    setRedeemTarget(null);
  };

  /**
   * Persist a rewards list, rolling back to `snapshot` if the write fails.
   *
   * `editorFetch` resolves for every status except 401, so omitting the
   * `res.ok` check treated a 500 as success: a saved reward vanished on
   * reload, and a deleted one came back. These are surfaces children use, so
   * phantom state here is the worst place for it.
   *
   * `force` is for deletes: the hub refuses an empty list (409) as a guard
   * against a buggy client wiping the data, but deleting the only reward is
   * exactly that list and the person just confirmed it. After a failure the
   * real state is fetched back so the page never shows a phantom.
   *
   * The list quotes the revision it was built from. When somebody else saved
   * first the hub answers 409 with `reason: 'revision'`; the change is rolled
   * back, the current list fetched, and the person told to make it again.
   */
  const persistRewards = async (updated: RewardDefinition[], snapshot: RewardsData | null, force = false) => {
    setSaveError(null);
    try {
      const res = await editorFetch('/api/rewards/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewards: updated, ...(force ? { force: true } : {}), revision: snapshot?.revision }),
      });
      const json = await res.json().catch(() => null) as { rewards?: RewardDefinition[]; revision?: string; reason?: string } | null;
      if (!res.ok) {
        setData(snapshot);
        setSaveError(res.status === 409 && json?.reason === 'revision' ? 'conflict' : 'failed');
        await refreshData();
        return;
      }
      if (json?.revision) {
        const revision = json.revision;
        setData((prev) => prev ? { ...prev, rewards: json.rewards ?? prev.rewards, revision } : prev);
      }
    } catch (err) {
      if (isSessionExpired(err)) return;
      setData(snapshot);
      setSaveError('failed');
      await refreshData();
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

  const handleAdjust = async (memberId: string, amount: number) => {
    if (adjusting.has(memberId)) return;
    setAdjusting((prev) => new Set(prev).add(memberId));
    const snapshot = data;
    // Optimistic
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
    try {
      const res = await editorFetch('/api/rewards/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, amount }),
      });
      if (res.ok) {
        const result = await res.json();
        setData((prev) => prev ? { ...prev, balances: result.balances } : prev);
      } else {
        setData(snapshot);
      }
    } catch {
      setData(snapshot);
    }
    setAdjusting((prev) => {
      const next = new Set(prev);
      next.delete(memberId);
      return next;
    });
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
      const res = await editorFetch('/api/rewards/goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: selectedMemberId, rewardId }),
      });
      if (res.ok) {
        const result = await res.json() as { goals?: SavingsGoals };
        setSaveError(null);
        setData((prev) => (prev ? { ...prev, goals: result.goals ?? {} } : prev));
      } else {
        setData(snapshot);
        setSaveError('goalFailed');
        await refreshData();
      }
    } catch (err) {
      if (isSessionExpired(err)) return;
      setData(snapshot);
      setSaveError('goalFailed');
    }
  };

  /** Several people, the same amount each, with a reason. Nothing optimistic: the sheet waits for the hub. */
  const handleAdjustMany = async (memberIds: string[], amount: number, reason: string) => {
    try {
      const res = await editorFetch('/api/rewards/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds, amount, ...(reason ? { reason } : {}) }),
      });
      if (res.ok) {
        const result = await res.json() as { balances: Record<string, number> };
        setSaveError(null);
        setData((prev) => (prev ? { ...prev, balances: result.balances } : prev));
      } else {
        setSaveError('adjustFailed');
        await refreshData();
      }
    } catch (err) {
      if (!isSessionExpired(err)) setSaveError('adjustFailed');
    }
  };

  // ── Inner nav colors ──
  const viewColors: Record<InnerView, string> = {
    redeem: selectedColor,
    rewards: '#f59e0b',
    balances: '#4ade80',
    history: '#a78bfa',
  };

  const navLabels: Record<InnerView, string> = {
    redeem: t('rewardsView.nav.redeem'),
    rewards: t('rewardsView.nav.rewards'),
    balances: t('rewardsView.nav.balances'),
    history: t('rewardsView.nav.history'),
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
          {t(REWARD_ERROR_KEYS[saveError])}
        </div>
      )}

      {/* Inner toggle: Redeem / Manage / History */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, padding: '0 2px' }}>
        {(isAdmin ? ['redeem', 'rewards', 'balances', 'history'] as InnerView[] : ['redeem', 'history'] as InnerView[]).map((v) => (
          <button
            key={v}
            onClick={() => setInnerView(v)}
            style={{
              fontSize: 13,
              fontWeight: innerView === v ? 600 : 500,
              color: innerView === v ? viewColors[v] : 'var(--hs-text-faint)',
              // The underline sits under a 17px word; the padding is what makes
              // the tab a thumb-sized target without a taller-looking tab bar.
              minHeight: 44,
              paddingTop: 10,
              paddingBottom: 8,
              cursor: 'pointer',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottomStyle: 'solid',
              borderBottomWidth: 2,
              borderBottomColor: innerView === v ? viewColors[v] : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            {navLabels[v]}
          </button>
        ))}
      </div>

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
        const remainingTickets = remaining === 1
          ? t('rewardsView.ticketCountSingular', { n: remaining })
          : t('rewardsView.ticketCountPlural', { n: remaining });
        const memberName = selectedMember?.name ?? t('rewardsView.redeem.memberFallback');
        // What this does to the goal: clears it, or leaves it short. Nothing
        // is said when the goal stays affordable after the spend.
        const goalLine = goal
          ? goal.id === redeemTarget.reward.id
            ? t('rewardsView.redeem.goalClears', { name: memberName })
            : remaining < goal.cost
              ? t('rewardsView.redeem.goalFurther', { goal: goal.name, n: goal.cost - remaining })
              : null
          : null;
        const base = cost === 1
          ? t('rewardsView.redeem.confirmDescriptionSingular', { cost, memberName, remaining: remainingTickets })
          : t('rewardsView.redeem.confirmDescriptionPlural', { cost, memberName, remaining: remainingTickets });
        // Two sentences: the base line ends without a full stop in some locales.
        const description = goalLine ? `${base.replace(/[.。]$/, '')}. ${goalLine}` : base;
        const confirmLabel = cost === 1
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
            confirmColor={selectedColor}
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

const REWARD_ERROR_KEYS = {
  failed: 'rewardsView.saveFailed',
  conflict: 'rewardsView.changedElsewhere',
  redeemRefused: 'rewardsView.redeem.refused',
  redeemFailed: 'rewardsView.redeem.failed',
  goalFailed: 'rewardsView.goal.failed',
  adjustFailed: 'rewardsView.adjust.failed',
} as const;

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '12px 0' }}>
        {members.map((member) => {
          const isActive = member.id === selectedMemberId;
          return (
            <button
              key={member.id}
              className="press-scale"
              onClick={() => onSelectMember(member.id)}
              aria-pressed={isActive}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                minHeight: 44,
                borderRadius: 999,
                border: `2px solid ${isActive ? member.color : 'transparent'}`,
                background: isActive ? `color-mix(in srgb, ${member.color} 15%, transparent)` : 'var(--hs-bg-card)',
                color: isActive ? member.color : 'var(--hs-text-muted)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                flexShrink: 0,
                maxWidth: '100%',
                transition: 'all 0.15s',
              }}
            >
              {member.emoji ? (
                <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                  <ChoreIcon value={member.emoji} size={18} color={isActive ? member.color : 'var(--hs-text-muted)'} fallback={<span style={{ fontSize: 16, fontWeight: 600 }}>{member.name[0]}</span>} />
                </span>
              ) : (
                <span style={{ fontSize: 16, fontWeight: 600, flexShrink: 0 }}>{member.name[0]}</span>
              )}
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{member.name}</span>
            </button>
          );
        })}
      </div>
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

      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--hs-text-faint)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
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
              {reward.cost === 1
                ? t('rewardsView.ticketCountSingular', { n: reward.cost })
                : t('rewardsView.ticketCountPlural', { n: reward.cost })}
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
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--hs-text-faint)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ChoreIcon value="lucide:gem" bare size={14} color="#a78bfa" />
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
              {reward.cost === 1
                ? t('rewardsView.ticketCountSingular', { n: reward.cost })
                : t('rewardsView.ticketCountPlural', { n: reward.cost })}
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
          <div style={{ color: 'var(--hs-border-strong)', fontSize: 18 }}>›</div>
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
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--hs-text-faint)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ChoreIcon value="lucide:gem" bare size={14} color="#a78bfa" />
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
              color: 'white',
              flexShrink: 0,
              fontWeight: 700,
            }}
          >
            {member.name[0]}
          </div>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--hs-text-body)' }}>
            {member.name}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--hs-text-muted)', marginRight: 8 }}>
            {(() => {
              const n = data?.balances[member.id] ?? 0;
              return n === 1
                ? t('rewardsView.ticketCountSingular', { n })
                : t('rewardsView.ticketCountPlural', { n });
            })()}
          </div>
          {/* Minus and plus sit a finger-width apart: side by side at 32px they
              were one mis-tap away from taking a ticket instead of giving one. */}
          <button
            className="press-scale-xs"
            onClick={() => onAdjust(member.id, -1)}
            disabled={(data?.balances[member.id] ?? 0) <= 0}
            aria-label={t('rewardsView.balances.adjustDownAriaLabel', { name: member.name })}
            style={{
              opacity: (data?.balances[member.id] ?? 0) <= 0 ? 0.4 : 1,
              width: 40,
              height: 40,
              marginRight: 8,
              borderRadius: 10,
              border: '1px solid var(--hs-border)',
              background: 'var(--hs-bg-panel)',
              color: 'var(--hs-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Minus size={16} />
          </button>
          <button
            className="press-scale-xs"
            onClick={() => onAdjust(member.id, 1)}
            aria-label={t('rewardsView.balances.adjustUpAriaLabel', { name: member.name })}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: '1px solid var(--hs-border)',
              background: 'var(--hs-bg-panel)',
              color: 'var(--hs-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={16} />
          </button>
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
