'use client';

import { Target } from 'lucide-react';
import type { RewardDefinition } from '@/lib/reward-data';
import { goalProgress } from '@/lib/reward-rules';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import BottomSheet from './BottomSheet';

/**
 * The "Saving for" card under the balance on the Rewards tab. With a goal it
 * shows the reward, how far along the kid is and a bar in their color; with
 * none it is a dashed prompt. Either way a tap opens the picker.
 */
export function SavingsGoalCard({
  goal,
  balance,
  color,
  onOpen,
  onRedeem,
  memberName,
  forOther = false,
}: {
  goal: RewardDefinition | null;
  balance: number;
  color: string;
  onOpen: () => void;
  /** With enough saved, the card itself redeems; Change still opens the picker. */
  onRedeem?: () => void;
  memberName: string;
  /** A grown-up on a kid's behalf: the card names the kid instead of saying "you". */
  forOther?: boolean;
}) {
  const t = useTranslate('remote');
  if (!goal) {
    return (
      <button
        type="button"
        data-testid="savings-goal-empty"
        className="press-scale"
        onClick={onOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: 16, marginBottom: 16, minHeight: 56,
          background: 'transparent', border: '1px dashed var(--hs-border-strong)', borderRadius: 16,
          color: 'var(--hs-text-muted)', fontSize: 15, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <Target size={18} aria-hidden />
        {t(forOther ? 'rewardsView.goal.pickFor' : 'rewardsView.goal.pick', { name: memberName })}
      </button>
    );
  }
  const progress = goalProgress(balance, goal);
  const line = progress.reached
    ? t(forOther ? 'rewardsView.goal.reachedFor' : 'rewardsView.goal.reached', { name: memberName })
    : progress.stillNeeded === 1
      ? t('rewardsView.goal.progressSingular', { have: progress.have, cost: progress.cost, n: progress.stillNeeded })
      : t('rewardsView.goal.progressPlural', { have: progress.have, cost: progress.cost, n: progress.stillNeeded });
  return (
    <button
      type="button"
      data-testid="savings-goal-card"
      className="press-scale"
      onClick={onRedeem ?? onOpen}
      aria-label={onRedeem ? t('rewardsView.goal.redeemAriaLabel', { name: goal.name }) : t('rewardsView.goal.changeAriaLabel', { name: goal.name })}
      style={{
        width: '100%', textAlign: 'left', padding: '14px 16px', marginBottom: 16,
        background: 'var(--hs-bg-card)', border: '1px solid var(--hs-bg-hover)', borderRadius: 16,
        color: 'inherit', cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--hs-text-faint)', marginBottom: 8 }}>
        {t(forOther ? 'rewardsView.goal.headingFor' : 'rewardsView.goal.heading', { name: memberName })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          <ChoreIcon value={goal.emoji} size={20} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--hs-text-body)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{goal.name}</div>
          <div style={{ fontSize: 12.5, color: progress.reached ? color : 'var(--hs-text-muted)', marginTop: 1, fontWeight: progress.reached ? 600 : 400 }}>{line}</div>
        </div>
        <span
          role={onRedeem ? 'button' : undefined}
          data-testid="savings-goal-change"
          onClick={onRedeem ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
          style={{ fontSize: 13, fontWeight: 600, color, padding: '6px 10px', borderRadius: 999, background: `color-mix(in srgb, ${color} 15%, transparent)`, flexShrink: 0 }}
        >
          {t('rewardsView.goal.change')}
        </span>
      </div>
      <div style={{ height: 7, background: 'var(--hs-border)', borderRadius: 9, marginTop: 12, overflow: 'hidden' }}>
        <div data-testid="savings-goal-bar" style={{ height: '100%', borderRadius: 9, background: color, width: `${progress.fraction * 100}%`, transition: 'width 0.3s ease' }} />
      </div>
    </button>
  );
}

/**
 * The picker: every reward this person may redeem, cheapest first, the
 * current goal ticked. A tap picks and closes; Stop saving clears.
 */
export function SavingsGoalSheet({
  memberName,
  rewards,
  goalId,
  color,
  onPick,
  onClose,
  forOther = false,
}: {
  memberName: string;
  rewards: RewardDefinition[];
  goalId: string | null;
  color: string;
  onPick: (rewardId: string | null) => void;
  onClose: () => void;
  forOther?: boolean;
}) {
  const t = useTranslate('remote');
  const sorted = [...rewards].sort((a, b) => a.cost - b.cost);
  const cost = (n: number) => (n === 1 ? t('rewardsView.ticketCountSingular', { n }) : t('rewardsView.ticketCountPlural', { n }));
  return (
    <BottomSheet title={t(forOther ? 'rewardsView.goal.sheetTitleFor' : 'rewardsView.goal.sheetTitle', { name: memberName })} onClose={onClose} testId="savings-goal-sheet">
      <p style={{ margin: '-6px 0 10px', fontSize: 13, color: 'var(--hs-text-muted)', lineHeight: 1.4 }}>
        {t('rewardsView.goal.sheetHint', { name: memberName })}
      </p>
      {sorted.length === 0 && (
        <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--hs-text-faint)', fontSize: 14 }}>{t('rewardsView.goal.sheetEmpty')}</p>
      )}
      <div role="radiogroup" aria-label={t('rewardsView.goal.sheetTitle')}>
        {sorted.map((reward) => {
          const picked = reward.id === goalId;
          return (
            <button
              key={reward.id}
              type="button"
              role="radio"
              aria-checked={picked}
              data-testid={`savings-goal-option-${reward.id}`}
              className="press-scale"
              onClick={() => { onPick(reward.id); onClose(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', minHeight: 56,
                background: 'transparent', border: 'none', borderTop: '1px solid var(--hs-bg-card)',
                color: 'inherit', textAlign: 'left', cursor: 'pointer',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--hs-bg-card)' }}>
                <ChoreIcon value={reward.emoji} size={16} color={picked ? color : 'var(--hs-text-muted)'} />
              </div>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--hs-text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reward.name}</span>
                {/* Two rewards can share a name ("Extra screen time" at 5 and at 10): the description tells them apart. */}
                {reward.description && (
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--hs-text-faint)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reward.description}</span>
                )}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--hs-text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{cost(reward.cost)}</span>
              <span
                aria-hidden
                style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
                  border: picked ? `7px solid ${color}` : '2px solid var(--hs-border-strong)',
                }}
              />
            </button>
          );
        })}
      </div>
      {goalId && (
        <button
          type="button"
          data-testid="savings-goal-stop"
          onClick={() => { onPick(null); onClose(); }}
          // Not the danger colour: stopping loses no tickets, and red reads as "empty the balance".
          style={{ width: '100%', marginTop: 8, padding: '12px 0 4px', minHeight: 44, background: 'none', border: 'none', color: 'var(--hs-text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          {t(forOther ? 'rewardsView.goal.stopFor' : 'rewardsView.goal.stop', { name: memberName })}
        </button>
      )}
    </BottomSheet>
  );
}
