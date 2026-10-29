'use client';

import type { FamilyMember } from '@/types/family';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ArrowLeft, History, Ticket, Users } from 'lucide-react';

import type { RewardDefinition, RewardRedemption } from '@/lib/reward-data';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import { getDensityMultiplier, resolveFullscreenOnAccent, type FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { DEFAULT_ACCENT_COLOR } from '@/lib/meal-constants';
import { useTranslate } from '@/i18n';
import FamilyEmptyState from '@/components/modules/FamilyEmptyState';
import MemberPicker from './rewards/MemberPicker';
import BalanceBanner from './rewards/BalanceBanner';
import RewardCard from './rewards/RewardCard';
import RedeemConfirm from './rewards/RedeemConfirm';
import RedeemedBanner from './rewards/RedeemedBanner';
import { useElementBox } from '@/hooks/useElementBox';
import { useRedeemReward } from '../shared/useRedeemReward';
import { fitStore, feedMetrics, hiddenBelow } from './rewards/storeLayout';
import { isRewardOfferedTo, resolveSavingsGoal, sortRedemptionsNewestFirst } from '@/lib/reward-rules';

interface RewardsStoreViewProps {
  members: FamilyMember[];
  rewards: RewardDefinition[];
  balances: Record<string, number>;
  /** Each person's reward to save toward, by member id. */
  goals?: Record<string, string>;
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
  /** Where a redeem's result goes: `useChoreData().applyRedemption`. */
  onRedeemed: (result: { balances?: Record<string, number>; redemptions?: RewardRedemption[] }) => void;
  onBack?: () => void;
  /** Opens the family's reward history in place of the store. */
  onShowHistory?: () => void;
  idleTimeoutMs?: number;
}

export function RewardsStoreView({
  members,
  rewards,
  balances,
  goals,
  redemptions,
  k,
  typoMul,
  density,
  isLandscape,
  allowTouch,
  accentColor,
  theme,
  onRedeemed,
  onBack,
  onShowHistory,
  idleTimeoutMs,
}: RewardsStoreViewProps) {
  // Ink that reads on top of the accent (Redeem, Yes!, the redeemed bar).
  const onAccent = useMemo(() => resolveFullscreenOnAccent(accentColor, theme, DEFAULT_ACCENT_COLOR), [accentColor, theme]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    members.length > 0 ? members[0].id : null,
  );
  // Both come straight from the shared chore data, which a redeem publishes
  // into; a copy kept here was overwritten by the next poll of anything else.
  const localBalances = balances;
  const localRedemptions = redemptions;
  const [scrollTop, setScrollTop] = useState(0);
  const t = useTranslate('modules');
  const tCore = useTranslate('core');

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollerRef, scrollerSize] = useElementBox();

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

  const visibleRewards = useMemo(
    () => rewards.filter((r) => isRewardOfferedTo(r, selectedMemberId)),
    [rewards, selectedMemberId],
  );

  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;
  const currentBalance = selectedMemberId !== null ? (localBalances[selectedMemberId] ?? 0) : 0;
  const goalReward = selectedMemberId !== null ? resolveSavingsGoal({ rewards, goals }, selectedMemberId) : null;

  const memberRedemptions = useMemo(
    () => (selectedMemberId
      ? sortRedemptionsNewestFirst(localRedemptions.filter((r) => r.memberId === selectedMemberId))
      : []),
    [localRedemptions, selectedMemberId],
  );

  const redeem = useRedeemReward({ enabled: allowTouch, onRedeemed });
  const { redeemed } = redeem;
  const askForSelected = redeem.ask;
  const handleOpenConfirm = useCallback((reward: RewardDefinition) => {
    if (selectedMember) askForSelected(reward, selectedMember, localBalances[selectedMember.id] ?? 0);
  }, [askForSelected, selectedMember, localBalances]);

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

  const headerPill: React.CSSProperties = {
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
  };
  // Only once there is a history to look at; the whole family's, not the picked person's.
  const historyButton = onShowHistory && localRedemptions.length > 0 && (
    <button data-testid="fcc-store-history" onClick={onShowHistory} style={headerPill}>
      <History size={22 * k} strokeWidth={2.5} aria-hidden="true" />
      {t('fullscreen-chore-chart.rewardsStore.history')}
    </button>
  );
  const backButton = onBack && (
    <button data-testid="fcc-store-back" onClick={onBack} style={headerPill}>
      <ArrowLeft size={22 * k} strokeWidth={2.5} aria-hidden="true" />
      {t('fullscreen-chore-chart.rewardsStore.backToChores')}
    </button>
  );
  const headerButtons = (historyButton || backButton) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 * k, flexShrink: 0 }}>
      {historyButton}
      {backButton}
    </div>
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
              isGoal={goalReward?.id === reward.id}
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
          {headerButtons}
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

      {allowTouch && redeem.pending && (
        <RedeemConfirm
          reward={redeem.pending.reward}
          memberName={redeem.pending.member.name}
          error={redeem.error}
          busy={redeem.busy}
          onConfirm={redeem.confirm}
          onCancel={redeem.cancel}
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
          onDismiss={redeem.dismissRedeemed}
        />
      )}
    </div>
  );
}
