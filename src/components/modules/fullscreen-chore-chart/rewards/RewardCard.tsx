'use client';

import React, { useState } from 'react';
import type { RewardDefinition } from '@/lib/reward-data';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';

interface RewardCardProps {
  reward: RewardDefinition;
  canAfford: boolean;
  onRedeem: (reward: RewardDefinition) => void;
  scale: number;
}

export default function RewardCard({ reward, canAfford, onRedeem, scale }: RewardCardProps) {
  const [hovered, setHovered] = useState(false);

  const emojiFontSize = scale * 2.5;
  const nameFontSize = scale * 1.0;
  const descFontSize = scale * 0.8;
  const costFontSize = scale * 0.95;
  const redeemFontSize = scale * 0.85;
  const padding = `${scale * 1.0}px ${scale * 1.0}px`;
  const borderRadius = scale * 0.8;
  const gap = scale * 0.4;

  return (
    <button
      disabled={!canAfford}
      onClick={() => canAfford && onRedeem(reward)}
      onPointerEnter={() => canAfford && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap,
        padding,
        background: 'var(--fcc-surface)',
        border: `${scale * 0.1}px solid var(--fcc-border)`,
        borderRadius,
        boxShadow: 'var(--fcc-card-shadow)',
        cursor: canAfford ? 'pointer' : 'default',
        opacity: canAfford ? 1 : 0.35,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s, opacity 0.15s',
        outline: 'none',
        textAlign: 'center',
      }}
    >
      {/* Icon */}
      <div style={{ lineHeight: 1 }}>
        <ChoreIcon value={reward.emoji} size={Math.round(emojiFontSize)} color="var(--fcc-accent)" />
      </div>

      {/* Name */}
      <div
        style={{
          fontSize: nameFontSize,
          fontWeight: 600,
          color: 'var(--fcc-text)',
          lineHeight: 1.2,
        }}
      >
        {reward.name}
      </div>

      {/* Description */}
      {reward.description && (
        <div
          style={{
            fontSize: descFontSize,
            color: 'var(--fcc-text-3)',
            lineHeight: 1.3,
          }}
        >
          {reward.description}
        </div>
      )}

      {/* Cost */}
      <div
        style={{
          fontSize: costFontSize,
          fontWeight: 700,
          color: 'var(--fcc-accent)',
        }}
      >
        {reward.cost} tickets
      </div>

      {/* Redeem button — only shown when affordable */}
      {canAfford && (
        <div
          style={{
            fontSize: redeemFontSize,
            fontWeight: 600,
            color: 'white',
            background: 'var(--fcc-accent)',
            borderRadius: scale * 2,
            padding: `${scale * 0.3}px ${scale * 0.9}px`,
            marginTop: scale * 0.2,
          }}
        >
          Redeem
        </div>
      )}
    </button>
  );
}
