'use client';

import React from 'react';
import { useTranslate } from '@/i18n';

interface BalanceBannerProps {
  balance: number;
  memberName: string;
  scale: number;
}

export default function BalanceBanner({ balance, memberName, scale }: BalanceBannerProps) {
  const labelFontSize = scale * 1.0;
  const balanceFontSize = scale * 2.8;
  const suffixFontSize = scale * 1.1;
  const starFontSize = scale * 3.5;
  const padding = `${scale * 1.0}px ${scale * 1.6}px`;
  const borderRadius = scale * 0.8;
  const gap = scale * 1.2;
  const t = useTranslate('modules');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap,
        padding,
        background: 'var(--fcc-surface)',
        border: `${scale * 0.1}px solid var(--fcc-border)`,
        borderRadius,
        boxShadow: 'var(--fcc-card-shadow)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: scale * 0.2 }}>
        <div
          style={{
            fontSize: labelFontSize,
            fontWeight: 500,
            color: 'var(--fcc-text-2)',
          }}
        >
          {t('fullscreen-chore-chart.rewardsStore.memberTickets', { member: memberName })}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: scale * 0.35 }}>
          <span
            style={{
              fontSize: balanceFontSize,
              fontWeight: 800,
              color: 'var(--fcc-accent)',
              lineHeight: 1,
            }}
          >
            {balance}
          </span>
          <span
            style={{
              fontSize: suffixFontSize,
              fontWeight: 500,
              color: 'var(--fcc-text-3)',
            }}
          >
            {t('fullscreen-chore-chart.tickets')}
          </span>
        </div>
      </div>

      <div
        style={{
          fontSize: starFontSize,
          lineHeight: 1,
          opacity: 0.8,
        }}
      >
        ★
      </div>
    </div>
  );
}
