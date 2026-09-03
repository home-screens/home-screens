'use client';

import React from 'react';
import type { RewardDefinition } from '@/lib/reward-data';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';

interface RedeemConfirmProps {
  reward: RewardDefinition;
  memberName: string;
  error?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  k: number;
  t: number;
  d: number;
  onAccent: string;
}

/**
 * "Spend your tickets?" sheet. Sized like the cards behind it (t for text,
 * k for tap targets) so it reads from where the kid is standing, not like a
 * phone dialog dropped on a wall.
 */
export default function RedeemConfirm({ reward, memberName, error, busy, onConfirm, onCancel, k, t, d, onAccent }: RedeemConfirmProps) {
  const tr = useTranslate('modules');
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
      onClick={onCancel}
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
        </div>

        {error && (
          <div style={{ fontSize: 22 * t, color: '#ef4444', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16 * k * d, marginTop: 8 * k * d, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              ...buttonBase,
              color: 'var(--fcc-text)',
              background: 'var(--fcc-surface)',
              border: `${Math.max(1, 2 * k)}px solid var(--fcc-border)`,
            }}
          >
            {tr('fullscreen-chore-chart.rewardsStore.confirmCancel')}
          </button>

          <button
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
            {tr('fullscreen-chore-chart.rewardsStore.confirmYes')}
          </button>
        </div>
      </div>
    </div>
  );
}
