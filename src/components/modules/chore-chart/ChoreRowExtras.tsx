'use client';

import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';

/**
 * The small pieces every card view's chore row shares: what a short tap on a
 * finished chore says, how the hold shows itself running, and what the chore
 * is worth. Kept here so the three interactive views draw them the same way.
 */

/** Replaces the chore name for a moment after a tap that was not a hold. */
export function HoldHint({ color }: { color: string }) {
  const tCore = useTranslate('core');
  return (
    <span role="status" style={{ color, fontWeight: 700 }}>
      {tCore('chores.holdToUncheck')}
    </span>
  );
}

/**
 * The hold filling along the bottom of the row it is running on, so a finger
 * held on a wall can see something happening. The row has to be positioned.
 */
export function HoldProgress({ progress, color }: { progress: number; color: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="chore-hold-progress"
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        height: '0.15em',
        width: `${Math.round(progress * 100)}%`,
        backgroundColor: color,
        transition: 'width 60ms linear',
      }}
    />
  );
}

/**
 * What a chore is worth, on the row itself. A ticket system only works if a
 * kid at the wall can see that the dishwasher is worth more than a made bed,
 * so this rides along at nearly the row's own size rather than shrinking to a
 * pill nobody can read from the doorway.
 */
export function TicketValue({ points }: { points: number }) {
  const t = useTranslate('modules');
  return (
    <span
      data-testid="chore-ticket-value"
      className="shrink-0"
      title={t('chore-chart.ticketsCount', { count: points })}
      style={{ fontSize: '0.8em', fontWeight: 600, opacity: TEXT_OPACITY.secondary, fontVariantNumeric: 'tabular-nums' }}
    >
      &#127903;{points}
    </span>
  );
}

/** Whether a row should carry its ticket value at all. */
export function showsTicketValue(showPoints: boolean | undefined, points: number): boolean {
  return showPoints !== false && points > 0;
}
