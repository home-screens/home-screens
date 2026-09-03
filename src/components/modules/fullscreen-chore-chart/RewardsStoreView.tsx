'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ArrowLeft, Ticket, Users } from 'lucide-react';
import type { ChoreMember } from '@/types/config';
import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import { displayFetch } from '@/lib/display-fetch';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { rewardsUrl } from '@/lib/fetch-keys';
import { getDensityMultiplier, resolveFullscreenOnAccent, type FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import FamilyEmptyState from '@/components/modules/FamilyEmptyState';
import MemberPicker from './rewards/MemberPicker';
import BalanceBanner from './rewards/BalanceBanner';
import RewardCard from './rewards/RewardCard';
import RedeemConfirm from './rewards/RedeemConfirm';
import RedeemedBanner from './rewards/RedeemedBanner';
import { useElementSize } from './rewards/useElementSize';
import { fitStore, feedMetrics, hiddenBelow } from './rewards/storeLayout';

interface RewardsStoreViewProps {
  members: ChoreMember[];
  rewards: RewardDefinition[];
  balances: Record<string, number>;
  /** Every redemption the hub still holds; the feed sorts and trims it. */
  redemptions: RewardRedemption[];
  /** min(w, h) / 1080: chrome and tap targets scale with this alone. */
  k: number;
  /** Typography multiplier; text scales with k * typoMul. */
  typoMul: number;
  density: 'cozy' | 'snug' | string;
  isLandscape: boolean;
  /** False makes the store read-only: no Redeem pills, no confirm sheet. */
  allowTouch: boolean;
  /** The module's accentColor setting; empty follows the theme. */
  accentColor?: string;
  theme: FullscreenThemeTokens;
  onBack?: () => void;
  idleTimeoutMs?: number;
}

const REDEEMED_BANNER_MS = 5000;

interface RedeemedInfo {
  memberName: string;
  rewardName: string;
  cost: number;
}

export function RewardsStoreView({
  members,
  rewards,
  balances,
  redemptions,
  k,
  typoMul,
  density,
  isLandscape,
  allowTouch,
  accentColor,
  theme,
  onBack,
  idleTimeoutMs,
}: RewardsStoreViewProps) {
  // Ink that reads on top of the accent (Redeem, Yes!, the redeemed bar).
  const onAccent = useMemo(() => resolveFullscreenOnAccent(accentColor, theme, DEFAULT_ACCENT_COLOR), [accentColor, theme]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    members.length > 0 ? members[0].id : null,
  );
  const [localBalances, setLocalBalances] = useState<Record<string, number>>(balances);
  const [localRedemptions, setLocalRedemptions] = useState<RewardRedemption[]>(redemptions);
  const [confirmingReward, setConfirmingReward] = useState<RewardDefinition | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<RedeemedInfo | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const t = useTranslate('modules');
  const tCore = useTranslate('core');

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redeemedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollerRef, scrollerSize] = useElementSize();

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

  useEffect(() => () => {
    if (redeemedTimerRef.current !== null) clearTimeout(redeemedTimerRef.current);
  }, []);

  const handlePointerDown = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  const dismissRedeemed = useCallback(() => {
    if (redeemedTimerRef.current !== null) clearTimeout(redeemedTimerRef.current);
    redeemedTimerRef.current = null;
    setRedeemed(null);
  }, []);

  // Reward filtering: enabled AND (memberIds empty OR includes selected member)
  const visibleRewards = useMemo(
    () => rewards.filter(
      (r) =>
        r.enabled &&
        (r.memberIds.length === 0 || (selectedMemberId !== null && r.memberIds.includes(selectedMemberId))),
    ),
    [rewards, selectedMemberId],
  );

  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;
  const currentBalance = selectedMemberId !== null ? (localBalances[selectedMemberId] ?? 0) : 0;

  const memberRedemptions = useMemo(
    () => (selectedMemberId
      ? localRedemptions
        .filter((r) => r.memberId === selectedMemberId)
        .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime())
      : []),
    [localRedemptions, selectedMemberId],
  );

  const handleRedeem = useCallback(
    async () => {
      if (!allowTouch || !confirmingReward || !selectedMemberId || redeeming) return;
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
          const memberName = selectedMember?.name ?? '';
          const optimistic: RewardRedemption = {
            id: `local-${Date.now()}`,
            rewardId: confirmingReward.id,
            rewardName: confirmingReward.name,
            memberId: selectedMemberId,
            memberName,
            cost: confirmingReward.cost,
            redeemedAt: new Date().toISOString(),
          };
          setLocalRedemptions((prev) => [optimistic, ...prev]);
          setConfirmingReward(null);
          setRedeemed({ memberName, rewardName: confirmingReward.name, cost: confirmingReward.cost });
          if (redeemedTimerRef.current !== null) clearTimeout(redeemedTimerRef.current);
          redeemedTimerRef.current = setTimeout(() => {
            redeemedTimerRef.current = null;
            setRedeemed(null);
          }, REDEEMED_BANNER_MS);
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
    [allowTouch, confirmingReward, selectedMemberId, selectedMember, redeeming, t],
  );

  const handleCancelConfirm = useCallback(() => {
    setConfirmingReward(null);
    setRedeemError(null);
  }, []);

  const handleOpenConfirm = useCallback((reward: RewardDefinition) => {
    if (!allowTouch) return;
    setConfirmingReward(reward);
  }, [allowTouch]);

  // ── Sizing ──────────────────────────────────────────────────────────
  // Text follows the chore list next door (30px names at k = 1, medium);
  // chrome that has to stay tappable follows k alone; paddings and gaps
  // follow density too.
  const tt = k * typoMul;
  // Header chrome (chips, the balance label) stops growing past extra-large
  // so a big-type household does not spend the whole panel on its picker.
  const tc = k * Math.min(typoMul, 1.35);
  const d = getDensityMultiplier(density);
  const pad = 40 * k * d;
  const sectionGap = 24 * k * d;
  const scrollerPadTop = 20 * k * d;
  const hasMembers = members.length > 0;
  const showPicker = members.length > 1;
  const feed = feedMetrics(k, tt, d);
  const moreStripHeight = 24 * tt * 1.4 + 16 * k * d;

  const fit = useMemo(
    () => fitStore({
      rewards: visibleRewards,
      availWidth: scrollerSize.width,
      availHeight: scrollerSize.height,
      moreStripHeight,
      feedCount: memberRedemptions.length,
      isLandscape,
      k,
      t: tt,
      d,
    }),
    [visibleRewards, scrollerSize.width, scrollerSize.height, moreStripHeight, memberRedemptions.length, isLandscape, k, tt, d],
  );
  const feedRows = memberRedemptions.slice(0, fit.feedRows);
  const moreCount = hiddenBelow(visibleRewards.length, fit, scrollTop, scrollerSize.height - moreStripHeight);

  const backButton = onBack && (
    <button
      data-testid="fcc-store-back"
      onClick={onBack}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8 * k,
        padding: `${8 * k}px ${20 * k}px`,
        minHeight: 44 * k,
        borderRadius: 999,
        border: '1px solid var(--fcc-border)',
        background: 'var(--fcc-surface)',
        color: 'var(--fcc-accent)',
        fontSize: 22 * k,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: 'var(--fcc-card-shadow)',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        outline: 'none',
        fontFamily: 'inherit',
      }}
    >
      <ArrowLeft size={22 * k} strokeWidth={2.5} aria-hidden="true" />
      {t('fullscreen-chore-chart.rewardsStore.backToChores')}
    </button>
  );

  const picker = showPicker && (
    <MemberPicker
      members={members}
      balances={localBalances}
      selectedId={selectedMemberId}
      onSelect={setSelectedMemberId}
      k={k}
      t={tc}
      d={d}
    />
  );

  const banner = selectedMember && (
    <BalanceBanner balance={currentBalance} memberName={selectedMember.name} k={k} t={tc} d={d} />
  );

  let body: React.ReactNode;
  if (!hasMembers) {
    body = (
      <div style={{ flex: 1, display: 'flex', color: 'var(--fcc-text-2)' }}>
        <FamilyEmptyState
          icon={<Users size="1em" strokeWidth={1.75} aria-hidden="true" />}
          title={t('chore-chart.noMembersYet')}
          hint={t('chore-chart.setUpFromPhoneHint')}
          fontSize={44 * k}
        />
      </div>
    );
  } else if (visibleRewards.length === 0) {
    body = (
      <div style={{ flex: 1, display: 'flex', color: 'var(--fcc-text-2)' }}>
        <FamilyEmptyState
          icon={<Ticket size="1em" strokeWidth={1.75} aria-hidden="true" />}
          title={t('fullscreen-chore-chart.rewardsStore.noneAvailable')}
          hint={t('fullscreen-chore-chart.rewardsStore.addFromPhoneHint')}
          fontSize={44 * k}
        />
      </div>
    );
  } else {
    body = (
      <>
        <div
          data-testid="fcc-reward-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${fit.columns}, minmax(0, 1fr))`,
            gridAutoRows: `${fit.rowHeight}px`,
            gap: fit.gap,
            flexShrink: 0,
          }}
        >
          {visibleRewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              balance={currentBalance}
              allowTouch={allowTouch}
              onRedeem={handleOpenConfirm}
              metrics={fit.metrics}
              onAccent={onAccent}
            />
          ))}
        </div>

        {feedRows.length > 0 && (
          <div
            data-testid="fcc-reward-feed"
            style={{ marginTop: feed.top - 1, paddingTop: 0, borderTop: '1px solid var(--fcc-border-sub)', flexShrink: 0 }}
          >
            <div
              style={{
                fontSize: feed.heading,
                lineHeight: 1.3,
                fontWeight: 700,
                color: 'var(--fcc-text-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                paddingTop: 12 * k * d,
                height: feed.headingBlock,
                boxSizing: 'border-box',
              }}
            >
              {t('fullscreen-chore-chart.rewardsStore.recentRedemptions')}
            </div>
            {feedRows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16 * k * d,
                  height: feed.rowBlock,
                  boxSizing: 'border-box',
                  padding: `${feed.rowPadY}px 0`,
                  borderBottom: '1px solid var(--fcc-border-sub)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 * k * d, minWidth: 0 }}>
                  <span style={{ fontSize: feed.row, lineHeight: 1.4, fontWeight: 600, color: 'var(--fcc-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.rewardName}
                  </span>
                  <span style={{ fontSize: feed.row, lineHeight: 1.4, color: 'var(--fcc-text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {t('fullscreen-chore-chart.rewardsStore.redemptionCost', { count: r.cost })}
                  </span>
                </div>
                <span style={{ fontSize: feed.time, lineHeight: 1.4, color: 'var(--fcc-text-2)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {formatTimeAgoLocalized(r.redeemedAt, tCore)}
                </span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      data-testid="fcc-store"
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
      {/* Header: title and back control on one line, then the picker and the hero balance. */}
      <div style={{ flexShrink: 0, padding: `${pad}px ${pad}px 0`, display: 'flex', flexDirection: 'column', gap: sectionGap }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 * k * d }}>
          <div style={{ minWidth: 0 }}>
            <div
              data-testid="fcc-store-title"
              style={{ fontSize: Math.max(46 * k, 28 * tt), fontWeight: 800, lineHeight: 1.1, color: 'var(--fcc-text)' }}
            >
              {t('fullscreen-chore-chart.rewardsStore.title')}
            </div>
            <div style={{ fontSize: 22 * tt, fontWeight: 500, color: 'var(--fcc-text-2)', marginTop: 4 * k, lineHeight: 1.2 }}>
              {t('fullscreen-chore-chart.rewardsStore.subtitle')}
            </div>
          </div>
          {backButton}
        </div>

        {hasMembers && (isLandscape ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 * k * d, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>{picker}</div>
            <div style={{ flexShrink: 0 }}>{banner}</div>
          </div>
        ) : (
          <>
            {picker}
            {banner && <div>{banner}</div>}
          </>
        ))}
      </div>

      {/* The scroller's size never depends on whether it overflows: the "+N more"
          strip is an overlay, so the fit rule cannot flip-flop on its own output. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div
          ref={scrollerRef}
          data-testid="fcc-store-scroller"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: fit.overflow ? 'auto' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: `${scrollerPadTop}px ${pad}px ${pad}px`,
          }}
        >
          {body}
        </div>

        {fit.overflow && (
          <div
            data-testid="fcc-store-more"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: moreStripHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24 * tt,
              fontWeight: 600,
              color: 'var(--fcc-text-2)',
              lineHeight: 1.4,
              background: 'linear-gradient(to bottom, transparent, var(--fcc-bg) 45%)',
              pointerEvents: 'none',
            }}
          >
            {moreCount > 0 ? t('fullscreen-chore-chart.rewardsStore.moreRewards', { count: moreCount }) : ''}
          </div>
        )}
      </div>

      {allowTouch && confirmingReward && selectedMember && (
        <RedeemConfirm
          reward={confirmingReward}
          memberName={selectedMember.name}
          error={redeemError}
          busy={redeeming}
          onConfirm={handleRedeem}
          onCancel={handleCancelConfirm}
          k={k}
          t={tt}
          d={d}
          onAccent={onAccent}
        />
      )}

      {redeemed && (
        <RedeemedBanner
          title={t('fullscreen-chore-chart.rewardsStore.redeemedTitle')}
          body={t('fullscreen-chore-chart.rewardsStore.redeemedBody', { member: redeemed.memberName, reward: redeemed.rewardName, count: redeemed.cost })}
          k={k}
          t={tt}
          d={d}
          onAccent={onAccent}
          onDismiss={dismissRedeemed}
        />
      )}
    </div>
  );
}
