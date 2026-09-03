'use client';

import React from 'react';
import { Ticket } from 'lucide-react';
import type { RewardDefinition } from '@/lib/reward-data';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';
import { NAME_MAX_LINES, DESC_MAX_LINES, type CardMetrics } from './storeLayout';

interface RewardCardProps {
  reward: RewardDefinition;
  balance: number;
  /** False when the wall is read-only: no Redeem pill, nothing to tap. */
  allowTouch: boolean;
  onRedeem: (reward: RewardDefinition) => void;
  metrics: CardMetrics;
  onAccent: string;
}

const clampLines = (lines: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
});
const clampName = clampLines(NAME_MAX_LINES);
const clampDesc = clampLines(DESC_MAX_LINES);

/**
 * One reward. The glyph is the hero, the name the headline; cost and the
 * pill slot sit on the bottom edge so a row of cards shares one baseline.
 * A card the kid cannot afford yet stays at full strength and says how many
 * more tickets it takes, in the same slot the pill would fill, so nothing
 * reflows when they switch members.
 */
export default function RewardCard({ reward, balance, allowTouch, onRedeem, metrics: m, onAccent }: RewardCardProps) {
  const tr = useTranslate('modules');
  const canAfford = balance >= reward.cost;
  const tappable = allowTouch && canAfford;
  const Tag: 'button' | 'div' = tappable ? 'button' : 'div';

  let slot: React.ReactNode;
  if (!canAfford) {
    slot = (
      <span style={{ fontSize: m.cost * 0.92, fontWeight: 600, color: 'var(--fcc-text-3)', lineHeight: 1.2 }}>
        {tr('fullscreen-chore-chart.rewardsStore.moreTickets', { count: reward.cost - balance })}
      </span>
    );
  } else if (allowTouch) {
    slot = (
      <span
        data-testid="fcc-redeem-pill"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: m.pill,
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: `0 ${Math.min(m.pillText * 1.4, m.pill * 0.6)}px`,
          borderRadius: 999,
          background: 'var(--fcc-accent)',
          color: onAccent,
          fontSize: m.pillText,
          fontWeight: 700,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {tr('fullscreen-chore-chart.rewardsStore.redeem')}
      </span>
    );
  } else {
    slot = (
      <span style={{ fontSize: m.cost * 0.92, fontWeight: 600, color: 'var(--fcc-text-2)', lineHeight: 1.2 }}>
        {tr('fullscreen-chore-chart.rewardsStore.enoughTickets')}
      </span>
    );
  }

  return (
    <Tag
      data-testid="fcc-reward-card"
      onClick={tappable ? () => onRedeem(reward) : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        boxSizing: 'border-box',
        height: '100%',
        minWidth: 0,
        gap: m.gap,
        padding: `${m.padY}px ${m.padX}px`,
        background: 'var(--fcc-surface)',
        border: `${m.border}px solid var(--fcc-border)`,
        borderRadius: m.radius,
        boxShadow: 'var(--fcc-card-shadow)',
        color: 'var(--fcc-text)',
        fontFamily: 'inherit',
        cursor: tappable ? 'pointer' : 'default',
        outline: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: m.hero,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        <ChoreIcon value={reward.emoji} size={Math.round(m.hero)} bare />
      </div>

      <div style={{ fontSize: m.name, fontWeight: 700, lineHeight: 1.2, ...clampName }}>
        {reward.name}
      </div>

      {reward.description && (
        <div style={{ fontSize: m.desc, color: 'var(--fcc-text-2)', lineHeight: 1.3, marginTop: -m.gap * 0.4, ...clampDesc }}>
          {reward.description}
        </div>
      )}

      <div
        style={{
          marginTop: 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6 * (m.cost / 24),
          fontSize: m.cost,
          fontWeight: 600,
          lineHeight: 1.2,
          color: 'var(--fcc-text-2)',
          whiteSpace: 'nowrap',
        }}
      >
        <Ticket size={m.cost} strokeWidth={2} aria-hidden="true" />
        {tr('fullscreen-chore-chart.rewardsStore.rewardCost', { count: reward.cost })}
      </div>

      <div
        style={{
          height: m.pill,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {slot}
      </div>
    </Tag>
  );
}
