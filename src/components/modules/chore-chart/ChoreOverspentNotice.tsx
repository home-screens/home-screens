'use client';

import { useTranslate } from '@/i18n';
import { DIVIDER } from '@/lib/constants';
import type { OverspentNotice } from '@/lib/chore-toggle';

/**
 * The sentence itself, in one place. Both chore charts say it: the card at the
 * foot of its box, the fullscreen one in its toast strip.
 */
export function useOverspentMessage(notice: OverspentNotice | null): string | null {
  const t = useTranslate('modules');
  if (!notice) return null;
  return t('chore-chart.overspent', {
    name: notice.name ?? t('chore-chart.overspentSomeone'),
    balance: notice.balance,
    count: notice.owed,
  });
}

/**
 * What the wall says when un-ticking a chore takes its tickets back after they
 * were already spent. The balance goes below zero, and without this the only
 * trace is a line in a browser console nobody on a wall can open.
 *
 * It sits in the flow at the foot of the card rather than over the chart: a
 * card is translucent, so text laid over the rows would be read through them.
 */
export function ChoreOverspentNotice({
  notice,
  accentColor,
}: {
  notice: OverspentNotice;
  accentColor: string;
}) {
  const message = useOverspentMessage(notice);
  return (
    <div
      role="status"
      data-testid="chore-overspent-notice"
      style={{
        marginTop: '0.4em',
        paddingTop: '0.4em',
        borderTop: `1px solid ${DIVIDER.visible}`,
        fontSize: '0.85em',
        lineHeight: 1.3,
        fontWeight: 600,
        color: accentColor,
      }}
    >
      &#127903; {message}
    </div>
  );
}
