'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChoreMember } from '@/types/config';
import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import { displayFetch } from '@/lib/display-fetch';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { rewardsUrl } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import MemberPicker from './rewards/MemberPicker';
import BalanceBanner from './rewards/BalanceBanner';
import RewardCard from './rewards/RewardCard';
import RedeemConfirm from './rewards/RedeemConfirm';

interface RewardsStoreViewProps {
  members: ChoreMember[];
  rewards: RewardDefinition[];
  balances: Record<string, number>;
  redemptions: RewardRedemption[];
  scale: number;
  isLandscape: boolean;
  onBack?: () => void;
  idleTimeoutMs?: number;
}

export function RewardsStoreView({
  members,
  rewards,
  balances,
  redemptions,
  scale,
  isLandscape,
  onBack,
  idleTimeoutMs,
}: RewardsStoreViewProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    members.length > 0 ? members[0].id : null,
  );
  const [localBalances, setLocalBalances] = useState<Record<string, number>>(balances);
  const [localRedemptions, setLocalRedemptions] = useState<RewardRedemption[]>(redemptions);
  const [confirmingReward, setConfirmingReward] = useState<RewardDefinition | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const t = useTranslate('modules');
  const tCore = useTranslate('core');

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from props when polling updates arrive
  useEffect(() => { setLocalBalances(balances); }, [balances]);
  useEffect(() => { setLocalRedemptions(redemptions); }, [redemptions]);

  // When the rewards store is the configured boot view, `members` is empty
  // at mount (useChoreData hasn't resolved yet), so the useState initializer
  // above selects nothing. Select the first member once data arrives.
  useEffect(() => {
    if (selectedMemberId === null && members.length > 0) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, selectedMemberId]);

  // Idle timeout: reset on pointer activity, call onBack when expired
  const resetIdleTimer = useCallback(() => {
    if (!idleTimeoutMs || !onBack) return;
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      onBack();
    }, idleTimeoutMs);
  }, [idleTimeoutMs, onBack]);

  useEffect(() => {
    if (!idleTimeoutMs || !onBack) return;
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [idleTimeoutMs, onBack, resetIdleTimer]);

  const handlePointerDown = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  // Reward filtering: enabled AND (memberIds empty OR includes selected member)
  const visibleRewards = rewards.filter(
    (r) =>
      r.enabled &&
      (r.memberIds.length === 0 || (selectedMemberId !== null && r.memberIds.includes(selectedMemberId))),
  );

  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;
  const currentBalance = selectedMemberId !== null ? (localBalances[selectedMemberId] ?? 0) : 0;

  const memberRedemptions = selectedMemberId
    ? localRedemptions
        .filter((r) => r.memberId === selectedMemberId)
        .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime())
        .slice(0, 10)
    : [];

  const handleRedeem = useCallback(
    async () => {
      if (!confirmingReward || !selectedMemberId || redeeming) return;
      setRedeeming(true);
      setRedeemError(null);
      try {
        const res = await displayFetch(rewardsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rewardId: confirmingReward.id, memberId: selectedMemberId }),
        });
        if (res.ok) {
          const data = await res.json() as { balances?: Record<string, number> };
          if (data.balances) {
            setLocalBalances(data.balances);
          }
          const optimistic: RewardRedemption = {
            id: `local-${Date.now()}`,
            rewardId: confirmingReward.id,
            rewardName: confirmingReward.name,
            memberId: selectedMemberId,
            memberName: selectedMember?.name ?? '',
            cost: confirmingReward.cost,
            redeemedAt: new Date().toISOString(),
          };
          setLocalRedemptions((prev) => [optimistic, ...prev]);
          setConfirmingReward(null);
        } else {
          const err = await res.json().catch(() => null);
          setRedeemError(err?.error ?? t('fullscreen-chore-chart.rewardsStore.errorGeneric'));
        }
      } catch {
        setRedeemError(t('fullscreen-chore-chart.rewardsStore.errorOffline'));
      } finally {
        setRedeeming(false);
      }
    },
    [confirmingReward, selectedMemberId, selectedMember, redeeming, t],
  );

  const handleCancelConfirm = useCallback(() => {
    setConfirmingReward(null);
    setRedeemError(null);
  }, []);

  // Layout values
  const columns = isLandscape ? 4 : 2;
  const headerPaddingTop = scale * 1.6;
  const headerPaddingH = scale * 1.6;
  const sectionGap = scale * 1.2;
  const titleFontSize = scale * 2.0;
  const subtitleFontSize = scale * 1.0;
  const backFontSize = scale * 0.95;
  const gridGap = scale * 1.0;
  const gridPaddingH = scale * 1.6;
  const gridPaddingV = scale * 1.2;

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--fcc-bg)',
        color: 'var(--fcc-text)',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: `${headerPaddingTop}px ${headerPaddingH}px ${scale * 0.8}px`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: scale * 1.0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: titleFontSize,
              fontWeight: 800,
              color: 'var(--fcc-text)',
              lineHeight: 1.1,
            }}
          >
            {t('fullscreen-chore-chart.rewardsStore.title')}
          </div>
          <div
            style={{
              fontSize: subtitleFontSize,
              fontWeight: 400,
              color: 'var(--fcc-text-2)',
              marginTop: scale * 0.25,
            }}
          >
            {t('fullscreen-chore-chart.rewardsStore.subtitle')}
          </div>
        </div>

        {onBack && (
          <button
            onClick={onBack}
            style={{
              fontSize: backFontSize,
              fontWeight: 600,
              color: 'var(--fcc-text-2)',
              background: 'var(--fcc-surface)',
              border: `${scale * 0.1}px solid var(--fcc-border)`,
              borderRadius: scale * 2,
              padding: `${scale * 0.45}px ${scale * 1.1}px`,
              cursor: 'pointer',
              outline: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              alignSelf: 'center',
            }}
          >
            {t('fullscreen-chore-chart.rewardsStore.backToChores')}
          </button>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: `0 ${headerPaddingH}px`,
          marginBottom: sectionGap,
        }}
      >
        <MemberPicker
          members={members}
          balances={localBalances}
          selectedId={selectedMemberId}
          onSelect={setSelectedMemberId}
          scale={scale}
        />
      </div>

      {selectedMember && (
        <div
          style={{
            flexShrink: 0,
            padding: `0 ${headerPaddingH}px`,
            marginBottom: sectionGap,
          }}
        >
          <BalanceBanner
            balance={currentBalance}
            memberName={selectedMember.name}
            scale={scale}
          />
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `${gridPaddingV}px ${gridPaddingH}px`,
        }}
      >
        {visibleRewards.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: scale * 1.1,
              color: 'var(--fcc-text-3)',
              fontWeight: 500,
            }}
          >
            {t('fullscreen-chore-chart.rewardsStore.noneAvailable')}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
              gap: gridGap,
            }}
          >
            {visibleRewards.map((reward) => (
              <RewardCard
                key={reward.id}
                reward={reward}
                canAfford={currentBalance >= reward.cost}
                onRedeem={setConfirmingReward}
                scale={scale}
              />
            ))}
          </div>
        )}

        {memberRedemptions.length > 0 && (
          <div style={{ marginTop: scale * 1.5, paddingTop: scale * 1, borderTop: '1px solid var(--fcc-border-sub)' }}>
            <div style={{ fontSize: scale * 0.85, fontWeight: 700, color: 'var(--fcc-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: scale * 0.6 }}>
              {t('fullscreen-chore-chart.rewardsStore.recentRedemptions')}
            </div>
            {memberRedemptions.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${scale * 0.5}px 0`,
                  borderBottom: '1px solid var(--fcc-border-sub)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: scale * 0.5 }}>
                  <span style={{ fontSize: scale * 0.9, fontWeight: 600, color: 'var(--fcc-text)' }}>
                    {r.rewardName}
                  </span>
                  <span style={{ fontSize: scale * 0.75, color: 'var(--fcc-accent)', fontWeight: 600 }}>
                    {t('fullscreen-chore-chart.rewardsStore.redemptionCost', { count: r.cost })}
                  </span>
                </div>
                <span style={{ fontSize: scale * 0.7, color: 'var(--fcc-text-3)', flexShrink: 0 }}>
                  {formatTimeAgoLocalized(r.redeemedAt, tCore)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmingReward && selectedMember && (
        <RedeemConfirm
          reward={confirmingReward}
          memberName={selectedMember.name}
          error={redeemError}
          onConfirm={handleRedeem}
          onCancel={handleCancelConfirm}
          scale={scale}
        />
      )}
    </div>
  );
}
