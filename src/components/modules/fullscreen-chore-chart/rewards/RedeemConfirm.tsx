'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import type { RewardDefinition } from '@/lib/reward-data';
import { redeemGoalEffect, ticketsAfterRedeeming } from '@/lib/reward-rules';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import { WallButton } from '@/components/modules/shared/WallButton';
import { WallNotice } from '@/components/modules/shared/WallNotice';
import { useWallSheet, type WallSheetOptions } from '@/components/modules/shared/useWallSheet';

interface RedeemConfirmProps {
  reward: RewardDefinition;
  memberName: string;
  /** The person's tickets before the spend. */
  balance: number;
  /** What they are saving for, when the chart shows it. */
  goal?: RewardDefinition | null;
  error?: string | null;
  busy?: boolean;
  /** Spending needs the grown-up code: the yes says so, with a lock, before it is pressed. */
  asksGrownUp?: boolean;
  onConfirm: () => void;
  /** Closing it (Cancel, a scrim tap, nobody touching it), from `useRedeemReward`. */
  sheet: WallSheetOptions;
  k: number;
  t: number;
  d: number;
  onAccent: string;
}

/**
 * "Spend your tickets?" sheet. Sized like the cards behind it (t for text,
 * k for tap targets) so it reads from where the kid is standing, not like a
 * phone dialog dropped on a wall. It holds the screen while it is up, goes
 * away by itself with nobody touching it, and a scrim tap within a double tap
 * of opening is the tap that opened it.
 */
export default function RedeemConfirm({ reward, memberName, balance, goal = null, error, busy, asksGrownUp = false, onConfirm, sheet, k, t, d, onAccent }: RedeemConfirmProps) {
  const { touched, settled } = useWallSheet(sheet);
  const tr = useTranslate('modules');
  const trCore = useTranslate('core');
  const left = ticketsAfterRedeeming(balance, reward);
  const goalEffect = redeemGoalEffect(balance, reward, goal);
  const buttonText = 26 * t;
  const buttonHeight = Math.max(60 * k, buttonText * 1.2 + 20 * k);

  const buttonBase: React.CSSProperties = {
    minHeight: buttonHeight,
    padding: `0 ${44 * k * d}px`,
    minWidth: 6 * buttonText,
    borderRadius: 999,
    fontSize: buttonText,
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      data-testid="fcc-redeem-confirm"
      onClick={settled(sheet.onClose)}
      onPointerDown={touched}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40 * k,
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16 * k * d,
          padding: `${40 * k * d}px ${48 * k * d}px`,
          background: 'var(--fcc-surface)',
          borderRadius: 32 * k,
          border: `${Math.max(1, 1.5 * k)}px solid var(--fcc-border)`,
          boxShadow: '0 12px 60px rgba(0,0,0,0.4)',
          maxWidth: `min(${24 * 30 * t}px, 80vw)`,
          width: '100%',
          textAlign: 'center',
          color: 'var(--fcc-text)',
        }}
      >
        <div style={{ lineHeight: 1, height: 96 * t, display: 'flex', alignItems: 'center' }}>
          <ChoreIcon value={reward.emoji} size={Math.round(96 * t)} bare />
        </div>

        <div style={{ fontSize: 36 * t, fontWeight: 800, lineHeight: 1.15 }}>
          {tr('fullscreen-chore-chart.rewardsStore.confirmTitle')}
        </div>

        <div style={{ fontSize: 26 * t, fontWeight: 500, color: 'var(--fcc-text-2)', lineHeight: 1.35 }}>
          {tr('fullscreen-chore-chart.rewardsStore.confirmBody', { member: memberName, reward: reward.name, count: reward.cost })}
          {' '}
          <span data-testid="fcc-redeem-left">{tr('fullscreen-chore-chart.rewardsStore.confirmLeft', { member: memberName, count: left })}</span>
        </div>

        {/* What the spend does to the thing they are saving for; nothing when the goal stays in reach. */}
        {goalEffect && goal && (
          <div data-testid="fcc-redeem-goal" style={{ fontSize: 22 * t, fontWeight: 600, color: 'var(--fcc-accent)', lineHeight: 1.35 }}>
            {goalEffect.kind === 'clears'
              ? tr('fullscreen-chore-chart.rewardsStore.confirmGoalClears', { name: memberName })
              : tr('fullscreen-chore-chart.rewardsStore.confirmGoalFurther', { goal: goal.name, count: goalEffect.stillNeeded })}
          </div>
        )}

        {/* The notice's 26-unit text lands at the sheet's 22 px small text. */}
        {error && (
          <WallNotice tone="error" P={(n) => (n * 22 * t) / 26} surface="var(--fcc-surface)" text="var(--fcc-text)" testId="fcc-redeem-error">
            {error}
          </WallNotice>
        )}

        <div style={{ display: 'flex', gap: 16 * k * d, marginTop: 8 * k * d, flexWrap: 'wrap', justifyContent: 'center' }}>
          <WallButton
            onClick={sheet.onClose}
            style={{
              ...buttonBase,
              color: 'var(--fcc-text)',
              background: 'var(--fcc-surface)',
              border: `${Math.max(1, 2 * k)}px solid var(--fcc-border)`,
            }}
          >
            {tr('fullscreen-chore-chart.rewardsStore.confirmCancel')}
          </WallButton>

          <WallButton
            onClick={onConfirm}
            disabled={busy}
            style={{
              ...buttonBase,
              color: onAccent,
              background: 'var(--fcc-accent)',
              border: 'none',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {asksGrownUp
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}><Lock size="1em" strokeWidth={2.6} aria-hidden="true" />{trCore('grownUp.ask')}</span>
              : tr('fullscreen-chore-chart.rewardsStore.confirmYes')}
          </WallButton>
        </div>
      </div>
    </div>
  );
}
