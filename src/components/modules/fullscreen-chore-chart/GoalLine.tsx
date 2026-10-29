'use client';

import { Check, Ticket } from 'lucide-react';
import type { RewardDefinition } from '@/lib/reward-data';
import { goalProgress } from '@/lib/reward-rules';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useTranslate } from '@/i18n';

/**
 * What someone is saving for, as the wall draws it under a member: the
 * reward's icon, how many tickets are still to go (or "Enough saved!"), and
 * with `bar` a thin accent bar between them. The bar is left out where a
 * day-progress bar already sits right above it, since two look-alike bars
 * with no labels read as one broken bar.
 */
export default function GoalLine({
  goal,
  balance,
  size,
  bar,
  wide = false,
  short = false,
  testId = 'fcc-chip-goal',
}: {
  goal: RewardDefinition;
  balance: number;
  /** Text size in px; the icon and bar scale from it. */
  size: number;
  bar: boolean;
  /** The chip has room for the long words beside the bar (a landscape chip). */
  wide?: boolean;
  /** A one-line chip in a big family: a ticket glyph and "4 more", or a check once there is enough. */
  short?: boolean;
  testId?: string;
}) {
  const t = useTranslate('modules');
  const progress = goalProgress(balance, goal);
  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', alignItems: 'center', gap: size * 0.4, fontSize: size, fontWeight: 600, color: 'var(--fcc-text)', whiteSpace: 'nowrap', minWidth: 0, lineHeight: 1.3 }}
    >
      {goal.emoji ? <ChoreIcon value={goal.emoji} size={size} bare /> : <Ticket size={size} color="var(--fcc-accent)" />}
      {short ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.2, flexShrink: 0, color: progress.reached ? 'var(--fcc-accent)' : undefined, fontVariantNumeric: 'tabular-nums' }}>
          {progress.reached ? <Check size={size} strokeWidth={3} color="var(--fcc-accent)" /> : <><Ticket size={size * 0.9} color="var(--fcc-accent)" />{t('fullscreen-chore-chart.goal.toGoShort', { count: progress.stillNeeded })}</>}
        </span>
      ) : bar && !progress.reached ? (
        <>
          {/* A chip is narrow: the bar takes what the words leave, and the words
              are the short form with a ticket glyph saying what is counted. */}
          <div style={{ flex: 1, height: Math.max(4, size * 0.28), background: 'var(--fcc-border)', borderRadius: 999, overflow: 'hidden', minWidth: size }}>
            <div style={{ height: '100%', borderRadius: 999, background: 'var(--fcc-accent)', width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.2, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            <Ticket size={size * 0.9} color="var(--fcc-accent)" />
            {wide ? t('fullscreen-chore-chart.goal.toGo', { count: progress.stillNeeded }) : t('fullscreen-chore-chart.goal.toGoShort', { count: progress.stillNeeded })}
          </span>
        </>
      ) : (
        <span style={{ color: progress.reached ? 'var(--fcc-accent)' : undefined, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {progress.reached ? t('fullscreen-chore-chart.goal.ready') : t('fullscreen-chore-chart.goal.toGo', { count: progress.stillNeeded })}
        </span>
      )}
    </div>
  );
}
