'use client';

import React from 'react';
import type { RewardDefinition } from '@/lib/reward-data';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';

interface RedeemConfirmProps {
  reward: RewardDefinition;
  memberName: string;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  scale: number;
}

export default function RedeemConfirm({
  reward,
  memberName,
  error,
  onConfirm,
  onCancel,
  scale,
}: RedeemConfirmProps) {
  const emojiFontSize = scale * 4.0;
  const titleFontSize = scale * 1.6;
  const subtitleFontSize = scale * 1.1;
  const buttonFontSize = scale * 1.1;
  const dialogPadding = `${scale * 2.0}px ${scale * 2.4}px`;
  const dialogBorderRadius = scale * 1.2;
  const buttonBorderRadius = scale * 2;
  const buttonPadding = `${scale * 0.7}px ${scale * 2.0}px`;
  const gap = scale * 0.8;
  const t = useTranslate('modules');

  return (
    /* Full-screen scrim */
    <div
      onClick={onCancel}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      {/* Dialog */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap,
          padding: dialogPadding,
          background: 'var(--fcc-surface)',
          borderRadius: dialogBorderRadius,
          border: `${scale * 0.1}px solid var(--fcc-border)`,
          boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
          maxWidth: scale * 28,
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div style={{ lineHeight: 1 }}>
          <ChoreIcon value={reward.emoji} size={Math.round(emojiFontSize)} color="var(--fcc-accent)" />
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: titleFontSize,
            fontWeight: 700,
            color: 'var(--fcc-text)',
            lineHeight: 1.2,
          }}
        >
          {t('fullscreen-chore-chart.rewardsStore.confirmTitle')}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: subtitleFontSize,
            color: 'var(--fcc-text-2)',
            lineHeight: 1.4,
          }}
        >
          {t('fullscreen-chore-chart.rewardsStore.confirmBody', { member: memberName, reward: reward.name, count: reward.cost })}
        </div>

        {error && (
          <div style={{ fontSize: scale * 0.8, color: '#ef4444', fontWeight: 600, marginTop: scale * 0.2 }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: scale * 0.8,
            marginTop: scale * 0.4,
          }}
        >
          {/* Cancel */}
          <button
            onClick={onCancel}
            style={{
              fontSize: buttonFontSize,
              fontWeight: 600,
              color: 'var(--fcc-text)',
              background: 'var(--fcc-surface)',
              border: `${scale * 0.12}px solid var(--fcc-border)`,
              borderRadius: buttonBorderRadius,
              padding: buttonPadding,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {t('fullscreen-chore-chart.rewardsStore.confirmCancel')}
          </button>

          {/* Confirm */}
          <button
            onClick={onConfirm}
            style={{
              fontSize: buttonFontSize,
              fontWeight: 700,
              color: 'white',
              background: 'var(--fcc-accent)',
              border: 'none',
              borderRadius: buttonBorderRadius,
              padding: buttonPadding,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {t('fullscreen-chore-chart.rewardsStore.confirmYes')}
          </button>
        </div>
      </div>
    </div>
  );
}
