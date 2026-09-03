'use client';

import React from 'react';
import { Ticket } from 'lucide-react';
import { useTranslate } from '@/i18n';

interface BalanceBannerProps {
  balance: number;
  memberName: string;
  k: number;
  t: number;
  d: number;
}

/**
 * The one hero number in the store: how many tickets the picked kid has.
 * Drawn as a left-aligned pill so it shares an edge with the title and the
 * picker instead of stretching a full-width card around one fact.
 */
export default function BalanceBanner({ balance, memberName, k, t, d }: BalanceBannerProps) {
  const tr = useTranslate('modules');
  const label = 24 * t;
  const number = Math.max(64 * k, label * 2.4);

  return (
    <div
      data-testid="fcc-store-balance"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 16 * k * d,
        padding: `${10 * k * d}px ${28 * k * d}px ${10 * k * d}px ${20 * k * d}px`,
        background: 'var(--fcc-surface)',
        border: `${Math.max(1, 1.5 * k)}px solid var(--fcc-border)`,
        borderRadius: 24 * k,
        boxShadow: 'var(--fcc-card-shadow)',
        maxWidth: '100%',
      }}
    >
      <Ticket size={number * 0.75} strokeWidth={2} color="var(--fcc-accent)" aria-hidden="true" style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: number,
          fontWeight: 800,
          color: 'var(--fcc-accent)',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {balance}
      </span>
      <span
        style={{
          fontSize: label,
          fontWeight: 600,
          color: 'var(--fcc-text-2)',
          lineHeight: 1.2,
        }}
      >
        {tr('fullscreen-chore-chart.rewardsStore.memberTickets', { member: memberName })}
      </span>
    </div>
  );
}
